import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Search } from 'lucide-react';
import { createPurchaseOrder, getProducts } from '../../services/inventory';
import type { Product, Supplier } from '../../types';
import { supabase } from '../../services/supabase';

interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  cost_price: number;
}

interface Props {
  branchId: string;
  employeeId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddPurchaseModal({ branchId, employeeId, onClose, onSuccess }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderItem[]>([]);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    supabase.from('suppliers').select('*').order('name').then(({ data }) => setSuppliers(data ?? []));
    getProducts(branchId).then(setProducts);
  }, [branchId]);

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.includes(search) ||
    p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const addItem = (product: Product) => {
    if (items.find(i => i.product_id === product.id)) return;
    setItems(prev => [...prev, {
      product_id: product.id,
      product_name: product.name,
      quantity: 1,
      cost_price: product.cost_price ?? 0,
    }]);
    setSearch('');
    setShowSearch(false);
  };

  const updateItem = (idx: number, field: 'quantity' | 'cost_price', value: number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const total = items.reduce((sum, i) => sum + i.quantity * i.cost_price, 0);

  const handleSubmit = async () => {
    if (items.length === 0) return;
    setLoading(true);
    try {
      await createPurchaseOrder(
        {
          supplier_id: supplierId || undefined,
          branch_id: branchId,
          status: 'received',
          total,
          notes: notes || undefined,
          created_by: employeeId,
          received_at: new Date().toISOString(),
        },
        items.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          cost_price: i.cost_price,
        }))
      );
      onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Новый приход</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Поставщик */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Поставщик</label>
            <select
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">— без поставщика —</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Добавить товар */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Товары *</label>
            <div className="relative">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setShowSearch(true); }}
                    onFocus={() => setShowSearch(true)}
                    placeholder="Поиск товара по названию или штрихкоду..."
                    className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Дропдаун поиска */}
              {showSearch && search && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {filteredProducts.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-400">Не найдено</div>
                  ) : filteredProducts.slice(0, 8).map(p => (
                    <button
                      key={p.id}
                      onClick={() => addItem(p)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm text-gray-900">{p.name}</p>
                        <p className="text-xs text-gray-400">{p.barcode ?? p.sku ?? '—'}</p>
                      </div>
                      <Plus size={14} className="text-blue-500 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Список позиций */}
          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="border border-gray-100 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">{item.product_name}</p>
                    <button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Кол-во</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Цена прихода ₸</label>
                      <input
                        type="number"
                        min="0"
                        value={item.cost_price}
                        onChange={e => updateItem(idx, 'cost_price', parseFloat(e.target.value) || 0)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 text-right">
                    Сумма: ₸{(item.quantity * item.cost_price).toLocaleString()}
                  </p>
                </div>
              ))}

              {/* Итого */}
              <div className="flex items-center justify-between px-1 pt-1">
                <span className="text-sm text-gray-500">Итого:</span>
                <span className="text-base font-semibold text-gray-900">₸{total.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Примечание */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Примечание</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Необязательно..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || items.length === 0}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Сохраняем...' : `Принять товар (${items.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
