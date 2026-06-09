import { useState, useEffect } from 'react';
import { X, QrCode, Barcode } from 'lucide-react';
import { createProduct, getCategories, getBrands, generateBarcode, getProductGroups } from '../../services/inventory';
import { supabase } from '../../services/supabase';
import type { ProductCategory, Brand, ProductAttributes } from '../../types';
import BarcodeScanner from '../Shared/BarcodeScanner';
import InlineCreate from './InlineCreate';

interface Props {
  branchId: string;
  employeeId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function sortAlpha<T extends { name: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const aLatin = /^[a-zA-Z]/.test(a.name);
    const bLatin = /^[a-zA-Z]/.test(b.name);
    if (aLatin && !bLatin) return -1;
    if (!aLatin && bLatin) return 1;
    return a.name.localeCompare(b.name, aLatin ? 'en' : 'ru');
  });
}

export default function AddProductModal({ branchId, employeeId, onClose, onSuccess }: Props) {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    category_id: '',
    brand_id: '',
    price: '',
    cost_price: '',
    min_stock: '0',
    unit: 'шт',
  });

  const [attributes, setAttributes] = useState<ProductAttributes>({});
  const [showScanner, setShowScanner] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewBrand, setShowNewBrand] = useState(false);

  const [productGroup, setProductGroup] = useState('');
  const [productGroups, setProductGroups] = useState<string[]>([]);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);

  const handleGenerateBarcode = () => {
    setForm(f => ({ ...f, barcode: generateBarcode(crypto.randomUUID()) }));
  };

  useEffect(() => {
    getCategories().then(data => setCategories(sortAlpha(data))).catch(e => console.error('getCategories failed:', e));
    getBrands().then(data => setBrands(sortAlpha(data))).catch(e => console.error('getBrands failed:', e));
    getProductGroups().then(setProductGroups).catch(() => {});
  }, []);

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

  const selectedCategory = categories.find(c => c.id === form.category_id);
  const isLenses = selectedCategory?.slug?.includes('lens') || selectedCategory?.slug?.includes('contact');
  const isFrames = selectedCategory?.slug?.includes('frame') || selectedCategory?.slug?.includes('glass') || selectedCategory?.slug?.includes('sun');

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));
  const setAttr = (key: string, value: string) => setAttributes(a => ({ ...a, [key]: value }));

  const handleCreateCategory = async (name: string) => {
    const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-zа-я0-9_]/gi, '');
    const { data, error } = await supabase.from('product_categories').insert({ name, slug }).select().single();
    if (error) throw error;
    setCategories(prev => sortAlpha([...prev, data as ProductCategory]));
    set('category_id', data.id);
    setShowNewCategory(false);
  };

  const handleCreateBrand = async (name: string) => {
    const { data, error } = await supabase.from('brands').insert({ name }).select().single();
    if (error) throw error;
    setBrands(prev => sortAlpha([...prev, data as Brand]));
    set('brand_id', data.id);
    setShowNewBrand(false);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.price) return;

    setSubmitError(null);
    setLoading(true);

    const payload = {
      name: form.name.trim(),
      sku: form.sku || undefined,
      barcode: form.barcode || undefined,
      category_id: form.category_id || undefined,
      brand_id: form.brand_id || undefined,
      price: parseFloat(form.price),
      cost_price: parseFloat(form.cost_price || '0'),
      min_stock: parseInt(form.min_stock || '0'),
      unit: form.unit,
      attributes,
      product_group: productGroup.trim() || null,
      is_active: true,
      branch_id: branchId,
      created_by: employeeId,
    };

    try {
      await createProduct(payload);
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-modal="true" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Новый товар</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Название */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Название *</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Например: Оправа Ray-Ban RB3025"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Категория и бренд */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Категория</label>
              <select
                value={form.category_id}
                onChange={e => e.target.value === '__new__' ? (setShowNewCategory(true), setShowNewBrand(false), set('category_id', '')) : set('category_id', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">— выбрать —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.parent_id ? '  ' : ''}{c.name}</option>
                ))}
                <option value="__new__">+ Создать новую</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Бренд</label>
              <select
                value={form.brand_id}
                onChange={e => e.target.value === '__new__' ? (setShowNewBrand(true), setShowNewCategory(false), set('brand_id', '')) : set('brand_id', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">— выбрать —</option>
                {brands.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
                <option value="__new__">+ Создать новый</option>
              </select>
            </div>
          </div>
          {showNewCategory && (
            <InlineCreate
              placeholder="Новая категория"
              onConfirm={handleCreateCategory}
              onCancel={() => setShowNewCategory(false)}
            />
          )}
          {showNewBrand && (
            <InlineCreate
              placeholder="Новый бренд"
              onConfirm={handleCreateBrand}
              onCancel={() => setShowNewBrand(false)}
            />
          )}

          {/* Цены */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Цена продажи ₸ *</label>
              <input
                type="number"
                value={form.price}
                onChange={e => set('price', e.target.value)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Себестоимость ₸</label>
              <input
                type="number"
                value={form.cost_price}
                onChange={e => set('cost_price', e.target.value)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Группа товаров */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">Группа товаров</label>
            <input
              value={productGroup}
              onChange={e => setProductGroup(e.target.value)}
              onFocus={() => setShowGroupDropdown(true)}
              onBlur={() => setTimeout(() => setShowGroupDropdown(false), 150)}
              placeholder="Например: До 2 000 ₸, До 5 000 ₸"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="off"
            />
            <p className="text-xs text-gray-400 mt-1">Группа объединяет товары одного ценового диапазона</p>

            {showGroupDropdown && (() => {
              const filtered = productGroups.filter(g =>
                g.toLowerCase().includes(productGroup.toLowerCase())
              );
              return (
                <div
                  className="absolute left-0 right-0 z-30 rounded-lg overflow-hidden"
                  style={{
                    top: 'calc(100% - 16px)',
                    border: '1px solid #2a3942',
                    background: '#1d2b35',
                    maxHeight: 150,
                    overflowY: 'auto',
                  }}
                >
                  {filtered.length === 0 ? (
                    <div style={{ padding: '8px 12px', fontSize: 13, color: '#8696a0' }}>
                      Введите название новой группы
                    </div>
                  ) : (
                    filtered.map(g => (
                      <button
                        key={g}
                        type="button"
                        onMouseDown={e => {
                          e.preventDefault();
                          setProductGroup(g);
                          setShowGroupDropdown(false);
                        }}
                        style={{ padding: '8px 12px', fontSize: 13, color: '#e9edef', background: 'transparent', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2a3942'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                      >
                        {g}
                      </button>
                    ))
                  )}
                </div>
              );
            })()}
          </div>

          {/* SKU */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">SKU</label>
            <input
              value={form.sku}
              onChange={e => set('sku', e.target.value)}
              placeholder="Артикул"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Штрихкод */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Штрихкод</label>
            <div className="flex gap-1.5">
              <input
                value={form.barcode}
                onChange={e => set('barcode', e.target.value)}
                placeholder="EAN-13"
                className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="flex-shrink-0 px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                title="Сканировать"
              >
                <QrCode size={16} />
              </button>
              <button
                type="button"
                onClick={handleGenerateBarcode}
                className="flex-shrink-0 px-2.5 border border-gray-200 rounded-lg text-gray-500 hover:text-blue-600 hover:border-blue-300"
                title="Сгенерировать EAN-13"
              >
                <Barcode size={16} />
              </button>
            </div>
          </div>

          {/* Мин. остаток и единица */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Мин. остаток</label>
              <input
                type="number"
                value={form.min_stock}
                onChange={e => set('min_stock', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Единица</label>
              <select
                value={form.unit}
                onChange={e => set('unit', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="шт">шт</option>
                <option value="пара">пара</option>
                <option value="упак">упак</option>
                <option value="мл">мл</option>
                <option value="л">л</option>
              </select>
            </div>
          </div>

          {/* Атрибуты линз */}
          {isLenses && (
            <div className="border border-blue-100 bg-blue-50 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-blue-700">Параметры линз</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Оптическая сила (D)</label>
                  <input type="number" step="0.25"
                    onChange={e => setAttr('sphere', e.target.value)}
                    placeholder="-3.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Цилиндр</label>
                  <input type="number" step="0.25"
                    onChange={e => setAttr('cylinder', e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Диаметр (мм)</label>
                  <input type="number" step="0.1"
                    onChange={e => setAttr('diameter', e.target.value)}
                    placeholder="14.2"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">База (BC)</label>
                  <input type="number" step="0.1"
                    onChange={e => setAttr('base_curve', e.target.value)}
                    placeholder="8.6"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Атрибуты оправ */}
          {isFrames && (
            <div className="border border-purple-100 bg-purple-50 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-purple-700">Параметры оправы</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Цвет</label>
                  <input
                    onChange={e => setAttr('color', e.target.value)}
                    placeholder="Чёрный"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Размер</label>
                  <input
                    onChange={e => setAttr('size', e.target.value)}
                    placeholder="52-18-140"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Материал</label>
                  <select
                    onChange={e => setAttr('material', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                  >
                    <option value="">—</option>
                    <option value="metal">Металл</option>
                    <option value="plastic">Пластик</option>
                    <option value="titanium">Титан</option>
                    <option value="acetate">Ацетат</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Для кого</label>
                  <select
                    onChange={e => setAttr('gender', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                  >
                    <option value="">—</option>
                    <option value="male">Мужские</option>
                    <option value="female">Женские</option>
                    <option value="unisex">Унисекс</option>
                    <option value="kids">Детские</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {showScanner && (
          <BarcodeScanner
            onDetected={barcode => { set('barcode', barcode); setShowScanner(false); }}
            onClose={() => setShowScanner(false)}
          />
        )}

        {/* Footer */}
        {submitError && (
          <div className="px-5 pb-2">
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {submitError}
            </p>
          </div>
        )}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !form.name || !form.price}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Сохраняем...' : 'Добавить товар'}
          </button>
        </div>
      </div>
    </div>
  );
}
