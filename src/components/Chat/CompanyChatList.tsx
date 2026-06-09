import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Plus, Users, Check } from 'lucide-react';
import { supabase } from '../../services/supabase';
import {
  getMyInternalChats,
  getOrCreateDirectChat,
  createGroupChat,
  getAllEmployees,
} from '../../services/internalChat';
import type { InternalChat } from '../../services/internalChat';
import CompanyChatWindow from './CompanyChatWindow';

interface Props {
  currentEmployee: { id: string; name: string; role: string };
  onBack: () => void;
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function roleLabel(role: string): string {
  if (role === 'admin') return 'Администратор';
  if (role === 'branch_admin') return 'Менеджер филиала';
  return 'Менеджер';
}

export default function CompanyChatList({ currentEmployee, onBack }: Props) {
  const [chats, setChats] = useState<InternalChat[]>([]);
  const [selectedChat, setSelectedChat] = useState<InternalChat | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showEmployeeList, setShowEmployeeList] = useState(false);
  const [loading, setLoading] = useState(true);

  // CreateGroup state
  const [groupName, setGroupName] = useState('');
  const [allEmployees, setAllEmployees] = useState<{ id: string; name: string; role: string; branch_id: string }[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [creatingGroup, setCreatingGroup] = useState(false);

  // EmployeeList state
  const [empListLoading, setEmpListLoading] = useState(false);

  const touchStart = useRef({ x: 0, y: 0 });

  const loadChats = () => {
    setLoading(true);
    getMyInternalChats(currentEmployee.id)
      .then(setChats)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadChats();
  }, [currentEmployee.id]);

