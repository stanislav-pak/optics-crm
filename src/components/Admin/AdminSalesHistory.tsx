import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import type { Sale } from '../../types';
import type { Order } from '../../services/orders';
import type { ServiceOrder } from '../../types';

type Tab = 'sales' | 'orders' | 'workshop';

interface Branch { id: string; name: string; }

const PAYMENT_LABEL: Record<string, string> = {
  cash: '💵 Нал', kaspi_qr: '📱 Kaspi QR', halyk: '🏦 Halyk',
  kaspi_transfer: '💳 Kaspi пер.', mixed: '🔀 Смешан.',
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  new: 'Новый', confirmed: 'Подтверждён', awaiting: 'Ожидание',
  ready: 'Готов', completed: 'Выполнен', cancelled: 'Отменён',
};

const WS_STATUS_LABEL: Record<string, string> = {
  new: 'Новый', in_progress: 'В работе', ready: 'Готов',
  confirmed: 'Подтверждён', done: 'Выдан', cancelled: 'Отменён',
};

const WS_STATUS_COLOR: Record<string, string> = {
  new: '#8696a0', in_progress: '#3b82f6', ready: '#10b981',
  confirmed: '#f59e0b', done: '#6b7280', cancelled: '#ef4444',
};

function fmt(n: number) { return n.toLocaleString('ru-RU') + ' ₸'; }
function fmtDate(s?: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('ru-RU');
}

