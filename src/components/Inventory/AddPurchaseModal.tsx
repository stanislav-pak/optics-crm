import { useState, useEffect, useRef } from 'react';
import { X, Trash2, Search, Plus, QrCode } from 'lucide-react';
import { createPurchaseOrder, getProducts, getProductByBarcode } from '../../services/inventory';
import type { Product, Supplier, Branch } from '../../types';
import { supabase } from '../../services/supabase';
import BarcodeScanner from '../Shared/BarcodeScanner';

const DEFAULT_UNITS = ['шт', 'пара', 'коробка', 'упаковка', 'компл'];

interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  cost_price: number;
  unit: string;
  price: number;
}

interface InitialData {
  supplier_id?: string;
  items?: Array<{ product_id: string; quantity: number; cost_price: number }>;
}

interface Props {
  branchId: string;
  employeeId: string;
  role?: 'manager' | 'branch_admin' | 'admin';
  onClose: () => void;
  onSuccess: () => void;
  initialData?: InitialData;
}

export default function AddPurchaseModal({ branchId, employeeId, role = 'manager', onClose, onSuccess, initialData }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [supplierId, setSupplierId] = useState(() => localStorage.getItem('purchase_last_supplier') ?? '');
  const [receivingBranchId, setReceivingBranchId] = useState(branchId);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderItem[]>([]);
  const [lensProducts, setLensProducts] = useState<Set<string>>(new Set());
  const [axisValues, setAxisValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  // Кастомная единица: ключ — индекс позиции
  const [customUnits, setCustomUnits] = useState<Record<number, string>>({});
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from('suppliers').select('*').order('name').then(({ data }) => setSuppliers(data ?? []));
    supabase.from('branches').select('id, name, is_warehouse').order('name').then(({ data }) => {
      if (!data) return;
      const sorted = [...data].sort((a, b) => (b.is_warehouse ? 1 : 0) - (a.is_warehouse ? 1 : 0));
      setBranches(sorted);
      if (role !== 'manager') {
        const warehouse = sorted.find(b => b.is_warehouse);
        if (warehouse) setReceivingBranchId(warehouse.id);
      }
    });
    getProducts().then(data =>
      setProducts([...data].sort((a, b) => a.name.localeCompare(b.name, 'ru')))
    );
  }, [branchId]);

  useEffect(() => {
    if (!initialData || products.length === 0) return;
    if (initialData.supplier_id) setSupplierId(initialData.supplier_id);
    if (initialData.items && initialData.items.length > 0) {
      const mapped: OrderItem[] = initialData.items.flatMap(i => {
        const p = products.find(pr => pr.id === i.product_id);
        if (!p) return [];
        return [{ product_id: i.product_id, product_name: p.name, quantity: i.quantity, cost_price: i.cost_price, unit: p.unit ?? 'шт', price: p.price ?? 0 }];
      });
      if (mapped.length > 0) setItems(mapped);
    }
  }, [products]);

  useEffect(() => {
    const startX = { x: -1, y: 0 };
    const onStart = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest('[data-no-swipe="true"]')) { startX.x = -1; return; }
      startX.x = e.touches[0].clientX; startX.y = e.touches[0].clientY;
    };
    const onEnd = (e: TouchEvent) => {
      if (startX.x === -1) return;
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearch(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const q = search.toLowerCase().trim();
  const matchesSearch = (p: Product) =>
    !q ||
    p.name.toLowerCase().includes(q) ||
    (p.barcode ?? '').includes(search) ||
    (p.sku ?? '').toLowerCase().includes(q) ||
    (p.product_group ?? '').toLowerCase().includes(q);

  const purchaseCategories = Array.from(
    new Map(products.filter(p => p.category).map(p => [p.category!.id, p.category!])).values()
  ).sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const filteredAll = products.filter(p =>
    matchesSearch(p) && (!selectedCategory || p.category_id === selectedCategory)
  );
  const dropdownGrouped: Record<string, Product[]> = {};
  const dropdownUngrouped: Product[] = [];
  for (const p of filteredAll) {
    if (p.product_group) {
      if (!dropdownGrouped[p.product_group]) dropdownGrouped[p.product_group] = [];
      dropdownGrouped[p.product_group].push(p);
    } else {
      dropdownUngrouped.push(p);
    }
  }
  const dropdownGroupNames = Object.keys(dropdownGrouped).sort((a, b) => a.localeCompare(b, 'ru'));
  const hasDropdownResults = dropdownGroupNames.length > 0 || dropdownUngrouped.length > 0;

  const handleBarcodeDetected = async (barcode: string) => {
    try {
      const product = await getProductByBarcode(barcode);
      if (!product) {
        alert('Товар не найден в базе');
        return;
      }
      setItems(prev => {
        const existing = prev.findIndex(i => i.product_id === product.id);
        if (existing >= 0) {
          return prev.map((item, idx) => idx === existing ? { ...item, quantity: item.quantity + 1 } : item);
        }
        return [...prev, { product_id: product.id, product_name: product.name, quantity: 1, cost_price: product.cost_price ?? 0, unit: product.unit ?? 'шт', price: product.price ?? 0 }];
      });
    } catch {
      alert('Товар не найден в базе');
    }
  };

  const addItem = (product: Product) => {
    if (items.find(i => i.product_id === product.id)) return;
    setItems(prev => [...prev, {
      product_id: product.id,
      product_name: product.name,
      quantity: 1,
      cost_price: product.cost_price ?? 0,
      unit: product.unit ?? 'шт',
      price: product.price ?? 0,
    }]);
    const isLens = !!(product.category?.slug?.includes('lens') || product.category?.slug?.includes('contact'));
    if (isLens) {
      setLensProducts(prev => new Set([...prev, product.id]));
      if (product.attributes?.axis != null)
        setAxisValues(prev => ({ ...prev, [product.id]: String(product.attributes.axis) }));
    }
    setSearch(product.name);
    setShowSearch(false);
  };

  const updateItem = (idx: number, field: 'quantity' | 'cost_price' | 'unit', value: number | string) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setCustomUnits(prev => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  };

  const total = items.reduce((sum, i) => sum + i.quantity * i.cost_price, 0);

  const handleSubmit = async () => {
    if (items.length === 0) return;
    setLoading(true);
    try {
      // Обновляем axis для линз
      for (const item of items) {
        const axisStr = axisValues[item.product_id];
        if (lensProducts.has(item.product_id) && axisStr !== undefined && axisStr !== '') {
          const axis = parseFloat(axisStr);
          if (!isNaN(axis)) {
            const product = products.find(p => p.id === item.product_id);
            await supabase.from('products').update({
              attributes: { ...(product?.attributes ?? {}), axis },
            }).eq('id', item.product_id);
          }
        }
      }
      await createPurchaseOrder(
        {
          supplier_id: supplierId || undefined,
          branch_id: receivingBranchId,
          status: 'received' as const,
          total,
          notes: notes || undefined,
          created_by: employeeId,
          received_at: new Date(date).toISOString(),
        },
        items.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          cost_price: i.cost_price,
          unit: i.unit,
        }))
      );
      if (supplierId) localStorage.setItem('purchase_last_supplier', supplierId);
      onSuccess();
      onClose();
    } catch (e: any) {
      alert('Ошибка: ' + (e?.message || JSON.stringify(e)));
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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Шапка */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Филиал получатель</label>
            <select
              value={receivingBranchId}
              onChange={e => setReceivingBranchId(e.target.value)}
              disabled={role === 'manager'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:bg-gray-50"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.is_warehouse ? '🏭 ' : ''}{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Поставщик</label>
            <select
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— без поставщика —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Дата прихода</label>
            <div className="relative w-full">
              <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-700 pointer-events-none">
                {date ? new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Выберите дату'}
              </div>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
            </div>
          </div>

          {/* Позиции */}
          <div className="space-y-2">
            {items.map((item, idx) => {
              const isCustom = !DEFAULT_UNITS.includes(item.unit);
              return (
                <div key={idx} className="border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900 flex-1">{item.product_name}</span>
                    <button type="button" onMouseDown={e => { e.preventDefault(); removeItem(idx); }} className="text-gray-300 hover:text-red-400 flex-shrink-0 mt-0.5">
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className={`grid gap-2 ${role === 'manager' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    {/* Количество */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Количество</label>
                      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                        <button type="button" onMouseDown={e => { e.preventDefault(); updateItem(idx, 'quantity', Math.max(1, item.quantity - 1)); }} className="px-2 py-2 bg-gray-50 text-gray-600 hover:bg-gray-100 font-medium border-r border-gray-200">−</button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.quantity === 0 ? '' : String(item.quantity)}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            updateItem(idx, 'quantity', val === '' ? 0 : parseInt(val));
                          }}
                          onBlur={() => { if (item.quantity < 1) updateItem(idx, 'quantity', 1); }}
                          className="flex-1 text-center text-sm py-2 border-0 focus:outline-none min-w-0 w-full"
                        />
                        <button type="button" onMouseDown={e => { e.preventDefault(); updateItem(idx, 'quantity', item.quantity + 1); }} className="px-2 py-2 bg-gray-50 text-gray-600 hover:bg-gray-100 font-medium border-l border-gray-200">+</button>
                      </div>
                    </div>

                    {/* Единица измерения */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Единица</label>
                      {isCustom ? (
                        <div className="flex gap-1">
                          <input
                            autoFocus
                            value={item.unit}
                            onChange={e => updateItem(idx, 'unit', e.target.value)}
                            placeholder="напр. рулон"
                            className="flex-1 min-w-0 border border-blue-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => updateItem(idx, 'unit', 'шт')}
                            className="text-gray-400 hover:text-gray-600 px-1"
                            title="Сбросить"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <select
                          value={item.unit}
                          onChange={e => {
                            if (e.target.value === '__custom__') {
                              updateItem(idx, 'unit', '');
                            } else {
                              updateItem(idx, 'unit', e.target.value);
                            }
                          }}
                          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {DEFAULT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          <option value="__custom__">+ свой</option>
                        </select>
                      )}
                    </div>

                    {/* Цена — только для admin/branch_admin */}
                    {role !== 'manager' && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Цена прихода ₸</label>
                        <input
                          type="number"
                          min="0"
                          value={item.cost_price === 0 ? '' : item.cost_price}
                          onChange={e => updateItem(idx, 'cost_price', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}
                  </div>

                  {lensProducts.has(item.product_id) && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-400 flex-shrink-0">Градусы (AX)</label>
                      <input
                        type="number" step="1" min="0" max="180"
                        value={axisValues[item.product_id] ?? ''}
                        onChange={e => setAxisValues(prev => ({ ...prev, [item.product_id]: e.target.value }))}
                        placeholder="0"
                        className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                  <div className="flex justify-end">
                    {role === 'manager'
                      ? <span className="text-sm text-gray-500">Цена продажи: <span className="font-semibold text-gray-700">₸{item.price.toLocaleString()}</span></span>
                      : <span className="text-sm font-semibold text-gray-700">Сумма: ₸{(item.quantity * item.cost_price).toLocaleString()}</span>
                    }
                  </div>
                </div>
              );
            })}

            {items.length === 0 && (
              <div className="text-center py-6 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
                Добавьте товары через поиск ниже
              </div>
            )}

            {items.length > 0 && role !== 'manager' && (
              <div className="flex items-center justify-between px-1 pt-1 border-t border-gray-100">
                <span className="text-sm text-gray-500">Итого:</span>
                <span className="text-base font-bold text-gray-900">₸{total.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Поиск товара */}
          <div ref={searchRef} className="relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">Добавить товар</label>
            {/* Фильтр по категориям */}
            {purchaseCategories.length > 0 && (
              <div data-no-swipe="true" className="flex gap-1.5 overflow-x-auto pb-1.5 mb-2" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { setSelectedCategory(null); setShowSearch(true); }}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${!selectedCategory ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                >Все</button>
                {purchaseCategories.map(cat => (
                  <button key={cat.id}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setSelectedCategory(selectedCategory === cat.id ? null : cat.id); setShowSearch(true); }}
                    className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${selectedCategory === cat.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                  >{cat.name}</button>
                ))}
              </div>
            )}
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
              >
                <QrCode size={18} />
              </button>
            </div>

            {showSearch && (
              <div
                className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg"
                style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', maxHeight: '280px' }}
                onTouchMove={e => e.stopPropagation()}
              >
                {!hasDropdownResults ? (
                  <div className="px-4 py-3 text-sm text-gray-400">Не найдено</div>
                ) : (
                  <>
                    {dropdownGroupNames.map(groupName => (
                      <div key={groupName}>
                        {/* Заголовок группы */}
                        <div style={{ padding: '6px 12px 2px', fontSize: 11, color: '#8696a0', background: '#f9fafb', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                          Группа · {groupName}
                        </div>
                        {/* Варианты группы */}
                        {dropdownGrouped[groupName].map(p => (
                          <button
                            key={p.id}
                            onClick={() => addItem(p)}
                            className="w-full text-left hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                            style={{ padding: '8px 12px 8px 20px' }}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                              <p className="text-xs text-gray-400">{p.barcode ?? p.sku ?? '—'}{role !== 'manager' ? ` · ₸${p.cost_price.toLocaleString()}` : ''}</p>
                            </div>
                            <Plus size={14} className="text-blue-500 flex-shrink-0 ml-2" />
                          </button>
                        ))}
                      </div>
                    ))}

                    {/* Разделитель если есть и группы и обычные товары */}
                    {dropdownGroupNames.length > 0 && dropdownUngrouped.length > 0 && (
                      <div className="flex items-center gap-2 px-3 py-1.5">
                        <div className="flex-1 h-px bg-gray-100" />
                        <span style={{ fontSize: 11, color: '#8696a0' }}>Товары</span>
                        <div className="flex-1 h-px bg-gray-100" />
                      </div>
                    )}

                    {/* Обычные товары без группы */}
                    {dropdownUngrouped.map(p => (
                      <button
                        key={p.id}
                        onClick={() => addItem(p)}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">{p.name}</p>
                          <p className="text-xs text-gray-400">{p.barcode ?? p.sku ?? '—'}{role !== 'manager' ? ` · ₸${p.cost_price.toLocaleString()}` : ''}</p>
                        </div>
                        <Plus size={14} className="text-blue-500 flex-shrink-0 ml-2" />
                      </button>
                    ))}
                  </>
                )}
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
          <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
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