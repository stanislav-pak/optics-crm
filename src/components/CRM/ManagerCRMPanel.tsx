import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../services/supabase';
import { CRMSidebar } from './CRMSidebar';
import { formatPhone } from '@/utils/formatters';
import type { Chat } from '../../types';

// Метки и цвета берём из deal_stages.current_stage (не clients.status)
const STAGE_LABELS: Record<string, string> = {
  new: 'Новый', negotiation: 'Переговоры', quote: 'Счёт',
  payment: 'В ожидании оплаты', closed: 'Закрыт',
};
const STAGE_COLORS: Record<string, string> = {
  new: 'text-emerald-400 bg-emerald-500/20',
  negotiation: 'text-blue-400 bg-blue-500/20',
  quote: 'text-purple-400 bg-purple-500/20',
  payment: 'text-amber-400 bg-amber-500/20',
  closed: 'text-gray-400 bg-gray-500/20',
};
const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500', normal: 'bg-amber-500', low: 'bg-blue-500',
};

interface Task { id: string; title: string; priority: string; due_date?: string; chat_id: string; chat: any; }
interface Reminder { id: string; text: string; remind_at: string; chat_id: string; chat: any; }
interface Comment { id: string; text: string; created_at: string; chat_id: string; chat: any; }

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  if (date.toDateString() === now.toDateString())
    return `сегодня ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return 'завтра';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

interface ManagerCRMPanelProps {
  onBack: () => void;
  employeeId?: string;
  onOpenChat?: (chat: Chat) => void;
}

export function ManagerCRMPanel({ onBack, employeeId, onOpenChat }: ManagerCRMPanelProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // stageMap: chat_id → последний этап из deal_stages
  const [stageMap, setStageMap] = useState<Record<string, string>>({});

  // selectedChat ref для свайпа
  const selectedChatRef = useRef<Chat | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { selectedChatRef.current = selectedChat; }, [selectedChat]);

  // Свайп вправо → назад (только внутри ManagerCRMPanel)
  useEffect(() => {
    let startX = 0, startY = 0;
    const onStart = (e: TouchEvent) => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = Math.abs(e.changedTouches[0].clientY - startY);
      if (dy < 80 && dx > 60) {
        if (selectedChatRef.current) { selectedChatRef.current = null; setSelectedChat(null); setRefreshKey(k => k + 1); } else { onBack(); }
      }
    };
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
    };
  }, []);

  useEffect(() => {
    if (!employeeId) return;
    Promise.all([
      supabase.from('chats').select('*, client:clients(id, name, phone, status)')
        .eq('employee_id', employeeId).eq('status', 'active').order('last_message_at', { ascending: false }),
      supabase.from('tasks').select('id, title, priority, due_date, chat_id, chat:chats(id, client:clients(name, phone))')
        .eq('employee_id', employeeId).eq('status', 'open').order('due_date', { ascending: true }),
      supabase.from('reminders').select('id, text, remind_at, chat_id, chat:chats(id, client:clients(name, phone))')
        .eq('employee_id', employeeId).eq('is_sent', false).order('remind_at', { ascending: true }),
      supabase.from('comments').select('id, text, created_at, chat_id, chat:chats(id, client:clients(name, phone))')
        .eq('employee_id', employeeId).order('created_at', { ascending: false }).limit(10),
      supabase.from('deal_stages').select('chat_id, current_stage, moved_to_stage_at')
        .order('moved_to_stage_at', { ascending: false }),
    ]).then(([c, t, r, cm, ds]) => {
      setChats((c.data ?? []) as Chat[]);
      setTasks((t.data ?? []) as Task[]);
      setReminders((r.data ?? []) as Reminder[]);
      setComments((cm.data ?? []) as Comment[]);
      // Строим stageMap: берём только первую (последнюю по времени) запись на чат
      const map: Record<string, string> = {};
      (ds.data ?? []).forEach((s: any) => { if (!map[s.chat_id]) map[s.chat_id] = s.current_stage; });
      setStageMap(map);
      setLoading(false);
    });
  }, [employeeId, refreshKey]);

  // Найти чат по chat_id и открыть его CRM
  const openChatCRM = (chatId: string) => {
    const found = chats.find(c => c.id === chatId);
    if (found) { selectedChatRef.current = found; setSelectedChat(found); }
  };

  // Выбран клиент — показываем его CRM
  if (selectedChat) {
    return (
      <div ref={containerRef} className="flex-1 flex flex-col bg-[#111b21] overflow-hidden">
        <div className="px-4 py-3 bg-[#202c33] border-b border-white/5 flex items-center gap-3 flex-shrink-0">
          <button onClick={() => { selectedChatRef.current = null; setSelectedChat(null); }}
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
            <p className="text-xs text-[#8696a0]">{selectedChat.client?.phone ? formatPhone(selectedChat.client.phone) : ''}</p>
          </div>
          {onOpenChat && (
            <button
              onClick={() => onOpenChat(selectedChat)}
              title="Открыть чат"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 active:scale-95 transition-transform flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <CRMSidebar chat={selectedChat} />
        </div>
      </div>
    );
  }

  // Главный CRM — сводка + список клиентов
  return (
    <div ref={containerRef} className="flex-1 flex flex-col bg-[#0b141a] overflow-hidden">
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
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Чатов',    value: chats.length,    color: 'text-[#e9edef]' },
                { label: 'Задач',    value: tasks.length,    color: 'text-amber-400' },
                { label: 'Напомин.', value: reminders.length, color: 'text-emerald-400' },
                { label: 'Заметок',  value: comments.length,  color: 'text-blue-400' },
              ].map(s => (
                <div key={s.label} className="bg-[#202c33] rounded-xl p-2 text-center">
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[9px] text-[#8696a0] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Задачи */}
            {tasks.length > 0 && (
              <div>
                <p className="text-[10px] text-[#8696a0] uppercase tracking-wider mb-2">Открытые задачи</p>
                <div className="space-y-2">
                  {tasks.map(task => (
                    <button key={task.id} onClick={() => openChatCRM(task.chat_id)}
                      className="w-full text-left bg-[#202c33] rounded-xl p-3 flex items-center gap-3 active:bg-white/10 transition-colors">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_COLORS[task.priority] ?? 'bg-gray-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#e9edef] truncate">{task.title}</p>
                        <p className="text-[10px] text-[#8696a0]">
                          {task.chat?.client?.name || task.chat?.client?.phone || '—'}
                          {task.due_date && ` · ${formatDate(task.due_date)}`}
                        </p>
                      </div>
                      <svg className="w-3 h-3 text-[#8696a0] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
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
                    <button key={rem.id} onClick={() => openChatCRM(rem.chat_id)}
                      className="w-full text-left bg-[#202c33] rounded-xl p-3 flex items-center gap-3 active:bg-white/10 transition-colors">
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
                      <svg className="w-3 h-3 text-[#8696a0] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Заметки */}
            {comments.length > 0 && (
              <div>
                <p className="text-[10px] text-[#8696a0] uppercase tracking-wider mb-2">Последние заметки</p>
                <div className="space-y-2">
                  {comments.map(cm => (
                    <button key={cm.id} onClick={() => openChatCRM(cm.chat_id)}
                      className="w-full text-left bg-[#202c33] rounded-xl p-3 flex items-center gap-3 active:bg-white/10 transition-colors">
                      <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#e9edef] truncate">{cm.text}</p>
                        <p className="text-[10px] text-[#8696a0]">
                          {cm.chat?.client?.name || cm.chat?.client?.phone || '—'}
                          {` · ${formatDate(cm.created_at)}`}
                        </p>
                      </div>
                      <svg className="w-3 h-3 text-[#8696a0] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
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
                    <button key={chat.id} onClick={() => { selectedChatRef.current = chat; setSelectedChat(chat); }}
                      className="w-full text-left bg-[#202c33] rounded-xl p-3 flex items-center gap-3 active:bg-white/10 transition-colors">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                        {chat.client?.name ? chat.client.name[0].toUpperCase() : '#'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#e9edef] truncate">
                          {chat.client?.name || chat.client?.phone || 'Неизвестный'}
                        </p>
                        <p className="text-xs text-[#8696a0]">{chat.client?.phone ? formatPhone(chat.client.phone) : ''}</p>
                      </div>
                      {(() => {
                        const stage = stageMap[chat.id] ?? 'new';
                        return (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STAGE_COLORS[stage] ?? 'text-gray-400 bg-gray-500/20'}`}>
                            {STAGE_LABELS[stage] ?? stage}
                          </span>
                        );
                      })()}
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


