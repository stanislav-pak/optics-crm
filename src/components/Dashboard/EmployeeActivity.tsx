import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';

interface EmployeeActivity {
  id: string;
  name: string;
  email: string;
  activeChats: number;
  lastAction: string | null;
  lastActionAt: string | null;
  status: 'online' | 'away' | 'offline';
}

const ACTION_LABELS: Record<string, string> = {
  message_sent: 'Отправил сообщение',
  task_created: 'Создал задачу',
  stage_changed: 'Сменил этап',
  comment_added: 'Добавил комментарий',
};

function getStatus(lastAt: string | null): 'online' | 'away' | 'offline' {
  if (!lastAt) return 'offline';
  const diff = (Date.now() - new Date(lastAt).getTime()) / 1000 / 60;
  if (diff < 5) return 'online';
  if (diff < 30) return 'away';
  return 'offline';
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return 'Нет активности';
  const date = new Date(dateStr);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return date.toLocaleDateString('ru-RU');
}

const STATUS_COLORS = {
  online: 'bg-emerald-400',
  away:   'bg-amber-400',
  offline:'bg-gray-500',
};

const STATUS_LABELS = {
  online:  'Онлайн',
  away:    'Недавно',
  offline: 'Офлайн',
};

export function EmployeeActivity() {
  const [employees, setEmployees] = useState<EmployeeActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivity = async () => {
    const { data: emps } = await supabase
      .from('employees')
      .select('id, name, email')
      .eq('role', 'manager')
      .eq('is_active', true)
      .order('name');

    if (!emps) return;

    const { data: chats } = await supabase
      .from('chats')
      .select('id, employee_id')
      .eq('status', 'active');

    const { data: logs } = await supabase
      .from('activity_log')
      .select('employee_id, action, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    const chatCounts: Record<string, number> = {};
    chats?.forEach(c => {
      chatCounts[c.employee_id] = (chatCounts[c.employee_id] ?? 0) + 1;
    });

    const lastLog: Record<string, { action: string; created_at: string }> = {};
    logs?.forEach(l => {
      if (!lastLog[l.employee_id]) lastLog[l.employee_id] = l;
    });

    setEmployees(emps.map(e => ({
      id: e.id,
      name: e.name,
      email: e.email,
      activeChats: chatCounts[e.id] ?? 0,
      lastAction: lastLog[e.id]?.action ?? null,
      lastActionAt: lastLog[e.id]?.created_at ?? null,
      status: getStatus(lastLog[e.id]?.created_at ?? null),
    })));

    setLoading(false);
  };

  useEffect(() => {
    fetchActivity();
    const channel = supabase.channel('employee-activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, fetchActivity)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const online = employees.filter(e => e.status === 'online').length;

  const sorted = [...employees].sort((a, b) => {
    const order = { online: 0, away: 1, offline: 2 };
    return order[a.status] - order[b.status];
  });

  return (
    <div className="flex-1 overflow-y-auto bg-[#0b141a] p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[#e9edef]">Активность сотрудников</h2>
        <div className="flex items-center gap-1.5 text-xs text-[#8696a0]">
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          <span>{online} из {employees.length}</span>
        </div>
      </div>

      {employees.length === 0 ? (
        <p className="text-xs text-[#8696a0] text-center py-12">Нет активных менеджеров</p>
      ) : (
        <div className="space-y-2">
          {sorted.map(emp => (
            <div key={emp.id} className="bg-[#202c33] rounded-xl p-3">
              {/* Строка 1: аватар + имя + статус + кол-во чатов */}
              <div className="flex items-center gap-3 mb-2">
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-semibold">
                    {emp.name[0].toUpperCase()}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#202c33] ${STATUS_COLORS[emp.status]}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#e9edef] truncate">{emp.name}</p>
                  <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full ${
                    emp.status === 'online' ? 'bg-emerald-500/20 text-emerald-400' :
                    emp.status === 'away'   ? 'bg-amber-500/20 text-amber-400' :
                    'bg-white/5 text-[#8696a0]'
                  }`}>
                    {STATUS_LABELS[emp.status]}
                  </span>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-base font-semibold text-[#e9edef]">{emp.activeChats}</p>
                  <p className="text-[10px] text-[#8696a0]">чатов</p>
                </div>
              </div>
              {/* Строка 2: последнее действие + время */}
              <div className="flex items-center justify-between pl-0">
                <p className="text-[11px] text-[#8696a0] flex-1 truncate">
                  {emp.lastAction ? ACTION_LABELS[emp.lastAction] ?? emp.lastAction : 'Нет активности'}
                </p>
                <p className="text-[10px] text-[#8696a0] flex-shrink-0 ml-2">{formatTime(emp.lastActionAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}