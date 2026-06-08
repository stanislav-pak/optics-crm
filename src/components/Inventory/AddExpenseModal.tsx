import { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import {
  getExpenseCategories,
  createExpenseCategory,
  createExpense,
  type ExpenseCategory,
} from '../../services/expenses';

interface Props {
  branchId: string;
  employeeId: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function AddExpenseModal({ branchId, employeeId, onClose, onCreated }: Props) {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'kaspi'>('cash');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [loading, setLoading] = useState(false);
  const [catLoading, setCatLoading] = useState(false);

  useEffect(() => {
    getExpenseCategories().then(setCategories).catch(console.error);
  }, []);

  async function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    setCatLoading(true);
    try {
      const created = await createExpenseCategory(name);
      setCategories(prev => [...prev, created]);
      setCategoryId(created.id);
      setNewCategoryName('');
      setShowNewCategory(false);
    } catch (err) {
      console.error(err);
    } finally {
      setCatLoading(false);
    }
  }

  async function handleSave() {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) return;
    setLoading(true);
    try {
      await createExpense({
        branch_id: branchId,
        employee_id: employeeId,
        category_id: categoryId,
        amount: parsedAmount,
        payment_method: paymentMethod,
        description: description.trim() || undefined,
        date,
      });
      onCreated();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-end sm:items-center justify-center" data-modal="true" style={{ overscrollBehavior: 'none' }} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Новый расход</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Категория */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Категория</label>
            <div className="grid grid-cols-2 gap-2">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryId(cat.id)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors text-left ${
                    categoryId === cat.id
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
              <button
                onClick={() => setShowNewCategory(v => !v)}
                className="px-3 py-2.5 rounded-xl text-sm font-medium border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 flex items-center gap-1.5"
              >
                <Plus size={14} />
                Новая
              </button>
            </div>

            {showNewCategory && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  placeholder="Название категории"
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                  autoFocus
                />
                <button
                  onClick={handleAddCategory}
                  disabled={catLoading || !newCategoryName.trim()}
                  className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl disabled:opacity-50"
                >
                  {catLoading ? '...' : 'Добавить'}
                </button>
              </div>
            )}
          </div>

          {/* Сумма */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Сумма</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              min="0"
              className="w-full px-4 py-3 text-2xl font-bold border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
            />
          </div>

          {/* Оплата из */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Оплата из</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPaymentMethod('cash')}
                className={`py-3 rounded-xl text-sm font-medium border transition-colors ${
                  paymentMethod === 'cash'
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300'
                }`}
              >
                💵 Наличные
              </button>
              <button
                onClick={() => setPaymentMethod('kaspi')}
                className={`py-3 rounded-xl text-sm font-medium border transition-colors ${
                  paymentMethod === 'kaspi'
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300'
                }`}
              >
                📱 Kaspi
              </button>
            </div>
          </div>

          {/* Комментарий */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Комментарий</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Необязательно"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Дата */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Дата</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Кнопки */}
        <div className="px-4 pb-4 pt-2 flex gap-3 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !amount || parseFloat(amount) <= 0}
            className="flex-1 py-3 rounded-xl text-sm font-medium bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-700"
          >
            {loading ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
