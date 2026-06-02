import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { AlertTriangle, Trash2, RotateCcw, Tag, TrendingDown, Clock } from 'lucide-react';

interface ManagerStats {
  employee_id: string;
  name: string;
  branch: string;
  writeoff: number;
  return: number;
  discount: number;
  below_cost: number;
  transfer_discrepancy: number;
  total: number;
}

interface OffHourSale {
  id: string;
  created_at: string;
  total: number;
  employee_name: string;
  branch_name: string;
  hour: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat('ru-KZ', { style: 'currency', currency: 'KZT', maximumFractionDigits: 0 }).format(n);
}

function getAlmatyHour(ts: string): number {
  return (new Date(ts).getUTCHours() + 5) % 24;
}

function isOffHours(ts: string): boolean {
  const h = getAlmatyHour(ts);
  return h < 9 || h >= 19;
}

function formatHour(ts: string): string {
  const h = getAlmatyHour(ts);
  const m = new Date(ts).getUTCMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function AnomalyDashboard() {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [managers, setManagers] = useState<ManagerStats[]>([]);
  const [offHourSales, setOffHourSales] = useState<OffHourSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [eventDetails, setEventDetails] = useState<Record<string, any[]>>({});

  useEffect(() => {
    load();
  }, [period]);

  const load = async () => {
    setLoading(true);
    const days = period === 'week' ? 7 : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    // Аномалии по менеджерам из watchlist_events
    const { data: events } = await supabase
      .from('watchlist_events')
      .select('*, employee:employees(id, name, branch:branches(name)), product:products(id, name)')
      .gte('created_at', since)
      .in('type', ['writeoff', 'return', 'discount', 'below_cost', 'transfer_discrepancy']);

    // Агрегация по менеджерам
    const map: Record<string, ManagerStats> = {};
    (events || []).forEach((e: any) => {
      const id = e.employee_id;
      if (!id) return;
      if (!map[id]) {
        map[id] = {
          employee_id: id,
          name: e.employee?.name || '—',
          branch: e.employee?.branch?.name || '—',
          writeoff: 0, return: 0, discount: 0,
          below_cost: 0, transfer_discrepancy: 0, total: 0,
        };
      }
      if (e.type in map[id]) {
        (map[id] as any)[e.type]++;
        map[id].total++;
      }
    });

    const sorted = Object.values(map).sort((a, b) => b.total - a.total);
    setManagers(sorted);

    const details: Record<string, any[]> = {};
    (events || []).forEach((e: any) => {
      if (!e.employee_id) return;
      if (!details[e.employee_id]) details[e.employee_id] = [];
      details[e.employee_id].push(e);
    });
    setEventDetails(details);

    // Продажи вне рабочего времени
    const { data: sales } = await supabase
      .from('sales')
      .select('id, created_at, total, employee:employees(name, branch:branches(name))')
      .eq('status', 'paid')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);

    const off = (sales || [])
      .filter((s: any) => isOffHours(s.created_at))
      .map((s: any) => ({
        id: s.id,
        created_at: s.created_at,
        total: s.total,
        employee_name: (s.employee as any)?.name || '—',
        branch_name: (s.employee as any)?.branch?.name || '—',
        hour: getAlmatyHour(s.created_at),
      }));

    setOffHourSales(off);
    setLoading(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Переключатель периода */}
      <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-100">
        <span className="text-xs text-gray-500">Период:</span>
        {(['week', 'month'] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              period === p ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {p === 'week' ? 'Неделя' : 'Месяц'}
          </button>
        ))}
      </div>

      {/* Рейтинг менеджеров */}
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-500" />
          Аномалии по менеджерам
        </h3>
        {managers.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">Нет данных за период</p>
        ) : (
          <div className="space-y-2">
            {managers.map((m, i) => (
              <div
                key={m.employee_id}
                onClick={() => setExpandedId(expandedId === m.employee_id ? null : m.employee_id)}
                className="bg-white border border-gray-200 rounded-xl p-3 cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-xs font-bold text-gray-400 mr-2">#{i + 1}</span>
                    <span className="text-sm font-semibold text-gray-900">{m.name}</span>
                    <span className="text-xs text-gray-400 ml-1">· {m.branch}</span>
                  </div>
                  <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${
                    m.total >= 5 ? 'bg-red-100 text-red-700' :
                    m.total >= 2 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {m.total} аном.
                  </span>
                </div>
                <div className="flex gap-3 flex-wrap">
                  {m.writeoff > 0 && (
                    <span className="flex items-center gap-1 text-xs text-red-600">
                      <Trash2 className="w-3 h-3" /> {m.writeoff} списаний
                    </span>
                  )}
                  {m.return > 0 && (
                    <span className="flex items-center gap-1 text-xs text-orange-600">
                      <RotateCcw className="w-3 h-3" /> {m.return} возвратов
                    </span>
                  )}
                  {m.discount > 0 && (
                    <span className="flex items-center gap-1 text-xs text-yellow-600">
                      <Tag className="w-3 h-3" /> {m.discount} скидок
                    </span>
                  )}
                  {m.below_cost > 0 && (
                    <span className="flex items-center gap-1 text-xs text-purple-600">
                      <TrendingDown className="w-3 h-3" /> {m.below_cost} ниже себест.
                    </span>
                  )}
                  {m.transfer_discrepancy > 0 && (
                    <span className="flex items-center gap-1 text-xs text-orange-600">
                      <AlertTriangle className="w-3 h-3" /> {m.transfer_discrepancy} расхождений
                    </span>
                  )}
                </div>
                {expandedId === m.employee_id && eventDetails[m.employee_id] && (
                  <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
                    {eventDetails[m.employee_id].map((e: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-700 font-medium truncate">{e.product?.name || 'Без товара'}</p>
                          <p className="text-gray-400">
                            {new Date(e.created_at).toLocaleDateString('ru-RU')} · {String((new Date(e.created_at).getUTCHours() + 5) % 24).padStart(2, '0')}:{String(new Date(e.created_at).getUTCMinutes()).padStart(2, '0')}
                          </p>
                        </div>
                        {e.amount > 0 && (
                          <span className="font-semibold text-gray-900 flex-shrink-0">
                            {new Intl.NumberFormat('ru-KZ', { style: 'currency', currency: 'KZT', maximumFractionDigits: 0 }).format(e.amount)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Продажи вне рабочего времени */}
      <div className="px-4 pt-2 pb-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-500" />
          Продажи вне рабочего времени
          <span className="text-xs text-gray-400 font-normal">(до 09:00 / после 19:00)</span>
        </h3>
        {offHourSales.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">Нет продаж вне рабочего времени</p>
        ) : (
          <div className="space-y-2">
            {offHourSales.slice(0, 20).map(s => (
              <div key={s.id} className="bg-white border border-blue-100 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{s.employee_name}
                    <span className="text-gray-400 font-normal"> · {s.branch_name}</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(s.created_at).toLocaleDateString('ru-RU')} в{' '}
                    <span className={`font-semibold ${s.hour < 9 ? 'text-purple-600' : 'text-orange-600'}`}>
                      {formatHour(s.created_at)}
                    </span>
                  </p>
                </div>
                <span className="text-sm font-bold text-gray-900">{fmt(s.total)}</span>
              </div>
            ))}
            {offHourSales.length > 20 && (
              <p className="text-xs text-gray-400 text-center pt-1">
                + ещё {offHourSales.length - 20}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
