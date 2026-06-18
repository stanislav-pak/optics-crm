import { useState, useEffect, useRef } from 'react';
import { X, Search, MessageCircle, UserPlus, BookUser } from 'lucide-react';
import { searchClientsForChat, openOrCreateChat, createClientAndChat } from '../../services/chats';
import { formatPhone } from '@/utils/formatters';
import type { Employee, Chat } from '../../types';

interface NewChatModalProps {
  employee: Employee;
  onClose: () => void;
  onChatOpen: (chat: Chat) => void;
}

// Contact Picker API доступен только в Android Chrome и некоторых браузерах
const contactsSupported = typeof navigator !== 'undefined' && 'contacts' in navigator;

export default function NewChatModal({ employee, onClose, onChatOpen }: NewChatModalProps) {
  const [search, setSearch] = useState('');
  const [contactName, setContactName] = useState<string | undefined>(undefined);
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchClientsForChat>>>([]);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allBranches = employee.role === 'admin';

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchClientsForChat(search.trim(), employee.branch_id, allBranches);
        setResults(res);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSelect = async (clientId: string, resultKey: string) => {
    setError(null);
    setOpening(resultKey);
    try {
      const chat = await openOrCreateChat(clientId, employee.branch_id, employee.id);
      onChatOpen(chat);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка открытия чата');
      setOpening(null);
    }
  };

  const handlePickContact = async () => {
    try {
      const contacts = await (navigator as any).contacts.select(['name', 'tel'], { multiple: false });
      if (!contacts?.length) return;
      const contact = contacts[0];
      const rawPhone = contact.tel?.[0] ?? '';
      const phone = rawPhone.replace(/\D/g, '');
      const name: string | undefined = contact.name?.[0] ?? undefined;
      if (phone) {
        setSearch(phone);
        setContactName(name);
      }
    } catch {
      // пользователь отменил или API недоступен
    }
  };

  const handleCreateNew = async () => {
    const phone = search.trim();
    setError(null);
    setOpening('new');
    try {
      const chat = await createClientAndChat(phone, contactName, employee.branch_id, employee.id);
      onChatOpen(chat);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка создания чата');
      setOpening(null);
    }
  };

  const digits = search.replace(/\D/g, '');
  const looksLikePhone = digits.length >= 10;
  const showCreateNew = search.trim().length >= 2 && results.length === 0 && !loading;

  return (
    <div data-modal="true" className="fixed inset-0 z-50 flex flex-col bg-[#0b141a]">
      <div className="flex items-center gap-3 px-4 py-3 bg-[#202c33] border-b border-white/10 flex-shrink-0">
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2a3942] text-[#8696a0] active:scale-95 transition-transform"
        >
          <X size={16} />
        </button>
        <span className="text-white font-semibold text-base">Новый чат</span>
      </div>

      <div className="px-3 py-3 bg-[#111b21] border-b border-white/5 flex-shrink-0">
        <div className="flex items-center bg-[#202c33] rounded-xl px-3 gap-2">
          <Search className="w-4 h-4 text-[#8696a0] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Имя или номер телефона"
            className="flex-1 bg-transparent py-2.5 text-sm text-[#d1d7db] placeholder-[#8696a0] outline-none"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          )}
          {search.length > 0 && !loading && (
            <button onClick={() => { setSearch(''); setContactName(undefined); }} className="text-[#8696a0]">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {contactsSupported && (
          <button
            onClick={handlePickContact}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/5 active:bg-white/5 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-[#202c33] flex items-center justify-center flex-shrink-0">
              <BookUser size={18} className="text-[#8696a0]" />
            </div>
            <span className="text-[#d1d7db] text-sm">Выбрать из контактов</span>
          </button>
        )}

        {error && (
          <div className="mx-4 mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
            {error}
          </div>
        )}

        {results.map(result => (
          <button
            key={result.client.id}
            onClick={() => handleSelect(result.client.id, result.client.id)}
            disabled={!!opening}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/5 active:bg-white/5 transition-colors disabled:opacity-60"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
              {result.client.name ? result.client.name[0].toUpperCase() : '#'}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[#e9edef] text-sm font-medium truncate">
                {result.client.name || formatPhone(result.client.phone)}
              </p>
              <p className="text-[#8696a0] text-xs truncate">{formatPhone(result.client.phone)}</p>
            </div>
            {opening === result.client.id ? (
              <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            ) : result.chatId ? (
              <span className="flex items-center gap-1 text-[#8696a0] text-xs flex-shrink-0">
                <MessageCircle size={13} />
                Открыть
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-400 text-xs flex-shrink-0">
                <MessageCircle size={13} />
                Написать
              </span>
            )}
          </button>
        ))}

        {showCreateNew && (
          <div className="px-4 py-4">
            {looksLikePhone ? (
              <>
                <p className="text-[#8696a0] text-sm mb-3 text-center">
                  Клиент с таким номером не найден
                </p>
                <button
                  onClick={handleCreateNew}
                  disabled={opening === 'new'}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl active:bg-emerald-500/20 transition-colors disabled:opacity-60"
                >
                  {opening === 'new' ? (
                    <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <UserPlus size={18} className="text-emerald-400 flex-shrink-0" />
                  )}
                  <div className="text-left">
                    <p className="text-emerald-400 text-sm font-medium">Создать новый чат</p>
                    <p className="text-[#8696a0] text-xs">{search.trim()}</p>
                  </div>
                </button>
              </>
            ) : (
              <p className="text-[#8696a0] text-sm text-center">Ничего не найдено</p>
            )}
          </div>
        )}

        {search.trim().length < 2 && (
          <div className="flex flex-col items-center justify-center h-40 px-6">
            <p className="text-sm text-[#8696a0] text-center">
              Введи имя или номер телефона{contactsSupported ? ', или выбери из контактов выше' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
