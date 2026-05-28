import { useState, useEffect, useRef } from 'react';
import { X, Search, Trash2, QrCode } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { createWriteoff } from '../../services/inventory';
import BarcodeScanner from '../Shared/BarcodeScanner';

interface Branch {
  id: string;
  name: string;
  is_warehouse?: boolean;
}

interface StockItem {
  id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    sku?: string;
    barcode?: string;
    unit?: string;
  };
}

interface Props {
  branchId: string;
  employeeId: string;
  role?: 'manager' | 'branch_admin' | 'admin';
  onClose: () => void;
  onSuccess: () => void;
}

export default function WriteoffModal({ branchId, employeeId, role = 'admin', onClose, onSuccess }: Props) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState(branchId);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  // Загружаем филиалы (только для admin)
  useEffect(() => {
    if (role !== 'admin') return;
    supabase.from('branches').select('id, name, is_warehouse').order('name')
      .then(({ data }) => {
        if (!data) return;
        const sorted = [...data].sort((a, b) => (b.is_warehouse ? 1 : 0) - (a.is_warehouse ? 1 : 0));
        setBranches(sorted);
      });
  }, []);

  // Загружаем остатки при смене selectedBranchId
  useEffect(() => {
    if (!selectedBranchId) return;
    supabase
      .from('stock')
      .select('*, product:products(id, name, sku, barcode, unit)')
      .eq('branch_id', selectedBranchId)
      .gt('quantity', 0)
      .then(({ data }) => {
        const sorted = ([...(data ?? [])] as StockItem[]).sort((a, b) =>
          a.product.name.localeCompare(b.product.name, 'ru')
        );
        setStockItems(sorted);
      });
    setSelectedStock(null);
    setQuantity(1);
  }, [selectedBranchId]);

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

  const filteredStock = productSearch
    ? stockItems.filter(s =>
        s.product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        s.product.sku?.toLowerCase().includes(productSearch.toLowerCase()) ||
        s.product.barcode?.includes(productSearch)
      )
    : stockItems;

  const handleBarcodeDetected = (barcode: string) => {
    const found = stockItems.find(s => s.product.barcode === barcode);
    if (found) {
      setSelectedStock(found);
      setQuantity(1);
      setProductSearch('');
    }
    setShowScanner(false);
  };

  const available = selectedStock?.quantity ?? 0;
  const unit = selectedStock?.product.unit ?? 'шт';

  const canSubmit =
    selectedBranchId &&
    selectedStock &&
    quantity > 0 &&
    quantity <= available &&
    reason.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || !selectedStock) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setError(null);
    setLoading(true);
    try {
      await createWriteoff(
        selectedBranchId,
        selectedStock.product.id,
        quantity,
        reason.trim(),
        employeeId
      );
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div data-modal="true" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Trash2 size={18} className="text-red-500" />
            <h2 className="text-base font-semibold text-gray-900">Списание товара</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Выбор филиала (только для admin) */}
          {role === 'admin' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Склад / Филиал</label>
              <select
                value={selectedBranchId}
                onChange={e => setSelectedBranchId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.is_warehouse ? '🏭 ' : ''}{b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Товар */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Товар</label>

            {/* Поиск + сканер */}
            <div className="flex gap-2 mb-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="Поиск по названию, SKU, штрихкоду..."
                  className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); setShowScanner(true); }}
                className="flex items-center justify-center w-10 h-10 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex-shrink-0"
                title="Сканировать штрихкод"
              >
                <QrCode size={18} />
              </button>
            </div>

            {/* Список товаров */}
            {filteredStock.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">
                {stockItems.length === 0 ? 'Нет товаров на этом складе' : 'Ничего не найдено'}
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto divide-y divide-gray-100">
                {filteredStock.map(s => {
                  const isSelected = selectedStock?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setSelectedStock(isSelected ? null : s); setQuantity(1); }}
                      className={`w-full text-left px-4 py-2.5 transition-colors ${
                        isSelected
                          ? 'bg-red-50 border-l-2 border-l-red-500'
                          : 'hover:bg-gray-50 border-l-2 border-l-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${isSelected ? 'text-red-700' : 'text-gray-900'}`}>
                            {s.product.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            На складе: <span className="font-medium text-gray-600">{s.quantity} {s.product.unit ?? 'шт'}</span>
                            {s.product.sku ? ` · ${s.product.sku}` : ''}
                          </p>
                        </div>
                        {isSelected && (
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Количество */}
          {selectedStock && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Количество (макс. {available} {unit})
              </label>
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); setQuantity(q => Math.max(1, q - 1)); }}
                  className="px-4 py-2.5 bg-gray-50 text-gray-600 hover:bg-gray-100 text-lg font-medium border-r border-gray-200 flex-shrink-0"
                >−</button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={quantity === 0 ? '' : String(quantity)}
                  onChange={e => {
                    const val = parseInt(e.target.value.replace(/[^0-9]/g, '') || '0');
                    setQuantity(Math.min(val, available));
                  }}
                  className="flex-1 text-center text-sm py-2.5 border-0 focus:outline-none"
                />
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); setQuantity(q => Math.min(q + 1, available)); }}
                  className="px-4 py-2.5 bg-gray-50 text-gray-600 hover:bg-gray-100 text-lg font-medium border-l border-gray-200 flex-shrink-0"
                >+</button>
              </div>
              {quantity > available && (
                <p className="text-xs text-red-500 mt-1">Превышает доступное количество</p>
              )}
            </div>
          )}

          {/* Причина */}
          {selectedStock && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Причина списания <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Укажите причину (брак, истёк срок, повреждение...)"
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
              {reason.trim().length === 0 && (
                <p className="text-xs text-gray-400 mt-1">Причина обязательна для заполнения</p>
              )}
            </div>
          )}

          {/* Итоговый баннер */}
          {selectedStock && quantity > 0 && quantity <= available && reason.trim().length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
              Списать <strong>{quantity} {unit}</strong> «{selectedStock.product.name}»
              <p className="text-xs mt-0.5 text-red-400">Причина: {reason.trim()}</p>
            </div>
          )}
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
            disabled={loading || !canSubmit}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Списываем...' : 'Списать'}
          </button>
        </div>
      </div>

      {showScanner && (
        <BarcodeScanner
          onDetected={handleBarcodeDetected}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
