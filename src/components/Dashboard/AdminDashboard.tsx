import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import type { Chat } from '../../types';

const STAGES = [
  { key: 'new',         label: 'Новый',      color: 'bg-blue-500' },
  { key: 'negotiation', label: 'Переговоры', color: 'bg-amber-500' },
  { key: 'quote',       label: 'Счёт',       color: 'bg-purple-500' },
  { key: 'payment',     label: 'Оплата',     color: 'bg-emerald-500' },
  { key: 'closed',      label: 'Закрыт',     color: 'bg-gray-500' },
];

const DATE_PERIODS = [
  { key: 'all',    label: 'Всё время' },
  { key: 'today',  label: 'Сегодня' },
  { key: 'week',   label: 'Неделя' },
  { key: 'month',  label: 'Месяц' },
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

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

interface ChatWithStage extends Chat {
  current_stage: string;
  deal_amount?: number | null;
}

interface Branch { id: string; name: string; city: string; }
interface Employee { id: string; name: string; branch_id: string; }

interface AdminDashboardProps {
  onChatSelect: (chat: Chat) => void;
  activeChatId?: string;
}

export function AdminDashboard({ onChatSelect, activeChatId }: AdminDashboardProps) {
  const isMobile = useIsMobile();
  const [chats, setChats] = useState<ChatWithStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [search, setSearch] = useState('');
  const [activeStage, setActiveStage] = useState('new');
  const [activePeriod, setActivePeriod] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const fetchChats = async () => {
    const { data } = await supabase
      .from('chats')
      .select('*, client:clients(id, name, phone, status), employee:employees(id, name, branch_id)')
      .eq('status', 'active')
      .order('last_message_at', { ascending: false });

    const { data: stages } = await supabase
      .from('deal_stages')
      .select('chat_id, current_stage, moved_to_stage_at')
      .order('moved_to_stage_at', { ascending: false });

    const latestStage: Record<string, string> = {};
    stages?.forEach((s) => { if (!latestStage[s.chat_id]) latestStage[s.chat_id] = s.current_stage; });

    setChats((data ?? []).map((c) => ({ ...c, current_stage: latestStage[c.id] ?? 'new' })));
    setLoading(false);
  };

  useEffect(() => {
    fetchChats();
    supabase.from('branches').select('id, name, city').order('city').then(({ data }) => setBranches(data ?? []));
    supabase.from('employees').select('id, name, branch_id').eq('role', 'manager').eq('is_active', true).order('name').then(({ data }) => setEmployees(data ?? []));
    const channel = supabase.channel('admin-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, fetchChats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deal_stages' }, fetchChats)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredEmployees = filterBranch === 'all' ? employees : employees.filter(e => e.branch_id === filterBranch);

  const { from: periodFrom, to: periodTo } = getPeriodDates(activePeriod, customFrom, customTo);

  const filteredChats = chats.filter(c => {
    if (filterBranch !== 'all' && c.branch_id !== filterBranch) return false;
    if (filterEmployee !== 'all' && c.employee_id !== filterEmployee) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!(c.client?.name?.toLowerCase().includes(q) || c.client?.phone?.toLowerCase().includes(q))) return false;
    }
    if (periodFrom) {
      const d = c.last_message_at ? new Date(c.last_message_at) : null;
      if (!d || d < periodFrom) return false;
      if (periodTo && d > periodTo) return false;
    }
    return true;
  });

  const totalChats = filteredChats.length;
  const closedChats = filteredChats.filter(c => c.current_stage === 'closed').length;
  const conversionRate = totalChats > 0 ? Math.round((closedChats / totalChats) * 100) : 0;
  const totalAmount = filteredChats.reduce((sum, c) => sum + (c.deal_amount ?? 0), 0);

  async function updateAmount(chatId: string, val: number | null) {
    await supabase.from('chats').update({ deal_amount: val }).eq('id', chatId);
  }

  // Общий Header (фильтры)
  const Header = (
    <div className="px-4 py-3 bg-[#202c33] border-b border-white/5 flex-shrink-0">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-[#e9edef]">Dashboard</h2>
        <div className="flex items-center gap-3 text-xs text-[#8696a0]">
          <span>Чатов: <span className="text-[#e9edef] font-medium">{totalChats}</span></span>
          <span>Закрыто: <span className="text-[#e9edef] font-medium">{closedChats}</span></span>
          <span>Конверсия: <span className="text-emerald-400 font-medium">{conversionRate}%</span></span>
          {totalAmount > 0 && <span className="hidden sm:inline">Сумма: <span className="text-emerald-400 font-medium">{totalAmount.toLocaleString('ru-RU')} ₸</span></span>}
        </div>
      </div>
      {/* Период */}
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
        <div className="flex gap-2 mb-2">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
            className="flex-1 bg-[#2a3942] text-[#d1d7db] text-xs rounded-lg px-2 py-1.5 outline-none border border-white/5" />
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
            className="flex-1 bg-[#2a3942] text-[#d1d7db] text-xs rounded-lg px-2 py-1.5 outline-none border border-white/5" />
        </div>
      )}
      {/* Фильтры */}
      <div className="grid grid-cols-2 gap-2">
        <div className="relative col-span-2">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8696a0]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="Поиск..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#2a3942] text-[#d1d7db] text-xs rounded-lg pl-8 pr-3 py-1.5 outline-none border border-white/5 placeholder-[#8696a0]" />
        </div>
        <select value={filterBranch} onChange={(e) => { setFilterBranch(e.target.value); setFilterEmployee('all'); }}
          className="bg-[#2a3942] text-[#d1d7db] text-xs rounded-lg px-2 py-1.5 outline-none border border-white/5 w-full">
          <option value="all">Все филиалы</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)}
          className="bg-[#2a3942] text-[#d1d7db] text-xs rounded-lg px-2 py-1.5 outline-none border border-white/5 w-full">
          <option value="all">Все менеджеры</option>
          {filteredEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
    </div>
  );

  // Карточка чата
  const ChatCard = ({ chat, compact = false }: { chat: ChatWithStage; compact?: boolean }) => (
    <div className={`rounded-xl overflow-hidden transition-colors ${
      activeChatId === chat.id ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-[#2a3942]'
    }`}>
      <button onClick={() => onChatSelect(chat)} className="w-full text-left p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
            {chat.client?.name ? chat.client.name[0].toUpperCase() : '#'}
          </div>
          <p className="text-xs font-semibold text-[#e9edef] leading-tight line-clamp-2 flex-1">
            {chat.client?.name || chat.client?.phone}
          </p>
        </div>
        <div className="flex items-center gap-1 mb-1">
          <svg className="w-3 h-3 text-[#8696a0] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <p className="text-[10px] text-[#8696a0] truncate">{chat.employee?.name}</p>
        </div>
        {chat.last_message_at && (
          <p className="text-[10px] text-[#8696a0]">
            {new Date(chat.last_message_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}
          </p>
        )}
        {chat.deal_amount != null && chat.deal_amount > 0 && (
          <p className="text-[10px] text-emerald-400 font-semibold mt-1">{chat.deal_amount.toLocaleString('ru-RU')} ₸</p>
        )}
      </button>
      {!compact && (
        <div className="px-3 pb-3">
          <input type="text" inputMode="numeric" placeholder="Сумма сделки..."
            defaultValue={chat.deal_amount ?? ''}
            onBlur={(e) => updateAmount(chat.id, e.target.value ? parseFloat(e.target.value.replace(/\s/g, '')) : null)}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white/5 text-[#d1d7db] rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-emerald-500 placeholder-[#8696a0]"
            style={{ fontSize: '16px' }} />
        </div>
      )}
    </div>
  );

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // МОБИЛЬ — таб-интерфейс
  if (isMobile) {
    const activeStageChats = filteredChats.filter(c => c.current_stage === activeStage);
    const activeStageInfo = STAGES.find(s => s.key === activeStage)!;
    const showTotal = activeStage === 'payment' || activeStage === 'closed';
    const stageTotal = activeStageChats.reduce((sum, c) => sum + (c.deal_amount ?? 0), 0);

    return (
      <div className="flex-1 flex flex-col bg-[#0b141a] overflow-hidden">
        {Header}
        <div className="px-4 py-2 bg-[#161e25] flex items-center gap-2 flex-shrink-0">
          <span className={`w-2.5 h-2.5 rounded-full ${activeStageInfo.color}`} />
          <span className="text-sm font-semibold text-[#e9edef]">{activeStageInfo.label}</span>
          <span className="text-xs text-[#8696a0] bg-white/5 px-2 py-0.5 rounded-full ml-1">{activeStageChats.length}</span>
          {showTotal && stageTotal > 0 && (
            <span className="ml-auto text-sm font-bold text-emerald-400">{stageTotal.toLocaleString('ru-RU')} ₸</span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {activeStageChats.length === 0 && (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-[#8696a0]">Нет чатов</p>
            </div>
          )}
          {activeStageChats.map(chat => <ChatCard key={chat.id} chat={chat} />)}
        </div>
        <div className="flex bg-[#202c33] border-t border-white/10 flex-shrink-0">
          {STAGES.map(stage => {
            const count = filteredChats.filter(c => c.current_stage === stage.key).length;
            const isActive = activeStage === stage.key;
            return (
              <button key={stage.key} onClick={() => setActiveStage(stage.key)}
                className={`flex-1 py-2.5 flex flex-col items-center gap-1 transition-colors ${isActive ? 'text-white' : 'text-[#8696a0]'}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${stage.color} ${isActive ? 'opacity-100' : 'opacity-40'}`} />
                <span className="text-[9px] font-medium leading-none truncate px-0.5">{stage.label}</span>
                <span className={`text-[10px] font-bold ${isActive ? 'text-white' : 'text-[#8696a0]'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ДЕСКТОП — канбан с вертикальными карточками
  return (
    <div className="flex-1 flex flex-col bg-[#0b141a] overflow-hidden">
      {Header}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-3 h-full min-w-0">
          {STAGES.map(stage => {
            const stageChats = filteredChats.filter(c => c.current_stage === stage.key);
            const stageTotal = stageChats.reduce((sum, c) => sum + (c.deal_amount ?? 0), 0);
            return (
              <div key={stage.key} className="flex-1 min-w-[180px] flex flex-col bg-[#202c33] rounded-xl overflow-hidden">
                <div className="px-3 py-2.5 flex items-center gap-2 border-b border-white/5 flex-shrink-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${stage.color}`} />
                  <span className="text-xs font-medium text-[#e9edef] flex-1 truncate">{stage.label}</span>
                  <span className="text-xs text-[#8696a0] bg-white/5 px-1.5 py-0.5 rounded-full flex-shrink-0">{stageChats.length}</span>
                </div>
                {stageTotal > 0 && (
                  <div className="px-3 py-1 border-b border-white/5 flex-shrink-0">
                    <p className="text-[10px] text-emerald-400 font-medium">{stageTotal.toLocaleString('ru-RU')} ₸</p>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {stageChats.length === 0 && <p className="text-xs text-[#8696a0] text-center py-6">Нет чатов</p>}
                  {stageChats.map(chat => <ChatCard key={chat.id} chat={chat} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}