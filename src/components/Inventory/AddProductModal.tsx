import { useState, useEffect } from 'react';
import { X, QrCode } from 'lucide-react';
import { createProduct, getCategories, getBrands } from '../../services/inventory';
import type { ProductCategory, Brand, ProductAttributes } from '../../types';
import BarcodeScanner from '../Shared/BarcodeScanner';

interface Props {
  branchId: string;
  employeeId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddProductModal({ branchId, employeeId, onClose, onSuccess }: Props) {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    getCategories().then(setCategories);
    getBrands().then(setBrands);
  }, []);

  const selectedCategory = categories.find(c => c.id === form.category_id);
  const isLenses = selectedCategory?.slug?.includes('lens') || selectedCategory?.slug?.includes('contact');
  const isFrames = selectedCategory?.slug?.includes('frame') || selectedCategory?.slug?.includes('glass') || selectedCategory?.slug?.includes('sun');

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));
  const setAttr = (key: string, value: string) => setAttributes(a => ({ ...a, [key]: value }));

  const handleSubmit = async () => {
    if (!form.name || !form.price) return;
    setLoading(true);
    try {
      await createProduct({
        name: form.name,
        sku: form.sku || undefined,
        barcode: form.barcode || undefined,
        category_id: form.category_id || undefined,
        brand_id: form.brand_id || undefined,
        price: parseFloat(form.price),
        cost_price: parseFloat(form.cost_price || '0'),
        min_stock: parseInt(form.min_stock || '0'),
        unit: form.unit,
        attributes,
        is_active: true,
        branch_id: branchId,
        created_by: employeeId,
      });
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
                onChange={e => set('category_id', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">— выбрать —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.parent_id ? '  ' : ''}{c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Бренд</label>
              <select
                value={form.brand_id}
                onChange={e => set('brand_id', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">— выбрать —</option>
                {brands.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

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
            <div className="flex gap-2">
              <input
                value={form.barcode}
                onChange={e => set('barcode', e.target.value)}
                placeholder="EAN-13"
                className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="flex-shrink-0 px-3 border border-gray-200 rounded-lg text-gray-500 hover:text-blue-600 hover:border-blue-300"
                title="Сканировать"
              >
                <QrCode size={16} />
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
