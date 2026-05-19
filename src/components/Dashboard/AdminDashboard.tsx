import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import type { Chat } from '../../types';

const STAGES = [
  { key: 'new', label: 'Новый', color: 'bg-blue-500' },
  { key: 'negotiation', label: 'Переговоры', color: 'bg-amber-500' },
  { key: 'quote', label: 'Счёт', color: 'bg-purple-500' },
  { key: 'payment', label: 'Оплата', color: 'bg-emerald-500' },
  { key: 'closed', label: 'Закрыт', color: 'bg-gray-500' },
];

interface ChatWithStage extends Chat {
  deal_amount?: number | null;
  current_stage: string;
}

interface Branch {
  id: string;
  name: string;
  city: string;
}

interface Employee {
  id: string;
  name: string;
  branch_id: string;
}

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

  const fetchChats = async () => {
    const { data } = await supabase
      .from('chats')
      .select(`
        *,
        client:clients(id, name, phone, status),
        employee:employees(id, name, branch_id)
      `)
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

  const fetchBranches = async () => {
    const { data } = await supabase.from('branches').select('id, name, city').order('city');
    setBranches(data ?? []);
  };

  const fetchEmployees = async () => {
    const { data } = await supabase
      .from('employees')
      .select('id, name, branch_id')
      .eq('role', 'manager')
      .eq('is_active', true)
      .order('name');
    setEmployees(data ?? []);
  };

  useEffect(() => {
    fetchChats();
    fetchBranches();
    fetchEmployees();

    const channel = supabase.channel('admin-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, fetchChats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deal_stages' }, fetchChats)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Сброс менеджера при смене филиала
  const handleBranchChange = (branchId: string) => {
    setFilterBranch(branchId);
    setFilterEmployee('all');
  };

  // Менеджеры текущего филиала
  const filteredEmployees = filterBranch === 'all'
    ? employees
    : employees.filter(e => e.branch_id === filterBranch);

  // Фильтрация чатов
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0b141a]">
      {/* Header */}
      <div className="px-6 py-4 bg-[#202c33] border-b border-white/5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#e9edef]">Dashboard</h2>
          <div className="flex items-center gap-4 text-xs text-[#8696a0]">
            <span>Чатов: <span className="text-[#e9edef] font-medium">{totalChats}</span></span>
            <span>Закрыто: <span className="text-[#e9edef] font-medium">{closedChats}</span></span>
            <span>Конверсия: <span className="text-emerald-400 font-medium">{conversionRate}%</span></span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8696a0]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Поиск по клиенту..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#2a3942] text-[#d1d7db] text-xs rounded-lg pl-8 pr-3 py-1.5 outline-none border border-white/5 placeholder-[#8696a0]"
            />
          </div>

          {/* Branch filter */}
          <select
            value={filterBranch}
            onChange={(e) => handleBranchChange(e.target.value)}
            className="bg-[#2a3942] text-[#d1d7db] text-xs rounded-lg px-3 py-1.5 outline-none border border-white/5"
          >
            <option value="all">Все филиалы</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
            ))}
          </select>

          {/* Employee filter */}
          <select
            value={filterEmployee}
            onChange={(e) => setFilterEmployee(e.target.value)}
            className="bg-[#2a3942] text-[#d1d7db] text-xs rounded-lg px-3 py-1.5 outline-none border border-white/5"
          >
            <option value="all">Все менеджеры</option>
            {filteredEmployees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>

          {/* Reset */}
          {(filterBranch !== 'all' || filterEmployee !== 'all' || search) && (
            <button
              onClick={() => { setFilterBranch('all'); setFilterEmployee('all'); setSearch(''); }}
              className="text-xs text-[#8696a0] hover:text-[#e9edef] transition-colors px-2 py-1.5"
            >
              Сбросить
            </button>
          )}
        </div>
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="grid grid-cols-5 gap-3 h-full w-full">
          {STAGES.map((stage) => {
            const stageChats = filteredChats.filter(c => c.current_stage === stage.key);
            return (
              <div key={stage.key} className="flex flex-col bg-[#202c33] rounded-xl overflow-hidden flex-shrink-0">
                <div className="px-4 py-3 flex items-center gap-2 border-b border-white/5">
                  <span className={`w-2 h-2 rounded-full ${stage.color}`} />
                  <span className="text-xs font-medium text-[#e9edef]">{stage.label}</span>
                  <span className="ml-auto text-xs text-[#8696a0] bg-white/5 px-2 py-0.5 rounded-full">{stageChats.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {stageChats.length === 0 && (
                    <p className="text-xs text-[#8696a0] text-center py-6">Нет чатов</p>
                  )}
                  {stageChats.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => onChatSelect(chat)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        activeChatId === chat.id
                          ? 'bg-emerald-500/20 border border-emerald-500/30'
                          : 'bg-[#2a3942] hover:bg-[#2a3942]/80'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                          {chat.client?.name ? chat.client.name[0].toUpperCase() : '#'}
                        </div>
                        <p className="text-xs font-medium text-[#e9edef] truncate">
                          {chat.client?.name || chat.client?.phone}
                        </p>
                      </div>
                      <p className="text-[10px] text-[#8696a0]">👤 {chat.employee?.name}</p>
                      {chat.last_message_at && (
                        <p className="text-[10px] text-[#8696a0] mt-1">
                          {new Date(chat.last_message_at).toLocaleDateString('ru-RU')}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}



