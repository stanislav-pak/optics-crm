import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../hooks/useAuth';

interface TaskItem {
  id: string;
  title: string;
  status: string;
  confirmation_status: string;
  rejection_reason?: string;
  created_at: string;
  due_date?: string;
  employee_id: string;
  assigned_by?: string;
  chat_id: string;
  assignee?: { name: string };
  assigner?: { name: string };
  chat?: { client?: { name?: string; phone?: string } };
}

interface Employee { id: string; name: string; branch_id: string; }
interface Branch { id: string; name: string; city: string; }

interface TasksPanelProps {
  onBack?: () => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:  { label: 'Ожидает',   color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  accepted: { label: 'Принята',   color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  rejected: { label: 'Отклонена', color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  none:     { label: 'Активна',   color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
};

export function TasksPanel({ onBack }: TasksPanelProps) {
  const { employee } = useAuth();
  const isAdmin = employee?.role === 'admin' || employee?.role === 'branch_admin';

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [managers, setManagers] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [newBranch, setNewBranch] = useState<string>('all'); // 'all' | branch_id
  const [filteredManagers, setFilteredManagers] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');
  // Создание задачи
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newManager, setNewManager] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [creating, setCreating] = useState(false);
  // Отклонение
  const [rejectingTask, setRejectingTask] = useState<TaskItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchTasks = async () => {
    setLoading(true);
    let query = supabase.from('tasks')
      .select(`
        *,
        assignee:employees!tasks_employee_id_fkey(name),
        assigner:employees!tasks_assigned_by_fkey(name),
        chat:chats(client:clients(name, phone))
      `)
      .order('created_at', { ascending: false });

    // Менеджер видит только свои задачи
    if (!isAdmin) query = query.eq('employee_id', employee!.id);
    // Только назначенные задачи (с assigned_by) для основного задачника
    query = query.not('confirmation_status', 'eq', 'none');

    const { data } = await query;
    setTasks((data ?? []) as TaskItem[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
    if (isAdmin) {
      supabase.from('branches').select('id, name, city').order('name').then(({ data }) => setBranches(data ?? []));
      supabase.from('employees').select('id, name, branch_id').eq('role', 'manager').eq('is_active', true).order('name')
        .then(({ data }) => { setManagers(data ?? []); setFilteredManagers(data ?? []); });
    }
  }, []);

  // Realtime
  useEffect(() => {
    const channel = supabase.channel('tasks-panel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, fetchTasks)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const createTask = async () => {
    if (!newTitle.trim() || !employee) return;
    setCreating(true);

    // Определяем список менеджеров для назначения
    const targetManagers = newManager === 'all'
      ? filteredManagers  // все из выбранного филиала (или все вообще)
      : managers.filter(m => m.id === newManager);

    if (!targetManagers.length) {
      alert('Нет менеджеров для назначения');
      setCreating(false);
      return;
    }

    // Создаём задачу каждому менеджеру
    for (const mgr of targetManagers) {
      const { data: chats } = await supabase.from('chats')
        .select('id').eq('employee_id', mgr.id).eq('status', 'active')
        .order('last_message_at', { ascending: false }).limit(1);
      if (!chats?.length) continue;

      await supabase.from('tasks').insert({
        chat_id: chats[0].id,
        employee_id: mgr.id,
        assigned_by: employee.id,
        title: newTitle.trim(),
        due_date: newDueDate || null,
        confirmation_status: 'pending',
      });
    }

    setNewTitle('');
    setNewManager('');
    setNewBranch('all');
    setNewDueDate('');
    setShowCreate(false);
    setCreating(false);
    fetchTasks();
  };

  const acceptTask = async (task: TaskItem) => {
    await supabase.from('tasks').update({ confirmation_status: 'accepted' }).eq('id', task.id);
    fetchTasks();
    window.dispatchEvent(new Event('tasks-updated'));
  };

  const rejectTask = async () => {
    if (!rejectingTask || !rejectReason.trim()) return;
    await supabase.from('tasks').update({ confirmation_status: 'rejected', rejection_reason: rejectReason.trim() }).eq('id', rejectingTask.id);
    setRejectingTask(null);
    setRejectReason('');
    fetchTasks();
    window.dispatchEvent(new Event('tasks-updated'));
  };

  const completeTask = async (task: TaskItem) => {
    await supabase.from('tasks').update({
      status: task.status === 'open' ? 'completed' : 'open',
      completed_at: task.status === 'open' ? new Date().toISOString() : null,
    }).eq('id', task.id);
    fetchTasks();
  };

  const filtered = tasks.filter(t => {
    if (filter === 'all') return true;
    return t.confirmation_status === filter;
  });

  const counts = {
    all: tasks.length,
    pending: tasks.filter(t => t.confirmation_status === 'pending').length,
    accepted: tasks.filter(t => t.confirmation_status === 'accepted').length,
    rejected: tasks.filter(t => t.confirmation_status === 'rejected').length,
  };

  return (
    <div className="flex flex-col h-full bg-[#0b141a]">

      {/* Header */}
      <div className="px-4 py-3 bg-[#202c33] flex items-center gap-3 border-b border-white/5 flex-shrink-0">
        {onBack && (
          <button onClick={onBack} className="text-[#8696a0] hover:text-[#e9edef] transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
        )}
        <h1 className="flex-1 text-[#e9edef] font-semibold text-base">Задачи</h1>
        {isAdmin && (
          <button onClick={() => setShowCreate(true)}
            className="w-8 h-8 bg-emerald-500 hover:bg-emerald-600 rounded-full flex items-center justify-center transition-colors">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          </button>
        )}
      </div>

      {/* Фильтры */}
      <div className="px-4 py-2 grid grid-cols-4 gap-1.5 flex-shrink-0 border-b border-white/5">
        {(['all', 'pending', 'accepted', 'rejected'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-[11px] py-1.5 rounded-full transition-colors text-center ${filter === f ? 'bg-emerald-500 text-white' : 'bg-white/5 text-[#8696a0]'}`}>
            {f === 'all' ? 'Все' : f === 'pending' ? 'Ожидают' : f === 'accepted' ? 'Приняты' : 'Откл.'}
            {' '}<span className="opacity-70">({counts[f]})</span>
          </button>
        ))}
      </div>

      {/* Список */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[#8696a0] text-sm">Нет задач</p>
          </div>
        )}
        {filtered.map(task => {
          const cs = task.confirmation_status || 'none';
          const statusInfo = STATUS_LABELS[cs] || STATUS_LABELS.none;
          const isPending = cs === 'pending';
          const clientName = (task.chat as any)?.client?.name || (task.chat as any)?.client?.phone || '—';

          return (
            <div key={task.id} className={`bg-[#202c33] rounded-xl p-4 border ${isPending ? 'border-amber-500/30' : 'border-transparent'}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className={`text-sm font-medium flex-1 ${task.status === 'completed' ? 'line-through text-[#8696a0]' : 'text-[#e9edef]'}`}>
                  {task.title}
                </p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
              </div>

              {/* Мета */}
              <div className="space-y-0.5 mb-3">
                <p className="text-[11px] text-[#8696a0]">Клиент: <span className="text-[#d1d7db]">{clientName}</span></p>
                {isAdmin && task.assignee && (
                  <p className="text-[11px] text-[#8696a0]">Менеджер: <span className="text-[#d1d7db]">{(task.assignee as any).name}</span></p>
                )}
                {!isAdmin && task.assigner && (
                  <p className="text-[11px] text-[#8696a0]">От: <span className="text-[#d1d7db]">{(task.assigner as any).name}</span></p>
                )}
                {task.due_date && (
                  <p className="text-[11px] text-[#8696a0]">Срок: <span className="text-amber-400">{new Date(task.due_date).toLocaleDateString('ru-RU')}</span></p>
                )}
              </div>

              {/* Причина отклонения */}
              {cs === 'rejected' && task.rejection_reason && (
                <div className="bg-red-500/10 rounded-lg px-3 py-2 mb-3">
                  <p className="text-[11px] text-red-400">💬 {task.rejection_reason}</p>
                </div>
              )}

              {/* Кнопки для менеджера */}
              {isPending && !isAdmin && (
                <div className="flex gap-2">
                  <button onClick={() => acceptTask(task)}
                    className="flex-1 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-500/30 transition-colors">
                    ✓ Принять
                  </button>
                  <button onClick={() => { setRejectingTask(task); setRejectReason(''); }}
                    className="flex-1 py-2 bg-red-500/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/30 transition-colors">
                    ✕ Отклонить
                  </button>
                </div>
              )}

              {/* Чекбокс для принятых задач */}
              {cs === 'accepted' && !isAdmin && (
                <button onClick={() => completeTask(task)}
                  className={`flex items-center gap-2 text-xs ${task.status === 'completed' ? 'text-[#8696a0]' : 'text-emerald-400'}`}>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${task.status === 'completed' ? 'bg-emerald-500 border-emerald-500' : 'border-[#8696a0]'}`}>
                    {task.status === 'completed' && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  {task.status === 'completed' ? 'Выполнена' : 'Отметить выполненной'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Модал создания задачи */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end" onClick={() => setShowCreate(false)}>
          <div className="w-full bg-[#202c33] rounded-t-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#e9edef] font-semibold">Новая задача</h3>
              <button onClick={() => setShowCreate(false)} className="text-[#8696a0] text-xl">✕</button>
            </div>
            <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
              placeholder="Название задачи"
              className="w-full bg-[#2a3942] text-[#d1d7db] placeholder-[#8696a0] rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-emerald-500 mb-3" />
            {/* Шаг 1: Выбор филиала */}
            <select value={newBranch} onChange={e => {
              const b = e.target.value;
              setNewBranch(b);
              setNewManager('all');
              setFilteredManagers(b === 'all' ? managers : managers.filter(m => m.branch_id === b));
            }}
              className="w-full bg-[#2a3942] text-[#d1d7db] rounded-xl px-4 py-3 text-sm outline-none mb-3 border border-white/5">
              <option value="all">Все филиалы</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.city})</option>)}
            </select>

            {/* Шаг 2: Выбор менеджера внутри филиала */}
            <select value={newManager} onChange={e => setNewManager(e.target.value)}
              className="w-full bg-[#2a3942] text-[#d1d7db] rounded-xl px-4 py-3 text-sm outline-none mb-3 border border-white/5">
              <option value="all">
                {newBranch === 'all' ? 'Всем менеджерам' : 'Всем менеджерам филиала'}
              </option>
              {filteredManagers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <div className="mb-4">
              <p className="text-xs text-[#8696a0] mb-1 px-1">Срок (необязательно)</p>
              <input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)}
                className="w-full bg-[#2a3942] text-[#d1d7db] rounded-xl px-4 py-3 text-sm outline-none border border-white/5" />
            </div>
            <button onClick={createTask} disabled={!newTitle.trim() || creating}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors">
              {creating ? 'Создание...' : 'Создать и отправить'}
            </button>
          </div>
        </div>
      )}

      {/* Модал отклонения */}
      {rejectingTask && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end" onClick={() => setRejectingTask(null)}>
          <div className="w-full bg-[#202c33] rounded-t-2xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-[#e9edef] font-semibold mb-1">Причина отклонения</h3>
            <p className="text-xs text-[#8696a0] mb-3">«{rejectingTask.title}»</p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Напишите причину..." rows={3}
              className="w-full bg-[#2a3942] text-[#d1d7db] placeholder-[#8696a0] rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-emerald-500 resize-none mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setRejectingTask(null)} className="flex-1 py-3 bg-white/5 text-[#8696a0] rounded-xl text-sm">Отмена</button>
              <button onClick={rejectTask} disabled={!rejectReason.trim()}
                className="flex-1 py-3 bg-red-500 disabled:opacity-40 text-white font-semibold rounded-xl text-sm transition-colors">
                Отклонить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}