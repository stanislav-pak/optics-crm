import { useState, useEffect, useRef } from 'react';
import { X, PackageCheck, AlertTriangle, CheckCircle } from 'lucide-react';
import { getIncomingTransfers, confirmTransfer } from '../../services/inventory';

interface IncomingTransfer {
  id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  notes?: string;
  order_id?: string | null;
  product: { id: string; name: string; sku?: string };
  from_branch: { id: string; name: string };
  order?: { id: string; client_name?: string; client_phone?: string } | null;
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
  const [confirmedQtys, setConfirmedQtys] = useState<Record<string, number>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef<Record<string, boolean>>({});

  useEffect(() => { loadTransfers(); }, [branchId]);

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
    if (submittingRef.current[transferId]) return;
    submittingRef.current[transferId] = true;
    setError(null);
    setSubmittingId(transferId);
    try {
      await confirmTransfer(transferId, confirmedQtys[transferId] ?? 0, employeeId);
      setTransfers(prev => prev.filter(t => t.id !== transferId));
      onUpdated();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      submittingRef.current[transferId] = false;
      setSubmittingId(null);
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
            {transfers.length > 0 && (
              <span className="bg-orange-100 text-orange-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                {transfers.length}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : transfers.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              Нет ожидающих перемещений
            </div>
          ) : transfers.map(t => {
            const confirmedQty = confirmedQtys[t.id] ?? t.quantity;
            const discrepancy = t.quantity - confirmedQty;
            const isSubmitting = submittingId === t.id;

            return (
              <div key={t.id} className="border border-orange-200 rounded-xl overflow-hidden bg-white">

                {/* Шапка карточки */}
                <div className="px-4 py-3 bg-orange-50 border-b border-orange-100">
                  <p className="text-sm font-semibold text-gray-900 leading-snug">
                    {t.product?.name ?? '—'}
                  </p>
                  {t.product?.sku && (
                    <p className="text-xs text-gray-400 mt-0.5">{t.product.sku}</p>
                  )}
                  {t.order_id && (
                    <div className="mt-1.5 inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-xs font-medium px-2 py-0.5 rounded-full">
                      <span>🛒 Предзаказ:</span>
                      <span>{t.order?.client_name || t.order?.client_phone || 'клиент'}</span>
                    </div>
                  )}
                </div>

                {/* Детали */}
                <div className="px-4 py-3 space-y-2">
                  {/* Откуда + дата */}
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>
                      Откуда:{' '}
                      <span className="font-medium text-gray-700">
                        {t.from_branch?.name ?? '—'}
                      </span>
                    </span>
                    <span>{new Date(t.created_at).toLocaleDateString('ru-RU')}</span>
                  </div>

                  {/* Отправлено */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Отправлено:</span>
                    <span className="text-sm font-semibold text-orange-600 tabular-nums">
                      {t.quantity} шт
                    </span>
                  </div>

                  {/* Степпер: фактически получено */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Фактически получено
                    </label>
                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onMouseDown={e => {
                          e.preventDefault();
                          setConfirmedQtys(prev => ({
                            ...prev,
                            [t.id]: Math.max(0, (prev[t.id] ?? t.quantity) - 1),
                          }));
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
                          setConfirmedQtys(prev => ({
                            ...prev,
                            [t.id]: Math.min((prev[t.id] ?? t.quantity) + 1, t.quantity),
                          }));
                        }}
                        className="px-4 py-2 bg-gray-50 text-gray-600 hover:bg-gray-100 text-lg font-medium border-l border-gray-200 flex-shrink-0"
                      >+</button>
                    </div>

                    {/* Статус расхождения */}
                    {discrepancy > 0 ? (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />
                        <p className="text-xs text-red-500 font-medium">
                          Расхождение: {discrepancy} шт
                        </p>
                      </div>
                    ) : confirmedQty > 0 ? (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <CheckCircle size={12} className="text-green-500 flex-shrink-0" />
                        <p className="text-xs text-green-600">Количество совпадает</p>
                      </div>
                    ) : null}
                  </div>

                  {/* Ошибка */}
                  {error && submittingId === null && (
                    <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}

                  {/* Кнопка подтверждения */}
                  <button
                    onClick={() => handleConfirm(t.id)}
                    disabled={isSubmitting || confirmedQty === 0}
                    className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors mt-1"
                  >
                    {isSubmitting ? 'Подтверждаем...' : 'Подтвердить приёмку'}
                  </button>
                </div>
              </div>
            );
          })}

          {error && submittingId === null && transfers.length > 0 && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
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
