import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../hooks/useAuth';
import type { Chat, Message } from '../../types';

interface ChatWindowProps {
  chat: Chat;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function ChatWindow({ chat }: ChatWindowProps) {
  const { employee } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chat.id)
      .order('created_at', { ascending: true });
    setMessages(data ?? []);
    setLoading(false);
  };

  const sendMessage = async () => {
    if (!text.trim() || !employee || sending) return;
    const content = text.trim();
    setText('');
    setSending(true);

    const tempMsg: Message = {
      id: crypto.randomUUID(),
      chat_id: chat.id,
      direction: 'outbound',
      sender_type: 'employee',
      sender_id: employee.id,
      content,
      message_type: 'text',
      is_read: false,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    const { data } = await supabase.from('messages').insert({
      chat_id: chat.id,
      direction: 'outbound',
      sender_type: 'employee',
      sender_id: employee.id,
      content,
      message_type: 'text',
    }).select().single();

    if (data) {
      setMessages((prev) => prev.map((m) => m.id === tempMsg.id ? data : m));
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    fetchMessages();

    const channel = supabase
      .channel(`chat-${chat.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chat.id}` }, (payload) => {
        setMessages((prev) => {
          const exists = prev.find((m) => m.id === (payload.new as Message).id);
          if (exists) return prev;
          return [...prev, payload.new as Message];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chat.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const client = chat.client;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 bg-[#202c33] flex items-center gap-3 border-b border-white/5">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-semibold">
          {client?.name ? client.name[0].toUpperCase() : '#'}
        </div>
        <div>
          <p className="text-sm font-medium text-[#e9edef]">{client?.name || client?.phone || 'Клиент'}</p>
          <p className="text-xs text-[#8696a0]">{client?.phone}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2" style={{ background: '#0b141a' }}>
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex justify-center py-8">
            <p className="text-sm text-[#8696a0]">Нет сообщений</p>
          </div>
        )}
        {messages.map((msg) => {
          const isOutbound = msg.direction === 'outbound';
          return (
            <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] px-3 py-2 rounded-lg text-sm ${isOutbound ? 'bg-[#005c4b] text-[#e9edef]' : 'bg-[#202c33] text-[#e9edef]'}`}>
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                <p className={`text-[10px] mt-1 ${isOutbound ? 'text-emerald-300/70 text-right' : 'text-[#8696a0]'}`}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-3 bg-[#202c33] flex items-end gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Написать сообщение..."
          rows={1}
          className="flex-1 bg-[#2a3942] text-[#d1d7db] placeholder-[#8696a0] rounded-lg px-3 py-2.5 text-sm outline-none resize-none max-h-32 focus:ring-1 focus:ring-emerald-500 transition-all"
          style={{ scrollbarWidth: 'none' }}
        />
        <button
          onClick={sendMessage}
          disabled={!text.trim() || sending}
          className="w-10 h-10 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
        >
          <svg className="w-5 h-5 text-white rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
