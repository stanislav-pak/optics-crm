import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { updateProduct, getCategories, getBrands } from '../../services/inventory';
import { supabase } from '../../services/supabase';
import type { Product, ProductCategory, Brand } from '../../types';
import InlineCreate from './InlineCreate';

interface Props {
  product: Product;
  onClose: () => void;
  onSave: (updated: Product) => void;
}

export default function EditProductModal({ product, onClose, onSave }: Props) {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
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
    description: String(product.attributes?.description ?? ''),
  });

  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewBrand, setShowNewBrand] = useState(false);

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const handleCreateCategory = async (name: string) => {
    const { data, error } = await supabase.from('product_categories').insert({ name }).select().single();
    if (error) throw error;
    setCategories(prev => [...prev, data as ProductCategory].sort((a, b) => a.name.localeCompare(b.name)));
    set('category_id', data.id);
    setShowNewCategory(false);
  };

  const handleCreateBrand = async (name: string) => {
    const { data, error } = await supabase.from('brands').insert({ name }).select().single();
    if (error) throw error;
    setBrands(prev => [...prev, data as Brand].sort((a, b) => a.name.localeCompare(b.name)));
    set('brand_id', data.id);
    setShowNewBrand(false);
  };

  useEffect(() => {
    getCategories().then(setCategories).catch(console.error);
    getBrands().then(setBrands).catch(console.error);
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
      const attrs = {
        ...product.attributes,
        ...(form.description.trim() ? { description: form.description.trim() } : { description: undefined }),
      };

      const updates: Partial<Product> = {
        name: form.name.trim(),
        category_id: form.category_id || undefined,
        brand_id: form.brand_id || undefined,
        price: parseFloat(form.price),
        cost_price: parseFloat(form.cost_price || '0'),
        sku: form.sku || undefined,
        barcode: form.barcode || undefined,
        min_stock: parseInt(form.min_stock || '0'),
        attributes: attrs,
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
          <div className="grid grid-cols-2 gap-3">
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
          </div>

          {/* SKU и штрихкод */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Артикул</label>
              <input
                value={form.sku}
                onChange={e => set('sku', e.target.value)}
                placeholder="SKU"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Штрихкод</label>
              <input
                value={form.barcode}
                onChange={e => set('barcode', e.target.value)}
                placeholder="EAN-13"
                className={inputCls}
              />
            </div>
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
