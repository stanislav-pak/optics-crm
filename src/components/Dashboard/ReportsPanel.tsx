import { useEffect, useState, useMemo, Component, type ReactNode } from 'react';
import { supabase } from '../../services/supabase';

// ── ErrorBoundary ─────────────────────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  componentDidCatch(e: Error, info: any) { console.error('[ReportsPanel] crash:', e, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-6" style={{ backgroundColor: '#0b141a' }}>
          <p className="text-sm font-semibold mb-2" style={{ color: '#f87171' }}>Ошибка в аналитике</p>
          <p className="text-xs text-center" style={{ color: '#8696a0' }}>{this.state.error}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-4 px-4 py-2 rounded-lg text-xs"
            style={{ backgroundColor: '#202c33', color: '#e9edef' }}
          >
            Попробовать снова
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── типы ──────────────────────────────────────────────────────────────────────
interface SaleRow {
  id: string;
  branch_id: string | null;
  total: number;
  created_at: string;
  status: string;
  items: { quantity: number; price: number; product_id: string; product: { cost_price: number; name: string } | null }[];
  branch: { id: string; name: string } | null;
  employee: { id: string; name: string } | null;
}

interface ChatRow {
  id: string;
  branch_id: string;
  last_message_at: string | null;
  employee: { id: string; name: string } | null;
  branch: { id: string; name: string; city: string } | null;
  current_stage: string;
}

// ── константы ─────────────────────────────────────────────────────────────────
const STAGE_META: Record<string, { label: string; hex: string }> = {
  new:         { label: 'Новый',      hex: '#3b82f6' },
  negotiation: { label: 'Переговоры', hex: '#f59e0b' },
  quote:       { label: 'Счёт',       hex: '#a855f7' },
  payment:     { label: 'Оплата',     hex: '#10b981' },
  closed:      { label: 'Закрыт',     hex: '#6b7280' },
};

const PERIODS = [
  { key: 'today',  label: 'Сегодня' },
  { key: 'week',   label: 'Неделя' },
  { key: 'month',  label: 'Месяц' },
  { key: 'all',    label: 'Всё время' },
  { key: 'custom', label: 'Период' },
];

function periodRange(key: string, from?: string, to?: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (key === 'today') {
    const f = new Date(now); f.setHours(0, 0, 0, 0);
    const t = new Date(now); t.setHours(23, 59, 59, 999);
    return { from: f, to: t };
  }
  if (key === 'week') {
    const f = new Date(now); f.setDate(now.getDate() - 6); f.setHours(0, 0, 0, 0);
    return { from: f, to: now };
  }
  if (key === 'month') {
    // Текущий месяц: с 1-го числа по сегодня включительно
    const f = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const t = new Date(now); t.setHours(23, 59, 59, 999);
    return { from: f, to: t };
  }
  if (key === 'custom' && from && to) {
    return { from: new Date(from), to: new Date(to + 'T23:59:59') };
  }
  return { from: null, to: null };
}

function fmtMoney(n: number) {
  if (n >= 1_000_000) return `₸${(n / 1_000_000).toFixed(1)}М`;
  if (n >= 1_000) return `₸${(n / 1_000).toFixed(0)}К`;
  return `₸${n.toLocaleString()}`;
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  } catch { return iso; }
}

