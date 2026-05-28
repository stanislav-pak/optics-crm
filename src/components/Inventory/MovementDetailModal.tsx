import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../services/supabase';

interface MovementDetail {
  id: string;
  type: string;
  quantity: number;
  notes?: string;
  status?: string;
  created_at: string;
  product: { name: string; sku?: string } | null;
  employee: { name: string } | null;
  branch: { name: string } | null;
  to_branch: { name: string } | null;
}

const TYPE_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  in:              { label: 'Приход',      color: '#4ade80', bg: 'rgba(74,222,128,0.12)', icon: '📥' },
  out:             { label: 'Продажа',     color: '#f87171', bg: 'rgba(248,113,113,0.12)', icon: '🛒' },
  writeoff:        { label: 'Списание',    color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  icon: '🗑' },
  transfer:        { label: 'Перемещение', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  icon: '↔️' },
  revision_adjust: { label: 'Ревизия',     color: '#c084fc', bg: 'rgba(192,132,252,0.12)', icon: '📋' },
};

interface Props {
  movementId: string;
  onClose: () => void;
}

export default function MovementDetailModal({ movementId, onClose }: Props) {
  const [movement, setMovement] = useState<MovementDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('stock_movements')
      .select(`
        id, type, quantity, notes, status, created_at,
        product:products!stock_movements_product_id_fkey(name, sku),
        employee:employees!stock_movements_created_by_fkey(name),
        branch:branches!stock_movements_branch_id_fkey(name),
        to_branch:branches!stock_movements_to_branch_id_fkey(name)
      `)
      .eq('id', movementId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setMovement(data as MovementDetail);
      })
      .finally(() => setLoading(false));
  }, [movementId]);

  // Свайп вниз — закрыть
  useEffect(() => {
    const start = { x: 0, y: 0 };
    const onStart = (e: TouchEvent) => {
      start.x = e.touches[0].clientX;
      start.y = e.touches[0].clientY;
    };
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

  const meta = movement ? (TYPE_META[movement.type] ?? { label: movement.type, color: '#e9edef', bg: 'rgba(233,237,239,0.1)', icon: '📦' }) : null;

  const dateStr = movement
    ? new Date(movement.created_at).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '';

  return (
    <div
      data-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-3xl flex flex-col"
        style={{ backgroundColor: '#111b21', maxHeight: '80vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#374045' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <span className="text-sm font-semibold" style={{ color: '#e9edef' }}>
            Детали движения
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-full transition-colors"
            style={{ color: '#8696a0' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 pb-6 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#00a884', borderTopColor: 'transparent' }} />
            </div>
          ) : !movement ? (
            <p className="text-center py-12 text-sm" style={{ color: '#8696a0' }}>Движение не найдено</p>
          ) : (
            <>
              {/* Тип — большая карточка */}
              <div
                className="rounded-2xl px-4 py-4 flex items-center gap-3"
                style={{ backgroundColor: meta!.bg, border: `1px solid ${meta!.color}30` }}
              >
                <span className="text-2xl">{meta!.icon}</span>
                <div>
                  <p className="text-lg font-bold" style={{ color: meta!.color }}>
                    {meta!.label}
                  </p>
                  {movement.status === 'in_transit' && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 inline-block"
                      style={{ backgroundColor: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
                      В пути
                    </span>
                  )}
                </div>
              </div>

              {/* Строки деталей */}
              <div className="rounded-2xl overflow-hidden divide-y" style={{ backgroundColor: '#202c33', divideColor: '#2a3942' }}>

                {/* Товар */}
                <DetailRow
                  label="Товар"
                  value={movement.product?.name ?? '—'}
                  sub={movement.product?.sku ? `Арт: ${movement.product.sku}` : undefined}
                />

                {/* Количество */}
                <DetailRow
                  label="Количество"
                  value={<span style={{ color: meta!.color, fontWeight: 700 }}>{movement.quantity} шт</span>}
                />

                {/* Филиал */}
                {movement.type === 'transfer' ? (
                  <DetailRow
                    label="Маршрут"
                    value={`${movement.branch?.name ?? '—'} → ${movement.to_branch?.name ?? '—'}`}
                  />
                ) : (
                  <DetailRow label="Склад / Филиал" value={movement.branch?.name ?? '—'} />
                )}

                {/* Сотрудник */}
                <DetailRow label="Сотрудник" value={movement.employee?.name ?? '—'} />

                {/* Дата и время */}
                <DetailRow label="Дата и время" value={dateStr} />

                {/* Примечание */}
                {movement.notes && (
                  <DetailRow label="Примечание" value={movement.notes} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Вспомогательный компонент ----

function DetailRow({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-start justify-between px-4 py-3 gap-3">
      <span className="text-sm flex-shrink-0" style={{ color: '#8696a0' }}>{label}</span>
      <div className="text-right min-w-0">
        <p className="text-sm font-medium break-words" style={{ color: '#e9edef' }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: '#8696a0' }}>{sub}</p>}
      </div>
    </div>
  );
}
