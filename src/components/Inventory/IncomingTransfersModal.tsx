import { useState, useEffect } from 'react';
import { X, PackageCheck } from 'lucide-react';
import { getIncomingTransfers, confirmTransfer } from '../../services/inventory';

interface IncomingTransfer {
  id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  notes?: string;
  product: { id: string; name: string; sku?: string };
  from_branch: { id: string; name: string };
}

interface Props {
  branchId: string;
  employeeId: string;
  onClose: () => void;
  onUpdated: () => void;
}

export default function IncomingTransfersModal({ branchId, employeeId, onClose, onUpdated }: Props) {
  const [transfers, setTransfers] = useState<IncomingTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmedQtys, setConfirmedQtys] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTransfers();
  }, [branchId]);

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

  async function loadTransfers() {
    setLoading(true);
    try {
      const data = (await getIncomingTransfers(branchId)) as IncomingTransfer[];
      setTransfers(data);
      // Дефолтное подтверждённое количество = ожидаемое
      const qtys: Record<string, number> = {};
      data.forEach(t => { qtys[t.id] = t.quantity; });
      setConfirmedQtys(qtys);
    } catch (e) {
      console.error('getIncomingTransfers:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(transferId: string) {
    setError(null);
    setSubmitting(true);
    try {
      await confirmTransfer(transferId, confirmedQtys[transferId] ?? 0, employeeId);
      setTransfers(prev => prev.filter(t => t.id !== transferId));
      setExpandedId(null);
      onUpdated();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div data-modal="true" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <PackageCheck size={18} className="text-orange-500" />
            <h2 className="text-base font-semibold text-gray-900">Входящие перемещения</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : transfers.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              Нет ожидающих перемещений
            </div>
          ) : transfers.map(t => {
            const isExpanded = expandedId === t.id;
            const confirmedQty = confirmedQtys[t.id] ?? t.quantity;
            const discrepancy = t.quantity - confirmedQty;

            return (
              <div
                key={t.id}
                className={`border rounded-xl overflow-hidden transition-colors ${
                  isExpanded ? 'border-orange-200' : 'border-gray-200'
                }`}
              >
                {/* Карточка перемещения */}
                <div className="px-4 py-3 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {t.product?.name ?? '—'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Из: <span className="text-gray-600">{t.from_branch?.name ?? '—'}</span>
                      </p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs bg-orange-50 text-orange-600 border border-orange-100 px-2 py-0.5 rounded-full font-medium">
                          Ожидается: {t.quantity} шт
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(t.created_at).toLocaleDateString('ru-RU')}
                        </span>
                      </div>
                    </div>
                    {!isExpanded && (
                      <button
                        onClick={() => setExpandedId(t.id)}
                        className="flex-shrink-0 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        Принять
                      </button>
                    )}
                  </div>
                </div>

                {/* Форма подтверждения */}
                {isExpanded && (
                  <div className="border-t border-orange-100 bg-orange-50 px-4 py-3 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Фактически получено
                      </label>
                      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                        <button
                          type="button"
                          onMouseDown={e => {
                            e.preventDefault();
                            setConfirmedQtys(prev => ({ ...prev, [t.id]: Math.max(0, (prev[t.id] ?? t.quantity) - 1) }));
                          }}
                          className="px-4 py-2 bg-gray-50 text-gray-600 hover:bg-gray-100 text-lg font-medium border-r border-gray-200 flex-shrink-0"
                        >−</button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={confirmedQty === 0 ? '' : String(confirmedQty)}
                          onChange={e => {
                            const val = parseInt(e.target.value.replace(/[^0-9]/g, '') || '0');
                            setConfirmedQtys(prev => ({ ...prev, [t.id]: Math.min(val, t.quantity) }));
                          }}
                          className="flex-1 text-center text-sm py-2 border-0 focus:outline-none"
                        />
                        <button
                          type="button"
                          onMouseDown={e => {
                            e.preventDefault();
                            setConfirmedQtys(prev => ({ ...prev, [t.id]: Math.min((prev[t.id] ?? t.quantity) + 1, t.quantity) }));
                          }}
                          className="px-4 py-2 bg-gray-50 text-gray-600 hover:bg-gray-100 text-lg font-medium border-l border-gray-200 flex-shrink-0"
                        >+</button>
                      </div>

                      {discrepancy > 0 && (
                        <p className="text-xs text-red-500 mt-1 font-medium">
                          ⚠️ Расхождение: {discrepancy} шт
                        </p>
                      )}
                      {discrepancy === 0 && confirmedQty > 0 && (
                        <p className="text-xs text-green-600 mt-1">✓ Количество совпадает</p>
                      )}
                    </div>

                    {error && (
                      <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => { setExpandedId(null); setError(null); }}
                        className="flex-1 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-white bg-white"
                      >
                        Отмена
                      </button>
                      <button
                        onClick={() => handleConfirm(t.id)}
                        disabled={submitting || confirmedQty === 0}
                        className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                      >
                        {submitting ? 'Подтверждаем...' : 'Подтвердить'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
