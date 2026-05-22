import { VoiceMessage } from './VoiceMessage';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../hooks/useAuth';
import { CRMSidebar } from '../CRM/CRMSidebar';
import { ChatInfoPanel } from './ChatInfoPanel';
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

interface BranchOption {
  id: string;
  name: string;
  city: string;
  address?: string;
}

function formatTime(dateStr: string): string {
  const d = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
  return new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function MsgStatus({ isRead }: { isRead: boolean }) {
  return (
    <span className="text-[12px] font-bold leading-none flex-shrink-0"
      style={{ letterSpacing: '-3px', color: isRead ? '#60a5fa' : '#a7c5bd' }}>
      ✓✓
    </span>
  );
}

function LocationMessage({ content, isOutbound, time, isRead }: {
  content: string; isOutbound: boolean; time: string; isRead: boolean;
}) {
  let loc: { lat?: number; lng?: number; name?: string } = {};
  try { loc = JSON.parse(content); } catch { loc = { name: content }; }
  const hasCoords = loc.lat && loc.lng && loc.lat !== 0 && loc.lng !== 0;
  const mapsUrl = hasCoords
    ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}`
    : `https://www.google.com/maps/search/${encodeURIComponent(loc.name || '')}`;
  const staticMap = hasCoords
    ? `https://static-maps.yandex.ru/1.x/?ll=${loc.lng},${loc.lat}&z=15&size=250,120&l=map&pt=${loc.lng},${loc.lat},pm2rdm`
    : null;
  return (
    <div className="overflow-hidden rounded-lg" style={{ minWidth: 220, maxWidth: 280 }}>
      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="block relative bg-[#1a2530] h-28 flex items-center justify-center">
        {staticMap ? (
          <>
            <img src={staticMap} alt="карта" className="w-full h-full object-cover absolute inset-0" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-[#8696a0]">
            <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            <span className="text-xs">Нажмите для открытия</span>
          </div>
        )}
      </a>
      <div className="px-3 py-2">
        <p className="text-[13px] font-medium text-[#e9edef] truncate">{loc.name || 'Местоположение'}</p>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-emerald-400">Открыть в Google Maps →</a>
        <div className={`flex items-center gap-1 mt-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-[10px] ${isOutbound ? 'text-emerald-300/70' : 'text-[#8696a0]'}`}>{time}</span>
          {isOutbound && <MsgStatus isRead={isRead} />}
        </div>
      </div>
    </div>
  );
}

function ContactMessage({ content, isOutbound, time, isRead }: {
  content: string; isOutbound: boolean; time: string; isRead: boolean;
}) {
  let contact: { name?: string; phone?: string } = {};
  try { contact = JSON.parse(content); } catch { contact = { name: content }; }
  const telUrl = contact.phone ? `tel:${contact.phone}` : undefined;
  const waUrl = contact.phone ? `https://wa.me/${contact.phone.replace(/\D/g, '')}` : undefined;
  return (
    <div className="px-3 py-2 min-w-[200px]">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
          {contact.name ? contact.name[0].toUpperCase() : '?'}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#e9edef] truncate">{contact.name || 'Контакт'}</p>
          {contact.phone && <p className="text-xs text-[#8696a0]">{contact.phone}</p>}
        </div>
      </div>
      <div className="flex gap-2 border-t border-white/10 pt-2">
        {telUrl && <a href={telUrl} className="flex-1 text-center text-xs text-emerald-400 py-1">📞 Позвонить</a>}
        {waUrl && <a href={waUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-center text-xs text-emerald-400 py-1">💬 WhatsApp</a>}
      </div>
      <div className={`flex items-center gap-1 mt-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
        <span className={`text-[10px] ${isOutbound ? 'text-emerald-300/70' : 'text-[#8696a0]'}`}>{time}</span>
        {isOutbound && <MsgStatus isRead={isRead} />}
      </div>
    </div>
  );
}

export function ChatWindow({ chat, onArchive, onBack }: ChatWindowProps) {
  const { employee } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [mediaModal, setMediaModal] = useState<MediaModal | null>(null);
  const [showCRM, setShowCRM] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [selectedMsg, setSelectedMsg] = useState<Message | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [micState, setMicState] = useState<'idle' | 'permission' | 'ready' | 'recording'>('idle');
  const permissionGrantedRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef<number>(0);
  const isStartingRef = useRef(false);
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
      if (mediaModalRef.current) { if (dx > 80 && dy < 100) setMediaModal(null); }
      else if (dx > 50 && dy < 100) { if (onBackRef.current) onBackRef.current(); }
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, []);

  const fetchMessages = async () => {
    supabase.from('messages').update({ is_read: true })
      .eq('chat_id', chat.id).eq('direction', 'inbound').eq('is_read', false)
      .then(() => window.dispatchEvent(new Event('messages-read')));
    const { data } = await supabase.from('messages').select('*').eq('chat_id', chat.id).order('created_at', { ascending: true });
    setMessages(data ?? []);
    setLoading(false);
  };

  const loadBranches = async () => {
    const { data } = await supabase.from('branches').select('id, name, city, address').order('name');
    setBranches(data ?? []);
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
    setMessages(prev => [...prev, tempMsg]);
    const { data } = await supabase.from('messages').insert({
      chat_id: chat.id, direction: 'outbound', sender_type: 'employee',
      sender_id: employee.id, content, message_type: 'text',
    }).select().single();
    if (data) setMessages(prev => prev.map(m => m.id === tempMsg.id ? data : m));
    setSending(false);
  };

  const sendBranchLocation = async (branch: BranchOption) => {
    if (!employee) return;
    setGeocoding(true);
    const query = [branch.address, branch.city].filter(Boolean).join(', ');
    let lat = 0, lng = 0;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`, { headers: { 'Accept-Language': 'ru' } });
      const data = await res.json();
      if (data.length > 0) { lat = parseFloat(data[0].lat); lng = parseFloat(data[0].lon); }
    } catch {}
    setGeocoding(false);
    setShowLocationModal(false);
    const name = `${branch.name}${branch.address ? ', ' + branch.address : ''}, ${branch.city}`;
    const { data } = await supabase.from('messages').insert({
      chat_id: chat.id, direction: 'outbound', sender_type: 'employee',
      sender_id: employee.id, content: JSON.stringify({ lat, lng, name }), message_type: 'location',
    }).select().single();
    if (data) setMessages(prev => [...prev, data]);
  };

  const sendContact = async () => {
    if (!employee || (!contactName.trim() && !contactPhone.trim())) return;
    const content = JSON.stringify({ name: contactName.trim(), phone: contactPhone.trim() });
    setShowContactModal(false);
    setContactName('');
    setContactPhone('');
    const { data } = await supabase.from('messages').insert({
      chat_id: chat.id, direction: 'outbound', sender_type: 'employee',
      sender_id: employee.id, content, message_type: 'contact',
    }).select().single();
    if (data) setMessages(prev => [...prev, data]);
  };

  const deleteMessage = async (msg: Message) => {
    setSelectedMsg(null);
    await supabase.from('messages').delete().eq('id', msg.id);
    setMessages(prev => prev.filter(m => m.id !== msg.id));
  };

  const handleMsgPressStart = (msg: Message) => {
    longPressTimer.current = setTimeout(() => setSelectedMsg(msg), 500);
  };
  const handleMsgPressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
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
      if (data) setMessages(prev => [...prev, data]);
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
  const openMedia = (url: string, type: 'image' | 'video' | 'file', name?: string) => setMediaModal({ url, type, name });
  const formatRecTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const handleMicTap = async () => {
    if (isRecording || isStartingRef.current) return;
    if (!permissionGrantedRef.current) {
      setMicState('permission');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        permissionGrantedRef.current = true;
        setMicState('ready');
      } catch { setMicState('idle'); alert('Нет доступа к микрофону'); }
      return;
    }
    await startRecording();
  };

  const startRecording = async () => {
    if (isStartingRef.current || isRecording) return;
    isStartingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.start(100);
      recordingStartRef.current = Date.now();
      setIsRecording(true);
      setMicState('recording');
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(Math.floor((Date.now() - recordingStartRef.current) / 1000));
      }, 500);
    } catch { alert('Нет доступа к микрофону'); }
    finally { isStartingRef.current = false; }
  };

  const stopRecording = async (cancel = false) => {
    if (!mediaRecorderRef.current) return;
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setMicState('ready');
    const duration = Math.round((Date.now() - recordingStartRef.current) / 1000);
    setRecordingTime(0);
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    const stopTracks = () => recorder.stream.getTracks().forEach(t => t.stop());
    if (cancel) { recorder.stop(); stopTracks(); return; }
    await new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        stopTracks();
        const mimeType = recorder.mimeType || 'audio/webm';
        const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size < 1000 || duration < 1) { resolve(); return; }
        const path = `${chat.id}/voice_${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from('chat-media').upload(path, blob, { contentType: mimeType });
        if (!error && employee) {
          const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
          const { data } = await supabase.from('messages').insert({
            chat_id: chat.id, direction: 'outbound', sender_type: 'employee',
            sender_id: employee.id, content: `🎤 ${duration}`, message_type: 'audio',
            media_url: urlData.publicUrl,
          }).select().single();
          if (data) setMessages(prev => [...prev, data]);
        }
        resolve();
      };
      recorder.stop();
    });
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
        setMessages(prev => {
          if (prev.find(m => m.id === (payload.new as Message).id)) return prev;
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

  const renderMicButton = () => {
    if (isRecording) return (
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => stopRecording(true)} className="w-8 h-8 text-red-400 flex items-center justify-center text-lg">✕</button>
        <span className="text-red-400 text-xs font-mono animate-pulse whitespace-nowrap">⏺{formatRecTime(recordingTime)}</span>
        <button onPointerUp={() => stopRecording()} className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
        </button>
      </div>
    );
    if (micState === 'permission') return (
      <div className="w-10 h-10 bg-emerald-500/50 rounded-full flex items-center justify-center flex-shrink-0">
        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
    if (canSend) return (
      <button onClick={sendMessage} disabled={isArchived}
        className="w-10 h-10 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 rounded-full flex items-center justify-center flex-shrink-0 transition-colors">
        <svg className="w-5 h-5 text-white rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
      </button>
    );
    return (
      <button disabled={isArchived} onPointerDown={(e) => { e.preventDefault(); handleMicTap(); }}
        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${micState === 'ready' ? 'bg-emerald-400 ring-2 ring-emerald-300' : 'bg-emerald-500 hover:bg-emerald-600'} disabled:opacity-50`}>
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      </button>
    );
  };

  const renderMsg = (msg: Message) => {
    const isOutbound = msg.direction === 'outbound';
    const isVideo = msg.media_url?.match(/\.(mp4|mov|avi|webm)$/i);
    return (
      <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`max-w-[70%] rounded-lg overflow-hidden text-sm select-none ${isOutbound ? 'bg-[#005c4b] text-[#e9edef]' : 'bg-[#202c33] text-[#e9edef]'}`}
          onTouchStart={() => handleMsgPressStart(msg)} onTouchEnd={handleMsgPressEnd} onTouchMove={handleMsgPressEnd}
          onMouseDown={() => handleMsgPressStart(msg)} onMouseUp={handleMsgPressEnd} onMouseLeave={handleMsgPressEnd}
        >
          {msg.message_type === 'image' && msg.media_url ? (
            <div>
              <img src={msg.media_url} alt="фото" className="max-w-full cursor-pointer" onClick={() => openMedia(msg.media_url!, 'image')} />
              <div className={`flex items-center gap-1 px-3 pb-2 mt-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                <span className="text-[10px] text-emerald-300/70">{formatTime(msg.created_at)}</span>
                {isOutbound && <MsgStatus isRead={msg.is_read} />}
              </div>
            </div>
          ) : msg.message_type === 'file' && msg.media_url ? (
            <div className="px-3 py-2">
              <button onClick={() => openMedia(msg.media_url!, isVideo ? 'video' : 'file', msg.content)} className="flex items-center gap-2 text-emerald-400">
                {isVideo
                  ? <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  : <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                <span className="text-xs">{msg.content}</span>
              </button>
              <div className={`flex items-center gap-1 mt-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                <span className={`text-[10px] ${isOutbound ? 'text-emerald-300/70' : 'text-[#8696a0]'}`}>{formatTime(msg.created_at)}</span>
                {isOutbound && <MsgStatus isRead={msg.is_read} />}
              </div>
            </div>
          ) : msg.message_type === 'audio' && msg.media_url ? (
            <VoiceMessage url={msg.media_url} isOutbound={isOutbound}
              time={formatTime(msg.created_at)}
              storedDuration={parseInt(msg.content.replace(/[^0-9]/g, '')) || 0}
              isRead={msg.is_read} />
          ) : msg.message_type === 'location' ? (
            <LocationMessage content={msg.content} isOutbound={isOutbound} time={formatTime(msg.created_at)} isRead={msg.is_read} />
          ) : msg.message_type === 'contact' ? (
            <ContactMessage content={msg.content} isOutbound={isOutbound} time={formatTime(msg.created_at)} isRead={msg.is_read} />
          ) : (
            <div className="px-3 py-2">
              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              <div className={`flex items-center gap-1 mt-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                <span className={`text-[10px] ${isOutbound ? 'text-emerald-300/70' : 'text-[#8696a0]'}`}>{formatTime(msg.created_at)}</span>
                {isOutbound && <MsgStatus isRead={msg.is_read} />}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0">

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

        {/* Delete Sheet */}
        {selectedMsg && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setSelectedMsg(null)}>
            <div className="w-full bg-[#202c33] rounded-t-2xl p-4" onClick={e => e.stopPropagation()}>
              <p className="text-[#8696a0] text-xs text-center mb-3">
                {selectedMsg.message_type === 'text' ? `"${selectedMsg.content.slice(0, 40)}${selectedMsg.content.length > 40 ? '...' : ''}"`
                  : selectedMsg.message_type === 'audio' ? '🎤 Голосовое'
                  : selectedMsg.message_type === 'image' ? '📷 Фото'
                  : selectedMsg.message_type === 'location' ? '📍 Местоположение'
                  : selectedMsg.message_type === 'contact' ? '👤 Контакт'
                  : '📎 Файл'}
              </p>
              <button onClick={() => deleteMessage(selectedMsg)}
                className="w-full py-3.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl font-medium mb-2 hover:bg-red-500/20 transition-colors">
                🗑 Удалить сообщение
              </button>
              <button onClick={() => setSelectedMsg(null)}
                className="w-full py-3.5 bg-white/5 text-[#8696a0] rounded-xl hover:bg-white/10 transition-colors">
                Отмена
              </button>
            </div>
          </div>
        )}

        {/* Location Modal */}
        {showLocationModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-end" onClick={() => setShowLocationModal(false)}>
            <div className="w-full bg-[#202c33] rounded-t-2xl p-5 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <h3 className="text-[#e9edef] font-semibold">Выбрать филиал</h3>
                <button onClick={() => setShowLocationModal(false)} className="text-[#8696a0] text-xl">✕</button>
              </div>
              {geocoding ? (
                <div className="flex items-center justify-center py-8 gap-3">
                  <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[#8696a0] text-sm">Определяем адрес...</span>
                </div>
              ) : (
                <div className="overflow-y-auto flex-1 space-y-2">
                  {branches.length === 0 && <p className="text-[#8696a0] text-sm text-center py-4">Нет филиалов</p>}
                  {branches.map(branch => (
                    <button key={branch.id} onClick={() => sendBranchLocation(branch)}
                      className="w-full flex items-start gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-left">
                      <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                      <div className="min-w-0">
                        <p className="text-[#e9edef] text-sm font-medium">{branch.name}</p>
                        <p className="text-[#8696a0] text-xs truncate">{[branch.address, branch.city].filter(Boolean).join(', ')}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Contact Modal */}
        {showContactModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-end" onClick={() => setShowContactModal(false)}>
            <div className="w-full bg-[#202c33] rounded-t-2xl p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[#e9edef] font-semibold">Отправить контакт</h3>
                <button onClick={() => setShowContactModal(false)} className="text-[#8696a0] text-xl">✕</button>
              </div>
              <input type="text" value={contactName} onChange={e => setContactName(e.target.value)}
                placeholder="Имя контакта"
                className="w-full bg-[#2a3942] text-[#d1d7db] placeholder-[#8696a0] rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-emerald-500 mb-3" />
              <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                placeholder="Номер телефона (+7...)"
                className="w-full bg-[#2a3942] text-[#d1d7db] placeholder-[#8696a0] rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-emerald-500 mb-4" />
              <button onClick={sendContact} disabled={!contactName.trim() && !contactPhone.trim()}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors">
                Отправить
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="px-4 py-3 bg-[#202c33] flex items-center gap-3 border-b border-white/5 flex-shrink-0">
          {onBack && (
            <button onClick={onBack} className="text-[#8696a0] hover:text-[#e9edef] transition-colors mr-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
          )}
          <button onClick={() => setShowInfo(true)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
              {client?.name ? client.name[0].toUpperCase() : '#'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#e9edef] truncate">{client?.name || client?.phone || 'Клиент'}</p>
              <div className="flex items-center gap-2">
                <p className="text-xs text-[#8696a0]">{client?.phone}</p>
                {isArchived && <span className="text-[10px] bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded-full">Архив</span>}
              </div>
            </div>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2" style={{ background: '#0b141a' }}>
          {loading && <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>}
          {!loading && messages.length === 0 && <div className="flex justify-center py-8"><p className="text-sm text-[#8696a0]">Нет сообщений</p></div>}
          {messages.map(msg => renderMsg(msg))}
          <div ref={bottomRef} />
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
                <button onClick={() => removePending(i)} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="px-2 pt-2 bg-[#202c33] flex items-end gap-1.5 flex-shrink-0" style={{ paddingBottom: '20px' }}
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.txt" multiple className="hidden" onChange={handleFileChange} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
          <input ref={mediaInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileChange} />

          {/* + меню */}
          <div className="relative flex-shrink-0">
            <button onClick={(e) => { e.stopPropagation(); setShowAttachMenu(v => !v); }} disabled={isArchived}
              className="w-10 h-10 text-[#8696a0] hover:text-[#e9edef] disabled:opacity-50 flex items-center justify-center transition-colors">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </button>
            {showAttachMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowAttachMenu(false)} />
                <div id="attach-menu" className="absolute bottom-12 left-0 bg-[#233138] rounded-2xl shadow-xl overflow-hidden w-56 z-20">
                <button onClick={() => { setShowAttachMenu(false); setTimeout(() => mediaInputRef.current?.click(), 100); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors text-left">
                  <div className="w-9 h-9 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </div>
                  <span className="text-[#e9edef] text-sm">Фото и видео</span>
                </button>
                <button onClick={() => { setShowAttachMenu(false); setTimeout(() => fileInputRef.current?.click(), 100); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors text-left border-t border-white/5">
                  <div className="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <span className="text-[#e9edef] text-sm">Выбрать файлы</span>
                </button>
                <button onClick={() => { setShowAttachMenu(false); setShowLocationModal(true); loadBranches(); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors text-left border-t border-white/5">
                  <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                  </div>
                  <span className="text-[#e9edef] text-sm">Местоположение</span>
                </button>
                <button onClick={async () => {
                  setShowAttachMenu(false);
                  if ('contacts' in navigator) {
                    try {
                      const contacts = await (navigator as any).contacts.select(['name', 'tel'], { multiple: false });
                      if (contacts?.length > 0) {
                        setContactName(contacts[0].name?.[0] || '');
                        setContactPhone(contacts[0].tel?.[0] || '');
                      }
                    } catch {}
                  }
                  setShowContactModal(true);
                }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors text-left border-t border-white/5">
                  <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  </div>
                  <span className="text-[#e9edef] text-sm">Контакт</span>
                </button>
                </div>
              </>
            )}
          </div>

          <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={isArchived ? 'Чат в архиве' : 'Написать сообщение...'}
            disabled={isArchived} rows={1}
            onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px"; }}
            className="flex-1 bg-[#2a3942] text-[#d1d7db] placeholder-[#8696a0] rounded-full px-4 py-2.5 text-sm outline-none resize-none max-h-32 focus:ring-1 focus:ring-emerald-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ scrollbarWidth: 'none' }} />

          {!canSend && !isRecording && (
            <button onClick={() => cameraInputRef.current?.click()} disabled={isArchived}
              className="w-10 h-10 text-[#8696a0] hover:text-[#e9edef] disabled:opacity-50 flex items-center justify-center flex-shrink-0 transition-colors">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
          )}

          {renderMicButton()}
        </div>

      </div>

      {showCRM && <CRMSidebar chat={chat} />}
      {showInfo && (
        <ChatInfoPanel chat={chat} onClose={() => setShowInfo(false)}
          onArchive={() => { setShowInfo(false); onArchive?.(); }} />
      )}
    </div>
  );
}