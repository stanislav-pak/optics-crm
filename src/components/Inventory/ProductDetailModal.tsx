import { useState, useEffect } from 'react';
import { X, Pencil, Trash2, Printer } from 'lucide-react';
import { supabase } from '../../services/supabase';
import type { Product } from '../../types';
import PrintLabelModal from './PrintLabelModal';

interface PurchaseHistoryItem {
  id: string;
  created_at: string;
  supplier: { name: string } | null;
  quantity: number;
  cost_price: number;
  kind: 'purchase' | 'transfer';
  from_branch?: string;
}

interface Props {
  product: Product;
  stock: number;
  branchId: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ProductDetailModal({ product, stock, branchId, onClose, onEdit, onDelete }: Props) {
  const [history, setHistory] = useState<PurchaseHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showPrintLabel, setShowPrintLabel] = useState(false);

  const isLow = stock <= product.min_stock;

  useEffect(() => {
    setHistoryLoading(true);

    Promise.all([
      // Приходы из накладных
      supabase
        .from('purchase_orders')
        .select('id, created_at, supplier:suppliers(name), items:purchase_order_items(product_id, quantity, cost_price)')
        .eq('branch_id', branchId)
        .eq('status', 'received')
        .order('created_at', { ascending: false }),

      // Входящие перемещения
      supabase
        .from('stock_movements')
        .select('id, created_at, quantity, from_branch:branches!stock_movements_branch_id_fkey(name)')
        .eq('product_id', product.id)
        .eq('to_branch_id', branchId)
        .eq('type', 'transfer')
        .eq('status', 'completed')
        .order('created_at', { ascending: false }),
    ]).then(([poRes, mvRes]) => {
      const result: PurchaseHistoryItem[] = [];

      // Из накладных
      for (const po of (poRes.data ?? [])) {
        const matchedItems = (po.items as any[]).filter(i => i.product_id === product.id);
        for (const item of matchedItems) {
          result.push({
            id: `po_${po.id}_${item.cost_price}`,
            created_at: po.created_at,
            supplier: po.supplier as any,
            quantity: item.quantity,
            cost_price: item.cost_price,
            kind: 'purchase',
          });
        }
      }

      // Из перемещений
      for (const mv of (mvRes.data ?? [])) {
        result.push({
          id: `mv_${mv.id}`,
          created_at: mv.created_at,
          supplier: null,
          quantity: mv.quantity,
          cost_price: product.cost_price ?? 0,
          kind: 'transfer',
          from_branch: (mv.from_branch as any)?.name ?? '—',
        });
      }

      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setHistory(result);
      setHistoryLoading(false);
    });
  }, [product.id, branchId]);

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

  const attrs = product.attributes ?? {};
  const attrEntries = Object.entries(attrs).filter(([, v]) => v !== undefined && v !== null && v !== '');

  return (
    <div data-modal="true" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 truncate pr-2">{product.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* Основная информация */}
          <section className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Основная информация</p>
            <div className="bg-gray-50 rounded-xl divide-y divide-gray-100">
              {(product.category as any)?.name && (
                <Row label="Категория" value={(product.category as any).name} />
              )}
              {(product.brand as any)?.name && (
                <Row label="Бренд" value={(product.brand as any).name} />
              )}
              {product.sku && <Row label="Артикул" value={product.sku} mono />}
              {product.barcode && (
                <div className="flex items-center justify-between px-4 py-2.5 gap-3">
                  <span className="text-xs text-gray-500 flex-shrink-0">Штрихкод</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-gray-900">{product.barcode}</span>
                    <button
                      onClick={() => setShowPrintLabel(true)}
                      className="text-blue-500 hover:text-blue-700 flex-shrink-0"
                      title="Печать этикетки"
                    >
                      <Printer size={14} />
                    </button>
                  </div>
                </div>
              )}
              <Row
                label="Цена закупки"
                value={product.cost_price > 0 ? `₸${product.cost_price.toLocaleString()}` : '—'}
              />
              <Row label="Цена продажи" value={`₸${product.price.toLocaleString()}`} />
              <Row
                label="Остаток"
                value={`${stock} ${product.unit}`}
                valueClassName={isLow ? 'text-red-500 font-semibold' : 'text-gray-900'}
              />
              <Row label="Мин. остаток" value={`${product.min_stock} ${product.unit}`} />
            </div>
          </section>

          {/* Атрибуты (линзы / оправы) */}
          {attrEntries.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Параметры</p>
              <div className="bg-gray-50 rounded-xl divide-y divide-gray-100">
                {attrEntries.map(([key, val]) => (
                  <Row key={key} label={attrLabel(key)} value={String(val)} />
                ))}
              </div>
            </section>
          )}

          {/* История приходов */}
          <section className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">История приходов</p>
            {historyLoading ? (
              <p className="text-sm text-gray-400">Загрузка...</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-gray-400">Нет приходов</p>
            ) : (
              <div className="bg-gray-50 rounded-xl divide-y divide-gray-100">
                {history.map(h => (
                  <div key={h.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      {h.kind === 'transfer' ? (
                        <p className="text-sm text-gray-700">
                          <span className="text-purple-500 font-medium">Перемещение</span>
                          {' · '}{h.from_branch}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-700">{h.supplier?.name ?? 'Без поставщика'}</p>
                      )}
                      <p className="text-xs text-gray-400">{new Date(h.created_at).toLocaleDateString('ru-RU')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">{h.quantity} {product.unit}</p>
                      <p className="text-xs text-gray-400">₸{h.cost_price.toLocaleString()}/шт</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onDelete}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-red-200 text-red-500 rounded-xl text-sm hover:bg-red-50"
          >
            <Trash2 size={15} />
            Удалить
          </button>
          <button
            onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            <Pencil size={15} />
            Редактировать
          </button>
        </div>
      </div>
      {showPrintLabel && (
        <PrintLabelModal product={product} onClose={() => setShowPrintLabel(false)} />
      )}
    </div>
  );
}

function Row({
  label, value, mono = false, valueClassName = 'text-gray-900',
}: {
  label: string; value: string; mono?: boolean; valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 gap-3">
      <span className="text-xs text-gray-500 flex-shrink-0">{label}</span>
      <span className={`text-sm text-right ${mono ? 'font-mono' : ''} ${valueClassName}`}>{value}</span>
    </div>
  );
}

function attrLabel(key: string): string {
  const map: Record<string, string> = {
    sphere: 'Оптическая сила',
    cylinder: 'Цилиндр',
    diameter: 'Диаметр',
    base_curve: 'База (BC)',
    color: 'Цвет',
    size: 'Размер',
    material: 'Материал',
    gender: 'Для кого',
  };
  return map[key] ?? key;
}
