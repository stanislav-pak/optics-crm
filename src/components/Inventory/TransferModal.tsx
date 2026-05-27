import { useState, useEffect, useRef } from 'react';
import { X, Search, ArrowRight, QrCode } from 'lucide-react';
import { supabase } from '../../services/supabase';
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
  onClose: () => void;
  onSuccess: () => void;
}

export default function TransferModal({ branchId, employeeId, onClose, onSuccess }: Props) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [fromBranchId, setFromBranchId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Загружаем филиалы — Склад первым
  useEffect(() => {
    supabase.from('branches').select('id, name, is_warehouse').order('name')
      .then(({ data }) => {
        if (!data) return;
        const sorted = [...data].sort((a, b) => (b.is_warehouse ? 1 : 0) - (a.is_warehouse ? 1 : 0));
        setBranches(sorted);
        const warehouse = sorted.find(b => b.is_warehouse);
        if (warehouse) setFromBranchId(warehouse.id);
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
      .then(({ data }) => setStockItems((data ?? []) as StockItem[]));
    setSelectedStock(null);
    setQuantity(1);
  }, [fromBranchId]);

  // Закрываем дропдаун при клике вне
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowSearch(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
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

  const filteredStock = productSearch
    ? stockItems.filter(s =>
        s.product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        s.product.sku?.toLowerCase().includes(productSearch.toLowerCase()) ||
        s.product.barcode?.includes(productSearch)
      ).slice(0, 8)
    : [];

  const handleBarcodeDetected = (barcode: string) => {
    const found = stockItems.find(s => s.product.barcode === barcode);
    if (found) {
      setSelectedStock(found);
      setQuantity(1);
      setProductSearch('');
      setShowSearch(false);
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
    setError(null);
    setLoading(true);

    try {
      const productId = selectedStock.product.id;

      // Актуальные остатки
      const [fromRes, toRes] = await Promise.all([
        supabase.from('stock').select('quantity').eq('product_id', productId).eq('branch_id', fromBranchId).maybeSingle(),
        supabase.from('stock').select('quantity').eq('product_id', productId).eq('branch_id', toBranchId).maybeSingle(),
      ]);

      const currentFrom = fromRes.data?.quantity ?? 0;
      const currentTo = toRes.data?.quantity ?? 0;

      if (quantity > currentFrom) {
        setError(`Недостаточно товара: доступно ${currentFrom} ${unit}`);
        setLoading(false);
        return;
      }

      // Уменьшаем остаток на fromBranch
      const { error: fromErr } = await supabase
        .from('stock')
        .update({ quantity: currentFrom - quantity })
        .eq('product_id', productId)
        .eq('branch_id', fromBranchId);
      if (fromErr) throw fromErr;

      // Upsert остаток на toBranch
      const { error: toErr } = await supabase
        .from('stock')
        .upsert(
          { product_id: productId, branch_id: toBranchId, quantity: currentTo + quantity },
          { onConflict: 'product_id,branch_id' }
        );
      if (toErr) throw toErr;

      // Два движения
      const movements = [
        {
          product_id: productId,
          branch_id: fromBranchId,
          type: 'transfer' as const,
          quantity,
          reference_type: 'transfer',
          notes: `Перемещение в ${toBranchName}`,
          created_by: employeeId,
        },
        {
          product_id: productId,
          branch_id: toBranchId,
          type: 'transfer' as const,
          quantity,
          reference_type: 'transfer',
          notes: `Перемещение из ${fromBranchName}`,
          created_by: employeeId,
        },
      ];

      const { error: movErr } = await supabase.from('stock_movements').insert(movements);
      if (movErr) throw movErr;

      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

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
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {branches.map(b => (
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
            {fromBranchId === toBranchId && toBranchId && (
              <p className="text-xs text-red-500 mt-1">Филиалы должны быть разными</p>
            )}
          </div>

          {/* Товар */}
          <div ref={searchRef} className="relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">Товар</label>
            {selectedStock ? (
              <div className="flex items-center justify-between border border-blue-200 bg-blue-50 rounded-lg px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{selectedStock.product.name}</p>
                  <p className="text-xs text-gray-500">
                    Доступно:{' '}
                    <span className={available === 0 ? 'text-red-500 font-medium' : 'text-gray-700 font-medium'}>
                      {available} {unit}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedStock(null); setProductSearch(''); setQuantity(1); }}
                  className="ml-2 text-gray-400 hover:text-gray-600 flex-shrink-0"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={productSearch}
                      onChange={e => { setProductSearch(e.target.value); setShowSearch(true); }}
                      onFocus={() => setShowSearch(true)}
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
                {showSearch && productSearch && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-44 overflow-y-auto">
                    {filteredStock.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-400">Не найдено</div>
                    ) : filteredStock.map(s => (
                      <button
                        key={s.id}
                        onMouseDown={e => {
                          e.preventDefault();
                          setSelectedStock(s);
                          setProductSearch('');
                          setShowSearch(false);
                          setQuantity(1);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                      >
                        <p className="text-sm text-gray-900">{s.product.name}</p>
                        <p className="text-xs text-gray-400">
                          Остаток: {s.quantity} {s.product.unit ?? 'шт'}
                          {s.product.sku ? ` · ${s.product.sku}` : ''}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </>
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

          {/* Итоговый баннер */}
          {selectedStock && toBranchId && fromBranchId !== toBranchId && quantity > 0 && quantity <= available && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
              Переместить <strong>{quantity} {unit}</strong> товара «{selectedStock.product.name}» из <strong>{fromBranchName}</strong> в <strong>{toBranchName}</strong>
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
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Перемещаем...' : 'Переместить'}
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
