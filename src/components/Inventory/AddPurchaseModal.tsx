import { useState, useEffect, useRef } from 'react';
import { X, Trash2, Search, Plus, QrCode } from 'lucide-react';
import { createPurchaseOrder, getProducts, getProductByBarcode } from '../../services/inventory';
import type { Product, Supplier } from '../../types';
import { supabase } from '../../services/supabase';
import BarcodeScanner from '../Shared/BarcodeScanner';

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
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderItem[]>([]);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from('suppliers').select('*').order('name').then(({ data }) => setSuppliers(data ?? []));
    getProducts(branchId).then(setProducts);
  }, [branchId]);

  // Свайп вправо — закрыть модал
  useEffect(() => {
    const startX = { x: 0, y: 0 };
    const onStart = (e: TouchEvent) => {
      startX.x = e.touches[0].clientX;
      startX.y = e.touches[0].clientY;
    };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX.x;
      const dy = Math.abs(e.changedTouches[0].clientY - startX.y);
      if (dx > 60 && dy < 80) onClose();
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, []);

  // Закрыть дропдаун при клике вне
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.includes(search) ||
    p.sku?.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8);

  const handleBarcodeDetected = async (barcode: string) => {
    try {
      const product = await getProductByBarcode(barcode);
      setItems(prev => {
        const existing = prev.findIndex(i => i.product_id === product.id);
        if (existing >= 0) {
          return prev.map((item, idx) =>
            idx === existing ? { ...item, quantity: item.quantity + 1 } : item
          );
        }
        return [...prev, {
          product_id: product.id,
          product_name: product.name,
          quantity: 1,
          cost_price: product.cost_price ?? 0,
        }];
      });
    } catch {
      // товар не найден по штрихкоду
    }
  };

  const addItem = (product: Product) => {
    console.log('[addItem] called with:', product.name, product.id);
    if (items.find(i => i.product_id === product.id)) {
      console.log('[addItem] already in list, skip');
      return;
    }
    setItems(prev => {
      const next = [...prev, {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        cost_price: product.cost_price ?? 0,
      }];
      console.log('[addItem] new items:', next.length);
      return next;
    });
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
          received_at: new Date(date).toISOString(),
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
    <div data-modal="true" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Приходная накладная</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Шапка накладной */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Поставщик</label>
            <select
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— без поставщика —</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Дата прихода</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Список позиций */}
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="border border-gray-200 rounded-xl p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 flex-1">{item.product_name}</span>
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); removeItem(idx); }}
                    className="text-gray-300 hover:text-red-400 flex-shrink-0 mt-0.5"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Количество</label>
                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onMouseDown={e => { e.preventDefault(); updateItem(idx, 'quantity', Math.max(1, item.quantity - 1)); }}
                        className="px-3 py-2 bg-gray-50 text-gray-600 hover:bg-gray-100 text-lg font-medium border-r border-gray-200 flex-shrink-0"
                      >−</button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={item.quantity === 0 ? '' : String(item.quantity)}
                        onChange={e => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          updateItem(idx, 'quantity', val === '' ? 0 : parseInt(val));
                        }}
                        onBlur={() => { if (item.quantity < 1) updateItem(idx, 'quantity', 1); }}
                        placeholder=""
                        className="flex-1 text-center text-sm py-2 border-0 focus:outline-none min-w-0"
                      />
                      <button
                        type="button"
                        onMouseDown={e => { e.preventDefault(); updateItem(idx, 'quantity', item.quantity + 1); }}
                        className="px-3 py-2 bg-gray-50 text-gray-600 hover:bg-gray-100 text-lg font-medium border-l border-gray-200 flex-shrink-0"
                      >+</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Цена прихода ₸</label>
                    <input
                      type="number"
                      min="0"
                      value={item.cost_price === 0 ? '' : item.cost_price}
                      onChange={e => updateItem(idx, 'cost_price', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <span className="text-sm font-semibold text-gray-700">
                    Сумма: ₸{(item.quantity * item.cost_price).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}

            {items.length === 0 && (
              <div className="text-center py-6 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
                Добавьте товары через поиск ниже
              </div>
            )}

            {items.length > 0 && (
              <div className="flex items-center justify-between px-1 pt-1 border-t border-gray-100">
                <span className="text-sm text-gray-500">Итого:</span>
                <span className="text-base font-bold text-gray-900">₸{total.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Поиск и добавление товара */}
          <div ref={searchRef} className="relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">Добавить товар</label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setShowSearch(true); }}
                  onFocus={() => setShowSearch(true)}
                  placeholder="Поиск по названию, SKU, штрихкоду..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); setShowScanner(true); }}
                className="flex items-center justify-center w-10 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex-shrink-0"
                title="Сканировать штрихкод"
              >
                <QrCode size={18} />
              </button>
            </div>

            {showSearch && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-44 overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-400">Не найдено</div>
                ) : filteredProducts.map(p => (
                  <button
                    key={p.id}
                    onMouseDown={e => { e.preventDefault(); addItem(p); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                  >
                    <div>
                      <p className="text-sm text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.barcode ?? p.sku ?? '—'} · ₸{p.cost_price.toLocaleString()}</p>
                    </div>
                    <Plus size={14} className="text-blue-500 flex-shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Примечание */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Примечание</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Необязательно..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {showScanner && (
          <BarcodeScanner
            onDetected={handleBarcodeDetected}
            onClose={() => setShowScanner(false)}
          />
        )}

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
            {loading ? 'Сохраняем...' : `Принять приход (${items.length} поз.)`}
          </button>
        </div>
      </div>
    </div>
  );
}
