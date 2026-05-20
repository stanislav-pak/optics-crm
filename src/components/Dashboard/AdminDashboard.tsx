import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import type { Chat } from '../../types';

const STAGES = [
  { key: 'new',         label: 'Новый',      color: 'bg-blue-500',    dot: 'bg-blue-500' },
  { key: 'negotiation', label: 'Переговоры', color: 'bg-amber-500',   dot: 'bg-amber-500' },
  { key: 'quote',       label: 'Счёт',       color: 'bg-purple-500',  dot: 'bg-purple-500' },
  { key: 'payment',     label: 'Оплата',     color: 'bg-emerald-500', dot: 'bg-emerald-500' },
  { key: 'closed',      label: 'Закрыт',     color: 'bg-gray-500',    dot: 'bg-gray-500' },
];

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
  const [chats, setChats] = useState<ChatWithStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filterBranch, setFilterBranch] = useState<string>('all');
  const [filterEmployee, setFilterEmployee] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [activeStage, setActiveStage] = useState('new');

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
    stages?.forEach((s) => {
      if (!latestStage[s.chat_id]) latestStage[s.chat_id] = s.current_stage;
    });

    setChats((data ?? []).map((c) => ({
      ...c,
      current_stage: latestStage[c.id] ?? 'new',
    })));
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

  const filteredChats = chats.filter(c => {
    if (filterBranch !== 'all' && c.branch_id !== filterBranch) return false;
    if (filterEmployee !== 'all' && c.employee_id !== filterEmployee) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = c.client?.name?.toLowerCase() ?? '';
      const phone = c.client?.phone?.toLowerCase() ?? '';
      if (!name.includes(q) && !phone.includes(q)) return false;
    }
    return true;
  });

  const totalChats = filteredChats.length;
  const closedChats = filteredChats.filter(c => c.current_stage === 'closed').length;
  const conversionRate = totalChats > 0 ? Math.round((closedChats / totalChats) * 100) : 0;

  const activeStageChats = filteredChats.filter(c => c.current_stage === activeStage);
  const activeStageInfo = STAGES.find(s => s.key === activeStage)!;

  async function updateAmount(chatId: string, val: number | null) {
    await supabase.from('chats').update({ deal_amount: val }).eq('id', chatId);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0b141a] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-[#202c33] border-b border-white/5 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-[#e9edef]">Dashboard</h2>
          <div className="flex items-center gap-2 text-xs text-[#8696a0]">
            <span>Чатов: <span className="text-[#e9edef] font-medium">{totalChats}</span></span>
            <span>Закрыто: <span className="text-[#e9edef] font-medium">{closedChats}</span></span>
            <span>Конверсия: <span className="text-emerald-400 font-medium">{conversionRate}%</span></span>
          </div>
        </div>
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
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)}
            className="bg-[#2a3942] text-[#d1d7db] text-xs rounded-lg px-2 py-1.5 outline-none border border-white/5 w-full">
            <option value="all">Все менеджеры</option>
            {filteredEmployees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      </div>

      {/* Current stage label */}
      <div className="px-4 py-2 bg-[#161e25] flex items-center gap-2 flex-shrink-0">
        <span className={`w-2.5 h-2.5 rounded-full ${activeStageInfo.dot}`} />
        <span className="text-sm font-semibold text-[#e9edef]">{activeStageInfo.label}</span>
        <span className="text-xs text-[#8696a0] bg-white/5 px-2 py-0.5 rounded-full ml-1">{activeStageChats.length}</span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {activeStageChats.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-[#8696a0]">Нет чатов в этом статусе</p>
          </div>
        )}
        {activeStageChats.map((chat) => (
          <div key={chat.id} className={`rounded-xl overflow-hidden transition-colors ${
            activeChatId === chat.id ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-[#202c33]'
          }`}>
            <button onClick={() => onChatSelect(chat)} className="w-full text-left p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                  {chat.client?.name ? chat.client.name[0].toUpperCase() : '#'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#e9edef] truncate">
                    {chat.client?.name || chat.client?.phone}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <svg className="w-3 h-3 text-[#8696a0] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <p className="text-xs text-[#8696a0] truncate">{chat.employee?.name}</p>
                  </div>
                </div>
                {chat.last_message_at && (
                  <p className="text-xs text-[#8696a0] flex-shrink-0">
                    {new Date(chat.last_message_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                  </p>
                )}
              </div>
            </button>
            <div className="px-4 pb-4">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Сумма сделки..."
                defaultValue={chat.deal_amount ?? ''}
                onBlur={(e) => {
                  const val = e.target.value ? parseFloat(e.target.value) : null;
                  updateAmount(chat.id, val);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-white/5 text-[#d1d7db] rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500 placeholder-[#8696a0]"
                style={{ fontSize: '16px' }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Stage tabs */}
      <div className="flex bg-[#202c33] border-t border-white/10 flex-shrink-0">
        {STAGES.map((stage) => {
          const count = filteredChats.filter(c => c.current_stage === stage.key).length;
          const isActive = activeStage === stage.key;
          return (
            <button
              key={stage.key}
              onClick={() => setActiveStage(stage.key)}
              className={`flex-1 py-2.5 flex flex-col items-center gap-1 transition-colors ${isActive ? 'text-white' : 'text-[#8696a0]'}`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${stage.dot} ${isActive ? 'opacity-100' : 'opacity-40'}`} />
              <span className="text-[9px] font-medium leading-none truncate px-0.5">{stage.label}</span>
              <span className={`text-[10px] font-bold ${isActive ? 'text-white' : 'text-[#8696a0]'}`}>{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}