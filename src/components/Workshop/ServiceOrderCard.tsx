import { useState } from 'react';
import { supabase } from '../../services/supabase';
import { restoreServiceOrder } from '../../services/workshop';
import type { ServiceOrder, ServiceOrderStatus } from '../../types';

const WORKSHOP_BRANCH_ID = '1104bc27-07bb-4930-93b2-19a2d92b71c9';

interface StatusConfig {
  label: string;
  color: string;
}

const STATUS_CONFIG: Record<ServiceOrderStatus, StatusConfig> = {
  new:         { label: 'Новый',         color: 'bg-gray-100 text-gray-600' },
  in_progress: { label: 'В работе',      color: 'bg-blue-100 text-blue-700' },
  ready:       { label: 'Готов',         color: 'bg-green-100 text-green-700' },
  confirmed:   { label: 'Подтверждено',  color: 'bg-violet-100 text-violet-700' },
  done:        { label: 'Выдан',         color: 'bg-emerald-100 text-emerald-800' },
  cancelled:   { label: 'Отменён',       color: 'bg-red-100 text-red-600' },
};

interface Props {
  order: ServiceOrder;
  viewerBranchId: string;
  onStatusChange: (id: string, status: ServiceOrderStatus, prepayment?: number) => void;
}

export default function ServiceOrderCard({ order, viewerBranchId, onStatusChange }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const config = STATUS_CONFIG[order.status];
  const isMaster = viewerBranchId === WORKSHOP_BRANCH_ID;

  // Итого: приоритет — новые поля, иначе старое price
  const total = (order.service_price || 0) + (order.parts_price || 0) || order.price || 0;
  const hasBreakdown = (order.service_price || 0) > 0 || (order.parts_price || 0) > 0;
  // Fallback для старых записей без original_prepayment
  const effectivePrepayment = order.original_prepayment || order.prepayment || 0;
  const isFullyPaid =
    order.status === 'done' ||
    !!order.remaining_paid_at ||
    effectivePrepayment >= total;
  const remaining = Math.max(0, total - effectivePrepayment);

  const estimatedDate = order.estimated_ready_at
    ? new Date(order.estimated_ready_at).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : null;

  const employeeName = (order.employee as { name?: string } | undefined)?.name;

  // Кнопка действия мастера
  const masterNextAction: { label: string; status: ServiceOrderStatus } | null =
    isMaster
      ? order.status === 'new'         ? { label: 'Принять в работу', status: 'in_progress' }
      : order.status === 'in_progress' ? { label: 'Отметить готовым', status: 'ready' }
      : null
      : null;

  // Кнопка действия менеджера
  // "Выдать клиенту" убрана из карточки — выдача происходит через модал продажи
  const managerNextAction: { label: string; status: ServiceOrderStatus; needsConfirm: boolean } | null =
    !isMaster
      ? order.status === 'ready' && order.payment_type !== 'full'
        ? { label: 'Подтвердить получение', status: 'confirmed', needsConfirm: false }
      : null
      : null;

  // Отмена с сохранением previous_status
  const handleConfirmCancel = async () => {
    setCancelling(true);
    try {
      await supabase
        .from('service_orders')
        .update({
          status: 'cancelled',
          previous_status: order.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);
      onStatusChange(order.id, 'cancelled');
      setShowCancelConfirm(false);
    } catch (e) {
      console.error('handleConfirmCancel:', e);
    } finally {
      setCancelling(false);
    }
  };

  // Восстановление отменённого заказа
  const handleRestore = async () => {
    setRestoring(true);
    try {
      const restoreStatus = (order.previous_status as ServiceOrderStatus | undefined) ?? 'new';
      const { error } = await restoreServiceOrder(order.id, restoreStatus);
      if (!error) {
        onStatusChange(order.id, restoreStatus);
      }
    } catch (e) {
      console.error('handleRestore:', e);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3 active:bg-gray-50">

      {/* Строка 1: клиент + статус */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{order.client_name}</p>
          {order.client_phone && (
            <p className="text-xs text-gray-400 mt-0.5">{order.client_phone}</p>
          )}
          {order.created_branch?.name && order.created_branch.name !== 'Мастерская' && (
            <p className="text-xs text-gray-400 mt-0.5">📍 {order.created_branch.name}</p>
          )}
        </div>
        <span className={`flex-shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${config.color}`}>
          {config.label}
        </span>
      </div>

      {/* Строка 2: услуга + примечание */}
      <div>
        <p className="text-sm font-medium text-gray-800">{order.service_name}</p>
        {order.notes && (
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{order.notes}</p>
        )}
      </div>

      {/* Строка 3: цены */}
      <div className="space-y-1 text-xs">
        {hasBreakdown ? (
          <>
            <div className="flex justify-between text-gray-500">
              <span>Услуга</span>
              <span className="font-medium text-gray-700">₸{(order.service_price || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Запчасти</span>
              <span className="font-medium text-gray-700">₸{(order.parts_price || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between pt-0.5 border-t border-gray-100">
              <span className="font-medium text-gray-700">Итого</span>
              <span className="font-semibold text-gray-900">₸{total.toLocaleString()}</span>
            </div>
          </>
        ) : total > 0 ? (
          <div className="flex justify-between">
            <span className="text-gray-500">Итого</span>
            <span className="font-semibold text-gray-900">₸{total.toLocaleString()}</span>
          </div>
        ) : null}

        {effectivePrepayment > 0 && !isFullyPaid && (
          <div className="flex justify-between text-gray-500">
            <span>Предоплата</span>
            <span className="font-medium text-green-600">₸{effectivePrepayment.toLocaleString()}</span>
          </div>
        )}

        {total > 0 && order.status !== 'cancelled' && (
          isFullyPaid ? (
            <div className="text-right">
              <span className="text-green-600 font-medium text-sm">✓ Оплачено</span>
            </div>
          ) : remaining > 0 ? (
            <div className="flex justify-between">
              <span className="text-gray-500">Остаток</span>
              <span className="font-semibold text-red-500">₸{remaining.toLocaleString()}</span>
            </div>
          ) : null
        )}

        {/* Статус возврата предоплаты для отменённых */}
        {order.status === 'cancelled' && effectivePrepayment > 0 && (
          order.prepayment_refunded_at ? (
            <div className="text-xs text-gray-400 mt-1">
              ✓ Предоплата возвращена ({order.prepayment_refund_method === 'kaspi' ? 'Kaspi' : 'Наличные'})
            </div>
          ) : (
            <div className="text-xs text-orange-500 mt-1">
              ⚠ Предоплата ₸{effectivePrepayment.toLocaleString()} не возвращена
            </div>
          )
        )}
      </div>

      {/* Дата готовности */}
      {estimatedDate && (
        <p className="text-xs text-gray-400">
          🕐 Готов к: <span className="text-gray-600">{estimatedDate}</span>
        </p>
      )}

      {/* Footer: мета + кнопки */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[10px] text-gray-300">
          {new Date(order.created_at).toLocaleDateString('ru-RU')}
          {employeeName ? ` · ${employeeName}` : ''}
        </p>

        <div className="flex items-center gap-2">
          {/* Кнопка отмены — только для мастера */}
          {isMaster && order.status !== 'cancelled' && order.status !== 'done' && (
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="text-[11px] px-2.5 py-1 border border-red-200 text-red-400 rounded-lg hover:bg-red-50 active:bg-red-100 transition-colors"
            >
              Отменить
            </button>
          )}

          {/* Кнопка восстановления — только для мастера, только если предоплата не возвращена */}
          {isMaster && order.status === 'cancelled' && !order.prepayment_refunded_at && (
            <button
              onClick={handleRestore}
              disabled={restoring}
              className="text-[11px] px-2.5 py-1 border border-blue-400 text-blue-500 rounded-lg hover:bg-blue-50 active:bg-blue-100 transition-colors disabled:opacity-50"
            >
              {restoring ? '...' : 'Восстановить'}
            </button>
          )}

          {isMaster && masterNextAction && (
            <button
              onClick={() => onStatusChange(order.id, masterNextAction.status)}
              className="text-[11px] px-2.5 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 active:bg-purple-800 transition-colors font-medium"
            >
              {masterNextAction.label}
            </button>
          )}

          {!isMaster && managerNextAction && (
            <button
              onClick={() => {
                if (managerNextAction.needsConfirm) {
                  setShowConfirm(true);
                } else {
                  onStatusChange(order.id, managerNextAction.status);
                }
              }}
              className="text-[11px] px-2.5 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 active:bg-purple-800 transition-colors font-medium"
            >
              {managerNextAction.label}
            </button>
          )}
        </div>
      </div>

      {/* Диалог подтверждения выдачи клиенту */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" data-modal="true">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Подтвердите выдачу</h3>
            <p className="text-sm text-gray-600">
              {remaining > 0
                ? `Получена оплата ₸${remaining.toLocaleString()} от ${order.client_name}. Выдать заказ?`
                : `Заказ полностью оплачен. Выдать ${order.client_name}?`}
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  onStatusChange(order.id, 'done', total);
                }}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
              >
                {remaining > 0 ? 'Выдать и закрыть' : 'Выдать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Диалог подтверждения отмены */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" data-modal="true">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
            <h3 className="text-base font-semibold text-gray-900">Отменить заказ?</h3>
            <p className="text-sm text-gray-600">
              {order.client_name} — {order.service_name}
            </p>
            {effectivePrepayment > 0 && (
              <p className="text-sm text-orange-500 bg-orange-50 rounded-lg px-3 py-2">
                ⚠ Необходимо вернуть клиенту предоплату ₸{effectivePrepayment.toLocaleString()}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowCancelConfirm(false)}
                disabled={cancelling}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Назад
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={cancelling}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {cancelling ? 'Отмена...' : 'Да, отменить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
