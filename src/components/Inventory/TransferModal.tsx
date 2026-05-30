import { useState, useEffect, useRef } from 'react';
import { X, Search, ArrowRight, QrCode } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { createTransfer } from '../../services/inventory';
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

export default function TransferModal({ branchId, employeeId, role = 'admin', onClose, onSuccess }: Props) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [fromBranchId, setFromBranchId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // useRef вместо useState: синхронная защита от двойного клика
  // (React батчит setState — второй клик до ре-рендера всё ещё видит loading=false)
  const isSubmittingRef = useRef(false);

  // Загружаем филиалы
  useEffect(() => {
    supabase.from('branches').select('id, name, is_warehouse').order('name')
      .then(({ data }) => {
        if (!data) return;
        const sorted = [...data].sort((a, b) => (b.is_warehouse ? 1 : 0) - (a.is_warehouse ? 1 : 0));
        setBranches(sorted);

        if (role === 'manager') {
          // Менеджер может отправлять только со своего филиала
          setFromBranchId(branchId);
        } else {
          // Admin/branch_admin — по умолчанию Склад
          const warehouse = sorted.find(b => b.is_warehouse);
          setFromBranchId(warehouse?.id ?? branchId);
        }
      });
  }, []);

  // Загружаем остатки при смене fromBranchId
  useEffect(() => {
    if (!fromBranchId) return;
    supabase
      .from('stock')
      .select('*, product:products(id, name, sku, barcode, unit)')
      .eq('branch_id', fromBranchId)
      .gt('quantity', 0)
      .then(({ data }) => {
        const sorted = ([...(data ?? [])] as StockItem[]).sort((a, b) =>
          a.product.name.localeCompare(b.product.name, 'ru')
        );
        setStockItems(sorted);
      });
    setSelectedStock(null);
    setQuantity(1);
  }, [fromBranchId]);

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

  const fromBranchName = branches.find(b => b.id === fromBranchId)?.name ?? '';
  const toBranchName = branches.find(b => b.id === toBranchId)?.name ?? '';
  const available = selectedStock?.quantity ?? 0;
  const unit = selectedStock?.product.unit ?? 'шт';

  const canSubmit =
    fromBranchId &&
    toBranchId &&
    fromBranchId !== toBranchId &&
    selectedStock &&
    quantity > 0 &&
    quantity <= available;

  const handleSubmit = async () => {
    if (!canSubmit || !selectedStock) return;
    // Синхронная защита: ref обновляется немедленно, до батчинга React
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setError(null);
    setLoading(true);
    try {
      await createTransfer(
        fromBranchId,
        toBranchId,
        selectedStock.product.id,
        quantity,
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

  // Какие ветки показывать в "Откуда"
  const fromBranches = role === 'manager'
    ? branches.filter(b => b.id === branchId)
    : branches;

  return (
    <div data-modal="true" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Перемещение товара</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Откуда / Куда */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Направление</label>
            <div className="flex items-center gap-2">
              <select
                value={fromBranchId}
                onChange={e => setFromBranchId(e.target.value)}
                disabled={role === 'manager'}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-60 disabled:bg-gray-50"
              >
                {fromBranches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.is_warehouse ? '🏭 ' : ''}{b.name}
                  </option>
                ))}
              </select>
              <ArrowRight size={16} className="text-gray-400 flex-shrink-0" />
              <select
                value={toBranchId}
                onChange={e => setToBranchId(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">— выбрать —</option>
                {branches.filter(b => b.id !== fromBranchId).map(b => (
                  <option key={b.id} value={b.id}>
                    {b.is_warehouse ? '🏭 ' : ''}{b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

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
                  className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

            {/* Список товаров */}
            {productSearch.length > 0 && (filteredStock.length === 0 ? (
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
                          ? 'bg-blue-50 border-l-2 border-l-blue-500'
                          : 'hover:bg-gray-50 border-l-2 border-l-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>
                            {s.product.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            Доступно: <span className="font-medium text-gray-600">{s.quantity} {s.product.unit ?? 'шт'}</span>
                            {s.product.sku ? ` · ${s.product.sku}` : ''}
                          </p>
                        </div>
                        {isSelected && (
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
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
            ))}
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

          {/* Итоговый баннер */}
          {selectedStock && toBranchId && fromBranchId !== toBranchId && quantity > 0 && quantity <= available && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
              Отправить <strong>{quantity} {unit}</strong> «{selectedStock.product.name}» из <strong>{fromBranchName}</strong> в <strong>{toBranchName}</strong>
              <p className="text-xs mt-0.5 text-blue-500">Получатель подтвердит приёмку</p>
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
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !canSubmit}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Отправляем...' : 'Отправить'}
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
