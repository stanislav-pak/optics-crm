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

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500',
  normal: 'bg-amber-500',
  low: 'bg-blue-500',
};

interface Task {
  id: string;
  title: string;
  priority: string;
  due_date?: string;
  chat: any;
}

interface Reminder {
  id: string;
  text: string;
  remind_at: string;
  chat: any;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return `сегодня ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return 'завтра';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

interface ManagerCRMPanelProps {
  onBack: () => void;
  employeeId?: string;
}

export function ManagerCRMPanel({ onBack, employeeId }: ManagerCRMPanelProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);

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
    Promise.all([
      supabase.from('chats').select('*, client:clients(id, name, phone, status)')
        .eq('employee_id', employeeId).eq('status', 'active').order('last_message_at', { ascending: false }),
      supabase.from('tasks').select('id, title, priority, due_date, chat:chats(client:clients(name, phone))')
        .eq('employee_id', employeeId).eq('status', 'open').order('due_date', { ascending: true }),
      supabase.from('reminders').select('id, text, remind_at, chat:chats(client:clients(name, phone))')
        .eq('employee_id', employeeId).eq('is_sent', false).order('remind_at', { ascending: true }),
    ]).then(([c, t, r]) => {
      setChats((c.data ?? []) as Chat[]);
      setTasks((t.data ?? []) as Task[]);
      setReminders((r.data ?? []) as Reminder[]);
      setLoading(false);
    });
  }, [employeeId]);

  // Выбран клиент — показываем его CRM
  if (selectedChat) {
    return (
      <div className="flex-1 flex flex-col bg-[#111b21] overflow-hidden">
        <div className="px-4 py-3 bg-[#202c33] border-b border-white/5 flex items-center gap-3 flex-shrink-0">
          <button onClick={() => setSelectedChat(null)}
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

  // Главный CRM — сводка + список клиентов
  return (
    <div className="flex-1 flex flex-col bg-[#0b141a] overflow-hidden">
      <div className="px-4 py-3 bg-[#202c33] border-b border-white/5 flex items-center gap-3 flex-shrink-0">
        <button onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2a3942] text-white active:scale-95 transition-transform">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-[#e9edef] font-semibold text-base">CRM</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Сводка */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Чатов',   value: chats.length,     color: 'text-[#e9edef]' },
                { label: 'Задач',   value: tasks.length,     color: 'text-amber-400' },
                { label: 'Напомин.',value: reminders.length, color: 'text-emerald-400' },
              ].map(s => (
                <div key={s.label} className="bg-[#202c33] rounded-xl p-3 text-center">
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-[#8696a0] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Задачи */}
            {tasks.length > 0 && (
              <div>
                <p className="text-[10px] text-[#8696a0] uppercase tracking-wider mb-2">Открытые задачи</p>
                <div className="space-y-2">
                  {tasks.map(task => (
                    <div key={task.id} className="bg-[#202c33] rounded-xl p-3 flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_COLORS[task.priority] ?? 'bg-gray-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#e9edef] truncate">{task.title}</p>
                        <p className="text-[10px] text-[#8696a0]">
                          {task.chat?.client?.name || task.chat?.client?.phone || '—'}
                          {task.due_date && ` · ${formatDate(task.due_date)}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Напоминания */}
            {reminders.length > 0 && (
              <div>
                <p className="text-[10px] text-[#8696a0] uppercase tracking-wider mb-2">Напоминания</p>
                <div className="space-y-2">
                  {reminders.map(rem => (
                    <div key={rem.id} className="bg-[#202c33] rounded-xl p-3 flex items-center gap-3">
                      <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#e9edef] truncate">{rem.text}</p>
                        <p className="text-[10px] text-emerald-400">
                          {formatDate(rem.remind_at)}
                          {rem.chat?.client?.name && ` · ${rem.chat.client.name}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Список клиентов */}
            <div>
              <p className="text-[10px] text-[#8696a0] uppercase tracking-wider mb-2">Мои клиенты</p>
              {chats.length === 0 ? (
                <p className="text-sm text-[#8696a0] text-center py-4">Нет активных клиентов</p>
              ) : (
                <div className="space-y-2">
                  {chats.map(chat => (
                    <button key={chat.id} onClick={() => setSelectedChat(chat)}
                      className="w-full text-left bg-[#202c33] rounded-xl p-3 flex items-center gap-3 active:bg-white/10 transition-colors">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
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
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}