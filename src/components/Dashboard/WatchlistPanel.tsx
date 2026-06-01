import { useState, useEffect, useCallback, type ElementType } from 'react';
import { supabase } from '../../services/supabase';
import {
  AlertTriangle, Trash2, RotateCcw, Tag, TrendingDown,
  CheckCircle, Eye, RefreshCw, ShieldAlert, Banknote,
} from 'lucide-react';

type WatchlistEventType = 'writeoff' | 'return' | 'discount' | 'below_cost' | 'transfer_discrepancy' | 'cash_discrepancy';

interface WatchlistEvent {
  id: string;
  type: WatchlistEventType;
  branch_id: string;
  employee_id: string;
  product_id: string;
  sale_id?: string;
  movement_id?: string;
  quantity: number;
  amount: number;
  discount_pct?: number;
  extra?: Record<string, unknown>;
  notes?: string;
  is_reviewed: boolean;
  created_at: string;
  employee?: { id: string; name: string };
  product?: { id: string; name: string; sku: string };
  branch?: { id: string; name: string };
}

const EVENT_CONFIG: Record<WatchlistEventType, { label: string; icon: ElementType; bg: string; text: string; dot: string }> = {
  writeoff:              { label: 'Списание',      icon: Trash2,        bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
  return:                { label: 'Возврат',        icon: RotateCcw,     bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  discount:              { label: 'Скидка >10%',   icon: Tag,           bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  below_cost:            { label: 'Ниже себест.',  icon: TrendingDown,  bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  transfer_discrepancy:  { label: 'Расхождение',   icon: AlertTriangle, bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  cash_discrepancy:      { label: 'Касса',         icon: Banknote,      bg: 'bg-rose-100',   text: 'text-rose-700',   dot: 'bg-rose-500'   },
};

const FILTERS = [
  { value: 'unreviewed', label: 'Новые' },
  { value: 'all',        label: 'Все' },
  { value: 'writeoff',              label: 'Списания' },
  { value: 'return',                label: 'Возвраты' },
  { value: 'discount',              label: 'Скидки' },
  { value: 'below_cost',            label: 'Ниже с/с' },
  { value: 'transfer_discrepancy',  label: 'Расхождения' },
  { value: 'cash_discrepancy',      label: 'Касса' },
];

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('ru-KZ', { style: 'currency', currency: 'KZT', maximumFractionDigits: 0 }).format(amount);
}

function formatTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин. назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч. назад`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} дн. назад`;
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function WatchlistPanel() {
  const [events, setEvents] = useState<WatchlistEvent[]>([]);
  const [filter, setFilter] = useState('unreviewed');
  const [loading, setLoading] = useState(true);
  const [unreviewedCount, setUnreviewedCount] = useState(0);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('watchlist_events')
      .select('*, employee:employees(id, name), product:products(id, name, sku), branch:branches(id, name)')
      .order('created_at', { ascending: false })
      .limit(300);
    if (!error && data) {
      setEvents(data as WatchlistEvent[]);
      setUnreviewedCount(data.filter((e) => !e.is_reviewed).length);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEvents();
    const channel = supabase
      .channel('watchlist-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'watchlist_events' }, () => { fetchEvents(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'watchlist_events' }, (payload) => {
        setEvents((prev) => prev.map((e) => e.id === payload.new.id ? { ...e, is_reviewed: payload.new.is_reviewed as boolean } : e));
        setUnreviewedCount((prev) => payload.new.is_reviewed ? Math.max(0, prev - 1) : prev + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchEvents]);

  const markReviewed = async (id: string) => {
    await supabase.from('watchlist_events').update({ is_reviewed: true }).eq('id', id);
  };

  const markAllReviewed = async () => {
    const ids = events.filter((e) => !e.is_reviewed).map((e) => e.id);
    if (!ids.length) return;
    await supabase.from('watchlist_events').update({ is_reviewed: true }).in('id', ids);
    setEvents((prev) => prev.map((e) => ({ ...e, is_reviewed: true })));
    setUnreviewedCount(0);
  };

  const filtered = events.filter((e) => {
    if (filter === 'all') return true;
    if (filter === 'unreviewed') return !e.is_reviewed;
    return e.type === filter;
  });

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-gray-600" />
          <h2 className="font-semibold text-gray-900 text-base">На заметке</h2>
          {unreviewedCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
              {unreviewedCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreviewedCount > 0 && (
            <button onClick={markAllReviewed} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-emerald-50">
              <CheckCircle className="w-3.5 h-3.5" /> Все просмотрены
            </button>
          )}
          <button onClick={fetchEvents} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-white border-b border-gray-200 px-3 py-2 flex gap-1.5 overflow-x-auto flex-shrink-0 scrollbar-none">
        {FILTERS.map((opt) => {
          const count = opt.value === 'unreviewed' ? events.filter((e) => !e.is_reviewed).length
            : opt.value === 'all' ? events.length
            : events.filter((e) => e.type === opt.value).length;
          return (
            <button key={opt.value} onClick={() => setFilter(opt.value)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${filter === opt.value ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {opt.label}
              {count > 0 && <span className={`text-xs ${filter === opt.value ? 'text-emerald-100' : 'text-gray-400'}`}>{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <CheckCircle className="w-10 h-10" />
            <p className="text-sm font-medium">Всё чисто</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((event) => {
              const cfg = EVENT_CONFIG[event.type];
              const Icon = cfg.icon;
              return (
                <div key={event.id} className={`px-4 py-3 bg-white hover:bg-gray-50 transition-colors ${event.is_reviewed ? 'opacity-50' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${event.is_reviewed ? 'opacity-0' : cfg.dot}`} />
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${cfg.bg}`}>
                      <Icon className={`w-4 h-4 ${cfg.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                        {event.amount > 0 && <span className="text-sm font-bold text-gray-900">{formatAmount(event.amount)}</span>}
                        {event.discount_pct != null && <span className="text-xs font-bold text-yellow-700">−{event.discount_pct}%</span>}
                        {event.type === 'below_cost' && event.extra && (
                          <span className="text-xs text-purple-600">
                            −{formatAmount(((event.extra.cost_price as number) - (event.extra.sold_price as number)) * event.quantity)} убыток
                          </span>
                        )}
                      </div>
                      {event.product && (
                        <p className="text-sm text-gray-800 mt-0.5 font-medium">
                          {event.product.name}
                          {event.quantity > 0 && <span className="text-gray-500 font-normal"> × {event.quantity} шт.</span>}
                        </p>
                      )}
                      {event.notes && <p className="text-xs text-gray-500 mt-0.5">{event.notes}</p>}
                      {event.type === 'transfer_discrepancy' && event.extra && (
                        <p className="text-xs text-orange-600 mt-0.5">Отправлено: {event.extra.sent_qty as number}, принято: {event.extra.confirmed_qty as number}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap text-xs text-gray-400">
                        {event.employee && <span className="text-gray-500 font-medium">{event.employee.name}</span>}
                        {event.branch && <span>· {event.branch.name}</span>}
                        <span>· {formatTime(event.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {!event.is_reviewed ? (
                        <button onClick={() => markReviewed(event.id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-emerald-500 transition-colors" title="Просмотрено">
                          <Eye className="w-4 h-4" />
                        </button>
                      ) : (
                        <div className="p-1.5 text-gray-200"><CheckCircle className="w-4 h-4" /></div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {events.length > 0 && (
        <div className="bg-white border-t border-gray-200 px-4 py-2 flex items-center justify-between text-xs text-gray-400 flex-shrink-0">
          <span>Показано: {filtered.length}</span>
          <span>Всего: {events.length}</span>
        </div>
      )}
    </div>
  );
}

export function useWatchlistCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const fetch = async () => {
      const { count: c } = await supabase
        .from('watchlist_events')
        .select('id', { count: 'exact', head: true })
        .eq('is_reviewed', false);
      setCount(c ?? 0);
    };
    fetch();
    const channel = supabase
      .channel('watchlist-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'watchlist_events' }, () => { setCount((p) => p + 1); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'watchlist_events' }, (payload) => {
        if (payload.new.is_reviewed && !payload.old.is_reviewed) setCount((p) => Math.max(0, p - 1));
        if (!payload.new.is_reviewed && payload.old.is_reviewed) setCount((p) => p + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);
  return count;
}
