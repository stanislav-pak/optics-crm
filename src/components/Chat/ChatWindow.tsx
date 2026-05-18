import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../hooks/useAuth';
import type { Chat, Message } from '../../types';

interface ChatWindowProps {
  chat: Chat;
  onArchive?: () => void;
  onBack?: () => void;
}

interface PendingFile {
  file: File;
  preview: string;
  type: 'image' | 'video' | 'file';
}

interface MediaModal {
  url: string;
  type: 'image' | 'video' | 'file';
  name?: string;
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
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [mediaModal, setMediaModal] = useState<MediaModal | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mediaModalRef = useRef<MediaModal | null>(null);
  useEffect(() => { mediaModalRef.current = mediaModal; }, [mediaModal]);
  const onBackRef = useRef(onBack);
  useEffect(() => { onBackRef.current = onBack; }, [onBack]);

  useEffect(() => {
    let startX = 0, startY = 0;
    const onStart = (e: TouchEvent) => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = Math.abs(e.changedTouches[0].clientY - startY);
      if (mediaModalRef.current) {
        // Modal open — any right swipe closes it
        if (dx > 80 && dy < 100) { setMediaModal(null); }
      } else if (dx > 50 && dy < 100) {
        // No modal — swipe right goes back
        if (onBackRef.current) { onBackRef.current(); }
      }
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => { document.removeEventListener('touchstart', onStart); document.removeEventListener('touchend', onEnd); };
  }, []);



