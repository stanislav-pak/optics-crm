import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../services/supabase';
import type { Sale } from '../../types';
import type { Order } from '../../services/orders';
import type { ServiceOrder } from '../../types';

type Tab = 'sales' | 'orders' | 'workshop';

interface Branch { id: string; name: string; }

interface SalesCursor { createdAt: string; id: string; }

interface SalesSummary {
  count: number;
  totalSum: number;   // Σ sales.total по не-возвратным
  collected: number;  // Σ paid_* + Σ debt_amount уже погашенных долгов
  debt: number;       // Σ debt_amount непогашенных долгов
}

const EMPTY_SUMMARY: SalesSummary = { count: 0, totalSum: 0, collected: 0, debt: 0 };

export const ADMIN_SALES_PAGE_SIZE = 50;
const PAGE_SIZE = ADMIN_SALES_PAGE_SIZE;

const PAYMENT_LABEL: Record<string, string> = {
  cash: '💵 Нал', kaspi_qr: '📱 Kaspi QR', halyk: '🏦 POST',
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
// Дата + точное время (чч:мм) — как в InventoryPage, только для продаж:
// там, где важно "во сколько", не только "когда".
function fmtDateTime(s?: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const SALES_LIST_SELECT = `*, branch:branches(name), client:clients(name, phone), employee:employees(name), items:sale_items(*, product:products(name))`;
const SALES_SUMMARY_SELECT = `total, status, paid_cash, paid_kaspi, paid_halyk, paid_kaspi_transfer, debt_amount, debt_paid_at`;

export default function AdminSalesHistory() {
  const [tab, setTab] = useState<Tab>('sales');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>('');
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesCursor, setSalesCursor] = useState<SalesCursor | null>(null);
  const [salesLoadingMore, setSalesLoadingMore] = useState(false);
  const [salesSummary, setSalesSummary] = useState<SalesSummary>(EMPTY_SUMMARY);
  const [orders, setOrders] = useState<Order[]>([]);
  const [wsOrders, setWsOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Защита от гонки при быстрой смене фильтров — применяем только результат
  // последнего запущенного запроса (тот же паттерн, что в ActivityAuditView).
  const requestSeqRef = useRef(0);

  useEffect(() => {
    supabase.from('branches').select('id, name').order('name')
      .then(({ data }) => setBranches(data ?? []));
  }, []);

  const loadSalesSummary = useCallback(async () => {
    let q: any = supabase.from('sales').select(SALES_SUMMARY_SELECT);
    if (branchId) q = q.eq('branch_id', branchId);
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59');
    const { data } = await q;
    const rows = (data ?? []).filter((r: any) => r.status !== 'refunded');

    const totalSum = rows.reduce((s: number, r: any) => s + (r.total || 0), 0);
    const collectedPaid = rows.reduce((s: number, r: any) =>
      s + (r.paid_cash || 0) + (r.paid_kaspi || 0) + (r.paid_halyk || 0) + (r.paid_kaspi_transfer || 0), 0);
    // Долг, который уже погасили, НЕ прибавляется к paid_cash/paid_kaspi самой
    // продажи (см. settleSaleDebt) — иначе задвоение в кассе. Поэтому здесь
    // "собрано" = реально оплаченное при продаже + отдельно погашенные долги,
    // а "долг" — только то, что ещё не погашено. collected + debt === totalSum.
    const settledDebt = rows.reduce((s: number, r: any) => s + (r.debt_paid_at ? (r.debt_amount || 0) : 0), 0);
    const unsettledDebt = rows.reduce((s: number, r: any) => s + (!r.debt_paid_at ? (r.debt_amount || 0) : 0), 0);

    const summary: SalesSummary = {
      count: rows.length,
      totalSum,
      collected: collectedPaid + settledDebt,
      debt: unsettledDebt,
    };
    return summary;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, dateFrom, dateTo]);

  const loadSalesPage = useCallback(async (cursor?: SalesCursor | null) => {
    let q: any = supabase
      .from('sales')
      .select(SALES_LIST_SELECT)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE);
    if (branchId) q = q.eq('branch_id', branchId);
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59');
    if (cursor) {
      q = q.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
      );
    }
    const { data } = await q;
    const rows = (data ?? []) as Sale[];
    const last = rows[rows.length - 1];
    const nextCursor: SalesCursor | null =
      rows.length === PAGE_SIZE && last ? { createdAt: last.created_at, id: last.id } : null;
    return { rows, nextCursor };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, dateFrom, dateTo]);

  const loadOrdersAndWorkshop = useCallback(async () => {
    let orders: Order[];
    // Pre-orders
    {
      let q: any = supabase
        .from('orders')
        .select(`*, branch:branches!orders_branch_id_fkey(name), creator:employees!orders_created_by_fkey(name), items:order_items(*)`)
        .order('created_at', { ascending: false })
        .limit(200);
      if (branchId) q = q.eq('branch_id', branchId);
      if (dateFrom) q = q.gte('created_at', dateFrom);
      if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59');
      const { data } = await q;
      orders = (data ?? []).map((r: any) => ({ ...r, branch: r.branch, creator: r.creator, items: r.order_items ?? r.items })) as Order[];
    }
    // Workshop orders
    let wsOrders: ServiceOrder[];
    {
      let q: any = supabase
        .from('service_orders')
        .select(`*, branch:branches!service_orders_created_branch_id_fkey(name), employee:employees(name)`)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(200);
      if (branchId) q = q.eq('created_branch_id', branchId);
      if (dateFrom) q = q.gte('created_at', dateFrom);
      if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59');
      const { data } = await q;
      wsOrders = (data ?? []) as ServiceOrder[];
    }
    return { orders, wsOrders };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, dateFrom, dateTo]);

  // Все сеттеры централизованы здесь под одной seq-проверкой — иначе (как было
  // до ревью) сводка/предзаказы/мастерская могли применить устаревший ответ
  // при быстрой смене фильтров, даже если список продаж уже обновился верно.
  const loadAll = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    try {
      const [salesPage, summary, ordersAndWorkshop] = await Promise.all([
        loadSalesPage(null),
        loadSalesSummary(),
        loadOrdersAndWorkshop(),
      ]);
      if (seq !== requestSeqRef.current) return;
      setSales(salesPage.rows);
      setSalesCursor(salesPage.nextCursor);
      setSalesSummary(summary);
      setOrders(ordersAndWorkshop.orders);
      setWsOrders(ordersAndWorkshop.wsOrders);
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  }, [loadSalesPage, loadSalesSummary, loadOrdersAndWorkshop]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function loadMoreSales() {
    if (!salesCursor || salesLoadingMore) return;
    const seq = requestSeqRef.current;
    setSalesLoadingMore(true);
    try {
      const page = await loadSalesPage(salesCursor);
      if (seq !== requestSeqRef.current) return; // фильтр сменился, пока грузили следующую страницу
      setSales(prev => [...prev, ...page.rows]);
      setSalesCursor(page.nextCursor);
    } finally {
      setSalesLoadingMore(false);
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'sales', label: 'Продажи', count: salesSummary.count },
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
          <button onClick={loadAll} disabled={loading}
            className="ml-auto px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-50">
            {loading ? '↻' : '↺'} Обновить
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">

        {/* ПРОДАЖИ */}
        {tab === 'sales' && (
          <>
            {/* Сводка за филиал+период */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-1">
              <div className="bg-white rounded-xl border border-gray-200 px-3 py-2">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Продаж</p>
                <p className="text-sm font-bold text-gray-900">{salesSummary.count}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 px-3 py-2">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Продано (чеки)</p>
                <p className="text-sm font-bold text-gray-900">{fmt(salesSummary.totalSum)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 px-3 py-2">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Собрано</p>
                <p className="text-sm font-bold text-emerald-700">{fmt(salesSummary.collected)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 px-3 py-2">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Долг</p>
                <p className={`text-sm font-bold ${salesSummary.debt > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {fmt(salesSummary.debt)}
                </p>
              </div>
            </div>

            {loading ? <p className="text-sm text-gray-400 text-center py-10">Загрузка...</p> :
            sales.length === 0 ? <p className="text-sm text-gray-400 text-center py-10">Нет продаж</p> :
            <>
              {sales.map(s => {
                const client = (s.client as any)?.name || (s.client as any)?.phone || 'Без клиента';
                const emp = (s.employee as any)?.name ?? '—';
                const branchName = (s as any).branch?.name ?? '';
                const totalPaid = (s.paid_cash || 0) + (s.paid_kaspi || 0) + (s.paid_halyk || 0) + (s.paid_kaspi_transfer || 0);
                return (
                  <div key={s.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{client}</p>
                        <p className="text-xs text-gray-400">{fmtDateTime(s.created_at)} · {emp}{branchName ? ` · ${branchName}` : ''}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-gray-900">{fmt(s.total)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === 'paid' ? 'bg-green-100 text-green-700' : s.status === 'refunded' ? 'bg-red-100 text-red-600' : s.status === 'partially_refunded' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                          {s.status === 'paid' ? 'Оплачено' : s.status === 'refunded' ? 'Возврат' : s.status === 'partially_refunded' ? 'Частичный возврат' : s.status}
                        </span>
                      </div>
                    </div>

                    {/* Товары: название × кол-во, цена за штуку, скидка (если была) */}
                    {s.items && s.items.length > 0 && (
                      <div className="space-y-1 border-t border-gray-50 pt-2">
                        {s.items.map((item, idx) => {
                          const hasDiscount = item.list_price != null && item.list_price > item.price;
                          return (
                            <div key={idx} className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs text-gray-700 truncate">
                                  {(item.product as any)?.name ?? '—'} × {item.quantity}
                                </p>
                                <p className="text-[11px] text-gray-400">
                                  ₸{item.price.toLocaleString()}/шт
                                  {hasDiscount && (
                                    <span className="text-amber-600">
                                      {' '}· было ₸{item.list_price!.toLocaleString()}, скидка ₸{((item.list_price! - item.price) * item.quantity).toLocaleString()}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <span className="text-xs font-medium text-gray-600 flex-shrink-0">
                                ₸{(item.quantity * item.price).toLocaleString()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
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
              })}

              {salesCursor && (
                <button
                  onClick={loadMoreSales}
                  disabled={salesLoadingMore}
                  className="w-full py-2.5 text-sm text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl font-medium disabled:opacity-50"
                >
                  {salesLoadingMore ? 'Загружаем...' : 'Показать ещё'}
                </button>
              )}
            </>
            }
          </>
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
