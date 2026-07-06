import { supabase } from './supabase';

export interface CashSession {
  id: string;
  branch_id: string;
  date: string;
  system_cash: number;
  system_kaspi: number;
  system_total: number;
  actual_cash: number | null;
  cash_discrepancy: number | null;
  status: 'open' | 'closed';
  closed_at: string | null;
}

export interface CashSessionClosure {
  id: string;
  session_id: string;
  branch_id: string;
  closed_at: string;
  system_cash: number;
  system_kaspi: number;
  system_total: number;
  actual_cash: number;
  cash_discrepancy: number;
  notes: string | null;
}

export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export async function getCashSession(branchId: string, date: string): Promise<CashSession | null> {
  const { data } = await supabase
    .from('cash_sessions')
    .select('*')
    .eq('branch_id', branchId)
    .eq('date', date)
    .maybeSingle();
  return (data as CashSession) ?? null;
}

export async function openCashSession(branchId: string, employeeId: string): Promise<CashSession> {
  const { data, error } = await supabase
    .from('cash_sessions')
    .insert({ branch_id: branchId, employee_id: employeeId, date: todayStr() })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('Касса на сегодня уже была открыта');
    throw error;
  }
  return data as CashSession;
}

export async function closeCashSession(
  sessionId: string,
  actualCash: number,
  employeeId: string,
  notes?: string
): Promise<void> {
  const { error } = await supabase.rpc('close_cash_session', {
    p_session_id: sessionId,
    p_actual_cash: actualCash,
    p_employee_id: employeeId,
    p_notes: notes || null,
  });
  if (error) throw error;
}

// RLS (employees_update_cash_sessions) разрешает update закрытой сессии только admin —
// обычному менеджеру своего филиала нет, поэтому переоткрытие идёт через SECURITY DEFINER
// RPC (та же схема, что у close_cash_session), которая сама проверяет права владельца филиала.
// Сбрасывает данные закрытия — иначе расхождение считалось бы по уже неактуальным цифрам.
export async function reopenCashSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('reopen_cash_session', { p_session_id: sessionId });
  if (error) throw error;
}

export async function isCashSessionOpenToday(branchId: string): Promise<boolean> {
  const session = await getCashSession(branchId, todayStr());
  return session?.status === 'open';
}

// Каждое закрытие (в т.ч. после переоткрытия) логируется отдельной записью в
// close_cash_session — история не трогается переоткрытием, в отличие от cash_sessions.
export async function getCashSessionClosures(sessionId: string): Promise<CashSessionClosure[]> {
  const { data, error } = await supabase
    .from('cash_session_closures')
    .select('*')
    .eq('session_id', sessionId)
    .order('closed_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CashSessionClosure[];
}