// ── внутренний компонент (обёрнут в ErrorBoundary снаружи) ────────────────────
function ReportsPanelInner() {
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [period, setPeriod] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    setLoadError(null);
    try {
      console.log('[ReportsPanel] fetchAll start');

      // 1. Продажи
      let salesData: SaleRow[] = [];
      try {
        const res = await supabase
          .from('sales')
          .select(`id, branch_id, total, created_at, status,
            items:sale_items(quantity, price, product_id, product:products(cost_price, name)),
            branch:branches(id, name),
            employee:employees(id, name)`)
          .in('status', ['paid', 'partially_refunded'])
          .order('created_at', { ascending: true });
        if (res.error) {
          console.error('[ReportsPanel] sales error:', res.error);
        } else {
          salesData = (res.data ?? []) as SaleRow[];
          console.log('[ReportsPanel] sales loaded:', salesData.length);
        }
      } catch (e) { console.error('[ReportsPanel] sales fetch exception:', e); }
      setSales(salesData);

      // 2. Чаты
      let chatsData: any[] = [];
      try {
        const res = await supabase
          .from('chats')
          .select('id, branch_id, last_message_at, employee:employees(id, name), branch:branches(id, name, city)');
        if (res.error) {
          console.error('[ReportsPanel] chats error:', res.error);
        } else {
          chatsData = res.data ?? [];
          console.log('[ReportsPanel] chats loaded:', chatsData.length);
        }
      } catch (e) { console.error('[ReportsPanel] chats fetch exception:', e); }

      // 3. Стадии
      let stagesData: any[] = [];
      try {
        const res = await supabase
          .from('deal_stages')
          .select('chat_id, current_stage, moved_to_stage_at')
          .order('moved_to_stage_at', { ascending: false });
        if (res.error) {
          console.error('[ReportsPanel] stages error:', res.error);
        } else {
          stagesData = res.data ?? [];
          console.log('[ReportsPanel] stages loaded:', stagesData.length);
        }
      } catch (e) { console.error('[ReportsPanel] stages fetch exception:', e); }

      // Сборка чатов со стадиями
      try {
        const latestStage: Record<string, string> = {};
        stagesData.forEach((s: any) => {
          if (!latestStage[s.chat_id]) latestStage[s.chat_id] = s.current_stage;
        });
        setChats(chatsData.map((c: any) => ({
          ...c,
          current_stage: latestStage[c.id] ?? 'new',
        })));
      } catch (e) { console.error('[ReportsPanel] chats merge exception:', e); }

      console.log('[ReportsPanel] fetchAll done');
    } catch (e) {
      console.error('[ReportsPanel] fetchAll outer exception:', e);
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // ── фильтрация ──────────────────────────────────────────────────────────────
  const { from: pFrom, to: pTo } = periodRange(period, customFrom, customTo);

  const filteredSales = useMemo(() => {
    try {
      return sales.filter(s => {
        const d = new Date(s.created_at);
        if (pFrom && d < pFrom) return false;
        if (pTo && d > pTo) return false;
        return true;
      });
    } catch (e) { console.error('[ReportsPanel] filteredSales error:', e); return []; }
  }, [sales, pFrom, pTo]);

  const filteredChats = useMemo(() => {
    try {
      return chats.filter(c => {
        if (!pFrom) return true;
        const d = c.last_message_at ? new Date(c.last_message_at) : null;
        if (!d) return false;
        if (pFrom && d < pFrom) return false;
        if (pTo && d > pTo) return false;
        return true;
      });
    } catch (e) { console.error('[ReportsPanel] filteredChats error:', e); return []; }
  }, [chats, pFrom, pTo]);

  // ── выручка и доход ─────────────────────────────────────────────────────────
  const totalRevenue = useMemo(() => {
    try { return filteredSales.reduce((s, sale) => s + (sale.total ?? 0), 0); }
    catch (e) { console.error('[ReportsPanel] totalRevenue error:', e); return 0; }
  }, [filteredSales]);

  const totalCost = useMemo(() => {
    try {
      return filteredSales.reduce((sum, sale) =>
        sum + (sale.items ?? []).reduce((s, item) =>
          s + (item.quantity ?? 0) * (item.product?.cost_price ?? 0), 0), 0);
    } catch (e) { console.error('[ReportsPanel] totalCost error:', e); return 0; }
  }, [filteredSales]);

  const totalProfit = totalRevenue - totalCost;

  // ── данные по дням ───────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    try {
      const byDay: Record<string, number> = {};
      filteredSales.forEach(s => {
        const day = (s.created_at ?? '').split('T')[0];
        if (day) byDay[day] = (byDay[day] ?? 0) + (s.total ?? 0);
      });
      return Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, amount]) => ({ date, label: fmtDate(date), amount }));
    } catch (e) { console.error('[ReportsPanel] chartData error:', e); return []; }
  }, [filteredSales]);

  // ── топ-5 товаров ───────────────────────────────────────────────────────────
  const topProducts = useMemo(() => {
    try {
      const map: Record<string, { name: string; qty: number; revenue: number }> = {};
      filteredSales.forEach(sale =>
        (sale.items ?? []).forEach(item => {
          const name = item.product?.name ?? item.product_id ?? '—';
          if (!map[name]) map[name] = { name, qty: 0, revenue: 0 };
          map[name].qty += item.quantity ?? 0;
          map[name].revenue += (item.quantity ?? 0) * (item.price ?? 0);
        })
      );
      return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    } catch (e) { console.error('[ReportsPanel] topProducts error:', e); return []; }
  }, [filteredSales]);

  const maxProductRevenue = Math.max(...topProducts.map(p => p.revenue), 1);

  // ── воронка ─────────────────────────────────────────────────────────────────
  const stageCounts = useMemo(() => {
    try {
      const c: Record<string, number> = {};
      filteredChats.forEach(ch => { c[ch.current_stage] = (c[ch.current_stage] ?? 0) + 1; });
      return c;
    } catch (e) { console.error('[ReportsPanel] stageCounts error:', e); return {}; }
  }, [filteredChats]);

  const funnelStages = Object.entries(STAGE_META).map(([key, meta]) => ({
    key, ...meta, count: stageCounts[key] ?? 0,
  }));
  const maxFunnelCount = Math.max(...funnelStages.map(s => s.count), 1);

  // ── по филиалам ─────────────────────────────────────────────────────────────
  const branchStats = useMemo(() => {
    try {
      const map: Record<string, { id: string; name: string; revenue: number; profit: number }> = {};
      filteredSales.forEach(sale => {
        const br = sale.branch;
        if (!br) return;
        if (!map[br.id]) map[br.id] = { id: br.id, name: br.name, revenue: 0, profit: 0 };
        const cost = (sale.items ?? []).reduce((s, i) => s + (i.quantity ?? 0) * (i.product?.cost_price ?? 0), 0);
        map[br.id].revenue += sale.total ?? 0;
        map[br.id].profit += (sale.total ?? 0) - cost;
      });
      return Object.values(map).sort((a, b) => b.revenue - a.revenue);
    } catch (e) { console.error('[ReportsPanel] branchStats error:', e); return []; }
  }, [filteredSales]);

  // ── по менеджерам ────────────────────────────────────────────────────────────
  const empStats = useMemo(() => {
    try {
      const map: Record<string, { id: string; name: string; total: number; closed: number }> = {};
      filteredChats.forEach(c => {
        const emp = c.employee;
        if (!emp) return;
        if (!map[emp.id]) map[emp.id] = { id: emp.id, name: emp.name, total: 0, closed: 0 };
        map[emp.id].total++;
        if (c.current_stage === 'closed') map[emp.id].closed++;
      });
      return Object.values(map)
        .map(e => ({ ...e, conversion: e.total > 0 ? Math.round((e.closed / e.total) * 100) : 0 }))
        .sort((a, b) => b.total - a.total);
    } catch (e) { console.error('[ReportsPanel] empStats error:', e); return []; }
  }, [filteredChats]);

  // ── рендер ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: '#0b141a' }}>
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (loadError) return (
    <div className="flex-1 flex flex-col items-center justify-center p-6" style={{ backgroundColor: '#0b141a' }}>
      <p className="text-sm font-semibold mb-2" style={{ color: '#f87171' }}>Ошибка загрузки</p>
      <p className="text-xs text-center mb-4" style={{ color: '#8696a0' }}>{loadError}</p>
      <button onClick={fetchAll} className="px-4 py-2 rounded-lg text-xs" style={{ backgroundColor: '#202c33', color: '#e9edef' }}>
        Повторить
      </button>
    </div>
  );

  const totalClosed = filteredChats.filter(c => c.current_stage === 'closed').length;
  const totalChatsCount = filteredChats.length;
  const conversionRate = totalChatsCount > 0 ? Math.round((totalClosed / totalChatsCount) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ backgroundColor: '#0b141a' }}>

      {/* ── Фильтр периода ── */}
      <div className="space-y-2">
        <div className="flex gap-1.5 flex-wrap">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className="text-[11px] px-3 py-1.5 rounded-full transition-colors font-medium"
              style={{
                backgroundColor: period === p.key ? '#10b981' : 'rgba(255,255,255,0.05)',
                color: period === p.key ? '#fff' : '#8696a0',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex gap-2">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="flex-1 text-xs rounded-lg px-2 py-1.5 outline-none"
              style={{ backgroundColor: '#202c33', color: '#d1d7db', border: '1px solid rgba(255,255,255,0.05)' }} />
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="flex-1 text-xs rounded-lg px-2 py-1.5 outline-none"
              style={{ backgroundColor: '#202c33', color: '#d1d7db', border: '1px solid rgba(255,255,255,0.05)' }} />
          </div>
        )}
      </div>

      {/* ── Топ метрики ── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl p-4 space-y-1" style={{ backgroundColor: '#202c33' }}>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: '#8696a0' }}>Выручка</p>
          <p className="text-2xl font-bold" style={{ color: '#e9edef' }}>₸{totalRevenue.toLocaleString()}</p>
          <p className="text-[10px]" style={{ color: '#8696a0' }}>{filteredSales.length} продаж</p>
        </div>
        <div className="rounded-xl p-4 space-y-1" style={{ backgroundColor: '#202c33' }}>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: '#8696a0' }}>Доход</p>
          <p className="text-2xl font-bold" style={{ color: totalProfit >= 0 ? '#10b981' : '#f87171' }}>
            ₸{totalProfit.toLocaleString()}
          </p>
          <p className="text-[10px]" style={{ color: '#8696a0' }}>
            Маржа {totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0}%
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Чатов',     value: totalChatsCount,      color: '#e9edef' },
          { label: 'Закрыто',   value: totalClosed,          color: '#10b981' },
          { label: 'Конверсия', value: `${conversionRate}%`, color: '#f59e0b' },
        ].map(m => (
          <div key={m.label} className="rounded-xl p-3" style={{ backgroundColor: '#202c33' }}>
            <p className="text-[10px]" style={{ color: '#8696a0' }}>{m.label}</p>
            <p className="text-lg font-bold mt-0.5" style={{ color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* ── Продажи по дням (SVG) ── */}
      <div className="rounded-xl p-4" style={{ backgroundColor: '#202c33' }}>
        <h3 className="text-xs font-semibold mb-4" style={{ color: '#e9edef' }}>Продажи по дням</h3>
        {chartData.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: '#8696a0' }}>Нет данных за период</p>
        ) : (() => {
          // Отступы внутри SVG-координат
          const W = 300, H = 100;
          const padL = 38, padR = 6, padT = 6, padB = 20;
          const cW = W - padL - padR;   // ширина области данных
          const cH = H - padT - padB;   // высота области данных

          const vals = chartData.map(d => d.amount);
          const minV = Math.min(...vals);
          const maxV = Math.max(...vals);
          const rangeV = maxV - minV || 1;

          const toX = (i: number) =>
            padL + (chartData.length === 1 ? cW / 2 : (i / (chartData.length - 1)) * cW);
          const toY = (v: number) =>
            padT + cH - ((v - minV) / rangeV) * cH;

          const points = chartData.map((d, i) => `${toX(i)},${toY(d.amount)}`).join(' ');

          // Подписи X: первая и последняя (+ средняя если точек > 4)
          const xLabels: { i: number; label: string }[] = [];
          xLabels.push({ i: 0, label: chartData[0].label });
          if (chartData.length > 4) {
            const mid = Math.floor((chartData.length - 1) / 2);
            xLabels.push({ i: mid, label: chartData[mid].label });
          }
          xLabels.push({ i: chartData.length - 1, label: chartData[chartData.length - 1].label });

          // Подписи Y: 3 уровня
          const yLevels = [minV, minV + rangeV / 2, maxV];

          return (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              style={{ width: '100%', height: 'auto', overflow: 'visible' }}
            >
              {/* Сетка */}
              {yLevels.map((v, i) => (
                <line
                  key={i}
                  x1={padL} y1={toY(v)} x2={W - padR} y2={toY(v)}
                  stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3"
                />
              ))}

              {/* Подписи Y */}
              {yLevels.map((v, i) => (
                <text
                  key={i}
                  x={padL - 4} y={toY(v) + 3}
                  textAnchor="end"
                  fontSize={8}
                  fill="#8696a0"
                >
                  {fmtMoney(v)}
                </text>
              ))}

              {/* Область под линией */}
              <polygon
                points={`${toX(0)},${padT + cH} ${points} ${toX(chartData.length - 1)},${padT + cH}`}
                fill="rgba(16,185,129,0.08)"
              />

              {/* Линия */}
              <polyline
                points={points}
                fill="none"
                stroke="#10b981"
                strokeWidth="1.8"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Точки на линии */}
              {chartData.map((d, i) => (
                <circle
                  key={i}
                  cx={toX(i)} cy={toY(d.amount)} r={chartData.length <= 14 ? 2 : 0}
                  fill="#10b981"
                />
              ))}

              {/* Подписи X */}
              {xLabels.map(({ i, label }) => (
                <text
                  key={i}
                  x={toX(i)}
                  y={H - 4}
                  textAnchor={i === 0 ? 'start' : i === chartData.length - 1 ? 'end' : 'middle'}
                  fontSize={8}
                  fill="#8696a0"
                >
                  {label}
                </text>
              ))}
            </svg>
          );
        })()}
      </div>

      {/* ── Воронка сделок ── */}
      <div className="rounded-xl p-4" style={{ backgroundColor: '#202c33' }}>
        <h3 className="text-xs font-semibold mb-4" style={{ color: '#e9edef' }}>Воронка сделок</h3>
        <div className="space-y-2">
          {funnelStages.map((s, idx) => {
            const widthPct = maxFunnelCount > 0 ? (s.count / maxFunnelCount) * 100 : 0;
            const prev = idx > 0 ? funnelStages[idx - 1].count : null;
            const convPct = prev != null && prev > 0 ? Math.round((s.count / prev) * 100) : null;
            return (
              <div key={s.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs" style={{ color: '#d1d7db' }}>{s.label}</span>
                  <div className="flex items-center gap-2">
                    {convPct !== null && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: '#8696a0' }}>
                        {convPct}%
                      </span>
                    )}
                    <span className="text-xs font-semibold tabular-nums" style={{ color: '#e9edef', minWidth: '2ch', textAlign: 'right' }}>
                      {s.count}
                    </span>
                  </div>
                </div>
                <div className="h-5 rounded-md overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                  <div
                    className="h-full rounded-md transition-all duration-500"
                    style={{ width: `${widthPct}%`, backgroundColor: s.hex, opacity: 0.85 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Топ-5 товаров ── */}
      <div className="rounded-xl p-4" style={{ backgroundColor: '#202c33' }}>
        <h3 className="text-xs font-semibold mb-4" style={{ color: '#e9edef' }}>Топ товаров</h3>
        {topProducts.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: '#8696a0' }}>Нет данных</p>
        ) : (
          <div className="space-y-3">
            {topProducts.map((p, idx) => (
              <div key={p.name}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold tabular-nums flex-shrink-0" style={{ color: '#8696a0', minWidth: '1.2rem' }}>
                      #{idx + 1}
                    </span>
                    <span className="text-xs truncate" style={{ color: '#d1d7db' }}>{p.name}</span>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <span className="text-xs font-semibold" style={{ color: '#e9edef' }}>{fmtMoney(p.revenue)}</span>
                    <span className="text-[10px] ml-1" style={{ color: '#8696a0' }}>· {p.qty} шт</span>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(p.revenue / maxProductRevenue) * 100}%`, backgroundColor: '#3b82f6', opacity: 0.8 }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── По филиалам ── */}
      <div className="rounded-xl p-4" style={{ backgroundColor: '#202c33' }}>
        <h3 className="text-xs font-semibold mb-3" style={{ color: '#e9edef' }}>По филиалам</h3>
        {branchStats.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: '#8696a0' }}>Нет данных</p>
        ) : (
          <div>
            <div className="grid grid-cols-3 gap-2 mb-2 pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Филиал', 'Выручка', 'Доход'].map(h => (
                <p key={h} className="text-[10px] font-medium" style={{ color: '#8696a0' }}>{h}</p>
              ))}
            </div>
            <div className="space-y-2">
              {branchStats.map(b => (
                <div key={b.id} className="grid grid-cols-3 gap-2 items-center">
                  <p className="text-xs truncate" style={{ color: '#d1d7db' }}>{b.name}</p>
                  <p className="text-xs font-semibold" style={{ color: '#e9edef' }}>{fmtMoney(b.revenue)}</p>
                  <p className="text-xs font-semibold" style={{ color: b.profit >= 0 ? '#10b981' : '#f87171' }}>
                    {fmtMoney(b.profit)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── По менеджерам ── */}
      <div className="rounded-xl p-4" style={{ backgroundColor: '#202c33' }}>
        <h3 className="text-xs font-semibold mb-3" style={{ color: '#e9edef' }}>По менеджерам</h3>
        {empStats.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: '#8696a0' }}>Нет данных</p>
        ) : (
          <div className="space-y-2">
            {empStats.map(e => (
              <div key={e.id} className="flex items-center gap-3 rounded-xl p-3" style={{ backgroundColor: '#2a3942' }}>
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg,#10b981,#0d9488)' }}
                >
                  {(e.name?.[0] ?? '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: '#e9edef' }}>{e.name}</p>
                  <p className="text-[10px]" style={{ color: '#8696a0' }}>{e.total} чатов · {e.closed} закрыто</p>
                </div>
                <span className="text-sm font-bold flex-shrink-0" style={{ color: e.conversion > 0 ? '#10b981' : '#8696a0' }}>
                  {e.conversion}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

// ── публичный экспорт ─────────────────────────────────────────────────────────
interface ReportsPanelProps { onBack?: () => void; }

export function ReportsPanel({ onBack: _onBack }: ReportsPanelProps) {
  return (
    <ErrorBoundary>
      <ReportsPanelInner />
    </ErrorBoundary>
  );
}
