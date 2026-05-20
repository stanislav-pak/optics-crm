import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../services/supabase';
import { CRMSidebar } from './CRMSidebar';
import type { Chat } from '../../types';

const STATUS_LABELS: Record<string, string> = {
  new: 'Новый',
  in_progress: 'В работе',
  deal: 'Ожид. оплаты',
  paid: 'Оплачено',
  closed: 'Закрыт',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'text-emerald-400 bg-emerald-500/20',
  in_progress: 'text-blue-400 bg-blue-500/20',
  deal: 'text-purple-400 bg-purple-500/20',
  paid: 'text-amber-400 bg-amber-500/20',
  closed: 'text-gray-400 bg-gray-500/20',
};

interface ManagerCRMPanelProps {
  onBack: () => void;
  employeeId?: string;
}

export function ManagerCRMPanel({ onBack, employeeId }: ManagerCRMPanelProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);

  // Свайп вправо → назад
  const swipeRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - swipeRef.current.x;
      const dy = Math.abs(e.changedTouches[0].clientY - swipeRef.current.y);
      if (dy < 80 && dx > 60) {
        if (selectedChat) setSelectedChat(null);
        else onBack();
      }
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [selectedChat, onBack]);

  useEffect(() => {
    if (!employeeId) return;
    supabase
      .from('chats')
      .select('*, client:clients(id, name, phone, status)')
      .eq('employee_id', employeeId)
      .eq('status', 'active')
      .order('last_message_at', { ascending: false })
      .then(({ data }) => {
        setChats((data ?? []) as Chat[]);
        setLoading(false);
      });
  }, [employeeId]);

  // Если выбран клиент — показываем его CRM
  if (selectedChat) {
    return (
      <div className="flex-1 flex flex-col bg-[#111b21] overflow-hidden">
        <div className="px-4 py-3 bg-[#202c33] border-b border-white/5 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => setSelectedChat(null)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2a3942] text-white active:scale-95 transition-transform">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
            {selectedChat.client?.name ? selectedChat.client.name[0].toUpperCase() : '#'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#e9edef] truncate">
              {selectedChat.client?.name || selectedChat.client?.phone}
            </p>
            <p className="text-xs text-[#8696a0]">{selectedChat.client?.phone}</p>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <CRMSidebar chat={selectedChat} />
        </div>
      </div>
    );
  }

  // Список клиентов
  return (
    <div className="flex-1 flex flex-col bg-[#0b141a] overflow-hidden">
      <div className="px-4 py-3 bg-[#202c33] border-b border-white/5 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2a3942] text-white active:scale-95 transition-transform">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-[#e9edef] font-semibold text-base">CRM</h1>
        <span className="text-xs text-[#8696a0] bg-white/5 px-2 py-0.5 rounded-full ml-auto">{chats.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && chats.length === 0 && (
          <div className="flex items-center justify-center h-40">
            <p className="text-sm text-[#8696a0]">Нет активных клиентов</p>
          </div>
        )}
        {!loading && chats.map(chat => (
          <button
            key={chat.id}
            onClick={() => setSelectedChat(chat)}
            className="w-full text-left px-4 py-3 flex items-center gap-3 border-b border-white/5 hover:bg-white/5 active:bg-white/10 transition-colors">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
              {chat.client?.name ? chat.client.name[0].toUpperCase() : '#'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#e9edef] truncate">
                {chat.client?.name || chat.client?.phone || 'Неизвестный'}
              </p>
              <p className="text-xs text-[#8696a0]">{chat.client?.phone}</p>
            </div>
            {chat.client?.status && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[chat.client.status] ?? 'text-gray-400 bg-gray-500/20'}`}>
                {STATUS_LABELS[chat.client.status] ?? chat.client.status}
              </span>
            )}
            <svg className="w-4 h-4 text-[#8696a0] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}