import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import type { Employee } from '../../types';

export function PendingManagers() {
  const [pending, setPending] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = async () => {
    const { data } = await supabase.from('employees').select('*').eq('role', 'manager').eq('is_active', false).order('created_at', { ascending: false });
    setPending(data ?? []);
    setLoading(false);
  };

  const approve = async (id: string) => {
    await supabase.from('employees').update({ is_active: true }).eq('id', id);
    fetchPending();
  };

  const reject = async (id: string) => {
    await supabase.from('employees').delete().eq('id', id);
    fetchPending();
  };

  useEffect(() => {
    fetchPending();
    const channel = supabase.channel('pending-managers').on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, fetchPending).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (loading || pending.length === 0) return null;

  return (
    <div className="mx-4 mt-4 bg-[#202c33] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
        <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
        <h3 className="text-sm font-medium text-[#e9edef]">Ожидают подтверждения</h3>
        <span className="ml-auto text-xs bg-amber-400/20 text-amber-400 px-2 py-0.5 rounded-full">{pending.length}</span>
      </div>
      <div className="divide-y divide-white/5">
        {pending.map((emp) => (
          <div key={emp.id} className="px-4 py-3">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-full bg-[#2a3942] flex items-center justify-center text-[#8696a0] font-medium text-sm flex-shrink-0">{emp.name[0].toUpperCase()}</div>
              <div className="flex-1">
                <p className="text-sm text-[#e9edef] font-medium">{emp.name}</p>
                <p className="text-xs text-[#8696a0]">{emp.email}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => approve(emp.id)} className="flex-1 text-xs bg-emerald-500 hover:bg-emerald-600 text-white py-1.5 rounded-lg transition-colors">Принять</button>
              <button onClick={() => reject(emp.id)} className="flex-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 py-1.5 rounded-lg transition-colors">Отклонить</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
