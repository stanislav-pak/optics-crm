import { supabase } from './supabase';

export interface ExpenseCategory {
  id: string;
  name: string;
  is_default: boolean;
  created_at: string;
}

export interface Expense {
  id: string;
  branch_id: string;
  category_id: string | null;
  employee_id: string;
  amount: number;
  payment_method: 'cash' | 'kaspi';
  description: string | null;
  date: string;
  created_at: string;
  category?: ExpenseCategory;
  employee?: { id: string; name: string };
}

export interface ExpenseSummary {
  total: number;
  cash: number;
  kaspi: number;
  byCategory: { category_name: string; total: number }[];
}

export async function getExpenseCategories(): Promise<ExpenseCategory[]> {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .order('is_default', { ascending: false })
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createExpenseCategory(name: string): Promise<ExpenseCategory> {
  const { data, error } = await supabase
    .from('expense_categories')
    .insert({ name, is_default: false })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getExpenses(branchId: string, dateFrom?: string, dateTo?: string): Promise<Expense[]> {
  let query = supabase
    .from('expenses')
    .select('*, category:expense_categories(id, name, is_default, created_at), employee:employees(id, name)')
    .eq('branch_id', branchId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (dateFrom) query = query.gte('date', dateFrom);
  if (dateTo) query = query.lte('date', dateTo);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getExpensesForDate(branchId: string, date: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*, category:expense_categories(id, name, is_default, created_at), employee:employees(id, name)')
    .eq('branch_id', branchId)
    .eq('date', date)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createExpense(payload: {
  branch_id: string;
  employee_id: string;
  category_id: string | null;
  amount: number;
  payment_method: 'cash' | 'kaspi';
  description?: string;
  date?: string;
}): Promise<Expense> {
  const { data, error } = await supabase
    .from('expenses')
    .insert({ ...payload, date: payload.date ?? new Date().toISOString().slice(0, 10) })
    .select('*, category:expense_categories(id, name, is_default, created_at), employee:employees(id, name)')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

export function calcExpenseSummary(expenses: Expense[]): ExpenseSummary {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const cash = expenses.filter(e => e.payment_method === 'cash').reduce((s, e) => s + e.amount, 0);
  const kaspi = expenses.filter(e => e.payment_method === 'kaspi').reduce((s, e) => s + e.amount, 0);
  const byCatMap: Record<string, number> = {};
  for (const e of expenses) {
    const key = e.category?.name ?? 'Прочее';
    byCatMap[key] = (byCatMap[key] ?? 0) + e.amount;
  }
  const byCategory = Object.entries(byCatMap)
    .map(([category_name, total]) => ({ category_name, total }))
    .sort((a, b) => b.total - a.total);
  return { total, cash, kaspi, byCategory };
}
