import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../hooks/useAuth';
import { formatPhone } from '@/utils/formatters';
import type { Chat, Message, Employee, Branch } from '../../types';

interface Props {
  chat: Chat;
  onClose: () => void;
  onArchive: () => void;
  onClientNameUpdate?: (name: string) => void;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  new:         { label: 'Новый',       className: 'bg-blue-500/20 text-blue-300' },
  in_progress: { label: 'В работе',    className: 'bg-yellow-500/20 text-yellow-300' },
  deal:        { label: 'Сделка',      className: 'bg-purple-500/20 text-purple-300' },
  paid:        { label: 'Оплачено',    className: 'bg-emerald-500/20 text-emerald-300' },
  closed:      { label: 'Закрыт',      className: 'bg-gray-500/20 text-gray-400' },
};

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function ChatInfoPanel({ chat, onClose, onArchive, onClientNameUpdate }: Props) {
  const { employee: me } = useAuth();
  const [media, setMedia] = useState<Message[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [archiving, setArchiving] = useState(false);
  const [mediaModal, setMediaModal] = useState<{ url: string; type: 'image' | 'video' } | null>(null);

  // Инлайн-редактирование имени
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(chat.client?.name ?? '');
  const [savingName, setSavingName] = useState(false);

  // Переназначение менеджера
  const [branches, setBranches] = useState<Branch[]>([]);
  const [reassignBranch, setReassignBranch] = useState(chat.branch_id);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [reassignId, setReassignId] = useState(chat.employee_id);
  const [reassigning, setReassigning] = useState(false);

  const client = chat.client;
  const isArchived = chat.status === 'archived';
  const canReassign = me?.role === 'admin' || me?.role === 'branch_admin';
  const statusInfo = STATUS_LABELS[client?.status ?? 'new'] ?? STATUS_LABELS['new'];

  // Загрузка медиа
  useEffect(() => {
    supabase
      .from('messages')
      .select('id, media_url, message_type, created_at')
      .eq('chat_id', chat.id)
      .eq('message_type', 'image')
      .order('created_at', { ascending: false })
      .limit(18)
      .then(({ data }) => { setMedia(data ?? []); setLoadingMedia(false); });
  }, [chat.id]);

  // Загрузка филиалов для переназначения
  useEffect(() => {
    if (!canReassign) return;
    supabase
      .from('branches')
      .select('id, name')
      .order('name')
      .then(({ data }) => setBranches(data ?? []));
  }, [canReassign]);

  // Загрузка сотрудников выбранного филиала
  useEffect(() => {
    if (!canReassign) return;
    supabase
      .from('employees')
      .select('id, name, role')
      .eq('branch_id', reassignBranch)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        setEmployees(data ?? []);
        // Если текущий менеджер не принадлежит новому филиалу — сбрасываем выбор
        if (data && data.length > 0 && !data.find(e => e.id === reassignId)) {
          setReassignId(data[0].id);
        }
      });
  }, [reassignBranch, canReassign]);

  // Свайп вниз (bottom sheet на мобайле) / вправо — закрыть
  useEffect(() => {
    let startX = 0, startY = 0;
    const onStart = (e: TouchEvent) => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      // вправо (drawer) или вниз (bottom sheet)
      if ((dx > 50 && Math.abs(dy) < 80) || (dy > 80 && Math.abs(dx) < 60)) {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('touchstart', onStart, { passive: true, capture: true });
    document.addEventListener('touchend', onEnd, { capture: true });
    return () => {
      document.removeEventListener('touchstart', onStart, { capture: true });
      document.removeEventListener('touchend', onEnd, { capture: true });
    };
  }, []);

  const saveName = async () => {
    if (!nameValue.trim() || savingName) return;
    setSavingName(true);
    await supabase.from('clients').update({ name: nameValue.trim() }).eq('id', chat.client_id);
    setSavingName(false);
    setEditingName(false);
    onClientNameUpdate?.(nameValue.trim());
  };

  const toggleArchive = async () => {
    if (archiving) return;
    const action = isArchived ? 'Восстановить чат?' : 'Архивировать этот чат?';
    if (!window.confirm(action)) return;
    setArchiving(true);
    await supabase.from('chats').update({ status: isArchived ? 'active' : 'archived' }).eq('id', chat.id);
    setArchiving(false);
    onArchive();
  };

  const saveReassign = async () => {
    const branchChanged  = reassignBranch !== chat.branch_id;
    const employeeChanged = reassignId !== chat.employee_id;
    if ((!branchChanged && !employeeChanged) || reassigning) return;
    setReassigning(true);
    await supabase.from('chats')
      .update({ branch_id: reassignBranch, employee_id: reassignId })
      .eq('id', chat.id);
    setReassigning(false);
  };

  const isVideo = (url: string) => !!url.match(/\.(mp4|mov|avi|webm)$/i);

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Panel: right drawer на sm+, bottom sheet на мобайле */}
      <div
        data-modal="true"
        className="fixed z-50 bg-[#111b21] flex flex-col shadow-2xl
          bottom-0 left-0 right-0 rounded-t-2xl max-h-[92vh]
          sm:inset-y-0 sm:right-0 sm:left-auto sm:w-80 sm:rounded-none sm:max-h-full"
      >
        {/* Drag handle (мобайл) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

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

          {/* ── СЕКЦИЯ 1: КЛИЕНТ ── */}
          <div className="px-4 py-5 border-b border-white/5">
            <p className="text-[10px] text-[#8696a0] uppercase tracking-widest font-semibold mb-3">Клиент</p>

            {/* Аватар */}
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                {(nameValue || client?.phone || '#')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                {/* Имя inline edit */}
                {editingName ? (
                  <div className="space-y-2">
                    <input
                      value={nameValue}
                      onChange={e => setNameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                      autoFocus
                      className="w-full bg-[#2a3942] text-[#e9edef] text-sm px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveName}
                        disabled={savingName}
                        className="flex-1 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium active:bg-emerald-500/30 disabled:opacity-50 transition-colors"
                      >
                        {savingName ? 'Сохранение...' : 'Сохранить'}
                      </button>
                      <button
                        onClick={() => { setEditingName(false); setNameValue(chat.client?.name ?? ''); }}
                        className="flex-1 py-2 bg-white/5 text-[#8696a0] rounded-lg text-xs font-medium active:bg-white/10 transition-colors"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-[#e9edef] truncate">
                      {nameValue || 'Без имени'}
                    </p>
                    <button onClick={() => setEditingName(true)}
                      className="text-[#8696a0] hover:text-[#e9edef] flex-shrink-0 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                )}
                {/* Статус */}
                <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${statusInfo.className}`}>
                  {statusInfo.label}
                </span>
              </div>
            </div>

            {/* Телефон + кнопка звонка */}
            {client?.phone && (
              <div className="flex items-center justify-between py-2.5 border-t border-white/5">
                <div>
                  <p className="text-[10px] text-[#8696a0] mb-0.5">Телефон</p>
                  <p className="text-sm text-[#e9edef]">{formatPhone(client.phone)}</p>
                </div>
                <a href={`tel:${client.phone}`}
                  className="flex items-center gap-1.5 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Позвонить
                </a>
              </div>
            )}

            {/* Первый и последний контакт */}
            <div className="grid grid-cols-2 gap-3 mt-2">
              {client?.first_contact_date && (
                <div className="bg-white/5 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-[#8696a0] mb-0.5">Первый контакт</p>
                  <p className="text-xs text-[#e9edef]">{formatDate(client.first_contact_date)}</p>
                </div>
              )}
              {client?.last_contact_date && (
                <div className="bg-white/5 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-[#8696a0] mb-0.5">Последний контакт</p>
                  <p className="text-xs text-[#e9edef]">{formatDate(client.last_contact_date)}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── СЕКЦИЯ 2: МЕДИА ── */}
          <div className="px-4 py-4 border-b border-white/5">
            <p className="text-[10px] text-[#8696a0] uppercase tracking-widest font-semibold mb-3">
              Медиафайлы {!loadingMedia && media.length > 0 && <span className="text-[#d1d7db]">({media.length})</span>}
            </p>
            {loadingMedia ? (
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
                    className="aspect-square overflow-hidden rounded-lg active:opacity-75 transition-opacity"
                  >
                    <img src={m.media_url!} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── СЕКЦИЯ 3: ДЕЙСТВИЯ ── */}
          <div className="px-4 py-4 space-y-3">
            <p className="text-[10px] text-[#8696a0] uppercase tracking-widest font-semibold">Действия</p>

            {/* Архивировать / восстановить */}
            <button
              onClick={toggleArchive}
              disabled={archiving}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                isArchived
                  ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
              } disabled:opacity-50`}
            >
              {isArchived ? (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              ) : (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              )}
              <span className="text-sm font-medium">
                {archiving ? 'Загрузка...' : isArchived ? 'Восстановить чат' : 'Архивировать чат'}
              </span>
            </button>

            {/* Переназначить менеджера (только admin / branch_admin) */}
            {canReassign && (
              <div className="bg-white/5 rounded-xl px-4 py-3 space-y-3">
                <p className="text-xs text-[#8696a0]">Переназначить менеджера</p>

                {/* Филиал */}
                <div className="space-y-1">
                  <p className="text-[11px] text-[#8696a0] font-medium">Филиал</p>
                  <select
                    value={reassignBranch}
                    onChange={e => setReassignBranch(e.target.value)}
                    className="w-full bg-[#2a3942] text-[#e9edef] text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                {/* Менеджер */}
                <div className="space-y-1">
                  <p className="text-[11px] text-[#8696a0] font-medium">Менеджер</p>
                  {employees.length === 0 ? (
                    <p className="text-xs text-[#8696a0] italic py-1">Нет сотрудников в этом филиале</p>
                  ) : (
                    <select
                      value={reassignId}
                      onChange={e => setReassignId(e.target.value)}
                      className="w-full bg-[#2a3942] text-[#e9edef] text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <button
                  onClick={saveReassign}
                  disabled={
                    reassigning ||
                    (reassignBranch === chat.branch_id && reassignId === chat.employee_id) ||
                    employees.length === 0
                  }
                  className="w-full py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
                >
                  {reassigning ? 'Сохраняем...' : 'Сохранить'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {mediaModal && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col" onClick={() => setMediaModal(null)}>
          <div className="flex items-center justify-between px-4 py-3 bg-black/50 flex-shrink-0">
            <p className="text-white text-sm">Медиафайл</p>
            <button className="text-white text-2xl leading-none" onClick={() => setMediaModal(null)}>✕</button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            {mediaModal.type === 'image'
              ? <img src={mediaModal.url} alt="фото" className="max-w-full max-h-full object-contain rounded-lg" />
              : <video src={mediaModal.url} controls autoPlay className="max-w-full max-h-full rounded-lg" />
            }
          </div>
        </div>
      )}
    </>
  );
}
