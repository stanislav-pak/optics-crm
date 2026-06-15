import { useState, useEffect, useRef } from 'react';
import { X, RotateCcw, ChevronLeft, Search } from 'lucide-react';
import { createReturn } from '../../services/inventory';
import { supabase } from '../../services/supabase';
import type { Sale, ServiceOrder } from '../../types';

interface Props {
  sales: Sale[];
  employeeId: string;
  onClose: () => void;
  onSuccess: () => void;
  initialSaleId?: string;
}

export default function ReturnModal({ sales, employeeId, onClose, onSuccess, initialSaleId }: Props) {
  const [step, setStep] = useState<'select' | 'items'>('select');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [saleSearch, setSaleSearch] = useState('');
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  // Заказ мастерской для выбранной продажи
  const [workshopOrder, setWorkshopOrder] = useState<ServiceOrder | null>(null);
  const [returnWorkshop, setReturnWorkshop] = useState(false);

  // Уже возвращённые количества по товарам: product_id → кол-во
  const [returnedQtys, setReturnedQtys] = useState<Record<string, number>>({});

  // Только продажи, которые можно вернуть
  const returnableSales = sales.filter(s => s.status === 'paid' || s.status === 'partially_refunded');
  const filteredSales = saleSearch
    ? returnableSales.filter(s => {
        const client = (s.client as any)?.name || (s.client as any)?.phone || '';
        const itemNames = s.items?.map(i => (i.product as any)?.name ?? '').join(' ') ?? '';
        const q = saleSearch.toLowerCase();
        return client.toLowerCase().includes(q) || itemNames.toLowerCase().includes(q);
      })
    : returnableSales;

  const handleSelectSale = (sale: Sale) => {
    setSelectedSale(sale);
    setQtys(Object.fromEntries((sale.items ?? []).map(i => [i.product_id, 0])));
    setReturnedQtys({});
    setReason('');
    setError(null);
    setReturnWorkshop(false);
    setWorkshopOrder(null);
    setStep('items');

    // Загружаем уже возвращённые количества по этой продаже
    const productIds = (sale.items ?? []).map(i => i.product_id);
    if (productIds.length > 0) {
      supabase
        .from('stock_movements')
        .select('product_id, quantity')
        .eq('reference_id', sale.id)
        .eq('type', 'return')
        .in('product_id', productIds)
        .then(({ data }) => {
          const map: Record<string, number> = {};
          (data ?? []).forEach(r => {
            map[r.product_id] = (map[r.product_id] ?? 0) + r.quantity;
          });
          setReturnedQtys(map);
        })
        .catch(() => setReturnedQtys({}));
    }
  };

  // Авто-выбор если передан initialSaleId — пропускаем экран выбора
  useEffect(() => {
    if (!initialSaleId) return;
    const sale = sales.find(s => s.id === initialSaleId);
    if (sale) handleSelectSale(sale);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Загружаем заказ мастерской при выборе продажи (показываем всё кроме cancelled)
  useEffect(() => {
    if (!selectedSale) { setWorkshopOrder(null); return; }
    supabase
      .from('service_orders')
      .select('id, service_name, service_price, parts_price, original_prepayment, prepayment, status, prepayment_refunded_at, remaining_paid_at, remaining_payment_method, payment_type, prepayment_method')
      .eq('sale_id', selectedSale.id)
      .not('status', 'in', '("cancelled")')
      .maybeSingle()
      .then(({ data }) => {
        setWorkshopOrder(data ? (data as unknown as ServiceOrder) : null);
      })
      .catch(() => setWorkshopOrder(null));
  }, [selectedSale?.id]);

  const items = selectedSale?.items ?? [];
  const totalReturnQty = Object.values(qtys).reduce((s, q) => s + q, 0);

  // Суммы возврата
  const itemsReturnAmount = items.reduce((sum, i) => sum + (qtys[i.product_id] ?? 0) * i.price, 0);

  // Секция мастерской показывается если была любая оплата
  const workshopHasPayment = workshopOrder && (
    (workshopOrder.original_prepayment ?? 0) > 0 ||
    (workshopOrder.prepayment ?? 0) > 0 ||
    workshopOrder.remaining_paid_at != null
  );

  // Сколько клиент реально заплатил за мастерскую
  const workshopPaidAmount = workshopOrder
    ? (workshopOrder.original_prepayment ?? workshopOrder.prepayment ?? 0) +
      (workshopOrder.remaining_paid_at
        ? (workshopOrder.service_price + workshopOrder.parts_price) -
          (workshopOrder.original_prepayment ?? workshopOrder.prepayment ?? 0)
        : 0)
    : 0;

  const workshopReturnAmount = returnWorkshop && workshopOrder ? workshopPaidAmount : 0;
  const totalReturnAmount = itemsReturnAmount + workshopReturnAmount;

  const canSubmit = (totalReturnQty > 0 || returnWorkshop) && reason.trim().length > 0 && !loading;

  const handleSubmit = async () => {
    if (!canSubmit || !selectedSale || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setError(null);
    setLoading(true);
    try {
      // 1. Возврат товаров (только если выбраны позиции)
      if (totalReturnQty > 0) {
        const returnItems = items
          .map(i => ({ product_id: i.product_id, quantity: qtys[i.product_id] ?? 0 }))
          .filter(i => i.quantity > 0);
        await createReturn(selectedSale.id, returnItems, reason.trim(), employeeId);
      }
      // 2. Отмена заказа мастерской + возврат предоплаты (если выбрано)
      if (returnWorkshop && workshopOrder) {
        const now = new Date().toISOString();
        const { error: workshopError } = await supabase
          .from('service_orders')
          .update({
            status: 'cancelled',
            previous_status: workshopOrder.status,
            prepayment_refunded_at: workshopOrder.original_prepayment > 0
              ? now : null,
            prepayment_refund_method: workshopOrder.prepayment_method ?? 'cash',
            remaining_refunded_at: workshopOrder.remaining_paid_at ? now : null,
            remaining_refund_method: workshopOrder.remaining_paid_at
              ? (workshopOrder.remaining_payment_method ?? 'cash') : null,
            updated_at: now,
          })
          .eq('id', workshopOrder.id);
        if (workshopError) throw new Error(`Ошибка отмены мастерской: ${workshopError.message}`);
      }
      window.dispatchEvent(new CustomEvent('sale-returned', {
        detail: { saleId: selectedSale?.id },
      }));
      window.dispatchEvent(new CustomEvent('workshop-order-updated'));
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div
      data-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-3xl flex flex-col bg-white"
        style={{ maxHeight: '85vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            {step === 'items' && !initialSaleId && (
              <button
                onClick={() => setStep('select')}
                className="p-1 rounded-full mr-1"
                className="text-gray-500"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <RotateCcw size={16} className="text-blue-500" />
            <span className="text-sm font-semibold" className="text-gray-900">
              {step === 'select' ? 'Выберите продажу' : 'Оформить возврат'}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-full" className="text-gray-500">
            <X size={20} />
          </button>
        </div>

        {/* ШАГ 1: ВЫБОР ПРОДАЖИ */}
        {step === 'select' && (
          <>
            <div className="px-5 pb-3 flex-shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" className="text-gray-500" />
                <input
                  value={saleSearch}
                  onChange={e => setSaleSearch(e.target.value)}
                  placeholder="Поиск по клиенту или товару..."
                  className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none"
                  className="bg-gray-50 border border-gray-200 text-gray-900"
                />
              </div>
            </div>

            <div
              className="overflow-y-auto flex-1 px-5 pb-5"
              onTouchStart={e => e.stopPropagation()}
              onTouchMove={e => e.stopPropagation()}
            >
              {filteredSales.length === 0 ? (
                <div className="text-center py-10 text-sm" className="text-gray-500">
                  {returnableSales.length === 0 ? 'Нет продаж для возврата' : 'Ничего не найдено'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredSales.map(s => {
                    const clientName = (s.client as any)?.name || (s.client as any)?.phone || 'Без клиента';
                    const saleDate = new Date(s.created_at).toLocaleDateString('ru-RU');
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSelectSale(s)}
                        className="w-full text-left rounded-2xl px-4 py-3 transition-colors active:opacity-80"
                        className="bg-gray-50 border border-gray-200"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate" className="text-gray-900">{clientName}</p>
                            <p className="text-xs mt-0.5" className="text-gray-500">
                              {saleDate} · {(s.employee as any)?.name ?? '—'}
                            </p>
                            <p className="text-xs mt-0.5 truncate" className="text-gray-500">
                              {s.items?.map(i => (i.product as any)?.name).filter(Boolean).join(', ')}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-semibold" className="text-gray-900">₸{s.total.toLocaleString()}</p>
                            {s.status === 'partially_refunded' && (
                              <span className="text-xs" style={{ color: '#f59e0b' }}>Частичный возврат</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ШАГ 2: ВЫБОР ПОЗИЦИЙ */}
        {step === 'items' && selectedSale && (
          <>
            {/* Инфо о продаже */}
            <div
              className="mx-5 mb-3 rounded-2xl px-4 py-3 flex-shrink-0"
              className="bg-gray-50"
            >
              <p className="text-sm font-medium" className="text-gray-900">
                {(selectedSale.client as any)?.name || (selectedSale.client as any)?.phone || 'Без клиента'}
              </p>
              <p className="text-xs mt-0.5" className="text-gray-500">
                {new Date(selectedSale.created_at).toLocaleDateString('ru-RU')} · ₸{selectedSale.total.toLocaleString()}
                {selectedSale.branch ? ` · ${(selectedSale.branch as any).name}` : ''}
              </p>
            </div>

            <div
              className="overflow-y-auto flex-1 px-5 pb-4 space-y-3"
              onTouchStart={e => e.stopPropagation()}
              onTouchMove={e => e.stopPropagation()}
            >

              {/* Позиции товаров */}
              {items.length > 0 && (
                <div
                  className="rounded-2xl overflow-hidden divide-y bg-gray-50 border border-gray-200"
                >
                  {items.map(item => {
                    const productName = (item.product as any)?.name ?? '—';
                    const alreadyReturned = returnedQtys[item.product_id] ?? 0;
                    const maxQty = Math.max(0, item.quantity - alreadyReturned);
                    const qty = qtys[item.product_id] ?? 0;
                    return (
                      <div key={item.product_id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate" className="text-gray-900">{productName}</p>
                            <p className="text-xs mt-0.5" className="text-gray-500">
                              Доступно к возврату: {maxQty} шт · ₸{item.price.toLocaleString()} / шт
                              {alreadyReturned > 0 && (
                                <span style={{ color: '#f59e0b' }}> (уже возвращено: {alreadyReturned})</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div
                          className="flex items-center rounded-xl overflow-hidden"
                          className="bg-white border border-gray-200"
                        >
                          <button
                            type="button"
                            onMouseDown={e => { e.preventDefault(); setQtys(prev => ({ ...prev, [item.product_id]: Math.max(0, (prev[item.product_id] ?? 0) - 1) })); }}
                            className="px-4 py-2 text-lg font-medium flex-shrink-0"
                            className="text-gray-500"
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
                            style={{ color: qty > 0 ? '#3b82f6' : '#9ca3af' }}
                          />
                          <button
                            type="button"
                            onMouseDown={e => { e.preventDefault(); setQtys(prev => ({ ...prev, [item.product_id]: Math.min((prev[item.product_id] ?? 0) + 1, maxQty) })); }}
                            className="px-4 py-2 text-lg font-medium flex-shrink-0"
                            className="text-gray-500"
                          >+</button>
                        </div>
                        {qty > 0 && (
                          <p className="text-xs mt-1.5" className="text-blue-500">
                            Вернуть: {qty} шт · ₸{(qty * item.price).toLocaleString()}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Секция мастерской */}
              {workshopHasPayment && workshopOrder && workshopOrder.status !== 'cancelled' && (
                <div>
                  <p className="text-xs font-medium mb-2" className="text-gray-500">
                    Услуги мастерской
                  </p>
                  <div
                    className="rounded-2xl px-4 py-3"
                    className="bg-gray-50 border border-gray-200"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium" className="text-gray-900">
                          🔧 {workshopOrder.service_name}
                        </p>
                        <p className="text-xs mt-1" className="text-gray-500">
                          Услуга: ₸{workshopOrder.service_price.toLocaleString()}
                          {workshopOrder.parts_price > 0 && ` · Запчасти: ₸${workshopOrder.parts_price.toLocaleString()}`}
                        </p>
                        <p className="text-xs mt-0.5" className="text-gray-500">
                          Оплачено клиентом: ₸{workshopPaidAmount.toLocaleString()}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 flex-shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={returnWorkshop}
                          onChange={e => setReturnWorkshop(e.target.checked)}
                          className="w-4 h-4 rounded accent-blue-500"
                        />
                        <span className="text-xs" className="text-gray-900">
                          Вернуть ₸{workshopPaidAmount.toLocaleString()}
                        </span>
                      </label>
                    </div>
                    {returnWorkshop && (
                      <p className="text-xs mt-2 font-medium" className="text-blue-500">
                        Вернуть клиенту: ₸{workshopPaidAmount.toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Причина */}
              <div>
                <p className="text-xs font-medium mb-1.5" className="text-gray-500">
                  Причина возврата <span style={{ color: '#f87171' }}>*</span>
                </p>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Укажите причину (брак, не подошло, ошибка заказа...)"
                  rows={3}
                  className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none"
                  className="bg-gray-50 border border-gray-200 text-gray-900"
                />
              </div>

              {/* Итог */}
              {(totalReturnQty > 0 || returnWorkshop) && reason.trim().length > 0 && (
                <div
                  className="rounded-2xl px-4 py-3 text-sm space-y-1"
                  style={{ backgroundColor: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}
                >
                  {itemsReturnAmount > 0 && (
                    <div className="flex justify-between" className="text-gray-500">
                      <span>Возврат товаров ({totalReturnQty} шт):</span>
                      <span>₸{itemsReturnAmount.toLocaleString()}</span>
                    </div>
                  )}
                  {returnWorkshop && workshopReturnAmount > 0 && (
                    <div className="flex justify-between" className="text-gray-500">
                      <span>Возврат оплаты мастерской:</span>
                      <span>₸{workshopReturnAmount.toLocaleString()}</span>
                    </div>
                  )}
                  {(itemsReturnAmount > 0 || workshopReturnAmount > 0) && (
                    <div
                      className="flex justify-between font-semibold pt-1"
                      style={{ color: '#60a5fa', borderTop: '1px solid rgba(96,165,250,0.2)' }}
                    >
                      <span>Итого к возврату:</span>
                      <span>₸{totalReturnAmount.toLocaleString()}</span>
                    </div>
                  )}
                  <p className="text-xs" className="text-gray-500">Причина: {reason.trim()}</p>
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
              className="border-t border-gray-100"
            >
              <button
                onClick={initialSaleId ? onClose : () => setStep('select')}
                className="flex-1 py-2.5 rounded-xl text-sm"
                className="border border-gray-200 text-gray-500"
              >
                {initialSaleId ? 'Отмена' : 'Назад'}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity"
                style={{
                  backgroundColor: canSubmit ? '#2563eb' : '#e5e7eb',
                  color: canSubmit ? '#fff' : '#9ca3af',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? 'Оформляем...' : 'Оформить возврат'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
