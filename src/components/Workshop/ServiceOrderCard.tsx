import { useState } from 'react';
import type { ServiceOrder, ServiceOrderStatus } from '../../types';

interface StatusConfig {
  label: string;
  color: string;
  next?: ServiceOrderStatus;
  nextLabel?: string;
}

const STATUS_CONFIG: Record<ServiceOrderStatus, StatusConfig> = {
  new:        { label: 'Новый',    color: 'bg-gray-100 text-gray-600',      next: 'in_progress', nextLabel: 'Взять в работу' },
  in_progress:{ label: 'В работе', color: 'bg-blue-100 text-blue-700',      next: 'ready',       nextLabel: 'Отметить готовым' },
  ready:      { label: 'Готов',    color: 'bg-green-100 text-green-700',    next: 'done',        nextLabel: 'Выдать клиенту' },
  done:       { label: 'Выдан',    color: 'bg-emerald-100 text-emerald-800' },
  cancelled:  { label: 'Отменён',  color: 'bg-red-100 text-red-600' },
};

interface Props {
  order: ServiceOrder;
  onStatusChange: (id: string, status: ServiceOrderStatus, prepayment?: number) => void;
}

export default function ServiceOrderCard({ order, onStatusChange }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const config = STATUS_CONFIG[order.status];
  const remaining = order.price - order.prepayment;

  const estimatedDate = order.estimated_ready_at
    ? new Date(order.estimated_ready_at).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : null;

  const employeeName = (order.employee as { name?: string } | undefined)?.name;

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3 active:bg-gray-50">

      {/* Строка 1: клиент + статус */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{order.client_name}</p>
          {order.client_phone && (
            <p className="text-xs text-gray-400 mt-0.5">{order.client_phone}</p>
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
      <div className="flex items-center justify-between text-xs gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-gray-500">
            Цена: <span className="font-semibold text-gray-800">₸{order.price.toLocaleString()}</span>
          </span>
          {order.prepayment > 0 && (
            <span className="text-gray-500">
              Предоплата: <span className="font-medium text-green-600">₸{order.prepayment.toLocaleString()}</span>
            </span>
          )}
        </div>
        {order.status !== 'cancelled' && (
          order.status === 'done' ? (
            <span className="text-green-600 font-medium text-sm">✓ Оплачено</span>
          ) : remaining > 0 ? (
            <span className="text-red-500 font-medium text-sm">
              Остаток: ₸{remaining.toLocaleString()}
            </span>
          ) : (
            <span className="text-green-600 font-medium text-sm">✓ Оплачено</span>
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
          {order.status !== 'cancelled' && order.status !== 'done' && (
            <button
              onClick={() => onStatusChange(order.id, 'cancelled')}
              className="text-[11px] px-2.5 py-1 border border-red-200 text-red-400 rounded-lg hover:bg-red-50 active:bg-red-100 transition-colors"
            >
              Отменить
            </button>
          )}
          {config.next && (
            <button
              onClick={() => {
                if (config.next === 'done') {
                  setShowConfirm(true);
                } else {
                  onStatusChange(order.id, config.next!);
                }
              }}
              className="text-[11px] px-2.5 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 active:bg-purple-800 transition-colors font-medium"
            >
              {config.nextLabel}
            </button>
          )}
        </div>
      </div>

      {/* Диалог подтверждения выдачи */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          data-modal="true"
        >
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
                  onStatusChange(order.id, 'done', order.price);
                }}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
              >
                {remaining > 0 ? 'Выдать и закрыть' : 'Выдать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
