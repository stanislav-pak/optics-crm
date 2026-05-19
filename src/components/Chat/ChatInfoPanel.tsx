import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import type { Chat, Message } from '../../types';

interface Props {
  chat: Chat;
  onClose: () => void;
  onArchive: () => void;
}

export function ChatInfoPanel({ chat, onClose, onArchive }: Props) {
  const [media, setMedia] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);
  const [mediaModal, setMediaModal] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const client = chat.client;
  const isArchived = chat.status === 'archived';

  useEffect(() => {
    async function fetchMedia() {
      const { data } = await supabase
        .from('messages')
        .select('id, media_url, message_type, created_at')
        .eq('chat_id', chat.id)
        .eq('message_type', 'image')
        .order('created_at', { ascending: false })
        .limit(12);
      setMedia(data ?? []);
      setLoading(false);
    }
    fetchMedia();
  }, [chat.id]);

  // Блокируем свайп пока панель открыта
  useEffect(() => {
    const prevent = (e: TouchEvent) => e.stopPropagation();
    document.addEventListener('touchstart', prevent, { capture: true });
    document.addEventListener('touchend', prevent, { capture: true });
    return () => {
      document.removeEventListener('touchstart', prevent, { capture: true });
      document.removeEventListener('touchend', prevent, { capture: true });
    };
  }, []);

  const toggleArchive = async () => {
    if (archiving) return;
    const action = isArchived ? 'Восстановить чат?' : 'Архивировать этот чат?';
    if (!window.confirm(action)) return;
    setArchiving(true);
    await supabase.from('chats').update({ status: isArchived ? 'active' : 'archived' }).eq('id', chat.id);
    setArchiving(false);
    onArchive();
  };

  const isVideo = (url: string) => url.match(/\.(mp4|mov|avi|webm)$/i);

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-[#111b21] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="px-4 py-3 bg-[#202c33] flex items-center gap-3 border-b border-white/5 flex-shrink-0">
          <button onClick={onClose} className="text-[#8696a0] hover:text-[#e9edef] transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <p className="text-sm font-semibold text-[#e9edef]">Информация о чате</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Аватар + имя */}
          <div className="flex flex-col items-center py-6 px-4 border-b border-white/5">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-2xl font-bold mb-3">
              {client?.name ? client.name[0].toUpperCase() : '#'}
            </div>
            <p className="text-base font-semibold text-[#e9edef]">{client?.name || 'Без имени'}</p>
            <p className="text-sm text-[#8696a0] mt-0.5">{client?.phone}</p>
          </div>

          {/* Детали */}
          <div className="px-4 py-4 border-b border-white/5 space-y-3">
            <p className="text-xs text-[#8696a0] uppercase tracking-wide font-medium">Детали</p>
            <div className="flex items-center gap-3">
              <svg className="w-4 h-4 text-[#8696a0] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <div>
                <p className="text-[10px] text-[#8696a0]">Менеджер</p>
                <p className="text-sm text-[#e9edef]">{chat.employee?.name ?? '—'}</p>
              </div>
            </div>
            {client?.email && (
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-[#8696a0] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <div>
                  <p className="text-[10px] text-[#8696a0]">Email</p>
                  <p className="text-sm text-[#e9edef]">{client.email}</p>
                </div>
              </div>
            )}
            {client?.first_contact_date && (
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-[#8696a0] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div>
                  <p className="text-[10px] text-[#8696a0]">Первый контакт</p>
                  <p className="text-sm text-[#e9edef]">
                    {new Date(client.first_contact_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Медиа */}
          <div className="px-4 py-4 border-b border-white/5">
            <p className="text-xs text-[#8696a0] uppercase tracking-wide font-medium mb-3">
              Медиафайлы {media.length > 0 && <span className="text-[#d1d7db]">({media.length})</span>}
            </p>
            {loading ? (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : media.length === 0 ? (
              <p className="text-xs text-[#8696a0]">Нет медиафайлов</p>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {media.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setMediaModal({ url: m.media_url!, type: isVideo(m.media_url!) ? 'video' : 'image' })}
                    className="aspect-square overflow-hidden rounded-lg"
                  >
                    <img src={m.media_url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Архив */}
          <div className="px-4 py-4">
            <button
              onClick={toggleArchive}
              disabled={archiving}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isArchived
                  ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
              }`}
            >
              {isArchived ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              )}
              <span className="text-sm font-medium">
                {archiving ? 'Загрузка...' : isArchived ? 'Восстановить чат' : 'Архивировать чат'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Медиа модал внутри панели */}
      {mediaModal && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col" onClick={() => setMediaModal(null)}>
          <div className="flex items-center justify-between px-4 py-3 bg-black/50">
            <p className="text-white text-sm">Медиафайл</p>
            <button className="text-white text-2xl leading-none" onClick={() => setMediaModal(null)}>✕</button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            {mediaModal.type === 'image' ? (
              <img src={mediaModal.url} alt="фото" className="max-w-full max-h-full object-contain rounded-lg" />
            ) : (
              <video src={mediaModal.url} controls autoPlay className="max-w-full max-h-full rounded-lg" />
            )}
          </div>
        </div>
      )}
    </>
  );
}