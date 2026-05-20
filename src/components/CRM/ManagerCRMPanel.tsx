import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import type { Chat } from '../../types';

interface Task {
  id: string;
  title: string;
  priority: 'low' | 'normal' | 'high';
  due_date?: string;
  chat: { client?: { name?: string; phone?: string } } | null;
}

interface Reminder {
  id: string;
  text: string;
  remind_at: string;
  chat: { client?: { name?: string; phone?: string } } | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500',
  normal: 'bg-amber-500',
  low: 'bg-blue-500',
};

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
  onChatSelect: (chat: Chat) => void;
  employeeId?: string;
}

export function ManagerCRMPanel({ onBack, employeeId }: ManagerCRMPanelProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return;
    Promise.all([
      supabase.from('tasks').select('id, title, priority, due_date, chat:chats(client:clients(name, phone))')
        .eq('employee_id', employeeId).eq('status', 'open').order('due_date', { ascending: true }),
      supabase.from('reminders').select('id, text, remind_at, chat:chats(client:clients(name, phone))')
        .eq('employee_id', employeeId).eq('is_sent', false).order('remind_at', { ascending: true }),
      supabase.from('chats').select('*, client:clients(id, name, phone, status)')
        .eq('employee_id', employeeId).eq('status', 'active').order('last_message_at', { ascending: false }),
    ]).then(([t, r, c]) => {
      setTasks((t.data ?? []) as Task[]);
      setReminders((r.data ?? []) as Reminder[]);
      setChats((c.data ?? []) as Chat[]);
      setLoading(false);
    });
  }, [employeeId]);

  const STATUS_LABELS: Record<string, string> = {
    new: 'Новый', in_progress: 'В работе', deal: 'Ожид. оплаты', paid: 'Оплачено', closed: 'Закрыт',
  };
  const STATUS_COLORS: Record<string, string> = {
    new: 'text-emerald-400 bg-emerald-500/20',
    in_progress: 'text-blue-400 bg-blue-500/20',
    deal: 'text-purple-400 bg-purple-500/20',
    paid: 'text-amber-400 bg-amber-500/20',
    closed: 'text-gray-400 bg-gray-500/20',
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-[#0b141a]">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-[#0b141a] overflow-hidden">
      <div className="px-4 py-3 bg-[#202c33] border-b border-white/5 flex items-center gap-3 flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2a3942] text-white active:scale-95 transition-transform">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-[#e9edef] font-semibold text-base">CRM</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Чатов', value: chats.length, color: 'text-[#e9edef]' },
            { label: 'Задач', value: tasks.length, color: 'text-amber-400' },
            { label: 'Напомин.', value: reminders.length, color: 'text-emerald-400' },
          ].map(s => (
            <div key={s.label} className="bg-[#202c33] rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-[#8696a0] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tasks */}
        {tasks.length > 0 && (
          <div>
            <p className="text-[10px] text-[#8696a0] uppercase tracking-wider mb-2">Открытые задачи</p>
            <div className="space-y-2">
              {tasks.map(task => (
                <div key={task.id} className="bg-[#202c33] rounded-xl p-3 flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_COLORS[task.priority]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#e9edef] truncate">{task.title}</p>
                    <p className="text-[10px] text-[#8696a0]">
                      {(task.chat as any)?.client?.name || (task.chat as any)?.client?.phone || '—'}
                      {task.due_date && ` · ${formatDate(task.due_date)}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reminders */}
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
                      {rem.chat && ` · ${(rem.chat as any)?.client?.name || (rem.chat as any)?.client?.phone}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Clients */}
        <div>
          <p className="text-[10px] text-[#8696a0] uppercase tracking-wider mb-2">Мои клиенты</p>
          {chats.length === 0 ? (
            <p className="text-sm text-[#8696a0] text-center py-4">Нет активных чатов</p>
          ) : (
            <div className="space-y-2">
              {chats.map(chat => (
                <div key={chat.id} className="bg-[#202c33] rounded-xl p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                    {chat.client?.name ? chat.client.name[0].toUpperCase() : '#'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#e9edef] truncate">
                      {chat.client?.name || chat.client?.phone}
                    </p>
                    <p className="text-[10px] text-[#8696a0]">{chat.client?.phone}</p>
                  </div>
                  {chat.client?.status && (
                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[chat.client.status] ?? 'text-gray-400 bg-gray-500/20'}`}>
                      {STATUS_LABELS[chat.client.status] ?? chat.client.status}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
