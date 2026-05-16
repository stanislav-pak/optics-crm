import { useState } from 'react';
import { useChats } from '../../hooks/useChats';
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
  deal: 'Сделка',
  paid: 'Оплачен',
  closed: 'Закрыт',
};

function formatTime(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function ChatItem({
  chat,
  isActive,
  onClick,
}: {
  chat: Chat;
  isActive: boolean;
  onClick: () => void;
}) {
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
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-semibold text-sm">
          {client?.name ? client.name[0].toUpperCase() : '#'}
        </div>
        <span
          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#111b21]"
          style={{ backgroundColor: statusColor }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="font-medium text-[#e9edef] text-sm truncate">
            {client?.name || client?.phone || 'Неизвестный'}
          </span>
          <span className="text-xs text-[#8696a0] flex-shrink-0 ml-2">
            {formatTime(chat.last_message_at)}
          </span>
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

interface ChatListProps {
  activeChatId?: string;
  onChatSelect: (chat: Chat) => void;
}

export function ChatList({ activeChatId, onChatSelect }: ChatListProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ChatListFilters['status']>(undefined);

  const filters: ChatListFilters = {
    status: statusFilter,
    search: search.trim() || undefined,
  };

  const { chats, loading, error } = useChats(filters);

  return (
    <div className="flex flex-col h-full bg-[#111b21] select-none">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/5">
        <h1 className="text-[#e9edef] font-semibold text-base tracking-wide">Чаты</h1>
        <span className="text-xs text-[#8696a0] bg-white/5 px-2 py-0.5 rounded-full">
          {chats.length}
        </span>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="flex items-center bg-[#202c33] rounded-lg px-3 gap-2">
          <svg className="w-4 h-4 text-[#8696a0] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени или номеру"
            className="flex-1 bg-transparent py-2 text-sm text-[#d1d7db] placeholder-[#8696a0] outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-[#8696a0] hover:text-[#d1d7db]">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Status filters */}
      <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none">
        {([undefined, 'active', 'archived'] as const).map((s) => (
          <button
            key={s ?? 'all'}
            onClick={() => setStatusFilter(s)}
            className={`flex-shrink-0 text-xs px-3 py-1 rounded-full transition-colors ${
              statusFilter === s
                ? 'bg-emerald-500 text-white'
                : 'bg-white/5 text-[#8696a0] hover:bg-white/10'
            }`}
          >
            {s === undefined ? 'Все' : s === 'active' ? 'Активные' : 'Архив'}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="mx-4 mt-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && chats.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-center px-6">
            <svg className="w-10 h-10 text-[#8696a0] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm text-[#8696a0]">
              {search ? 'Ничего не найдено' : 'Нет активных чатов'}
            </p>
          </div>
        )}

        {!loading &&
          chats.map((chat) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              isActive={chat.id === activeChatId}
              onClick={() => onChatSelect(chat)}
            />
          ))}
      </div>
    </div>
  );
}
