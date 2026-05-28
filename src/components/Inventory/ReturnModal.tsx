import { useState, useEffect, useRef } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { createReturn } from '../../services/inventory';
import type { Sale, SaleStatus } from '../../types';

interface Props {
  sale: Sale;
  employeeId: string;
  onClose: () => void;
  onSuccess: (newStatus: SaleStatus) => void;
}

export default function ReturnModal({ sale, employeeId, onClose, onSuccess }: Props) {
  const items = sale.items ?? [];

  // Количество к возврату по каждой позиции (product_id → qty)
  const [qtys, setQtys] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map(i => [i.product_id, 0]))
  );
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  // Свайп вниз — закрыть
  useEffect(() => {
    const start = { x: 0, y: 0 };
    const onStart = (e: TouchEvent) => { start.x = e.touches[0].clientX; start.y = e.touches[0].clientY; };
    const onEnd = (e: TouchEvent) => {
      const dy = e.changedTouches[0].clientY - start.y;
      const dx = Math.abs(e.changedTouches[0].clientX - start.x);
      if (dy > 80 && dx < 60) onClose();
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [onClose]);

  const totalReturnQty = Object.values(qtys).reduce((s, q) => s + q, 0);

  const canSubmit =
    totalReturnQty > 0 &&
    reason.trim().length > 0 &&
    !loading;

  const handleSubmit = async () => {
    if (!canSubmit || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setError(null);
    setLoading(true);
    try {
      const returnItems = items
        .map(i => ({ product_id: i.product_id, quantity: qtys[i.product_id] ?? 0 }))
        .filter(i => i.quantity > 0);

      const newStatus = await createReturn(sale.id, returnItems, reason.trim(), employeeId);
      onSuccess(newStatus);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const saleDate = new Date(sale.created_at).toLocaleDateString('ru-RU');
  const clientName = (sale.client as any)?.name || (sale.client as any)?.phone || 'Без клиента';

  return (
    <div
      data-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-3xl flex flex-col"
        style={{ backgroundColor: '#111b21', maxHeight: '85vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#374045' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <RotateCcw size={16} style={{ color: '#60a5fa' }} />
            <span className="text-sm font-semibold" style={{ color: '#e9edef' }}>
              Оформить возврат
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-full" style={{ color: '#8696a0' }}>
            <X size={20} />
          </button>
        </div>

        {/* Инфо о продаже */}
        <div
          className="mx-5 mb-3 rounded-2xl px-4 py-3 flex-shrink-0"
          style={{ backgroundColor: '#202c33' }}
        >
          <p className="text-sm font-medium" style={{ color: '#e9edef' }}>{clientName}</p>
          <p className="text-xs mt-0.5" style={{ color: '#8696a0' }}>
            {saleDate} · ₸{sale.total.toLocaleString()}
            {sale.branch ? ` · ${(sale.branch as any).name}` : ''}
          </p>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 pb-4 space-y-3">

          {/* Позиции */}
          <div
            className="rounded-2xl overflow-hidden divide-y"
            style={{ backgroundColor: '#202c33', borderColor: '#2a3942' }}
          >
            {items.map(item => {
              const productName = (item.product as any)?.name ?? '—';
              const maxQty = item.quantity;
              const qty = qtys[item.product_id] ?? 0;

              return (
                <div key={item.product_id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: '#e9edef' }}>
                        {productName}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: '#8696a0' }}>
                        В продаже: {maxQty} шт · ₸{item.price.toLocaleString()} / шт
                      </p>
                    </div>
                  </div>

                  {/* Степпер */}
                  <div
                    className="flex items-center rounded-xl overflow-hidden"
                    style={{ backgroundColor: '#111b21', border: '1px solid #2a3942' }}
                  >
                    <button
                      type="button"
                      onMouseDown={e => { e.preventDefault(); setQtys(prev => ({ ...prev, [item.product_id]: Math.max(0, (prev[item.product_id] ?? 0) - 1) })); }}
                      className="px-4 py-2 text-lg font-medium flex-shrink-0"
                      style={{ color: '#8696a0' }}
                    >−</button>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={qty === 0 ? '' : String(qty)}
                      onChange={e => {
                        const val = parseInt(e.target.value.replace(/[^0-9]/g, '') || '0');
                        setQtys(prev => ({ ...prev, [item.product_id]: Math.min(val, maxQty) }));
                      }}
                      className="flex-1 text-center text-sm py-2 bg-transparent border-0 focus:outline-none"
                      style={{ color: qty > 0 ? '#60a5fa' : '#8696a0' }}
                    />
                    <button
                      type="button"
                      onMouseDown={e => { e.preventDefault(); setQtys(prev => ({ ...prev, [item.product_id]: Math.min((prev[item.product_id] ?? 0) + 1, maxQty) })); }}
                      className="px-4 py-2 text-lg font-medium flex-shrink-0"
                      style={{ color: '#8696a0' }}
                    >+</button>
                  </div>

                  {qty > 0 && (
                    <p className="text-xs mt-1.5" style={{ color: '#60a5fa' }}>
                      Вернуть: {qty} шт · ₸{(qty * item.price).toLocaleString()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Причина */}
          <div>
            <p className="text-xs font-medium mb-1.5" style={{ color: '#8696a0' }}>
              Причина возврата <span style={{ color: '#f87171' }}>*</span>
            </p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Укажите причину (брак, не подошло, ошибка заказа...)"
              rows={3}
              className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none"
              style={{
                backgroundColor: '#202c33',
                border: '1px solid #2a3942',
                color: '#e9edef',
              }}
            />
          </div>

          {/* Итог */}
          {totalReturnQty > 0 && reason.trim().length > 0 && (
            <div
              className="rounded-2xl px-4 py-3 text-sm"
              style={{ backgroundColor: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}
            >
              <p style={{ color: '#60a5fa' }}>
                Вернуть <strong>{totalReturnQty} шт</strong> на склад
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#8696a0' }}>
                Причина: {reason.trim()}
              </p>
            </div>
          )}

          {/* Ошибка */}
          {error && (
            <div
              className="rounded-xl px-4 py-3 text-xs"
              style={{ backgroundColor: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-4 flex gap-3 flex-shrink-0"
          style={{ borderTop: '1px solid #2a3942' }}
        >
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm"
            style={{ border: '1px solid #374045', color: '#8696a0' }}
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity"
            style={{
              backgroundColor: canSubmit ? '#2563eb' : '#2a3942',
              color: canSubmit ? '#fff' : '#8696a0',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Оформляем...' : 'Оформить возврат'}
          </button>
        </div>
      </div>
    </div>
  );
}
