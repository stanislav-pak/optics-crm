import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { updateServiceOrderStatus } from '../../services/workshop';
import type { ServiceOrder } from '../../types';

const STATUS_RU: Record<string, string> = {
  new: 'Новый',
  in_progress: 'В работе',
  ready: 'Готов',
  confirmed: 'Подтверждён',
  done: 'Выполнен',
  cancelled: 'Отменён',
};

const STATUS_COLOR: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  ready: 'bg-green-100 text-green-700',
  confirmed: 'bg-violet-100 text-violet-700',
  done: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-600',
};

type PaymentMethod = 'cash' | 'kaspi';

interface ConfirmState {
  order: ServiceOrder;
  method: PaymentMethod;
  type: 'dopay' | 'refund'; // доплата или возврат предоплаты
}

interface Props {
  branchId: string;
  onCountChange?: (count: number) => void;
}

export default function PendingPaymentsView({ branchId, onCountChange }: Props) {
  const [pendingOrders, setPendingOrders] = useState<ServiceOrder[]>([]);   // активные с остатком
  const [refundOrders, setRefundOrders] = useState<ServiceOrder[]>([]);     // отменённые, нужен возврат
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAll();
  }, [branchId]);

  // Realtime — обновление при любом изменении service_orders
  useEffect(() => {
    const channel = supabase
      .channel('pending-payments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_orders' },
        () => { loadAll(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [branchId]);

  async function loadAll() {
    try {
      // Запрос 1: активные заказы с незакрытым остатком
      const { data: activeData, error: e1 } = await supabase
        .from('service_orders')
        .select('*')
        .eq('created_branch_id', branchId)
        .not('status', 'in', '("done","cancelled")')
        .order('created_at', { ascending: false });

      if (e1) throw e1;

      const pending = (activeData as ServiceOrder[]).filter(o => {
        const effectivePrepayment = o.original_prepayment || o.prepayment;
        return (o.service_price + o.parts_price - effectivePrepayment) > 0;
      });

      // Запрос 2: отменённые с предоплатой, возврат ещё не оформлен
      const { data: cancelledData, error: e2 } = await supabase
        .from('service_orders')
        .select('*')
        .eq('created_branch_id', branchId)
        .eq('status', 'cancelled')
        .is('prepayment_refunded_at', null)
        .gt('original_prepayment', 0)
        .order('created_at', { ascending: false });

      if (e2) throw e2;

      const refunds = cancelledData as ServiceOrder[];

      setPendingOrders(pending);
      setRefundOrders(refunds);
      onCountChange?.(pending.length + refunds.length);
    } catch (e) {
      console.error('loadAll (PendingPaymentsView):', e);
    } finally {
      setLoading(false);
    }
  }

  // Принять доплату (status → done)
  async function handleDopay() {
    if (!confirm || confirm.type !== 'dopay') return;
    setSaving(true);
    try {
      const { order, method } = confirm;

      const { error } = await updateServiceOrderStatus(order.id, 'done');
      if (error) throw new Error(error);

      await supabase
        .from('service_orders')
        .update({
          remaining_payment_method: method,
          remaining_paid_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      const newPending = pendingOrders.filter(o => o.id !== order.id);
      setPendingOrders(newPending);
      onCountChange?.(newPending.length + refundOrders.length);
      setConfirm(null);
    } catch (e) {
      console.error('handleDopay:', e);
      alert('Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  }

  // Вернуть предоплату клиенту
  async function handleRefund() {
    if (!confirm || confirm.type !== 'refund') return;
    setSaving(true);
    try {
      const { order, method } = confirm;

      await supabase
        .from('service_orders')
        .update({
          prepayment_refunded_at: new Date().toISOString(),
          prepayment_refund_method: method,
        })
        .eq('id', order.id);

      const newRefunds = refundOrders.filter(o => o.id !== order.id);
      setRefundOrders(newRefunds);
      onCountChange?.(pendingOrders.length + newRefunds.length);
      setConfirm(null);
    } catch (e) {
      console.error('handleRefund:', e);
      alert('Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  }

  const handleConfirm = () => {
    if (confirm?.type === 'dopay') return handleDopay();
    if (confirm?.type === 'refund') return handleRefund();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isEmpty = pendingOrders.length === 0 && refundOrders.length === 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Заголовок */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Доплаты мастерской</h1>
        <p className="text-sm text-gray-400 mt-0.5">Незакрытые доплаты и возвраты предоплат</p>
      </div>

      <div className="p-4 space-y-3">
        {isEmpty ? (
          <div className="bg-white rounded-xl border border-gray-200 text-center py-16">
            <p className="text-4xl mb-3">✓</p>
            <p className="text-sm font-medium text-gray-700">Нет незакрытых доплат</p>
            <p className="text-xs text-gray-400 mt-1">Все заказы полностью оплачены</p>
          </div>
        ) : (
          <>
            {/* Тип А: Активные с незакрытым остатком */}
            {pendingOrders.map(order => {
              const total = order.service_price + order.parts_price;
              const effectivePrepayment = order.original_prepayment || order.prepayment;
              const remainder = total - effectivePrepayment;
              return (
                <div key={order.id} className="bg-white rounded-xl border border-orange-100 p-4 space-y-2.5">
                  {/* Клиент + статус */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{order.client_name}</p>
                      {order.client_phone && (
                        <p className="text-xs text-gray-400 mt-0.5">{order.client_phone}</p>
                      )}
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_RU[order.status] ?? order.status}
                    </span>
                  </div>

                  {/* Вид услуги + Цены */}
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Вид услуги</span>
                    <span>{order.service_name}</span>
                  </div>

                  {/* Цены */}
                  <div className="grid grid-cols-2 gap-1 text-xs text-gray-500">
                    <span>Работа: <span className="text-gray-700 font-medium">₸{order.service_price.toLocaleString()}</span></span>
                    <span>Запчасти: <span className="text-gray-700 font-medium">₸{order.parts_price.toLocaleString()}</span></span>
                  </div>

                  {/* Итого */}
                  <div className="flex justify-between text-sm border-t border-gray-50 pt-2">
                    <span className="text-gray-500">Итого:</span>
                    <span className="font-semibold text-gray-900">₸{total.toLocaleString()}</span>
                  </div>

                  {/* Предоплата */}
                  {effectivePrepayment > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Предоплата:</span>
                      <span className="text-gray-700">₸{effectivePrepayment.toLocaleString()}</span>
                    </div>
                  )}

                  {/* Остаток */}
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-red-500">Остаток:</span>
                    <span className="text-red-500">₸{remainder.toLocaleString()}</span>
                  </div>

                  <button
                    onClick={() => setConfirm({ order, method: 'cash', type: 'dopay' })}
                    className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold transition-colors mt-1"
                  >
                    Принять доплату ₸{remainder.toLocaleString()}
                  </button>
                </div>
              );
            })}

            {/* Тип Б: Отменённые, нужно вернуть предоплату */}
            {refundOrders.map(order => {
              const origPrepayment = order.original_prepayment || order.prepayment;
              return (
                <div key={order.id} className="bg-white rounded-xl border border-red-100 p-4 space-y-2.5">
                  {/* Клиент + статус */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{order.client_name}</p>
                      {order.client_phone && (
                        <p className="text-xs text-gray-400 mt-0.5">{order.client_phone}</p>
                      )}
                    </div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 bg-red-100 text-red-600">
                      Отменён
                    </span>
                  </div>

                  {/* Вид услуги */}
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Вид услуги</span>
                    <span>{order.service_name}</span>
                  </div>

                  {/* Предоплата к возврату */}
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-red-500">Вернуть предоплату:</span>
                    <span className="text-red-500">₸{origPrepayment.toLocaleString()}</span>
                  </div>

                  <button
                    onClick={() => setConfirm({ order, method: 'cash', type: 'refund' })}
                    className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold transition-colors mt-1"
                  >
                    Вернуть предоплату ₸{origPrepayment.toLocaleString()}
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Диалог подтверждения */}
      {confirm && (
        <div
          data-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
          onClick={e => { if (e.target === e.currentTarget) setConfirm(null); }}
        >
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-5 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">
              {confirm.type === 'dopay'
                ? `Принять доплату ₸${(confirm.order.service_price + confirm.order.parts_price - (confirm.order.original_prepayment || confirm.order.prepayment)).toLocaleString()} от ${confirm.order.client_name}?`
                : `Вернуть предоплату ₸${(confirm.order.original_prepayment || confirm.order.prepayment).toLocaleString()} клиенту ${confirm.order.client_name}?`
              }
            </h3>

            {/* Способ оплаты */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">
                {confirm.type === 'dopay' ? 'Способ оплаты' : 'Способ возврата'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setConfirm(prev => prev ? { ...prev, method: 'cash' } : prev)}
                  className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    confirm.method === 'cash'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  💵 Наличные
                </button>
                <button
                  onClick={() => setConfirm(prev => prev ? { ...prev, method: 'kaspi' } : prev)}
                  className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    confirm.method === 'kaspi'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  📱 Kaspi
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                disabled={saving}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className={`flex-1 py-2.5 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors ${
                  confirm.type === 'dopay'
                    ? 'bg-orange-500 hover:bg-orange-600'
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {saving ? 'Сохранение...' : 'Подтвердить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
