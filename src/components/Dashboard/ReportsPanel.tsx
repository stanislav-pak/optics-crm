import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';

interface StageStats {
  stage: string;
  label: string;
  count: number;
  color: string;
}

interface EmployeeStat {
  id: string;
  name: string;
  total: number;
  closed: number;
  conversion: number;
}

interface BranchStat {
  id: string;
  name: string;
  city: string;
  total: number;
  closed: number;
}

const STAGE_META: Record<string, { label: string; color: string }> = {
  new:         { label: 'Новый',      color: 'bg-blue-500' },
  negotiation: { label: 'Переговоры', color: 'bg-amber-500' },
  quote:       { label: 'Счёт',       color: 'bg-purple-500' },
  payment:     { label: 'Оплата',     color: 'bg-emerald-500' },
  closed:      { label: 'Закрыт',     color: 'bg-gray-500' },
};

const DATE_PERIODS = [
  { key: 'all',   label: 'Всё время' },
  { key: 'today', label: 'Сегодня' },
  { key: 'week',  label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: 'custom', label: 'Период' },
];

function getPeriodDates(period: string, customFrom?: string, customTo?: string): { from?: Date; to?: Date } {
  const now = new Date();
  if (period === 'today') {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    const to = new Date(now); to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  if (period === 'week') {
    const from = new Date(now); from.setDate(now.getDate() - 7); from.setHours(0, 0, 0, 0);
    return { from, to: now };
  }
  if (period === 'month') {
    const from = new Date(now); from.setDate(1); from.setHours(0, 0, 0, 0);
    return { from, to: now };
  }
  if (period === 'custom' && customFrom && customTo) {
    return { from: new Date(customFrom), to: new Date(customTo + 'T23:59:59') };
  }
  return {};
}

export function ReportsPanel() {
  const [allChatsWithStage, setAllChatsWithStage] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePeriod, setActivePeriod] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const { data: chats } = await supabase
      .from('chats')
      .select('id, branch_id, last_message_at, employee:employees(id, name), branch:branches(id, name, city)');

    const { data: stages } = await supabase
      .from('deal_stages')
      .select('chat_id, current_stage, moved_to_stage_at')
      .order('moved_to_stage_at', { ascending: false });

    const latestStage: Record<string, string> = {};
    stages?.forEach((s) => {
      if (!latestStage[s.chat_id]) latestStage[s.chat_id] = s.current_stage;
    });

    setAllChatsWithStage((chats ?? []).map(c => ({
      ...c,
      current_stage: latestStage[c.id] ?? 'new',
    })));
    setLoading(false);
  };

  const { from: periodFrom, to: periodTo } = getPeriodDates(activePeriod, customFrom, customTo);

  const chatsWithStage = allChatsWithStage.filter(c => {
    if (!periodFrom) return true;
    const d = c.last_message_at ? new Date(c.last_message_at) : null;
    if (!d) return false;
    if (periodFrom && d < periodFrom) return false;
    if (periodTo && d > periodTo) return false;
    return true;
  });

  const totalChats = chatsWithStage.length;
  const totalClosed = chatsWithStage.filter(c => c.current_stage === 'closed').length;
  const conversionRate = totalChats > 0 ? Math.round((totalClosed / totalChats) * 100) : 0;

  const stageCounts: Record<string, number> = {};
  chatsWithStage.forEach(c => {
    stageCounts[c.current_stage] = (stageCounts[c.current_stage] ?? 0) + 1;
  });

  const stageStats: StageStats[] = Object.entries(STAGE_META).map(([key, meta]) => ({
    stage: key, label: meta.label, color: meta.color, count: stageCounts[key] ?? 0,
  }));

  const empMap: Record<string, EmployeeStat> = {};
  chatsWithStage.forEach(c => {
    const emp = c.employee as any;
    if (!emp) return;
    if (!empMap[emp.id]) empMap[emp.id] = { id: emp.id, name: emp.name, total: 0, closed: 0, conversion: 0 };
    empMap[emp.id].total++;
    if (c.current_stage === 'closed') empMap[emp.id].closed++;
  });
  const employeeStats: EmployeeStat[] = Object.values(empMap).map(e => ({
    ...e, conversion: e.total > 0 ? Math.round((e.closed / e.total) * 100) : 0,
  })).sort((a, b) => b.total - a.total);

  const branchMap: Record<string, BranchStat> = {};
  chatsWithStage.forEach(c => {
    const br = c.branch as any;
    if (!br) return;
    if (!branchMap[br.id]) branchMap[br.id] = { id: br.id, name: br.name, city: br.city, total: 0, closed: 0 };
    branchMap[br.id].total++;
    if (c.current_stage === 'closed') branchMap[br.id].closed++;
  });
  const branchStats: BranchStat[] = Object.values(branchMap).sort((a, b) => b.total - a.total);

  const maxStageCount = Math.max(...stageStats.map(s => s.count), 1);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-[#0b141a] p-4">
      {/* Фильтр по периоду */}
      <div className="mb-4">
        <div className="grid grid-cols-5 gap-1 mb-2">
          {DATE_PERIODS.map(p => (
            <button key={p.key} onClick={() => { setActivePeriod(p.key); setShowDatePicker(p.key === 'custom'); }}
              className={`text-[10px] px-1 py-1.5 rounded-full transition-colors text-center ${
                activePeriod === p.key ? 'bg-emerald-500 text-white' : 'bg-white/5 text-[#8696a0] hover:bg-white/10'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
        {showDatePicker && (
          <div className="flex gap-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="flex-1 bg-[#202c33] text-[#d1d7db] text-xs rounded-lg px-2 py-1.5 outline-none border border-white/5" />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="flex-1 bg-[#202c33] text-[#d1d7db] text-xs rounded-lg px-2 py-1.5 outline-none border border-white/5" />
          </div>
        )}
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Всего чатов',    value: totalChats,           color: 'text-[#e9edef]' },
          { label: 'Закрыто сделок', value: totalClosed,          color: 'text-emerald-400' },
          { label: 'Конверсия',      value: `${conversionRate}%`, color: 'text-amber-400' },
        ].map((m) => (
          <div key={m.label} className="bg-[#202c33] rounded-xl p-3">
            <p className="text-[10px] text-[#8696a0] mb-1 leading-tight">{m.label}</p>
            <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Воронка */}
      <div className="bg-[#202c33] rounded-xl p-4 mb-3">
        <h3 className="text-xs font-medium text-[#e9edef] mb-3">Воронка продаж</h3>
        <div className="space-y-3">
          {stageStats.map((s) => (
            <div key={s.stage}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${s.color}`} />
                  <span className="text-xs text-[#d1d7db]">{s.label}</span>
                </div>
                <span className="text-xs font-medium text-[#e9edef]">{s.count}</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${s.color}`} style={{ width: `${(s.count / maxStageCount) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* По филиалам */}
      <div className="bg-[#202c33] rounded-xl p-4 mb-3">
        <h3 className="text-xs font-medium text-[#e9edef] mb-3">По филиалам</h3>
        {branchStats.length === 0 ? (
          <p className="text-xs text-[#8696a0] text-center py-4">Нет данных</p>
        ) : (
          <div className="space-y-3">
            {branchStats.map((b) => (
              <div key={b.id} className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-[#e9edef]">{b.name}</p>
                  <p className="text-[10px] text-[#8696a0]">{b.city}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-[#e9edef]">{b.total} чатов</p>
                  <p className="text-[10px] text-emerald-400">
                    {b.total > 0 ? Math.round((b.closed / b.total) * 100) : 0}% закрыто
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* По менеджерам */}
      <div className="bg-[#202c33] rounded-xl p-4">
        <h3 className="text-xs font-medium text-[#e9edef] mb-3">По менеджерам</h3>
        {employeeStats.length === 0 ? (
          <p className="text-xs text-[#8696a0] text-center py-4">Нет данных</p>
        ) : (
          <div className="space-y-2">
            {employeeStats.map((e) => (
              <div key={e.id} className="bg-[#2a3942] rounded-xl p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                  {e.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#e9edef] truncate">{e.name}</p>
                  <p className="text-[10px] text-[#8696a0]">{e.total} чатов · {e.closed} закрыто</p>
                </div>
                <span className={`text-sm font-bold flex-shrink-0 ${e.conversion > 0 ? 'text-emerald-400' : 'text-[#8696a0]'}`}>
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