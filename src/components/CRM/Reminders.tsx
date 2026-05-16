import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../hooks/useAuth';
import type { Chat, Reminder } from '../../types';

interface RemindersProps {
  chat: Chat;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function Reminders({ chat }: RemindersProps) {
  const { employee } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [text, setText] = useState('');
  const [remindAt, setRemindAt] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchReminders = async () => {
    const { data } = await supabase
      .from('reminders')
      .select('*')
      .eq('chat_id', chat.id)
      .eq('is_sent', false)
      .order('remind_at', { ascending: true });
    setReminders(data ?? []);
  };

  const requestPermission = async () => {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  const addReminder = async () => {
    if (!text.trim() || !remindAt || !employee) return;
    setLoading(true);
    await requestPermission();
    await supabase.from('reminders').insert({
      chat_id: chat.id,
      employee_id: employee.id,
      text: text.trim(),
      remind_at: new Date(remindAt).toISOString(),
    });
    setText('');
    setRemindAt('');
    fetchReminders();
    setLoading(false);
  };

  const deleteReminder = async (id: string) => {
    await supabase.from('reminders').delete().eq('id', id);
    fetchReminders();
  };

  useEffect(() => {
    fetchReminders();
  }, [chat.id]);

  // Проверяем напоминания каждую минуту
  useEffect(() => {
    const check = async () => {
      if (Notification.permission !== 'granted') return;
      const now = new Date();
      const { data } = await supabase
        .from('reminders')
        .select('*')
        .eq('employee_id', employee?.id)
        .eq('is_sent', false)
        .lte('remind_at', now.toISOString());

      if (!data) return;
      for (const reminder of data) {
        new Notification('New Line CRM', {
          body: reminder.text,
          icon: '/favicon.ico',
        });
        await supabase.from('reminders').update({ is_sent: true, sent_at: now.toISOString() }).eq('id', reminder.id);
      }
      if (data.length > 0) fetchReminders();
    };

    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [employee?.id, chat.id]);

  // Минимальное время — через 1 минуту от сейчас
  const minDateTime = new Date(Date.now() + 60000).toISOString().slice(0, 16);

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-[#8696a0] font-medium uppercase tracking-wide">Напоминания</p>

      {Notification.permission === 'denied' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400">
          Уведомления заблокированы. Разрешите в настройках браузера.
        </div>
      )}

      <div className="space-y-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Текст напоминания..."
          className="w-full bg-[#202c33] text-[#d1d7db] placeholder-[#8696a0] rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <input
          type="datetime-local"
          value={remindAt}
          onChange={(e) => setRemindAt(e.target.value)}
          min={minDateTime}
          className="w-full bg-[#202c33] text-[#d1d7db] rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <button
          onClick={addReminder}
          disabled={!text.trim() || !remindAt || loading}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg py-2 text-xs transition-colors"
        >
          Добавить напоминание
        </button>
      </div>

      {reminders.length === 0 && (
        <p className="text-xs text-[#8696a0] text-center py-2">Нет активных напоминаний</p>
      )}

      {reminders.map((r) => (
        <div key={r.id} className="bg-[#202c33] rounded-lg px-3 py-2 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[#d1d7db]">{r.text}</p>
            <p className="text-[10px] text-emerald-400 mt-0.5">🔔 {formatDateTime(r.remind_at)}</p>
          </div>
          <button onClick={() => deleteReminder(r.id)} className="text-[#8696a0] hover:text-red-400 transition-colors flex-shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
}
