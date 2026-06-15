import { useState, useEffect, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { getExpenses, deleteExpense, calcExpenseSummary, type Expense } from '../../services/expenses';
import AddExpenseModal from './AddExpenseModal';

interface Props {
  branchId: string;
  employeeId: string;
  isAdmin: boolean;
}

type DateFilter = 'today' | 'week' | 'month' | 'custom';

function getDateRange(filter: DateFilter, customFrom: string, customTo: string): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (filter === 'today') return { from: today, to: today };
  if (filter === 'week') {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return { from: d.toISOString().slice(0, 10), to: today };
  }
  if (filter === 'month') {
    const d = new Date();
    d.setDate(1);
    return { from: d.toISOString().slice(0, 10), to: today };
  }
  return { from: customFrom, to: customTo };
}

export default function ExpensesTab({ branchId, employeeId, isAdmin }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = getDateRange(dateFilter, customFrom, customTo);
      const data = await getExpenses(branchId, from, to);
      setExpenses(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [branchId, dateFilter, customFrom, customTo]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('Удалить расход?')) return;
    setDeletingId(id);
    try {
      await deleteExpense(id);
      setExpenses(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  }

  const summary = calcExpenseSummary(expenses);

  const filterLabels: { key: DateFilter; label: string }[] = [
    { key: 'today', label: 'Сегодня' },
    { key: 'week', label: 'Неделя' },
    { key: 'month', label: 'Месяц' },
    { key: 'custom', label: 'Период' },
  ];

  if (showAddModal) {
    return (
      <AddExpenseModal
        branchId={branchId}
        employeeId={employeeId}
        onClose={() => setShowAddModal(false)}
        onCreated={() => { load(); setShowAddModal(false); }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden touch-pan-y overflow-x-hidden">
      {/* Фильтры */}
      <div className="space-y-2">
        <div className="flex gap-1.5 px-4 py-2 border-b">
          {filterLabels.map(f => (
            <button
              key={f.key}
              onClick={() => setDateFilter(f.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                dateFilter === f.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {dateFilter === 'custom' && (
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-400 text-sm">—</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      {/* Сводка */}
      {expenses.length > 0 && (
        <div className="mx-4 mb-3 bg-red-50 border border-red-100 rounded-2xl p-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-red-700 font-medium">Итого расходов</span>
            <span className="text-lg font-bold text-red-600">
              -{summary.total.toLocaleString('ru-KZ')} ₸
            </span>
          </div>
          <div className="flex gap-4 text-xs text-red-600">
            <span>💵 Наличные: {summary.cash.toLocaleString('ru-KZ')} ₸</span>
            <span>📱 Kaspi: {summary.kaspi.toLocaleString('ru-KZ')} ₸</span>
          </div>
          {summary.byCategory.length > 0 && (
            <div className="mt-2 space-y-1">
              {summary.byCategory.map(c => (
                <div key={c.category_name} className="flex justify-between text-xs text-red-500">
                  <span>{c.category_name}</span>
                  <span>{c.total.toLocaleString('ru-KZ')} ₸</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Список */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-24">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : expenses.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">Расходов нет</div>
        ) : (
          <div className="space-y-2">
            {expenses.map(expense => (
              <div
                key={expense.id}
                className="bg-white border border-gray-100 rounded-2xl px-4 py-3 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">
                      {expense.category?.name ?? 'Прочее'}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        expense.payment_method === 'cash'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {expense.payment_method === 'cash' ? '💵 Наличные' : '📱 Kaspi'}
                    </span>
                  </div>
                  {expense.description && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{expense.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                    <span>{expense.date}</span>
                    {expense.employee && <span>· {expense.employee.name}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-base font-bold text-red-500">
                    -{expense.amount.toLocaleString('ru-KZ')} ₸
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(expense.id)}
                      disabled={deletingId === expense.id}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Кнопка добавления */}
      <div className="fixed bottom-20 left-0 right-0 px-4 z-10 flex-shrink-0">
        <button
          onClick={() => setShowAddModal(true)}
          className="w-full max-w-md mx-auto block py-3.5 rounded-2xl bg-blue-600 text-white font-semibold text-sm shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-[0.98] transition-all"
        >
          + Добавить расход
        </button>
      </div>

    </div>
  );
}
