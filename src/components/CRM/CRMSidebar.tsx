import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Reminders } from './Reminders';
import type { Chat, Task, Comment, Client } from '../../types';

interface CRMSidebarProps {
  onBack?: () => void;
  chat: Chat;
}

const STAGES = [
  { key: 'new',         label: 'Новый',      color: 'bg-blue-500' },
  { key: 'negotiation', label: 'Переговоры', color: 'bg-amber-500' },
  { key: 'quote',       label: 'Счёт',       color: 'bg-purple-500' },
  { key: 'payment',     label: 'Оплата',     color: 'bg-emerald-500' },
  { key: 'closed',      label: 'Закрыт',     color: 'bg-gray-500' },
];

const STATUS_MAP: Record<string, string> = {
  new: 'new',
  negotiation: 'in_progress',
  quote: 'deal',
  payment: 'deal',
  closed: 'closed',
};

interface LastStageInfo {
  stage: string;
  employeeName: string;
  changedAt: string;
}

export function CRMSidebar({ chat, onBack }: CRMSidebarProps) {
  const { employee } = useAuth();
  const [stage, setStage] = useState<string>('new');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [clientName, setClientName] = useState('');
  const [newTask, setNewTask] = useState('');
  const [newComment, setNewComment] = useState('');
  const [tab, setTab] = useState<'tasks' | 'comments' | 'reminders'>('tasks');
  const [lastStageInfo, setLastStageInfo] = useState<LastStageInfo | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [stageChanging, setStageChanging] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = async () => {
    const [{ data: stages }, { data: tasksData }, { data: commentsData }, { data: clientData }] = await Promise.all([
      supabase.from('deal_stages')
        .select('*, employee:employees(name)')
        .eq('chat_id', chat.id)
        .order('moved_to_stage_at', { ascending: false })
        .limit(1),
      supabase.from('tasks').select('*').eq('chat_id', chat.id).order('created_at', { ascending: false }),
      supabase.from('comments').select('*, employee:employees(name)').eq('chat_id', chat.id).order('created_at', { ascending: false }),
      supabase.from('clients').select('*').eq('id', chat.client_id).single(),
    ]);

    if (stages?.[0]) {
      setStage(stages[0].current_stage);
      setLastStageInfo({
        stage: stages[0].current_stage,
        employeeName: stages[0].employee?.name ?? 'Неизвестно',
        changedAt: stages[0].moved_to_stage_at,
      });
    }
    setTasks(tasksData ?? []);
    setComments(commentsData ?? []);
    if (clientData) { setClient(clientData); setClientName(clientData.name ?? ''); }
  };

  const notifyUpdate = () => window.dispatchEvent(new Event('client-updated'));

  const changeStage = async (newStage: string) => {
    if (!employee || stageChanging) return;
    if (newStage === stage) return;

    const currentIdx = STAGES.findIndex(s => s.key === stage);
    const newIdx = STAGES.findIndex(s => s.key === newStage);
    const newLabel = STAGES.find(s => s.key === newStage)?.label ?? newStage;

    if (newIdx < currentIdx) {
      const confirmed = window.confirm(`Вернуть этап назад на "${newLabel}"? Это нежелательно — этапы должны идти вперёд.`);
      if (!confirmed) return;
    }

    setStageChanging(true);
    setStage(newStage);

    const { error } = await supabase.from('deal_stages').insert({
      chat_id: chat.id,
      current_stage: newStage,
      moved_to_stage_at: new Date().toISOString(),
      moved_by_id: employee.id,
    });

    if (error) {
      showToast('Ошибка при смене этапа');
      setStage(stage);
    } else {
      setLastStageInfo({
        stage: newStage,
        employeeName: employee.name,
        changedAt: new Date().toISOString(),
      });
      showToast(`Этап изменён: ${newLabel}`);
      // Обновляем статус клиента синхронно
      await supabase.from('clients')
        .update({ status: STATUS_MAP[newStage] ?? 'new' })
        .eq('id', chat.client_id);
      notifyUpdate();
    }
    setStageChanging(false);
  };

  const saveName = async () => {
    if (!client) return;
    await supabase.from('clients').update({ name: clientName }).eq('id', client.id);
    setClient({ ...client, name: clientName });
    setEditingName(false);
    notifyUpdate();
  };

  const addTask = async () => {
    if (!newTask.trim() || !employee) return;
    await supabase.from('tasks').insert({ chat_id: chat.id, employee_id: employee.id, title: newTask.trim() });
    setNewTask('');
    fetchData();
  };

  const toggleTask = async (task: Task) => {
    await supabase.from('tasks').update({
      status: task.status === 'open' ? 'completed' : 'open',
      completed_at: task.status === 'open' ? new Date().toISOString() : null,
    }).eq('id', task.id);
    fetchData();
  };

  const addComment = async () => {
    if (!newComment.trim() || !employee) return;
    await supabase.from('comments').insert({ chat_id: chat.id, employee_id: employee.id, text: newComment.trim() });
    setNewComment('');
    fetchData();
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  useEffect(() => { fetchData(); }, [chat.id]);

  return (
    <div className="w-full md:w-72 md:flex-shrink-0 flex flex-col md:border-l border-white/5 bg-[#111b21] overflow-y-auto h-full relative">

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-xs px-4 py-2 rounded-full shadow-lg animate-pulse">
          {toast}
        </div>
      )}

      {/* Клиент */}
      <div className="p-4 border-b border-white/5">
        <p className="text-xs text-[#8696a0] mb-3 font-medium uppercase tracking-wide">Клиент</p>
        <div className="space-y-2">
          {editingName ? (
            <div className="flex gap-2">
              <input autoFocus type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveName()} className="flex-1 bg-[#202c33] text-[#d1d7db] rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500" />
              <button onClick={saveName} className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-1.5 rounded-lg">✓</button>
              <button onClick={() => setEditingName(false)} className="text-xs bg-white/5 text-[#8696a0] px-2 py-1.5 rounded-lg">✕</button>
            </div>
          ) : (
            <button onClick={() => setEditingName(true)} className="w-full text-left flex items-center gap-2 group">
              <p className="text-sm font-medium text-[#e9edef] flex-1">{client?.name || 'Без имени'}</p>
              <svg className="w-3 h-3 text-[#8696a0] opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </button>
          )}
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-[#8696a0] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            <p className="text-xs text-[#8696a0]">{client?.phone || ''}</p>
          </div>
        </div>
      </div>

      {/* Этап сделки */}
      <div className="p-4 border-b border-white/5">
        <p className="text-xs text-[#8696a0] mb-3 font-medium uppercase tracking-wide">Этап сделки</p>
        <div className="flex flex-col gap-1.5">
          {STAGES.map((s, i) => (
            <button
              key={s.key}
              onClick={() => changeStage(s.key)}
              disabled={stageChanging}
              className={`text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 disabled:opacity-50 ${
                stage === s.key ? 'bg-emerald-500 text-white' : 'bg-white/5 text-[#8696a0] hover:bg-white/10'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 ${stage === s.key ? 'bg-white/20' : 'bg-white/10'}`}>{i + 1}</span>
              {s.label}
            </button>
          ))}
        </div>
        {lastStageInfo && (
          <p className="text-[10px] text-[#8696a0] mt-3 leading-relaxed">
            Изменил: <span className="text-[#d1d7db]">{lastStageInfo.employeeName}</span>
            {' · '}{formatDate(lastStageInfo.changedAt)}
          </p>
        )}
      </div>

      {/* Табы */}
      <div className="flex border-b border-white/5">
        <button onClick={() => setTab('tasks')} className={`flex-1 py-2 text-[10px] font-medium transition-colors ${tab === 'tasks' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-[#8696a0] hover:text-[#d1d7db]'}`}>
          Задачи ({tasks.filter(t => t.status === 'open').length})
        </button>
        <button onClick={() => setTab('comments')} className={`flex-1 py-2 text-[10px] font-medium transition-colors ${tab === 'comments' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-[#8696a0] hover:text-[#d1d7db]'}`}>
          Заметки ({comments.length})
        </button>
        <button onClick={() => setTab('reminders')} className={`flex-1 py-2 text-[10px] font-medium transition-colors ${tab === 'reminders' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-[#8696a0] hover:text-[#d1d7db]'}`}>
          🔔
        </button>
      </div>

      <div className="flex-1">
        {tab === 'tasks' && (
          <div className="p-4 space-y-2">
            <div className="flex gap-2">
              <input type="text" value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} placeholder="Новая задача..." className="flex-1 bg-[#202c33] text-[#d1d7db] placeholder-[#8696a0] rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500" />
              <button onClick={addTask} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 rounded-lg text-xs transition-colors">+</button>
            </div>
            {tasks.length === 0 && <p className="text-xs text-[#8696a0] text-center py-4">Нет задач</p>}
            {tasks.map((task) => (
              <div key={task.id} className="flex items-start gap-2 bg-[#202c33] rounded-lg px-3 py-2">
                <button onClick={() => toggleTask(task)} className={`w-4 h-4 rounded flex-shrink-0 mt-0.5 border transition-colors ${task.status === 'completed' ? 'bg-emerald-500 border-emerald-500' : 'border-[#8696a0]'}`}>
                  {task.status === 'completed' && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </button>
                <p className={`text-xs flex-1 ${task.status === 'completed' ? 'line-through text-[#8696a0]' : 'text-[#d1d7db]'}`}>{task.title}</p>
              </div>
            ))}
          </div>
        )}
        {tab === 'comments' && (
          <div className="p-4 space-y-2">
            <div className="flex gap-2">
              <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addComment()} placeholder="Добавить заметку..." className="flex-1 bg-[#202c33] text-[#d1d7db] placeholder-[#8696a0] rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500" />
              <button onClick={addComment} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 rounded-lg text-xs transition-colors">+</button>
            </div>
            {comments.length === 0 && <p className="text-xs text-[#8696a0] text-center py-4">Нет заметок</p>}
            {comments.map((comment) => (
              <div key={comment.id} className="bg-[#202c33] rounded-lg px-3 py-2">
                <p className="text-xs text-[#d1d7db]">{comment.text}</p>
                <p className="text-[10px] text-[#8696a0] mt-1">{comment.employee?.name} · {new Date(comment.created_at).toLocaleDateString('ru-RU')}</p>
              </div>
            ))}
          </div>
        )}
        {tab === 'reminders' && <Reminders chat={chat} />}
      </div>
    </div>
  );
}