  const fetchMessages = async () => {
    supabase.from('messages').update({ is_read: true })
      .eq('chat_id', chat.id).eq('direction', 'inbound').eq('is_read', false)
      .then(() => window.dispatchEvent(new Event('messages-read')));
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chat.id)
      .order('created_at', { ascending: true });
    setMessages(data ?? []);
    setLoading(false);
  };

  const sendMessage = async () => {
    if (pendingFiles.length > 0) { await sendPendingFiles(); return; }
    if (!text.trim() || !employee || sending) return;
    const content = text.trim();
    setText('');
    setSending(true);
    const tempMsg: Message = {
      id: crypto.randomUUID(), chat_id: chat.id, direction: 'outbound',
      sender_type: 'employee', sender_id: employee.id, content,
      message_type: 'text', is_read: false, created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);
    const { data } = await supabase.from('messages').insert({
      chat_id: chat.id, direction: 'outbound', sender_type: 'employee',
      sender_id: employee.id, content, message_type: 'text',
    }).select().single();
    if (data) setMessages((prev) => prev.map((m) => m.id === tempMsg.id ? data : m));
    setSending(false);
  };

  const sendPendingFiles = async () => {
    if (!employee || uploading) return;
    setUploading(true);
    for (const pending of pendingFiles) {
      const ext = pending.file.name.split('.').pop();
      const path = `${chat.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('chat-media').upload(path, pending.file);
      if (error) continue;
      const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
      const content = pending.type === 'image' ? '📷 Фото' : pending.type === 'video' ? '🎥 Видео' : `📎 ${pending.file.name}`;
      const { data } = await supabase.from('messages').insert({
        chat_id: chat.id, direction: 'outbound', sender_type: 'employee',
        sender_id: employee.id, content,
        message_type: pending.type === 'image' ? 'image' : 'file',
        media_url: urlData.publicUrl,
      }).select().single();
      if (data) setMessages((prev) => [...prev, data]);
    }
    setPendingFiles([]);
    setUploading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const newPending: PendingFile[] = files.map(file => ({
      file, preview: URL.createObjectURL(file),
      type: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file',
    }));
    setPendingFiles(prev => [...prev, ...newPending]);
    e.target.value = '';
  };

  const removePending = (index: number) => setPendingFiles(prev => prev.filter((_, i) => i !== index));

  const openMedia = (url: string, type: 'image' | 'video' | 'file', name?: string) => {
    setMediaModal({ url, type, name });
  };

  const toggleArchive = async () => {
    if (archiving) return;
    if (!window.confirm(isArchived ? 'Восстановить чат?' : 'Архивировать этот чат?')) return;
    setArchiving(true);
    await supabase.from('chats').update({ status: isArchived ? 'active' : 'archived' }).eq('id', chat.id);
    setArchiving(false);
    onArchive?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    fetchMessages();
    const channel = supabase.channel(`chat-${chat.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chat.id}` }, (payload) => {
        setMessages((prev) => {
          if (prev.find((m) => m.id === (payload.new as Message).id)) return prev;
          return [...prev, payload.new as Message];
        });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chat.id]);

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 50);
  }, [messages]);

  const client = chat.client;
  const isArchived = chat.status === 'archived';
  const canSend = (text.trim().length > 0 || pendingFiles.length > 0) && !sending && !uploading;

  return (
    <div className="flex flex-col h-full">
      {/* Media Modal */}
      {mediaModal && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col" onClick={() => setMediaModal(null)}>
          <div className="flex items-center justify-between px-4 py-3 bg-black/50">
            <p className="text-white text-sm truncate">{mediaModal.name || 'Медиафайл'}</p>
            <button className="text-white text-2xl leading-none" onClick={() => setMediaModal(null)}>✕</button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            {mediaModal.type === 'image' && (
              <img src={mediaModal.url} alt="фото" className="max-w-full max-h-full object-contain rounded-lg" />
            )}
            {mediaModal.type === 'video' && (
              <video src={mediaModal.url} controls autoPlay className="max-w-full max-h-full rounded-lg" />
            )}
            {mediaModal.type === 'file' && (
              <div className="flex flex-col items-center w-full h-full">
                {mediaModal.url.match(/\.pdf$/i) ? (
                  <a href={mediaModal.url} target="_blank" rel="noopener noreferrer"
                    className="flex flex-col items-center gap-3 text-emerald-400 hover:text-emerald-300 flex-1 justify-center flex">
                    <svg className="w-20 h-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <span className="text-base font-medium">Открыть {mediaModal.name}</span>
                    <span className="text-xs text-[#8696a0]">Откроется в браузере</span>
                  </a>
                ) : (
                  <div className="text-center flex-1 flex flex-col items-center justify-center">
                    <svg className="w-16 h-16 text-[#8696a0] mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <p className="text-white mb-2">{mediaModal.name}</p>
                    <p className="text-[#8696a0] text-sm">Предпросмотр недоступен</p>
                  </div>
                )}
                <a href={mediaModal.url} download target="_blank" rel="noopener noreferrer"
                  className="mt-3 text-sm text-emerald-400 hover:text-emerald-300 underline flex items-center gap-1">
                  ⬇ Скачать файл
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
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
        <button onClick={toggleArchive} disabled={archiving}
          className={`transition-colors disabled:opacity-50 ${isArchived ? 'text-[#8696a0] hover:text-emerald-400' : 'text-[#8696a0] hover:text-amber-400'}`}>
          {isArchived ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
          )}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2" style={{ background: '#0b141a' }}>
        {loading && <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>}
        {!loading && messages.length === 0 && <div className="flex justify-center py-8"><p className="text-sm text-[#8696a0]">Нет сообщений</p></div>}
        {messages.map((msg) => {
          const isOutbound = msg.direction === 'outbound';
          const isVideo = msg.media_url?.match(/\.(mp4|mov|avi|webm)$/i);
          return (
            <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] rounded-lg overflow-hidden text-sm ${isOutbound ? 'bg-[#005c4b] text-[#e9edef]' : 'bg-[#202c33] text-[#e9edef]'}`}>
                {msg.message_type === 'image' && msg.media_url ? (
                  <div>
                    <img src={msg.media_url} alt="фото" className="max-w-full cursor-pointer" onClick={() => openMedia(msg.media_url!, 'image')} />
                    <p className={`text-[10px] px-3 pb-2 mt-1 ${isOutbound ? 'text-emerald-300/70 text-right' : 'text-[#8696a0]'}`}>{formatTime(msg.created_at)}</p>
                  </div>
                ) : msg.message_type === 'file' && msg.media_url ? (
                  <div className="px-3 py-2">
                    <button onClick={() => openMedia(msg.media_url!, isVideo ? 'video' : 'file', msg.content)}
                      className="flex items-center gap-2 text-emerald-400">
                      {isVideo ? (
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      ) : (
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      )}
                      <span className="text-xs">{msg.content}</span>
                    </button>
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

      {/* Pending files preview */}
      {pendingFiles.length > 0 && (
        <div className="px-4 py-2 bg-[#202c33] border-t border-white/5 flex gap-2 overflow-x-auto">
          {pendingFiles.map((pf, i) => (
            <div key={i} className="relative flex-shrink-0">
              {pf.type === 'image' ? (
                <img src={pf.preview} className="w-16 h-16 object-cover rounded-lg" />
              ) : pf.type === 'video' ? (
                <div className="w-16 h-16 bg-[#2a3942] rounded-lg flex items-center justify-center">
                  <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
                </div>
              ) : (
                <div className="w-16 h-16 bg-[#2a3942] rounded-lg flex items-center justify-center">
                  <svg className="w-8 h-8 text-[#8696a0]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
              )}
              <button onClick={() => removePending(i)} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 bg-[#202c33] flex items-end gap-2">
        <input ref={fileInputRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden" onChange={handleFileChange} />
        <button onClick={() => fileInputRef.current?.click()} disabled={isArchived || uploading}
          className="w-10 h-10 text-[#8696a0] hover:text-[#e9edef] disabled:opacity-50 flex items-center justify-center flex-shrink-0 transition-colors">
          {uploading ? <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /> :
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>}
        </button>
        <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown}
          placeholder={isArchived ? 'Чат в архиве' : 'Написать сообщение...'}
          disabled={isArchived} rows={1}
          onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px"; }}
          className="flex-1 bg-[#2a3942] text-[#d1d7db] placeholder-[#8696a0] rounded-lg px-3 py-2.5 text-sm outline-none resize-none max-h-32 focus:ring-1 focus:ring-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ scrollbarWidth: 'none' }} />
        <button onClick={sendMessage} disabled={!canSend || isArchived}
          className="w-10 h-10 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-full flex items-center justify-center flex-shrink-0 transition-colors">
          <svg className="w-5 h-5 text-white rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
        </button>
      </div>
    </div>
  );
}