export default function AdminSalesHistory() {
  const [tab, setTab] = useState<Tab>('sales');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>('');
  const [sales, setSales] = useState<Sale[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [wsOrders, setWsOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    supabase.from('branches').select('id, name').order('name')
      .then(({ data }) => setBranches(data ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Sales
      {
        let q = supabase
          .from('sales')
          .select(`*, branch:branches(name), client:clients(name, phone), employee:employees(name), items:sale_items(*, product:products(name))`)
          .order('created_at', { ascending: false })
          .limit(200);
        if (branchId) q = q.eq('branch_id', branchId);
        if (dateFrom) q = q.gte('created_at', dateFrom);
        if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59');
        const { data } = await q;
        setSales((data ?? []) as Sale[]);
      }
      // Pre-orders
      {
        let q = supabase
          .from('orders')
          .select(`*, branch:branches!orders_branch_id_fkey(name), creator:employees!orders_created_by_fkey(name), items:order_items(*)`)
          .order('created_at', { ascending: false })
          .limit(200);
        if (branchId) q = q.eq('branch_id', branchId);
        if (dateFrom) q = q.gte('created_at', dateFrom);
        if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59');
        const { data } = await q;
        setOrders((data ?? []).map((r: any) => ({ ...r, branch: r.branch, creator: r.creator, items: r.order_items ?? r.items })) as Order[]);
      }
      // Workshop orders
      {
        let q = supabase
          .from('service_orders')
          .select(`*, branch:branches!service_orders_created_branch_id_fkey(name), employee:employees(name)`)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(200);
        if (branchId) q = q.eq('created_branch_id', branchId);
        if (dateFrom) q = q.gte('created_at', dateFrom);
        if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59');
        const { data } = await q;
        setWsOrders((data ?? []) as ServiceOrder[]);
      }
    } finally {
      setLoading(false);
    }
  }, [branchId, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'sales', label: 'Продажи', count: sales.length },
    { key: 'orders', label: 'Предзаказы', count: orders.length },
    { key: 'workshop', label: 'Мастерская', count: wsOrders.length },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 space-y-2 flex-shrink-0">
        <div className="flex gap-2 flex-wrap">
          <select
            value={branchId}
            onChange={e => setBranchId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="">Все филиалы</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 px-2">✕ Сбросить</button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${tab === t.key ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {t.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${tab === t.key ? 'bg-white/20' : 'bg-gray-300 text-gray-600'}`}>
                {t.count}
              </span>
            </button>
          ))}
          <button onClick={load} disabled={loading}
            className="ml-auto px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-50">
            {loading ? '↻' : '↺'} Обновить
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">

        {/* ПРОДАЖИ */}
        {tab === 'sales' && (
          loading ? <p className="text-sm text-gray-400 text-center py-10">Загрузка...</p> :
          sales.length === 0 ? <p className="text-sm text-gray-400 text-center py-10">Нет продаж</p> :
          sales.map(s => {
            const client = (s.client as any)?.name || (s.client as any)?.phone || 'Без клиента';
            const emp = (s.employee as any)?.name ?? '—';
            const branchName = (s as any).branch?.name ?? '';
            const totalPaid = (s.paid_cash || 0) + (s.paid_kaspi || 0) + (s.paid_halyk || 0) + (s.paid_kaspi_transfer || 0);
            return (
              <div key={s.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{client}</p>
                    <p className="text-xs text-gray-400">{fmtDate(s.created_at)} · {emp}{branchName ? ` · ${branchName}` : ''}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">{fmt(s.total)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === 'paid' ? 'bg-green-100 text-green-700' : s.status === 'refunded' ? 'bg-red-100 text-red-600' : s.status === 'partially_refunded' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                      {s.status === 'paid' ? 'Оплачено' : s.status === 'refunded' ? 'Возврат' : s.status === 'partially_refunded' ? 'Частичный возврат' : s.status}
                    </span>
                  </div>
                </div>

                {/* Items */}
                {s.items && s.items.length > 0 && (
                  <p className="text-xs text-gray-500 truncate">
                    {s.items.map(i => `${(i.product as any)?.name ?? '—'} ×${i.quantity}`).join(', ')}
                  </p>
                )}

                {/* Payment breakdown */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-gray-50">
                  <span className="text-xs text-gray-500">{PAYMENT_LABEL[s.payment_method ?? ''] ?? s.payment_method}</span>
                  {(s.paid_cash || 0) > 0 && <span className="text-xs text-gray-400">💵 {fmt(s.paid_cash)}</span>}
                  {(s.paid_kaspi || 0) > 0 && <span className="text-xs text-gray-400">📱 {fmt(s.paid_kaspi)}</span>}
                  {(s.paid_halyk || 0) > 0 && <span className="text-xs text-gray-400">🏦 {fmt(s.paid_halyk)}</span>}
                  {(s.paid_kaspi_transfer || 0) > 0 && <span className="text-xs text-gray-400">💳 {fmt(s.paid_kaspi_transfer)}</span>}
                  {totalPaid > s.total && (
                    <span className="text-xs text-green-600">Сдача: {fmt(totalPaid - s.total)}</span>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* ПРЕДЗАКАЗЫ */}
        {tab === 'orders' && (
          loading ? <p className="text-sm text-gray-400 text-center py-10">Загрузка...</p> :
          orders.length === 0 ? <p className="text-sm text-gray-400 text-center py-10">Нет предзаказов</p> :
          orders.map(o => {
            const isPrepaid = o.payment_type === 'prepaid' || o.payment_type === 'full';
            const remaining = o.total_amount - (o.prepayment_amount || 0);
            const isOverdue = o.expected_date && new Date(o.expected_date) < new Date() && o.status !== 'completed' && o.status !== 'cancelled';
            return (
              <div key={o.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{o.client_name || o.client_phone || 'Без клиента'}</p>
                    <p className="text-xs text-gray-400">
                      {fmtDate(o.created_at)} · {o.creator?.name ?? '—'}{o.branch?.name ? ` · ${o.branch.name}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">{fmt(o.total_amount)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${o.status === 'completed' ? 'bg-green-100 text-green-700' : o.status === 'cancelled' ? 'bg-red-100 text-red-600' : o.status === 'ready' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {ORDER_STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </div>
                </div>

                {o.items && o.items.length > 0 && (
                  <p className="text-xs text-gray-500 truncate">
                    {o.items.map(i => `${i.product_name} ×${i.quantity}`).join(', ')}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-x-4 pt-1 border-t border-gray-50">
                  {/* Payment info */}
                  <div>
                    {o.payment_type === 'none' ? (
                      <p className="text-xs text-gray-400">Без предоплаты</p>
                    ) : (
                      <>
                        <p className="text-xs text-gray-600">
                          Предоплата: <span className="font-medium text-green-700">{fmt(o.prepayment_amount || 0)}</span>
                          {o.prepayment_method && <span className="text-gray-400"> ({o.prepayment_method === 'cash' ? 'нал' : 'Kaspi'})</span>}
                        </p>
                        {o.payment_type === 'prepaid' && remaining > 0 && (
                          <p className="text-xs text-orange-600">Остаток: {fmt(remaining)}</p>
                        )}
                        {o.payment_type === 'full' && (
                          <p className="text-xs text-green-600">100% оплачено</p>
                        )}
                      </>
                    )}
                  </div>
                  {/* Date */}
                  <div className="text-right">
                    {o.expected_date && (
                      <p className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                        {isOverdue ? '⚠️ ' : ''}Срок: {fmtDate(o.expected_date)}
                      </p>
                    )}
                    {o.notes && <p className="text-xs text-gray-400 truncate mt-0.5">{o.notes}</p>}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* МАСТЕРСКАЯ */}
        {tab === 'workshop' && (
          loading ? <p className="text-sm text-gray-400 text-center py-10">Загрузка...</p> :
          wsOrders.length === 0 ? <p className="text-sm text-gray-400 text-center py-10">Нет заказов мастерской</p> :
          wsOrders.map(wo => {
            const wsTotal = wo.service_price + wo.parts_price;
            const originalPrepay = (wo as any).original_prepayment ?? wo.prepayment ?? 0;
            const remainingPaid = (wo as any).remaining_paid_at != null;
            const totalPaid = remainingPaid ? wsTotal : originalPrepay;
            const remainingAmount = wsTotal - totalPaid;
            const isOverdue = wo.estimated_ready_at && new Date(wo.estimated_ready_at) < new Date()
              && wo.status !== 'done' && wo.status !== 'cancelled' && wo.status !== 'confirmed';
            return (
              <div key={wo.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{wo.client_name || '—'}</p>
                    <p className="text-xs text-gray-400">
                      {fmtDate(wo.created_at)} · {(wo as any).employee?.name ?? '—'}
                      {(wo as any).branch?.name ? ` · ${(wo as any).branch.name}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">{fmt(wsTotal)}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: WS_STATUS_COLOR[wo.status] + '20', color: WS_STATUS_COLOR[wo.status] }}>
                      {WS_STATUS_LABEL[wo.status] ?? wo.status}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-gray-600 truncate">🔧 {wo.service_name}</p>

                <div className="grid grid-cols-2 gap-x-4 pt-1 border-t border-gray-50">
                  {/* Payment status */}
                  <div className="space-y-0.5">
                    {wo.payment_type === 'on_delivery' ? (
                      <p className="text-xs text-gray-400">Оплата при получении</p>
                    ) : (
                      <>
                        {originalPrepay > 0 && (
                          <p className="text-xs text-gray-600">
                            Предоплата: <span className="font-medium text-green-700">{fmt(originalPrepay)}</span>
                            {(wo as any).prepayment_method && <span className="text-gray-400"> ({(wo as any).prepayment_method === 'cash' ? 'нал' : 'Kaspi'})</span>}
                          </p>
                        )}
                        {remainingPaid ? (
                          <p className="text-xs text-green-600">✓ Доплата получена {fmtDate((wo as any).remaining_paid_at)}</p>
                        ) : remainingAmount > 0 && wo.status !== 'done' ? (
                          <p className="text-xs text-orange-600">Остаток: {fmt(remainingAmount)}</p>
                        ) : null}
                      </>
                    )}
                  </div>
                  {/* Dates */}
                  <div className="text-right">
                    {wo.estimated_ready_at && (
                      <p className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                        {isOverdue ? '⚠️ ' : ''}Срок: {fmtDate(wo.estimated_ready_at)}
                      </p>
                    )}
                    {wo.completed_at && (
                      <p className="text-xs text-gray-400 mt-0.5">Выдан: {fmtDate(wo.completed_at)}</p>
                    )}
                  </div>
                </div>

                {wo.notes && <p className="text-xs text-gray-400 border-t border-gray-50 pt-1">{wo.notes}</p>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
