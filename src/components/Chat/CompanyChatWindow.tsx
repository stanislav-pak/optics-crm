import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { supabase } from '../../services/supabase';
import {
  getInternalMessages,
  sendInternalMessage,
  markAsRead,
} from '../../services/internalChat';
import type { InternalChat, InternalMessage } from '../../services/internalChat';

interface Props {
  chat: InternalChat;
  currentEmployeeId: string;
  onBack: () => void;
  onMessageRead?: () => void;
}

function sortMessages(msgs: InternalMessage[]): InternalMessage[] {
  return [...msgs].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function roleColor(role?: string): string {
  if (role === 'admin') return '#a78bfa';
  if (role === 'branch_admin') return '#60a5fa';
  return '#34d399';
}

export default function CompanyChatWindow({ chat, currentEmployeeId, onBack, onMessageRead }: Props) {
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [text, setText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef({ x: 0, y: 0 });

  // Определяем собеседника для direct-чата
  const otherMember = chat.type === 'direct'
    ? chat.members?.find(m => m.employee_id !== currentEmployeeId)
    : null;
  const otherName = otherMember?.employees?.name || 'Сотрудник';
  const otherRole = otherMember?.employees?.role;

  // Загружаем сообщения и отмечаем прочитанными
  useEffect(() => {
    const init = async () => {
      const data = await getInternalMessages(chat.id);
      const msgs = typeof data === 'string' ? JSON.parse(data) : data;
      setMessages(sortMessages(Array.isArray(msgs) ? msgs : []));
      await markAsRead(chat.id, currentEmployeeId);
setTimeout(() => onMessageRead?.(), 300);
    };
    init();
  }, [chat.id]);

  // Прокрутка вниз при новых сообщениях
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime подписка
  useEffect(() => {
    const channel = supabase
      .channel('internal-' + chat.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'internal_messages',
        filter: `chat_id=eq.${chat.id}`
      }, async (payload) => {
        const newMsg = payload.new as InternalMessage & Record<string, unknown>;
        const { data: sender } = await supabase
          .from('employees')
          .select('id, name')
          .eq('id', newMsg.sender_id)
          .single();
        const msgWithSender = { ...newMsg, sender } as InternalMessage;
        setMessages(prev => {
          if (prev.find(m => m.id === newMsg.id)) return prev;
          return sortMessages([...prev, msgWithSender]);
        });
        await markAsRead(chat.id, currentEmployeeId);
    setTimeout(() => onMessageRead?.(), 300);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chat.id, currentEmployeeId]);

  // Polling fallback — на случай если Realtime не доставил событие
  useEffect(() => {
    const poll = setInterval(async () => {
      const data = await getInternalMessages(chat.id);
      const msgs = typeof data === 'string' ? JSON.parse(data) : data;
      if (Array.isArray(msgs) && msgs.length > 0) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newMsgs = msgs.filter((m: InternalMessage) => !existingIds.has(m.id));
          if (newMsgs.length === 0) return prev;
          return sortMessages([...prev, ...newMsgs]);
        });
      }
    }, 5000);
    return () => clearInterval(poll);
  }, [chat.id]);

  // Обновляем прочитанные при фокусе на вкладке
  useEffect(() => {
    const onFocus = async () => {
      await markAsRead(chat.id, currentEmployeeId);
setTimeout(() => onMessageRead?.(), 300);
    };
    const onVisibility = () => { if (!document.hidden) onFocus(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [chat.id, currentEmployeeId]);

  // Свайп вправо → onBack
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStart.current.x;
      const dy = Math.abs(e.changedTouches[0].clientY - touchStart.current.y);
      if (dx > 80 && dy < 60 && touchStart.current.x < window.innerWidth * 0.7) onBack();
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [onBack]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content) return;
    setText('');
    const sent = await sendInternalMessage(chat.id, currentEmployeeId, content);
    if (sent) {
      setMessages(prev => {
        if (prev.find(m => m.id === sent.id)) return prev;
        return sortMessages([...prev, sent]);
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="fixed inset-0 bg-[#0b141a] z-40 flex flex-col">
      {/* Шапка */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#202c33] border-b border-white/5 flex-shrink-0">
        <button onClick={onBack} className="text-[#aebac1] hover:text-white p-1 -ml-1">
          <ArrowLeft size={20} />
        </button>

        {chat.type === 'direct' ? (
          <>
            {/* Аватар */}
            <div className="w-9 h-9 rounded-full bg-[#2a3942] flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-[#e9edef]">
                {otherName[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#e9edef] truncate">
                {otherName}
              </p>
              <p className="text-xs truncate" style={{ color: roleColor(otherRole) }}>
                {otherRole === 'admin' ? 'Администратор'
                  : otherRole === 'branch_admin' ? 'Менеджер филиала'
                  : 'Менеджер'}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="w-9 h-9 rounded-full bg-[#2a3942] flex items-center justify-center flex-shrink-0 text-lg">
              🏢
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#e9edef] truncate">
                {chat.name ?? 'Группа'}
              </p>
              <p className="text-xs text-[#8696a0]">
                {chat.members?.length ?? 0} участников
              </p>
            </div>
          </>
        )}
      </div>

      {/* Список сообщений */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {messages.map((msg, idx) => {
          const isMine = msg.sender_id === currentEmployeeId;
          const prevMsg = messages[idx - 1];
          const showSenderName = !isMine && (!prevMsg || prevMsg.sender_id !== msg.sender_id);

          // Находим данные отправителя из списка участников
          const senderMember = chat.members?.find(m => m.employee_id === msg.sender_id);
          const senderName = msg.sender?.name ?? senderMember?.employee?.name ?? 'Сотрудник';
          const senderRole = senderMember?.employee?.role;

          return (
            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] ${isMine ? '' : 'flex flex-col items-start'}`}>
                {showSenderName && (
                  <p className="px-3 mb-0.5" style={{ fontSize: 11, color: roleColor(senderRole) }}>
                    {senderName}
                  </p>
                )}
                <div
                  className={`px-3 py-2 rounded-lg ${
                    isMine
                      ? 'bg-[#005c4b] text-white rounded-br-sm'
                      : 'bg-[#202c33] text-[#e9edef] rounded-bl-sm'
                  }`}
                >
                  <p className="text-sm leading-snug break-words whitespace-pre-wrap">{msg.content}</p>
                  <p className="mt-0.5 text-right" style={{ fontSize: 10, color: isMine ? 'rgba(255,255,255,0.55)' : '#8696a0' }}>
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Поле ввода */}
      <div className="px-3 py-3 bg-[#202c33] border-t border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Сообщение..."
            className="flex-1 bg-[#2a3942] text-[#e9edef] placeholder:text-[#8696a0] rounded-full px-4 py-2.5 text-sm focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center text-white disabled:opacity-40 flex-shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
