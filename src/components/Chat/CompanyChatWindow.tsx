import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { supabase } from '../../services/supabase';
import {
  getInternalMessages,
  sendInternalMessage,
  sendInternalMediaMessage,
  markAsRead,
} from '../../services/internalChat';
import type { InternalChat, InternalMessage } from '../../services/internalChat';

interface Props {
  chat: InternalChat;
  currentEmployeeId: string;
  onBack: () => void;
  onMessageRead?: () => void;
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
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [mediaModal, setMediaModal] = useState<MediaModal | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const mediaModalRef = useRef<MediaModal | null>(null);
  useEffect(() => { mediaModalRef.current = mediaModal; }, [mediaModal]);

  const otherMember = chat.type === 'direct'
    ? chat.members?.find(m => m.employee_id !== currentEmployeeId)
    : null;
  const otherName = otherMember?.employees?.name || 'Сотрудник';
  const otherRole = otherMember?.employees?.role;

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStart.current.x;
      const dy = Math.abs(e.changedTouches[0].clientY - touchStart.current.y);
      if (mediaModalRef.current) { if (dx > 80 && dy < 100) setMediaModal(null); return; }
      if (dx > 80 && dy < 60 && touchStart.current.x < window.innerWidth * 0.7) onBack();
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [onBack]);

  const sendPendingFiles = async () => {
    if (uploading) return;
    setUploading(true);
    for (const pending of pendingFiles) {
      const ext = pending.file.name.split('.').pop();
      const path = `internal/${chat.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('chat-media').upload(path, pending.file);
      if (error) continue;
      const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
      const content = pending.type === 'image' ? '📷 Фото' : pending.type === 'video' ? '🎥 Видео' : `📎 ${pending.file.name}`;
      const msgType = pending.type === 'image' ? 'image' : 'file';
      const sent = await sendInternalMediaMessage(chat.id, currentEmployeeId, content, msgType, urlData.publicUrl);
      if (sent) setMessages(prev => {
        if (prev.find(m => m.id === sent.id)) return prev;
        return sortMessages([...prev, sent]);
      });
    }
    setPendingFiles([]);
    setUploading(false);
  };

  const handleSend = async () => {
    if (pendingFiles.length > 0) { await sendPendingFiles(); return; }
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const newPending: PendingFile[] = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      type: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file',
    }));
    setPendingFiles(prev => [...prev, ...newPending]);
    e.target.value = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const canSend = (text.trim().length > 0 || pendingFiles.length > 0) && !uploading;

  const renderMsg = (msg: InternalMessage, idx: number) => {
    const isMine = msg.sender_id === currentEmployeeId;
    const prevMsg = messages[idx - 1];
    const showSenderName = !isMine && (!prevMsg || prevMsg.sender_id !== msg.sender_id);
    const senderMember = chat.members?.find(m => m.employee_id === msg.sender_id);
    const senderName = msg.sender?.name ?? senderMember?.employee?.name ?? 'Сотрудник';
    const senderRole = senderMember?.employee?.role;
    const isVideo = msg.media_url?.match(/\.(mp4|mov|avi|webm)$/i);

    return (
      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[75%] ${isMine ? '' : 'flex flex-col items-start'}`}>
          {showSenderName && (
            <p className="px-3 mb-0.5" style={{ fontSize: 11, color: roleColor(senderRole) }}>
              {senderName}
            </p>
          )}
          <div className={`rounded-lg overflow-hidden text-sm ${isMine ? 'bg-[#005c4b] text-white rounded-br-sm' : 'bg-[#202c33] text-[#e9edef] rounded-bl-sm'}`}>
            {msg.message_type === 'image' && msg.media_url ? (
              <div>
                <img src={msg.media_url} alt="фото" className="max-w-full cursor-pointer" onClick={() => setMediaModal({ url: msg.media_url!, type: 'image' })} />
                <p className="px-3 pb-2 text-right" style={{ fontSize: 10, color: isMine ? 'rgba(255,255,255,0.55)' : '#8696a0' }}>{formatTime(msg.created_at)}</p>
              </div>
            ) : msg.message_type === 'file' && msg.media_url ? (
              <div className="px-3 py-2">
                <button onClick={() => setMediaModal({ url: msg.media_url!, type: isVideo ? 'video' : 'file', name: msg.content })} className="flex items-center gap-2 text-emerald-400">
                  {isVideo
                    ? <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    : <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                  <span className="text-xs">{msg.content}</span>
                </button>
                <p className="mt-1 text-right" style={{ fontSize: 10, color: isMine ? 'rgba(255,255,255,0.55)' : '#8696a0' }}>{formatTime(msg.created_at)}</p>
              </div>
            ) : (
              <div className="px-3 py-2">
                <p className="leading-snug break-words whitespace-pre-wrap">{msg.content}</p>
                <p className="mt-0.5 text-right" style={{ fontSize: 10, color: isMine ? 'rgba(255,255,255,0.55)' : '#8696a0' }}>{formatTime(msg.created_at)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-[#0b141a] z-40 flex flex-col">

      {/* Media Modal */}
      {mediaModal && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col" onClick={() => setMediaModal(null)}>
          <div className="flex items-center justify-between px-4 py-3 bg-black/50">
            <p className="text-white text-sm truncate">{mediaModal.name || 'Медиафайл'}</p>
            <button className="text-white text-2xl leading-none" onClick={() => setMediaModal(null)}>✕</button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            {mediaModal.type === 'image' && <img src={mediaModal.url} alt="фото" className="max-w-full max-h-full object-contain rounded-lg" />}
            {mediaModal.type === 'video' && <video src={mediaModal.url} controls autoPlay className="max-w-full max-h-full rounded-lg" />}
            {mediaModal.type === 'file' && (
              <div className="flex flex-col items-center w-full h-full">
                {mediaModal.url.match(/\.pdf$/i)
                  ? <a href={mediaModal.url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-3 text-emerald-400 flex-1 justify-center flex">
                      <svg className="w-20 h-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      <span>Открыть {mediaModal.name}</span>
                    </a>
                  : <div className="text-center flex-1 flex flex-col items-center justify-center">
                      <p className="text-white mb-2">{mediaModal.name}</p>
                      <p className="text-[#8696a0] text-sm">Предпросмотр недоступен</p>
                    </div>}
                <a href={mediaModal.url} download target="_blank" rel="noopener noreferrer" className="mt-3 text-sm text-emerald-400 underline">⬇ Скачать</a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Шапка */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#202c33] border-b border-white/5 flex-shrink-0">
        <button onClick={onBack} className="text-[#aebac1] hover:text-white p-1 -ml-1">
          <ArrowLeft size={20} />
        </button>
        {chat.type === 'direct' ? (
          <>
            <div className="w-9 h-9 rounded-full bg-[#2a3942] flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-[#e9edef]">{otherName[0].toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#e9edef] truncate">{otherName}</p>
              <p className="text-xs truncate" style={{ color: roleColor(otherRole) }}>
                {otherRole === 'admin' ? 'Администратор' : otherRole === 'branch_admin' ? 'Менеджер филиала' : 'Менеджер'}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="w-9 h-9 rounded-full bg-[#2a3942] flex items-center justify-center flex-shrink-0 text-lg">🏢</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#e9edef] truncate">{chat.name ?? 'Группа'}</p>
              <p className="text-xs text-[#8696a0]">{chat.members?.length ?? 0} участников</p>
            </div>
          </>
        )}
      </div>

      {/* Сообщения */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {messages.map((msg, idx) => renderMsg(msg, idx))}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending files */}
      {pendingFiles.length > 0 && (
        <div className="px-4 py-2 bg-[#202c33] border-t border-white/5 flex gap-2 overflow-x-auto flex-shrink-0">
          {pendingFiles.map((pf, i) => (
            <div key={i} className="relative flex-shrink-0">
              {pf.type === 'image'
                ? <img src={pf.preview} className="w-16 h-16 object-cover rounded-lg" />
                : <div className="w-16 h-16 bg-[#2a3942] rounded-lg flex items-center justify-center">
                    <svg className="w-8 h-8 text-[#8696a0]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>}
              <button onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Поле ввода */}
      <div className="px-2 py-2 bg-[#202c33] border-t border-white/5 flex-shrink-0">
        <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.txt" multiple className="hidden" onChange={handleFileChange} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
        <input ref={mediaInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileChange} />

        <div className="flex items-center gap-2">
          {/* + кнопка */}
          <div className="relative flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); setShowAttachMenu(v => !v); }}
              className="w-9 h-9 text-[#8696a0] hover:text-[#e9edef] flex items-center justify-center transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </button>
            {showAttachMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowAttachMenu(false)} />
                <div className="absolute bottom-12 left-0 bg-[#233138] rounded-2xl shadow-xl overflow-hidden w-52 z-20">
                  <button onClick={() => { setShowAttachMenu(false); setTimeout(() => mediaInputRef.current?.click(), 100); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors text-left">
                    <div className="w-9 h-9 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                    <span className="text-[#e9edef] text-sm">Фото / Видео</span>
                  </button>
                  <button onClick={() => { setShowAttachMenu(false); setTimeout(() => fileInputRef.current?.click(), 100); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors text-left border-t border-white/5">
                    <div className="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <span className="text-[#e9edef] text-sm">Документ</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Инпут */}
          <div className="flex-1 bg-[#2a3942] rounded-full flex items-center min-h-[42px] overflow-hidden">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown as unknown as React.KeyboardEventHandler<HTMLTextAreaElement>}
              placeholder="Сообщение..."
              rows={1}
              onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }}
              className="flex-1 bg-transparent text-[#d1d7db] placeholder-[#8696a0] px-4 py-2.5 text-sm outline-none resize-none max-h-32 w-full"
              style={{ scrollbarWidth: 'none' }}
            />
          </div>

          {/* Камера */}
          {!canSend && (
            <button onClick={() => cameraInputRef.current?.click()}
              className="w-9 h-9 text-[#8696a0] hover:text-[#e9edef] flex items-center justify-center flex-shrink-0 transition-colors">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
          )}

          {/* Отправить */}
          {canSend && (
            <button onClick={handleSend} disabled={uploading}
              className="w-10 h-10 bg-[#00a884] hover:bg-emerald-600 disabled:opacity-50 rounded-full flex items-center justify-center flex-shrink-0 transition-colors">
              {uploading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Send size={16} className="text-white" />}
            </button>
          )}
          {!canSend && (
            <button disabled className="w-10 h-10 bg-[#00a884] opacity-40 rounded-full flex items-center justify-center flex-shrink-0">
              <Send size={16} className="text-white" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
