import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../hooks/useAuth';
import type { Chat, Message } from '../../types';

interface ChatWindowProps {
  chat: Chat;
  onArchive?: () => void;
  onBack?: () => void;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function ChatWindow({ chat, onArchive, onBack }: ChatWindowProps) {
  const { employee } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    if (data) setMessages((prev) => prev.map((m) => m.id === tempMsg.id ? data : m));
    setSending(false);
  };

  const sendFile = async (file: File) => {
    if (!employee) return;
    setUploading(true);

    const ext = file.name.split('.').pop();
    const path = `${chat.id}/${Date.now()}.${ext}`;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    const { error } = await supabase.storage.from('chat-media').upload(path, file);
    if (error) { setUploading(false); return; }

    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
    const mediaUrl = urlData.publicUrl;

    const messageType = isImage ? 'image' : isVideo ? 'file' : 'file';
    const content = isImage ? '📷 Фото' : isVideo ? '🎥 Видео' : `📎 ${file.name}`;

    const { data } = await supabase.from('messages').insert({
      chat_id: chat.id,
      direction: 'outbound',
      sender_type: 'employee',
      sender_id: employee.id,
      content,
      message_type: messageType,
      media_url: mediaUrl,
    }).select().single();

    if (data) setMessages((prev) => [...prev, data]);
    setUploading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) sendFile(file);
    e.target.value = '';
  };

  const toggleArchive = async () => {
    if (archiving) return;
    const msg = isArchived ? 'Восстановить чат?' : 'Архивировать этот чат?';
    if (!window.confirm(msg)) return;
    setArchiving(true);
    await supabase.from('chats').update({ status: isArchived ? 'active' : 'archived' }).eq('id', chat.id);
    setArchiving(false);
    onArchive?.();
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
  const isArchived = chat.status === 'archived';

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 bg-[#202c33] flex items-center gap-3 border-b border-white/5">
        {onBack && (
          <button onClick={onBack} className="text-[#8696a0] hover:text-[#e9edef] transition-colors mr-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
        )}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-semibold">
          {client?.name ? client.name[0].toUpperCase() : '#'}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-[#e9edef]">{client?.name || client?.phone || 'Клиент'}</p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-[#8696a0]">{client?.phone}</p>
            {isArchived && <span className="text-[10px] bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded-full">Архив</span>}
          </div>
        </div>
        <button onClick={toggleArchive} disabled={archiving} title={isArchived ? 'Восстановить чат' : 'Архивировать чат'}
          className={`transition-colors disabled:opacity-50 ${isArchived ? 'text-[#8696a0] hover:text-emerald-400' : 'text-[#8696a0] hover:text-amber-400'}`}>
          {isArchived ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2" style={{ background: '#0b141a' }}>
        {loading && <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>}
        {!loading && messages.length === 0 && <div className="flex justify-center py-8"><p className="text-sm text-[#8696a0]">Нет сообщений</p></div>}
        {messages.map((msg) => {
          const isOutbound = msg.direction === 'outbound';
          return (
            <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] rounded-lg overflow-hidden text-sm ${isOutbound ? 'bg-[#005c4b] text-[#e9edef]' : 'bg-[#202c33] text-[#e9edef]'}`}>
                {msg.message_type === 'image' && msg.media_url ? (
                  <div>
                    <img src={msg.media_url} alt="фото" className="max-w-full rounded-lg cursor-pointer" onClick={() => window.open(msg.media_url, '_blank')} />
                    <p className={`text-[10px] px-3 pb-2 mt-1 ${isOutbound ? 'text-emerald-300/70 text-right' : 'text-[#8696a0]'}`}>{formatTime(msg.created_at)}</p>
                  </div>
                ) : msg.message_type === 'file' && msg.media_url ? (
                  <div className="px-3 py-2">
                    <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-emerald-400 underline">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                      <span className="text-xs">{msg.content}</span>
                    </a>
                    <p className={`text-[10px] mt-1 ${isOutbound ? 'text-emerald-300/70 text-right' : 'text-[#8696a0]'}`}>{formatTime(msg.created_at)}</p>
                  </div>
                ) : (
                  <div className="px-3 py-2">
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    <p className={`text-[10px] mt-1 ${isOutbound ? 'text-emerald-300/70 text-right' : 'text-[#8696a0]'}`}>{formatTime(msg.created_at)}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-3 bg-[#202c33] flex items-end gap-2">
        <input ref={fileInputRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={handleFileChange} />
        <button onClick={() => fileInputRef.current?.click()} disabled={isArchived || uploading}
          className="w-10 h-10 text-[#8696a0] hover:text-[#e9edef] disabled:opacity-50 flex items-center justify-center flex-shrink-0 transition-colors">
          {uploading ? (
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
          )}
        </button>
        <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown}
          placeholder={isArchived ? 'Чат в архиве' : 'Написать сообщение...'}
          disabled={isArchived} rows={1}
          onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px"; }}
          className="flex-1 bg-[#2a3942] text-[#d1d7db] placeholder-[#8696a0] rounded-lg px-3 py-2.5 text-sm outline-none resize-none max-h-32 focus:ring-1 focus:ring-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ scrollbarWidth: 'none' }} />
        <button onClick={sendMessage} disabled={!text.trim() || sending || isArchived}
          className="w-10 h-10 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-full flex items-center justify-center flex-shrink-0 transition-colors">
          <svg className="w-5 h-5 text-white rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
        </button>
      </div>
    </div>
  );
}
