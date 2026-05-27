import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../services/supabase';
import type { Branch } from '../../types';

interface StockItem {
  id: string;
  quantity: number;
  product: { id: string; name: string; sku?: string };
}

interface Movement {
  id: string;
  quantity: number;
  notes?: string;
  created_at: string;
  product: { id: string; name: string };
}

interface Props {
  branch: Branch;
  onClose: () => void;
}

export default function BranchDetailModal({ branch, onClose }: Props) {
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase
        .from('stock')
        .select('*, product:products(id, name, sku)')
        .eq('branch_id', branch.id)
        .order('quantity', { ascending: false }),
      supabase
        .from('stock_movements')
        .select('*, product:products(id, name)')
        .eq('branch_id', branch.id)
        .eq('type', 'transfer')
        .order('created_at', { ascending: false })
        .limit(20),
    ]).then(([stockRes, movRes]) => {
      setStockItems((stockRes.data ?? []) as StockItem[]);
      setMovements((movRes.data ?? []) as Movement[]);
    }).finally(() => setLoading(false));
  }, [branch.id]);

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
            {branch.is_warehouse && <span className="text-base">🏭</span>}
            <h2 className="text-base font-semibold text-gray-900">{branch.name}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* РАЗДЕЛ 1: Товары и остатки */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Товары и остатки
                </p>
                {stockItems.length === 0 ? (
                  <p className="text-sm text-gray-400 py-3">Нет товаров на складе</p>
                ) : (
                  <div className="bg-gray-50 rounded-xl divide-y divide-gray-100">
                    {stockItems.map(s => (
                      <div key={s.id} className="flex items-center justify-between px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900 truncate">{s.product?.name ?? '—'}</p>
                          {s.product?.sku && (
                            <p className="text-xs text-gray-400">{s.product.sku}</p>
                          )}
                        </div>
                        <span className={`text-sm font-semibold ml-3 flex-shrink-0 tabular-nums ${s.quantity === 0 ? 'text-red-500' : 'text-gray-900'}`}>
                          {s.quantity} шт
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* РАЗДЕЛ 2: История перемещений */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  История перемещений
                </p>
                {movements.length === 0 ? (
                  <p className="text-sm text-gray-400 py-3">Нет перемещений</p>
                ) : (
                  <div className="bg-gray-50 rounded-xl divide-y divide-gray-100">
                    {movements.map(m => (
                      <div key={m.id} className="px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-gray-900 truncate flex-1">{m.product?.name ?? '—'}</p>
                          <span className="text-sm font-semibold text-blue-600 flex-shrink-0 tabular-nums">
                            {m.quantity} шт
                          </span>
                        </div>
                        {m.notes && (
                          <p className="text-xs text-gray-400 mt-0.5">{m.notes}</p>
                        )}
                        <p className="text-xs text-gray-300 mt-0.5">
                          {new Date(m.created_at).toLocaleDateString('ru-RU')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
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
