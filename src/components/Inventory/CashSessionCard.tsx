import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabase';
import { Banknote, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { getExpensesForDate } from '../../services/expenses';

interface CashSession {
  id: string;
  branch_id: string;
  date: string;
  system_cash: number;
  system_kaspi: number;
  system_total: number;
  actual_cash: number | null;
  cash_discrepancy: number | null;
  status: 'open' | 'closed';
  closed_at: string | null;
}

interface Props {
  branchId: string;
  employeeId: string;
}

function fmt(n: number) {
  return new Intl.NumberFormat('ru-KZ', { style: 'currency', currency: 'KZT', maximumFractionDigits: 0 }).format(n);
}

export default function CashSessionCard({ branchId, employeeId }: Props) {
  const [session, setSession] = useState<CashSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [actualCash, setActualCash] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const isSubmittingRef = useRef(false);
  const [cashExpenses, setCashExpenses] = useState(0);
  const [cashExpenseItems, setCashExpenseItems] = useState<{name: string; amount: number}[]>([]);

  const todayStr = new Date().toISOString().split('T')[0];

  const loadSession = async () => {
    setLoading(true);
    const { data: sales } = await supabase
      .from('sales')
      .select('total, paid_cash, paid_kaspi')
      .eq('branch_id', branchId)
      .in('status', ['paid', 'refunded', 'partially_refunded'])
      .gte('created_at', todayStr + 'T00:00:00')
      .lte('created_at', todayStr + 'T23:59:59');

    const salesCash = (sales || []).reduce((s, x) => s + (Number(x.paid_cash) || 0), 0);
    const salesKaspi = (sales || []).reduce((s, x) => s + (Number(x.paid_kaspi) || 0), 0);

    // Предоплаты мастерской за сегодня (created_branch_id = этот филиал)
    const { data: workshopPrepayments } = await supabase
      .from('service_orders')
      .select('prepayment, prepayment_method')
      .eq('created_branch_id', branchId)
      .gte('prepayment_paid_at', todayStr + 'T00:00:00')
      .lte('prepayment_paid_at', todayStr + 'T23:59:59')
      .gt('prepayment', 0)
      .not('prepayment_paid_at', 'is', null);

    const prepaidCash = (workshopPrepayments ?? [])
      .filter(o => o.prepayment_method === 'cash')
      .reduce((sum, o) => sum + (o.prepayment ?? 0), 0);

    const prepaidKaspi = (workshopPrepayments ?? [])
      .filter(o => o.prepayment_method === 'kaspi')
      .reduce((sum, o) => sum + (o.prepayment ?? 0), 0);

    // Доплаты мастерской за сегодня (остатки при выдаче)
    const { data: workshopPayments } = await supabase
      .from('service_orders')
      .select('service_price, parts_price, prepayment, original_prepayment, remaining_payment_method, remaining_paid_at')
      .eq('created_branch_id', branchId)
      .gte('remaining_paid_at', todayStr + 'T00:00:00')
      .lte('remaining_paid_at', todayStr + 'T23:59:59')
      .not('remaining_paid_at', 'is', null);

    const cashWorkshop = (workshopPayments ?? [])
      .filter(o => o.remaining_payment_method === 'cash')
      .reduce((sum, o) => sum + (o.service_price + o.parts_price - (o.original_prepayment ?? o.prepayment)), 0);

    const kaspiWorkshop = (workshopPayments ?? [])
      .filter(o => o.remaining_payment_method === 'kaspi')
      .reduce((sum, o) => sum + (o.service_price + o.parts_price - (o.original_prepayment ?? o.prepayment)), 0);

    // Возвраты предоплат мастерской сегодня
    const { data: refunds } = await supabase
      .from('service_orders')
      .select('original_prepayment, prepayment_refund_method')
      .eq('created_branch_id', branchId)
      .gte('prepayment_refunded_at', todayStr + 'T00:00:00')
      .lte('prepayment_refunded_at', todayStr + 'T23:59:59')
      .not('prepayment_refunded_at', 'is', null);

    const refundCash = (refunds ?? [])
      .filter(o => o.prepayment_refund_method === 'cash')
      .reduce((sum, o) => sum + (o.original_prepayment ?? 0), 0);

    const refundKaspi = (refunds ?? [])
      .filter(o => o.prepayment_refund_method === 'kaspi')
      .reduce((sum, o) => sum + (o.original_prepayment ?? 0), 0);

    // Возвраты доплат мастерской сегодня (remaining_refunded_at)
    const { data: remainingRefunds } = await supabase
      .from('service_orders')
      .select('service_price, parts_price, prepayment, original_prepayment, remaining_refund_method')
      .eq('created_branch_id', branchId)
      .gte('remaining_refunded_at', todayStr + 'T00:00:00')
      .lte('remaining_refunded_at', todayStr + 'T23:59:59')
      .not('remaining_refunded_at', 'is', null);

    const remainingRefundCash = (remainingRefunds ?? [])
      .filter(o => o.remaining_refund_method === 'cash')
      .reduce((sum, o) => sum + Math.max(0, o.service_price + o.parts_price - (o.original_prepayment ?? o.prepayment)), 0);

    const remainingRefundKaspi = (remainingRefunds ?? [])
      .filter(o => o.remaining_refund_method === 'kaspi')
      .reduce((sum, o) => sum + Math.max(0, o.service_price + o.parts_price - (o.original_prepayment ?? o.prepayment)), 0);

    // Возвраты товаров за сегодня (stock_movements type=return, price=null → берём из sale_items)
    const { data: returnMovements } = await supabase
      .from('stock_movements')
      .select('quantity, product_id, reference_id')
      .eq('type', 'return')
      .eq('branch_id', branchId)
      .gte('created_at', todayStr + 'T00:00:00')
      .lte('created_at', todayStr + 'T23:59:59');

    let saleReturnsCash = 0;
    const returnSaleIds = [
      ...new Set((returnMovements ?? []).map(r => r.reference_id).filter(Boolean)),
    ];
    if (returnSaleIds.length > 0) {
      const { data: saleItems } = await supabase
        .from('sale_items')
        .select('sale_id, product_id, price')
        .in('sale_id', returnSaleIds);

      const priceMap: Record<string, Record<string, number>> = {};
      (saleItems ?? []).forEach((si: { sale_id: string; product_id: string; price: number }) => {
        if (!priceMap[si.sale_id]) priceMap[si.sale_id] = {};
        priceMap[si.sale_id][si.product_id] = si.price;
      });

      saleReturnsCash = (returnMovements ?? []).reduce((sum, r) => {
        const unitPrice = priceMap[r.reference_id ?? '']?.[r.product_id] ?? 0;
        return sum + r.quantity * unitPrice;
      }, 0);
    }

    const systemCash = salesCash + prepaidCash + cashWorkshop - refundCash - saleReturnsCash - remainingRefundCash;
    const systemKaspi = salesKaspi + prepaidKaspi + kaspiWorkshop - refundKaspi - remainingRefundKaspi;
    const systemTotal = systemCash + systemKaspi;

    const { data: existing } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('branch_id', branchId)
      .eq('date', todayStr)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'open') {
        const { data: updated } = await supabase
          .from('cash_sessions')
          .update({ system_cash: systemCash, system_kaspi: systemKaspi, system_total: systemTotal })
          .eq('id', existing.id)
          .select()
          .single();
        setSession((updated || existing) as CashSession);
      } else {
        setSession(existing as CashSession);
      }
    } else {
      const { data: created } = await supabase
        .from('cash_sessions')
        .insert({
          branch_id: branchId,
          employee_id: employeeId,
          date: todayStr,
          system_cash: systemCash,
          system_kaspi: systemKaspi,
          system_total: systemTotal,
        })
        .select()
        .single();
      setSession((created || null) as CashSession | null);
    }
    const exps = await getExpensesForDate(branchId, todayStr);
    const cashExps = exps.filter(e => e.payment_method === 'cash');
    const total = cashExps.reduce((s, e) => s + e.amount, 0);
    setCashExpenses(total);
    const byCat: Record<string, number> = {};
    for (const e of cashExps) {
      const key = e.category?.name ?? 'Прочее';
      byCat[key] = (byCat[key] ?? 0) + e.amount;
    }
    setCashExpenseItems(Object.entries(byCat).map(([name, amount]) => ({ name, amount })));
    setLoading(false);
  };

  useEffect(() => { loadSession(); }, [branchId]);

  // Обновить кассу после возврата продажи
  useEffect(() => {
    const refresh = () => loadSession();
    window.addEventListener('sale-returned', refresh);
    return () => window.removeEventListener('sale-returned', refresh);
  }, []);

  const handleClose = async () => {
    if (!session || !actualCash || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('close_cash_session', {
        p_session_id: session.id,
        p_actual_cash: parseFloat(actualCash),
        p_employee_id: employeeId,
        p_notes: notes || null,
      });
      if (error) {
        alert(`Ошибка закрытия кассы: ${error.message}`);
      } else {
        setShowModal(false);
        setActualCash('');
        setNotes('');
        loadSession();
      }
    } finally {
      isSubmittingRef.current = false;
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return null;

  const isClosed = session.status === 'closed';
  const discrepancy = session.cash_discrepancy;
  const hasDiscrepancy = discrepancy !== null && Math.abs(discrepancy) > 0;
  const previewDiff = actualCash
    ? (session.system_cash - cashExpenses) - parseFloat(actualCash)
  : null;

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
              <Banknote className="w-4 h-4 text-emerald-700" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">Касса сегодня</h3>
          </div>
          <div>
            {isClosed ? (
              hasDiscrepancy ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3.5 h-3.5" /> Расхождение
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  <CheckCircle className="w-3.5 h-3.5" /> Закрыта
                </span>
              )
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                <Clock className="w-3.5 h-3.5" /> Открыта
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Наличные</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">{fmt(session.system_cash)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Kaspi</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">{fmt(session.system_kaspi)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Итого</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">{fmt(session.system_total)}</p>
          </div>
        </div>

        {cashExpenses > 0 && (
          <div className="border-t pt-2 mt-1 space-y-1.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Расходы наличными</p>
            {cashExpenseItems.map(item => (
              <div key={item.name} className="flex justify-between text-sm">
                <span className="text-gray-600">{item.name}</span>
                <span className="text-red-500">−{item.amount.toLocaleString('ru-KZ')} ₸</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-semibold border-t border-gray-100 pt-1.5">
              <span className="text-gray-700">К сдаче наличными</span>
              <span className="text-gray-900">{(session.system_cash - cashExpenses).toLocaleString('ru-KZ')} ₸</span>
            </div>
          </div>
        )}

        {isClosed && session.actual_cash !== null && (
          <div className="border-t border-gray-100 pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Сдано наличными:</span>
              <span className="font-semibold text-gray-900">{fmt(session.actual_cash)}</span>
            </div>
            {hasDiscrepancy && discrepancy !== null && (
              <div className="flex justify-between">
                <span className="text-gray-600">Расхождение:</span>
                <span className={`font-semibold ${discrepancy > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {fmt(Math.abs(discrepancy))} {discrepancy > 0 ? '(недостача)' : '(излишек)'}
                </span>
              </div>
            )}
          </div>
        )}

        {!isClosed && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            Закрыть кассу
          </button>
        )}
      </div>

      {showModal && (
        <div
          data-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Закрытие кассы</h3>
            <p className="text-sm text-gray-500 mb-4">
              По системе наличными: <span className="font-semibold text-gray-800">{fmt(session.system_cash)}</span>
            </p>

            <label className="block text-xs font-medium text-gray-600 mb-1">
              Фактически сдано наличными (₸)
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={actualCash}
              onChange={e => setActualCash(e.target.value)}
              placeholder="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />

            <label className="block text-xs font-medium text-gray-600 mb-1">
              Комментарий (необязательно)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Причина расхождения..."
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />

            {previewDiff !== null && !Number.isNaN(previewDiff) && (
              <div className={`rounded-lg px-3 py-2.5 mb-4 text-sm ${Math.abs(previewDiff) > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Расхождение:</span>
                  <span className={`font-bold ${previewDiff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {fmt(Math.abs(previewDiff))}
                    {previewDiff > 0 ? ' (недостача)' : previewDiff < 0 ? ' (излишек)' : ''}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={!actualCash || saving}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {saving ? 'Сохранение...' : 'Подтвердить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
