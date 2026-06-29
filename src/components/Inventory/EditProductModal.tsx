import { useState, useEffect } from 'react';
import { X, Search, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { updateProduct, getCategories, getBrands } from '../../services/inventory';
import { supabase } from '../../services/supabase';
import type { Product, ProductCategory, Brand } from '../../types';
import InlineCreate from './InlineCreate';

const str = (v: string | number | undefined) => v === undefined || v === null ? '' : String(v);

interface Props {
  product: Product;
  role: 'manager' | 'branch_admin' | 'admin';
  onClose: () => void;
  onSave: (updated: Product) => void;
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

export default function EditProductModal({ product, role, onClose, onSave }: Props) {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: product.name,
    category_id: product.category_id ?? '',
    brand_id: product.brand_id ?? '',
    price: String(product.price),
    cost_price: String(product.cost_price ?? ''),
    sku: product.sku ?? '',
    barcode: product.barcode ?? '',
    min_stock: String(product.min_stock ?? 0),
    description: str(product.attributes?.description),
    product_group: product.product_group ?? '',
    // Линзы
    sphere: str(product.attributes?.sphere),
    cylinder: str(product.attributes?.cylinder),
    axis: str(product.attributes?.axis),
    diameter: str(product.attributes?.diameter),
    base_curve: str(product.attributes?.base_curve),
    // Оправы
    color: str(product.attributes?.color),
    size: str(product.attributes?.size),
    material: str(product.attributes?.material),
    gender: str(product.attributes?.gender),
  });

  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewBrand, setShowNewBrand] = useState(false);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);

  const [nktLoading, setNktLoading] = useState(false);
  const [nktResult, setNktResult] = useState<{ nameRu: string; ntin: string } | null>(null);
  const [nktStatus, setNktStatus] = useState<'idle' | 'not_found' | 'error'>('idle');

  const lookupNkt = async (gtin: string) => {
    setNktLoading(true);
    setNktResult(null);
    setNktStatus('idle');
    try {
      const { data, error } = await supabase.functions.invoke('nkt-lookup', { body: { gtin } });
      if (error) throw error;
      if (Array.isArray(data) && data.length > 0) {
        setNktResult({ nameRu: data[0].nameRu, ntin: data[0].ntin });
      } else {
        setNktStatus('not_found');
      }
    } catch {
      setNktStatus('error');
    } finally {
      setNktLoading(false);
    }
  };

  const handleNktLookup = () => {
    const gtin = form.barcode.trim();
    if (!/^\d{13,14}$/.test(gtin)) {
      setNktStatus('error');
      setNktResult(null);
      return;
    }
    lookupNkt(gtin);
  };

  // Авто-проверка при открытии если штрихкод выглядит как реальный EAN
  useEffect(() => {
    const barcode = product.barcode?.trim() ?? '';
    if (/^\d{13,14}$/.test(barcode)) {
      lookupNkt(barcode);
    }
  }, []);

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const selectedCategory = categories.find(c => c.id === form.category_id);
  const isLenses = selectedCategory?.slug?.includes('lens') || selectedCategory?.slug?.includes('contact');
  const isFrames = selectedCategory?.slug?.includes('frame') || selectedCategory?.slug?.includes('glass') || selectedCategory?.slug?.includes('sun');

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

  useEffect(() => {
    getCategories().then(data => setCategories(sortAlpha(data))).catch(console.error);
    getBrands().then(data => setBrands(sortAlpha(data))).catch(console.error);
    supabase.from('products').select('product_group').not('product_group', 'is', null).then(({ data }) => {
      const unique = [...new Set((data ?? []).map((d: { product_group: string | null }) => d.product_group).filter(Boolean))] as string[];
      setGroups(unique.sort((a, b) => a.localeCompare(b, 'ru')));
    });
  }, []);

  // Свайп вправо — закрыть
  useEffect(() => {
    const start = { x: 0, y: 0 };
    const onStart = (e: TouchEvent) => { start.x = e.touches[0].clientX; start.y = e.touches[0].clientY; };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = Math.abs(e.changedTouches[0].clientY - start.y);
      if (dx > 60 && dy < 80) onClose();
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, []);

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.price) return;
    setError(null);
    setLoading(true);
    try {
      const num = (v: string) => v.trim() !== '' ? parseFloat(v) : undefined;
      const attrs = {
        ...product.attributes,
        description: form.description.trim() || undefined,
        // Линзы
        sphere: num(form.sphere),
        cylinder: num(form.cylinder),
        axis: num(form.axis),
        diameter: num(form.diameter),
        base_curve: num(form.base_curve),
        // Оправы
        color: form.color.trim() || undefined,
        size: form.size.trim() || undefined,
        material: form.material.trim() || undefined,
        gender: (form.gender.trim() || undefined) as 'male' | 'female' | 'unisex' | 'kids' | undefined,
      };

      const updates: Partial<Product> = {
        name: form.name.trim(),
        category_id: form.category_id || undefined,
        brand_id: form.brand_id || undefined,
        price: parseFloat(form.price),
        ...(role !== 'manager' ? { cost_price: parseFloat(form.cost_price || '0') } : {}),
        sku: form.sku || undefined,
        barcode: form.barcode || undefined,
        min_stock: parseInt(form.min_stock || '0'),
        attributes: attrs,
        product_group: form.product_group.trim() || null,
      };

      const updated = await updateProduct(product.id, updates);
      onSave(updated);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const selectCls = inputCls + ' bg-white';

  return (
    <div data-modal="true" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Редактировать товар</h2>
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
              placeholder="Название товара"
              className={inputCls}
            />
          </div>

          {/* Категория и бренд */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Категория</label>
              <select
                value={form.category_id}
                onChange={e => e.target.value === '__new__' ? (setShowNewCategory(true), setShowNewBrand(false), set('category_id', '')) : set('category_id', e.target.value)}
                className={selectCls}
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
                className={selectCls}
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
          <div className={role !== 'manager' ? 'grid grid-cols-2 gap-3' : ''}>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Цена продажи ₸ *</label>
              <input
                type="number"
                value={form.price}
                onChange={e => set('price', e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
            {role !== 'manager' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Себестоимость ₸</label>
                <input
                  type="number"
                  value={form.cost_price}
                  onChange={e => set('cost_price', e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
            )}
          </div>

          {/* SKU */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Артикул</label>
            <input
              value={form.sku}
              onChange={e => set('sku', e.target.value)}
              placeholder="SKU"
              className={inputCls}
            />
          </div>

          {/* Штрихкод + НКТ */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Штрихкод</label>
            <div className="flex gap-2">
              <input
                value={form.barcode}
                onChange={e => { set('barcode', e.target.value); setNktResult(null); setNktStatus('idle'); }}
                placeholder="EAN-13 / GTIN"
                className={inputCls}
              />
              <button
                type="button"
                onClick={handleNktLookup}
                disabled={nktLoading || !form.barcode.trim()}
                title="Проверить в Национальном каталоге товаров"
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {nktLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                НКТ
              </button>
            </div>
            {nktResult && (
              <div className="mt-2 flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <CheckCircle size={14} className="text-green-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-green-800">
                  <span className="font-medium">Найдено в НКТ:</span> {nktResult.nameRu}
                  {nktResult.ntin && <span className="text-green-600 ml-1">(NTIN: {nktResult.ntin})</span>}
                </div>
              </div>
            )}
            {nktStatus === 'not_found' && (
              <div className="mt-2 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
                <span className="text-xs text-amber-700">Не найден в НКТ — можно оставить как есть</span>
              </div>
            )}
            {nktStatus === 'error' && (
              <div className="mt-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                <span className="text-xs text-red-700">Введите корректный штрихкод (13–14 цифр) или ошибка сети</span>
              </div>
            )}
          </div>

          {/* Мин. остаток */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Мин. остаток</label>
            <input
              type="number"
              value={form.min_stock}
              onChange={e => set('min_stock', e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Группа */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">Группа</label>
            <input
              value={form.product_group}
              onChange={e => set('product_group', e.target.value)}
              onFocus={() => setShowGroupDropdown(true)}
              onBlur={() => setTimeout(() => setShowGroupDropdown(false), 150)}
              placeholder="Выберите или введите новую группу"
              className={inputCls}
              autoComplete="off"
            />
            {form.product_group && (
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => set('product_group', '')}
                className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
            {showGroupDropdown && groups.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {groups
                  .filter(g => !form.product_group || g.toLowerCase().includes(form.product_group.toLowerCase()))
                  .map(g => (
                    <button
                      key={g}
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { set('product_group', g); setShowGroupDropdown(false); }}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 hover:text-blue-700"
                    >
                      {g}
                    </button>
                  ))
                }
              </div>
            )}
          </div>

          {/* Параметры линз */}
          {isLenses && (
            <div className="border border-blue-100 bg-blue-50 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-blue-700">Параметры линз</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Оптическая сила (D)</label>
                  <input type="number" step="0.25"
                    value={form.sphere}
                    onChange={e => set('sphere', e.target.value)}
                    placeholder="-3.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Цилиндр</label>
                  <input type="number" step="0.25"
                    value={form.cylinder}
                    onChange={e => set('cylinder', e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Градусы (AX)</label>
                  <input type="number" step="1" min="0" max="180"
                    value={form.axis}
                    onChange={e => set('axis', e.target.value)}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Диаметр (мм)</label>
                  <input type="number" step="0.1"
                    value={form.diameter}
                    onChange={e => set('diameter', e.target.value)}
                    placeholder="14.2"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">База (BC)</label>
                  <input type="number" step="0.1"
                    value={form.base_curve}
                    onChange={e => set('base_curve', e.target.value)}
                    placeholder="8.6"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Параметры оправы */}
          {isFrames && (
            <div className="border border-purple-100 bg-purple-50 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-purple-700">Параметры оправы</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Цвет</label>
                  <input
                    value={form.color}
                    onChange={e => set('color', e.target.value)}
                    placeholder="Чёрный"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Размер</label>
                  <input
                    value={form.size}
                    onChange={e => set('size', e.target.value)}
                    placeholder="52-18-140"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Материал</label>
                  <select
                    value={form.material}
                    onChange={e => set('material', e.target.value)}
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
                    value={form.gender}
                    onChange={e => set('gender', e.target.value)}
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

          {/* Описание */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Описание</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              placeholder="Необязательно..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-5 pb-2">
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !form.name.trim() || !form.price}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
