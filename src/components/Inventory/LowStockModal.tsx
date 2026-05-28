import { useState, useEffect } from 'react';
import { X, AlertTriangle, Package } from 'lucide-react';
import { supabase } from '../../services/supabase';
import type { StockAlert } from '../../types';

interface LastPurchase {
  date: string;
  supplierName: string;
  quantity: number;
}

interface Props {
  alerts: StockAlert[];
  branchId: string | undefined;
  onClose: () => void;
}

export default function LowStockModal({ alerts, onClose }: Props) {
  const [lastPurchases, setLastPurchases] = useState<Record<string, LastPurchase>>({});
  const [loadingPurchases, setLoadingPurchases] = useState(true);

  // Загружаем последний приход для каждого товара одним запросом
  useEffect(() => {
    const productIds = alerts.map(a => a.product.id);
    if (productIds.length === 0) { setLoadingPurchases(false); return; }

    supabase
      .from('purchase_order_items')
      .select(`
        product_id,
        quantity,
        purchase_order:purchase_orders!purchase_order_id(
          received_at,
          created_at,
          status,
          supplier:suppliers(name)
        )
      `)
      .in('product_id', productIds)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        // Берём последний приход (received) для каждого product_id
        const map: Record<string, LastPurchase> = {};
        for (const item of data) {
          const po = item.purchase_order as any;
          if (!po || po.status !== 'received') continue;
          if (map[item.product_id]) continue; // уже есть более свежий
          map[item.product_id] = {
            date: po.received_at ?? po.created_at,
            supplierName: po.supplier?.name ?? '—',
            quantity: item.quantity,
          };
        }
        setLastPurchases(map);
      })
      .finally(() => setLoadingPurchases(false));
  }, [alerts]);

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

  return (
    <div data-modal="true" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-500" />
            <h2 className="text-base font-semibold text-gray-900">Заканчивается на складе</h2>
            <span className="bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full">
              {alerts.length}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {alerts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Нет товаров с низким остатком</p>
          ) : (
            alerts.map((a, i) => {
              const lp = lastPurchases[a.product.id];
              return (
                <div key={i} className="bg-white border border-red-100 rounded-xl p-4 space-y-2">
                  {/* Название + филиал */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 leading-snug">
                        {a.product.name}
                      </p>
                      {a.product.sku && (
                        <p className="text-xs text-gray-400 mt-0.5">{a.product.sku}</p>
                      )}
                    </div>
                    {a.branch?.name && (
                      <span className="flex-shrink-0 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {a.branch.name}
                      </span>
                    )}
                  </div>

                  {/* Остаток */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500">Остаток:</span>
                      <span className="text-sm font-bold text-red-600 tabular-nums">
                        {a.current_qty} {a.product.unit ?? 'шт'}
                      </span>
                    </div>
                    <span className="text-gray-300">/</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500">Мин:</span>
                      <span className="text-sm font-medium text-gray-700 tabular-nums">
                        {a.min_stock} {a.product.unit ?? 'шт'}
                      </span>
                    </div>
                  </div>

                  {/* Последний приход */}
                  <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
                    <Package size={13} className="text-gray-400 flex-shrink-0" />
                    {loadingPurchases ? (
                      <span className="text-xs text-gray-400">Загружаем...</span>
                    ) : lp ? (
                      <span className="text-xs text-gray-500">
                        Последний приход:{' '}
                        <span className="text-gray-700 font-medium">
                          {new Date(lp.date).toLocaleDateString('ru-RU')}
                        </span>
                        {' · '}{lp.supplierName}
                        {' · '}<span className="tabular-nums">{lp.quantity} шт</span>
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Приходов не было</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            Закрыть
          </button>
        </div>

      </div>
    </div>
  );
}
