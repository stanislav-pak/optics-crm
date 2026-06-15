import { useState, useEffect } from 'react';
import { X, QrCode, Check, AlertTriangle } from 'lucide-react';
import { createRevision, updateRevisionItem, completeRevision, getProductByBarcode } from '../../services/inventory';
import { supabase } from '../../services/supabase';
import BarcodeScanner from '../Shared/BarcodeScanner';
import type { Revision, RevisionItem, Product } from '../../types';

interface Props {
  branchId: string;
  employeeId: string;
  existingRevisionId?: string;
  onClose: () => void;
  onSuccess: () => void;
  role?: 'manager' | 'branch_admin' | 'admin';
}

export default function RevisionModal({ branchId, employeeId, existingRevisionId, onClose, onSuccess, role = 'manager' }: Props) {
  const [revision, setRevision] = useState<Revision | null>(null);
  const [items, setItems] = useState<(RevisionItem & { product?: Product })[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [search, setSearch] = useState('');
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  useEffect(() => {
    initRevision();
  }, []);

  // Свайп для закрытия
  useEffect(() => {
    const start = { x: 0, y: 0 };
    const onStart = (e: TouchEvent) => { start.x = e.touches[0].clientX; start.y = e.touches[0].clientY; };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = Math.abs(e.changedTouches[0].clientY - start.y);
      if (dx > 60 && dy < 80) handleCancel();
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => { document.removeEventListener('touchstart', onStart); document.removeEventListener('touchend', onEnd); };
  }, []);

  const initRevision = async () => {
    setLoading(true);
    try {
      let rev: Revision;
      if (existingRevisionId) {
        const { data } = await supabase.from('revisions').select('*').eq('id', existingRevisionId).single();
        rev = data;
      } else {
        rev = await createRevision(branchId, employeeId);
      }
      const { data } = await supabase
        .from('revision_items')
        .select('*, product:products(id, name, sku, barcode, unit)')
        .eq('revision_id', rev.id)
        .order('created_at');
      setRevision(rev);
      const sorted = [...(data ?? [])].sort((a, b) =>
        ((a.product as any)?.name ?? '').localeCompare((b.product as any)?.name ?? '', 'ru')
      );
      setItems(sorted);
    } catch (e: any) {
      alert('Ошибка: ' + (e?.message || String(e)));
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    // При продолжении существующей ревизии — просто закрываем, не удаляем
    if (!existingRevisionId && revision) {
      await supabase.from('revision_items').delete().eq('revision_id', revision.id);
      await supabase.from('revisions').delete().eq('id', revision.id);
    }
    onClose();
  };

  const updateQty = async (itemId: string, qty: number) => {
    await updateRevisionItem(itemId, qty);
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, actual_qty: qty, difference: qty - i.expected_qty } : i));
  };

  const handleBarcodeDetected = async (barcode: string) => {
    setShowScanner(false);
    try {
      const product = await getProductByBarcode(barcode);
      if (!product) {
        alert('Товар не найден в базе');
        return;
      }
      const item = items.find(i => (i.product as any)?.id === product.id);
      if (item) {
        const newQty = (item.actual_qty ?? 0) + 1;
        await updateQty(item.id, newQty);
        setLastScanned((item.product as any)?.name);
        setTimeout(() => setLastScanned(null), 2000);
      } else {
        alert('Товар не найден в ревизии');
      }
    } catch {
      alert('Товар не найден в базе');
    }
  };

  const handleComplete = async () => {
    if (!revision) return;
    const uncounted = items.filter(i => i.actual_qty === null).length;
    if (uncounted > 0) {
      if (!confirm(`${uncounted} позиций не подсчитано. Завершить ревизию?`)) return;
    }
    setCompleting(true);
    try {
      await completeRevision(revision.id, employeeId);
      onSuccess();
      onClose();
    } catch (e: any) {
      alert('Ошибка: ' + (e?.message || String(e)));
    } finally {
      setCompleting(false);
    }
  };

  const filteredItems = items.filter(i =>
    !search || (i.product as any)?.name?.toLowerCase().includes(search.toLowerCase()) ||
    (i.product as any)?.barcode?.includes(search)
  );

  const counted = items.filter(i => i.actual_qty !== null).length;
  const withDiff = items.filter(i => i.actual_qty !== null && i.difference !== 0).length;
  const progress = items.length > 0 ? Math.round(counted / items.length * 100) : 0;

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" data-modal="true">
        <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">{existingRevisionId ? 'Загружаем ревизию...' : 'Создаём ревизию...'}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col bg-white" data-modal="true">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Ревизия склада</h2>
            <p className="text-xs text-gray-400">{new Date().toLocaleDateString('ru-RU')}</p>
          </div>
          <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {/* Прогресс */}
        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
            <span>Подсчитано: {counted}/{items.length}</span>
            {role === 'admin' && (
              <span className={withDiff > 0 ? 'text-red-500' : 'text-green-500'}>
                Расхождений: {withDiff}
              </span>
            )}
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Уведомление о последнем скане */}
        {lastScanned && (
          <div className="mx-4 mt-2 flex-shrink-0 bg-green-50 border border-green-200 rounded-xl px-4 py-2 flex items-center gap-2">
            <Check size={14} className="text-green-500" />
            <span className="text-sm text-green-700">{lastScanned} +1</span>
          </div>
        )}

        {/* Поиск и сканер */}
        <div className="px-4 py-2 flex gap-2 flex-shrink-0">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск товара..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={() => setShowScanner(true)}
            className="px-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <QrCode size={16} />
          </button>
        </div>

        {/* Список товаров */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
          {filteredItems.map(item => {
            const diff = item.difference ?? 0;
            const isCounted = item.actual_qty !== null;
            return (
              <div key={item.id}
                className={`border rounded-xl p-3 space-y-2 ${
                  !isCounted ? 'border-gray-200' :
                  diff === 0 ? 'border-green-200 bg-green-50' :
                  'border-red-200 bg-red-50'
                }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{(item.product as any)?.name}</p>
                    {role === 'admin' && (
                      <p className="text-xs text-gray-400">Ожидается: {item.expected_qty} {(item.product as any)?.unit}</p>
                    )}
                  </div>
                  {isCounted && role === 'admin' && (
                    <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      diff === 0 ? 'bg-green-100 text-green-600' :
                      diff > 0 ? 'bg-blue-100 text-blue-600' :
                      'bg-red-100 text-red-600'
                    }`}>
                      {diff > 0 ? <AlertTriangle size={10} /> : diff < 0 ? <AlertTriangle size={10} /> : <Check size={10} />}
                      {diff > 0 ? `+${diff}` : diff === 0 ? '✓' : diff}
                    </div>
                  )}
                </div>

                {/* Ввод фактического количества */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-16 flex-shrink-0">Факт:</span>
                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white flex-1">
                    <button
                      onMouseDown={e => { e.preventDefault(); updateQty(item.id, Math.max(0, (item.actual_qty ?? 0) - 1)); }}
                      className="px-3 py-1.5 bg-gray-50 text-gray-600 hover:bg-gray-100 font-medium text-sm">−</button>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={item.actual_qty === null ? '' : item.actual_qty === 0 ? '0' : String(item.actual_qty)}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        updateQty(item.id, val === '' ? 0 : parseInt(val));
                      }}
                      placeholder="—"
                      className="flex-1 text-center text-sm py-1.5 border-0 focus:outline-none min-w-0"
                    />
                    <button
                      onMouseDown={e => { e.preventDefault(); updateQty(item.id, (item.actual_qty ?? 0) + 1); }}
                      className="px-3 py-1.5 bg-gray-50 text-gray-600 hover:bg-gray-100 font-medium text-sm">+</button>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">Товары не найдены</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-gray-100 flex-shrink-0 flex gap-3">
          <button onClick={handleCancel}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            {existingRevisionId ? 'Закрыть' : 'Отмена'}
          </button>
          <button onClick={handleComplete} disabled={completing || counted === 0}
            className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
            {completing ? 'Завершаем...' : `Завершить ревизию (${counted}/${items.length})`}
          </button>
        </div>
      </div>

      {showScanner && (
        <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />
      )}
    </>
  );
}
