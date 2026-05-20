import { useState, useEffect, useContext } from 'react';
import { useChats } from '../../hooks/useChats';
import { AuthContext } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';
import type { Chat, ChatListFilters } from '../../types';

const STATUS_COLORS: Record<string, string> = {
  new: '#22c55e',
  in_progress: '#3b82f6',
  deal: '#a855f7',
  paid: '#f59e0b',
  closed: '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'Новый',
  in_progress: 'В работе',
  deal: 'В ожидании оплаты',
  paid: 'Оплачено',
  closed: 'Закрыт',
};

const STAGES = [
  { key: 'all',         label: 'Все',        color: 'bg-[#8696a0]' },
  { key: 'new',         label: 'Новый',      color: 'bg-blue-500' },
  { key: 'negotiation', label: 'Переговоры', color: 'bg-amber-500' },
  { key: 'quote',       label: 'Счёт',       color: 'bg-purple-500' },
  { key: 'payment',     label: 'Оплата',     color: 'bg-emerald-500' },
  { key: 'closed',      label: 'Закрыт',     color: 'bg-gray-500' },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function ChatItem({ chat, isActive, onClick }: { chat: Chat; isActive: boolean; onClick: () => void }) {
  const client = chat.client;
  const unread = chat.unread_count ?? 0;
  const statusColor = client?.status ? STATUS_COLORS[client.status] : '#6b7280';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-b border-white/5 ${
        isActive ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
    >
      <div className="relative flex-shrink-0">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-semibold text-sm">
          {client?.name ? client.name[0].toUpperCase() : '#'}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#111b21]" style={{ backgroundColor: statusColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="font-medium text-[#e9edef] text-sm truncate">
            {client?.name || client?.phone || 'Неизвестный'}
          </span>
          <span className="text-xs text-[#8696a0] flex-shrink-0 ml-2">{formatTime(chat.last_message_at)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#8696a0] truncate">
            {client?.status ? STATUS_LABELS[client.status] : '—'}
          </span>
          {unread > 0 && (
            <span className="ml-2 flex-shrink-0 min-w-[18px] h-[18px] bg-emerald-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center px-1">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

interface Branch { id: string; name: string; }
interface Employee { id: string; name: string; branch_id: string; }

interface ChatListProps {
  activeChatId?: string;
  onChatSelect: (chat: Chat) => void;
}

export function ChatList({ activeChatId, onChatSelect }: ChatListProps) {
  const { employee } = useContext(AuthContext);
  const isAdmin = employee?.role === 'admin' || employee?.role === 'branch_admin';
  const isMobile = useIsMobile();
  const showAdminMobile = isAdmin && isMobile;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ChatListFilters['status']>(undefined);
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [activeStage, setActiveStage] = useState('all');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stageMap, setStageMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('branches').select('id, name').order('name').then(({ data }) => setBranches(data ?? []));
    supabase.from('employees').select('id, name, branch_id').eq('role', 'manager').eq('is_active', true).order('name')
      .then(({ data }) => setEmployees(data ?? []));
  }, [isAdmin]);

  useEffect(() => {
    if (!showAdminMobile) return;
    supabase.from('deal_stages').select('chat_id, current_stage, moved_to_stage_at')
      .order('moved_to_stage_at', { ascending: false })
      .then(({ data }) => {
        const map: Record<string, string> = {};
        data?.forEach(s => { if (!map[s.chat_id]) map[s.chat_id] = s.current_stage; });
        setStageMap(map);
      });
  }, [showAdminMobile]);

  const filters: ChatListFilters = {
    status: statusFilter,
    search: search.trim() || undefined,
    branch_id: filterBranch !== 'all' ? filterBranch : undefined,
    employee_id: filterEmployee !== 'all' ? filterEmployee : undefined,
  };

  const { chats, loading, error } = useChats(filters);

  const filteredByStage = activeStage === 'all'
    ? chats
    : chats.filter(c => (stageMap[c.id] ?? 'new') === activeStage);

  const filteredEmployees = filterBranch === 'all' ? employees : employees.filter(e => e.branch_id === filterBranch);

  const stageCounts = STAGES.reduce((acc, s) => {
    acc[s.key] = s.key === 'all' ? chats.length : chats.filter(c => (stageMap[c.id] ?? 'new') === s.key).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex flex-col h-full bg-[#111b21] select-none">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/5">
        <h1 className="text-[#e9edef] font-semibold text-base tracking-wide">Чаты</h1>
        <span className="text-xs text-[#8696a0] bg-white/5 px-2 py-0.5 rounded-full">{filteredByStage.length}</span>
      </div>

      {/* Admin mobile filters */}
      {showAdminMobile && (
        <div className="px-3 pt-2 grid grid-cols-2 gap-2">
          <select value={filterBranch} onChange={(e) => { setFilterBranch(e.target.value); setFilterEmployee('all'); }}
            className="bg-[#202c33] text-[#d1d7db] text-xs rounded-lg px-2 py-1.5 outline-none border border-white/5 w-full">
            <option value="all">Все филиалы</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)}
            className="bg-[#202c33] text-[#d1d7db] text-xs rounded-lg px-2 py-1.5 outline-none border border-white/5 w-full">
            <option value="all">Все менеджеры</option>
            {filteredEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      )}

      {/* Search */}
      <div className="px-3 py-2">
        <div className="flex items-center bg-[#202c33] rounded-lg px-3 gap-2">
          <svg className="w-4 h-4 text-[#8696a0] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени или номеру"
            className="flex-1 bg-transparent py-2 text-sm text-[#d1d7db] placeholder-[#8696a0] outline-none" />
          {search && (
            <button onClick={() => setSearch('')} className="text-[#8696a0] hover:text-[#d1d7db]">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Status filters (non-admin) */}
      {!showAdminMobile && (
        <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none">
          {([undefined, 'active', 'archived'] as const).map((s) => (
            <button key={s ?? 'all'} onClick={() => setStatusFilter(s)}
              className={`flex-shrink-0 text-xs px-3 py-1 rounded-full transition-colors ${
                statusFilter === s ? 'bg-emerald-500 text-white' : 'bg-white/5 text-[#8696a0] hover:bg-white/10'
              }`}>
              {s === undefined ? 'Все' : s === 'active' ? 'Активные' : 'Архив'}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="mx-4 mt-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">{error}</div>
        )}
        {!loading && !error && filteredByStage.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-center px-6">
            <p className="text-sm text-[#8696a0]">{search ? 'Ничего не найдено' : 'Нет чатов'}</p>
          </div>
        )}
        {!loading && filteredByStage.map((chat) => (
          <ChatItem key={chat.id} chat={chat} isActive={chat.id === activeChatId} onClick={() => onChatSelect(chat)} />
        ))}
      </div>

      {/* Stage tabs — только для admin на мобиле */}
      {showAdminMobile && (
        <div className="flex bg-[#202c33] border-t border-white/10 flex-shrink-0">
          {STAGES.map((stage) => {
            const isActive = activeStage === stage.key;
            return (
              <button key={stage.key} onClick={() => setActiveStage(stage.key)}
                className={`flex-1 py-2.5 flex flex-col items-center gap-1 transition-colors ${isActive ? 'text-white' : 'text-[#8696a0]'}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${stage.color} ${isActive ? 'opacity-100' : 'opacity-40'}`} />
                <span className="text-[9px] font-medium leading-none truncate px-0.5">{stage.label}</span>
                <span className={`text-[10px] font-bold ${isActive ? 'text-white' : 'text-[#8696a0]'}`}>{stageCounts[stage.key]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}