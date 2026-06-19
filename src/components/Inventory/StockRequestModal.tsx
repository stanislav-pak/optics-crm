import { useState, useEffect } from 'react';
import { X, Search, Trash2, Send } from 'lucide-react';
import { getProducts, createStockRequest } from '../../services/inventory';
import { WAREHOUSE_ID } from '../../constants';
import type { Product } from '../../types';

interface RequestItem {
  product_id: string;
  product_name: string;
  quantity: number;
  warehouse_qty: number;
}

interface Props {
  branchId: string;
  employeeId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function StockRequestModal({ branchId, employeeId, onClose, onSuccess }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getProducts().then(setProducts).catch(console.error);
  }, []);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.includes(search)
  );

  const getWarehouseQty = (p: Product) =>
    (p.stock as any)?.find((s: any) => s.branch_id === WAREHOUSE_ID)?.quantity ?? 0;

  const addItem = (product: Product) => {
    const existing = items.findIndex(i => i.product_id === product.id);
    if (existing >= 0) {
      setItems(prev => prev.map((item, idx) =>
        idx === existing ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setItems(prev => [...prev, {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        warehouse_qty: getWarehouseQty(product),
      }]);
    }
    setSearch('');
    setShowSearch(false);
  };

  const updateQty = (idx: number, qty: number) => {
    if (qty < 1) return;
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, quantity: qty } : item));
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (items.length === 0) { alert('Добавьте хотя бы один товар'); return; }
    setLoading(true);
    try {
      await createStockRequest({
        branch_id: branchId,
        created_by: employeeId,
        notes: notes.trim() || undefined,
        items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
      });
      onSuccess();
      onClose();
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" data-modal="true">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Заявка на склад</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Товары в заявке */}
          {items.map((item, idx) => (
            <div key={idx} className="border border-gray-200 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.product_name}</p>
                  <p className="text-xs text-gray-400">
                    На складе: <span className={item.warehouse_qty > 0 ? 'text-green-600' : 'text-red-500'}>{item.warehouse_qty} шт</span>
                  </p>
                </div>
                <button onMouseDown={e => { e.preventDefault(); removeItem(idx); }} className="text-gray-300 hover:text-red-400">
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 flex-shrink-0">Кол-во:</label>
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                  <button type="button" onMouseDown={e => { e.preventDefault(); updateQty(idx, item.quantity - 1); }}
                    className="px-3 py-1.5 bg-gray-50 text-gray-600 hover:bg-gray-100 font-medium text-sm">−</button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={item.quantity}
                    onChange={e => { const n = parseInt(e.target.value); if (n > 0) updateQty(idx, n); }}
                    className="w-12 text-center text-sm py-1.5 border-0 focus:outline-none"
                  />
                  <button type="button" onMouseDown={e => { e.preventDefault(); updateQty(idx, item.quantity + 1); }}
                    className="px-3 py-1.5 bg-gray-50 text-gray-600 hover:bg-gray-100 font-medium text-sm">+</button>
                </div>
              </div>
            </div>
          ))}

          {/* Поиск товара */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Добавить товар</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setShowSearch(true); }}
                onFocus={() => setShowSearch(true)}
                onBlur={() => setTimeout(() => setShowSearch(false), 150)}
                placeholder="Поиск по названию или артикулу..."
                className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {showSearch && search && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-gray-400">Не найдено</p>
                  ) : filtered.slice(0, 8).map(p => {
                    const wQty = getWarehouseQty(p);
                    return (
                      <button key={p.id}
                        onMouseDown={e => { e.preventDefault(); addItem(p); }}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-900">{p.name}</p>
                          {p.sku && <p className="text-xs text-gray-400">{p.sku}</p>}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${wQty > 0 ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                          склад: {wQty}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Примечание */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Примечание</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Необязательно..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100">
          <button
            onClick={handleSubmit}
            disabled={loading || items.length === 0}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-colors"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Send size={16} />
            )}
            {loading ? 'Отправляем...' : `Отправить заявку (${items.length} поз.)`}
          </button>
        </div>
      </div>
    </div>
  );
}