  // Realtime: обновляем список при изменении internal_chats
  useEffect(() => {
    const channel = supabase
      .channel('internal-chats-list-' + currentEmployee.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_chats' }, () => {
        loadChats();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'internal_messages' }, () => {
        loadChats();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentEmployee.id]);

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

  // Если открыт чат — рендерим окно
  if (selectedChat) {
    return (
      <CompanyChatWindow
        chat={selectedChat}
        currentEmployeeId={currentEmployee.id}
        onBack={() => { setSelectedChat(null); loadChats(); }}
      />
    );
  }

  // CreateGroupSheet
  if (showCreateGroup) {
    const toggleMember = (id: string) => {
      setSelectedMemberIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    };

    const handleCreateGroup = async () => {
      if (!groupName.trim() || selectedMemberIds.size === 0) return;
      setCreatingGroup(true);
      try {
        const memberIds = [...selectedMemberIds, currentEmployee.id];
        const chat = await createGroupChat(groupName.trim(), memberIds, currentEmployee.id);
        setShowCreateGroup(false);
        setGroupName('');
        setSelectedMemberIds(new Set());
        setSelectedChat(chat);
        loadChats();
      } catch {
        // ошибка создания
      } finally {
        setCreatingGroup(false);
      }
    };

    // Загружаем сотрудников для выбора
    if (allEmployees.length === 0 && !creatingGroup) {
      getAllEmployees().then(setAllEmployees).catch(() => {});
    }

    const others = allEmployees.filter(e => e.id !== currentEmployee.id);

    return (
      <div className="fixed inset-0 bg-[#111b21] z-40 flex flex-col">
        {/* Шапка */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[#202c33] border-b border-white/5 flex-shrink-0">
          <button onClick={() => setShowCreateGroup(false)} className="text-[#aebac1] hover:text-white p-1 -ml-1">
            <ArrowLeft size={20} />
          </button>
          <p className="text-sm font-semibold text-[#e9edef] flex-1">Новая группа</p>
          <button
            onClick={handleCreateGroup}
            disabled={creatingGroup || !groupName.trim() || selectedMemberIds.size === 0}
            className="text-xs px-3 py-1.5 bg-[#00a884] text-white rounded-full disabled:opacity-40"
          >
            {creatingGroup ? 'Создаём...' : 'Создать'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Название группы */}
          <div className="px-4 py-4 border-b border-white/5">
            <input
              autoFocus
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Название группы..."
              className="w-full bg-[#2a3942] text-[#e9edef] placeholder:text-[#8696a0] rounded-lg px-4 py-2.5 text-sm focus:outline-none"
            />
          </div>

          {/* Список сотрудников */}
          <div className="px-4 pt-3 pb-1">
            <p className="text-xs text-[#8696a0] uppercase tracking-wider mb-2">
              Участники ({selectedMemberIds.size} выбрано)
            </p>
          </div>
          {others.map(emp => (
            <button
              key={emp.id}
              onClick={() => toggleMember(emp.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#2a3942] transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-[#2a3942] flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-[#e9edef]">{initials(emp.name)}</span>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm text-[#e9edef] truncate">{emp.name}</p>
                <p className="text-xs text-[#8696a0]">{roleLabel(emp.role)}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                selectedMemberIds.has(emp.id) ? 'bg-[#00a884] border-[#00a884]' : 'border-[#8696a0]'
              }`}>
                {selectedMemberIds.has(emp.id) && <Check size={11} className="text-white" />}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // EmployeeList — список для начала личного чата
  if (showEmployeeList) {
    const others = allEmployees.filter(e => e.id !== currentEmployee.id);

    const handleSelectEmployee = async (empId: string) => {
      setEmpListLoading(true);
      try {
        const chat = await getOrCreateDirectChat(currentEmployee.id, empId);
        if (!chat) {
          alert('Не удалось открыть чат. Попробуйте ещё раз.');
          return;
        }
        setSelectedChat(chat);
        setShowEmployeeList(false);
      } catch {
        alert('Не удалось открыть чат. Попробуйте ещё раз.');
      } finally {
        setEmpListLoading(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-[#111b21] z-40 flex flex-col">
        <div className="flex items-center gap-3 px-4 py-3 bg-[#202c33] border-b border-white/5 flex-shrink-0">
          <button onClick={() => setShowEmployeeList(false)} className="text-[#aebac1] hover:text-white p-1 -ml-1">
            <ArrowLeft size={20} />
          </button>
          <p className="text-sm font-semibold text-[#e9edef] flex-1">Написать сотруднику</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {empListLoading && (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {others.map(emp => (
            <button
              key={emp.id}
              onClick={() => handleSelectEmployee(emp.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#2a3942] transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-[#2a3942] flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-[#e9edef]">{initials(emp.name)}</span>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm text-[#e9edef] truncate">{emp.name}</p>
                <span style={{ fontSize: '11px', color: '#8696a0' }}>
                  {emp.branch_name} · {emp.role === 'admin' ? 'Администратор' : emp.role === 'manager' ? 'Менеджер' : 'Мастер'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Основной список чатов
  const groupChats = chats.filter(c => c.type === 'group');
  const directChats = chats.filter(c => c.type === 'direct');

  const handleOpenEmployeeList = () => {
    setEmpListLoading(false);
    if (allEmployees.length === 0) {
      getAllEmployees().then(setAllEmployees).catch(() => {});
    }
    setShowEmployeeList(true);
  };

  return (
    <div className="fixed inset-0 bg-[#111b21] z-30 flex flex-col">
      {/* Шапка */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#202c33] border-b border-white/5 flex-shrink-0">
        <button onClick={onBack} className="text-[#aebac1] hover:text-white p-1 -ml-1">
          <ArrowLeft size={20} />
        </button>
        <p className="text-base font-semibold text-[#e9edef] flex-1">Чат компании</p>
        {currentEmployee.role === 'admin' && (
          <button
            onClick={() => {
              if (allEmployees.length === 0) getAllEmployees().then(setAllEmployees).catch(() => {});
              setShowCreateGroup(true);
            }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#2a3942] text-[#e9edef] rounded-full hover:bg-[#3a4952] transition-colors"
          >
            <Users size={13} />
            <span>+ Группа</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Секция ГРУППЫ */}
            {groupChats.length > 0 && (
              <div>
                <div className="px-4 py-2 sticky top-0 bg-[#111b21]">
                  <p className="text-xs text-[#8696a0] uppercase tracking-wider font-medium">Группы</p>
                </div>
                {groupChats.map(chat => (
                  <button
                    key={chat.id}
                    onClick={() => setSelectedChat(chat)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#2a3942] transition-colors border-b border-white/[0.04]"
                  >
                    <div className="w-11 h-11 rounded-full bg-[#2a3942] flex items-center justify-center flex-shrink-0 text-xl">
                      🏢
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-[#e9edef] truncate">{chat.name ?? 'Группа'}</p>
                        <p className="text-xs text-[#8696a0] flex-shrink-0">{formatTime(chat.last_message?.created_at ?? chat.updated_at)}</p>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-[#8696a0] truncate">
                          {chat.last_message
                            ? `${chat.last_message.sender?.name ?? ''}: ${chat.last_message.content}`
                            : 'Нет сообщений'}
                        </p>
                        {(chat.unread_count ?? 0) > 0 && (
                          <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 bg-[#00a884] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                            {chat.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Секция ЛИЧНЫЕ */}
            <div>
              <div className="px-4 py-2 sticky top-0 bg-[#111b21]">
                <p className="text-xs text-[#8696a0] uppercase tracking-wider font-medium">Личные</p>
              </div>
              {directChats.length === 0 && (
                <p className="text-sm text-[#8696a0] text-center py-6">Нет личных чатов</p>
              )}
              {directChats.map(chat => {
                const other = chat.members?.find(m => m.employee_id !== currentEmployee.id);
                const name = other?.employee?.name ?? 'Сотрудник';
                const role = other?.employee?.role ?? '';
                return (
                  <button
                    key={chat.id}
                    onClick={() => setSelectedChat(chat)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#2a3942] transition-colors border-b border-white/[0.04]"
                  >
                    <div className="w-11 h-11 rounded-full bg-[#2a3942] flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-[#e9edef]">{initials(name)}</span>
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-[#e9edef] truncate">{name}</p>
                        <p className="text-xs text-[#8696a0] flex-shrink-0">{formatTime(chat.last_message?.created_at ?? chat.updated_at)}</p>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-[#8696a0] truncate">
                          {chat.last_message
                            ? chat.last_message.content
                            : roleLabel(role)}
                        </p>
                        {(chat.unread_count ?? 0) > 0 && (
                          <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 bg-[#00a884] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                            {chat.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Кнопка "+ Написать" */}
      <div className="px-4 pb-5 pt-3 bg-[#111b21] flex-shrink-0 border-t border-white/5">
        <button
          onClick={handleOpenEmployeeList}
          className="w-full flex items-center justify-center gap-2 py-3 bg-[#00a884] text-white rounded-2xl text-sm font-medium hover:bg-[#02c09a] transition-colors"
        >
          <Plus size={16} />
          Написать
        </button>
      </div>
    </div>
  );
}
