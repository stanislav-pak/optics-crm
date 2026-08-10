import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabase';
import { Banknote, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { getExpensesForDate } from '../../services/expenses';
import {
  getCashSession, openCashSession, closeCashSession, reopenCashSession, getCashSessionClosures,
  type CashSession, type CashSessionClosure,
} from '../../services/cashSessions';
import {
  allocateReturnsByPaymentMethod, sumReturnedValueBySale, sumByPaymentMethod,
  type ReturnAllocation, type SalePaidSplit,
} from '../../services/cashCalc';
import { CASH_CHANGED_EVENT } from '../../services/cashEvents';

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
  const [kaspiExpenses, setKaspiExpenses] = useState(0);
  const [cashExpenseItems, setCashExpenseItems] = useState<{name: string; amount: number}[]>([]);
  const [opening, setOpening] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [closures, setClosures] = useState<CashSessionClosure[]>([]);
  const [systemHalyk, setSystemHalyk] = useState(0);
  const [systemKaspiTransfer, setSystemKaspiTransfer] = useState(0);

  const todayStr = new Date().toISOString().split('T')[0];

  // silent=true — пересчитать и перезаписать суммы, не показывая спиннер вместо
  // карточки. Нужно при закрытии кассы: иначе открытый модал закрытия пропал бы
  // с экрана на время пересчёта.
  const loadSession = async (silent = false) => {
    if (!silent) setLoading(true);
    const existing = await getCashSession(branchId, todayStr);

    if (!existing) {
      // Касса ещё не открыта сегодня — не создаём сессию автоматически,
      // ждём явного нажатия "Открыть кассу"
      setSession(null);
      setCashExpenses(0);
      setKaspiExpenses(0);
      setCashExpenseItems([]);
      setClosures([]);
      setSystemHalyk(0);
      setSystemKaspiTransfer(0);
      setLoading(false);
      return;
    }

    try {
      setClosures(await getCashSessionClosures(existing.id));
    } catch (e) {
      console.error('getCashSessionClosures error:', e);
      setClosures([]);
    }

    if (existing.status === 'closed') {
      setSession(existing);
      const exps = await getExpensesForDate(branchId, todayStr);
      const cashExps = exps.filter(e => e.payment_method === 'cash');
      const total = cashExps.reduce((s, e) => s + e.amount, 0);
      setCashExpenses(total);
      // Расходы по Kaspi раньше в кассе филиала не учитывались нигде (в админском
      // своде вычитались) — из-за этого две витрины расходились.
      setKaspiExpenses(
        exps.filter(e => e.payment_method === 'kaspi').reduce((s, e) => s + e.amount, 0)
      );
      const byCat: Record<string, number> = {};
      for (const e of cashExps) {
        const key = e.category?.name ?? 'Прочее';
        byCat[key] = (byCat[key] ?? 0) + e.amount;
      }
      setCashExpenseItems(Object.entries(byCat).map(([name, amount]) => ({ name, amount })));

      // Halyk/Kaspi-перевод не хранятся в самой сессии — пересчитываем и для закрытой,
      // чтобы справочные суммы не обнулялись после закрытия/перезагрузки страницы
      const { data: closedSales } = await supabase
        .from('sales')
        .select('paid_halyk, paid_kaspi_transfer')
        .eq('branch_id', branchId)
        .in('status', ['paid', 'refunded', 'partially_refunded'])
        .gte('created_at', todayStr + 'T00:00:00')
        .lte('created_at', todayStr + 'T23:59:59');
      setSystemHalyk((closedSales ?? []).reduce((s, x) => s + (Number(x.paid_halyk) || 0), 0));
      setSystemKaspiTransfer((closedSales ?? []).reduce((s, x) => s + (Number(x.paid_kaspi_transfer) || 0), 0));

      setLoading(false);
      return;
    }

    const { data: sales } = await supabase
      .from('sales')
      .select('total, paid_cash, paid_kaspi, paid_halyk, paid_kaspi_transfer')
      .eq('branch_id', branchId)
      .in('status', ['paid', 'refunded', 'partially_refunded'])
      .gte('created_at', todayStr + 'T00:00:00')
      .lte('created_at', todayStr + 'T23:59:59');

    // Halyk и Kaspi-перевод — банковские переводы (вбиваются вручную, без API),
    // физически в кассе их нет — считаются отдельно от наличных, не входят в "к сдаче"
    const salesCash = (sales || []).reduce((s, x) => s + (Number(x.paid_cash) || 0), 0);
    const salesKaspi = (sales || []).reduce((s, x) => s + (Number(x.paid_kaspi) || 0), 0);
    const salesHalyk = (sales || []).reduce((s, x) => s + (Number(x.paid_halyk) || 0), 0);
    const salesKaspiTransfer = (sales || []).reduce((s, x) => s + (Number(x.paid_kaspi_transfer) || 0), 0);

    // Предоплаты мастерской за сегодня (created_branch_id = этот филиал).
    // ТОЛЬКО заказы без привязанной продажи (sale_id IS NULL). Заказ, оформленный
    // внутри продажи (AddSaleModal), кладёт ту же сумму и в paid_cash/paid_kaspi
    // самой продажи, и в prepayment заказа — считать оба значит задвоить кассу
    // (баг: ремонт на 500 ₸ показывал 1000 ₸). Заказ, созданный напрямую через
    // мастерскую, продажи под собой не имеет — его считать обязательно.
    // Доплату при выдаче (remaining_paid_at ниже) это не касается: она нигде,
    // кроме заказа, не фиксируется и задвоения не даёт.
    const { data: workshopPrepayments } = await supabase
      .from('service_orders')
      .select('prepayment, prepayment_method')
      .eq('created_branch_id', branchId)
      .is('sale_id', null)
      .gte('prepayment_paid_at', todayStr + 'T00:00:00')
      .lte('prepayment_paid_at', todayStr + 'T23:59:59')
      .gt('prepayment', 0)
      .not('prepayment_paid_at', 'is', null);

    const wsPrepaid = sumByPaymentMethod(
      workshopPrepayments, o => o.prepayment_method, o => o.prepayment ?? 0
    );

    // Предзаказы, оплаченные сегодня (предоплата или 100%). Продажа под
    // предзаказом НЕ создаётся — статус просто доходит до «выполнен», — поэтому
    // деньги учитываются прямо из orders, как у мастерской из service_orders.
    // Без этого предоплата предзаказа не попадала в кассу вообще.
    const { data: preorderPayments } = await supabase
      .from('orders')
      .select('prepayment_amount, prepayment_method')
      .eq('branch_id', branchId)
      .gte('prepayment_paid_at', todayStr + 'T00:00:00')
      .lte('prepayment_paid_at', todayStr + 'T23:59:59')
      .gt('prepayment_amount', 0)
      .not('prepayment_paid_at', 'is', null)
      .neq('status', 'cancelled');

    const preorderPaid = sumByPaymentMethod(
      preorderPayments, o => o.prepayment_method, o => o.prepayment_amount ?? 0
    );

    // Доплаты мастерской за сегодня (остатки при выдаче)
    const { data: workshopPayments } = await supabase
      .from('service_orders')
      .select('service_price, parts_price, prepayment, original_prepayment, remaining_payment_method, remaining_paid_at')
      .eq('created_branch_id', branchId)
      .gte('remaining_paid_at', todayStr + 'T00:00:00')
      .lte('remaining_paid_at', todayStr + 'T23:59:59')
      .not('remaining_paid_at', 'is', null);

    const wsRemaining = sumByPaymentMethod(
      workshopPayments,
      o => o.remaining_payment_method,
      o => o.service_price + o.parts_price - (o.original_prepayment ?? o.prepayment)
    );

    // Погашения долга по товару за сегодня (частичная оплата, без мастерской)
    const { data: saleDebtSettlements } = await supabase
      .from('sales')
      .select('debt_amount, debt_payment_method')
      .eq('branch_id', branchId)
      .gte('debt_paid_at', todayStr + 'T00:00:00')
      .lte('debt_paid_at', todayStr + 'T23:59:59')
      .not('debt_paid_at', 'is', null);

    const debtSettled = sumByPaymentMethod(
      saleDebtSettlements, s => s.debt_payment_method, s => s.debt_amount ?? 0
    );

    // Возвраты предоплат мастерской сегодня
    const { data: refunds } = await supabase
      .from('service_orders')
      .select('original_prepayment, prepayment_refund_method')
      .eq('created_branch_id', branchId)
      .gte('prepayment_refunded_at', todayStr + 'T00:00:00')
      .lte('prepayment_refunded_at', todayStr + 'T23:59:59')
      .not('prepayment_refunded_at', 'is', null);

    const prepayRefund = sumByPaymentMethod(
      refunds, o => o.prepayment_refund_method, o => o.original_prepayment ?? 0
    );

    // Возвраты доплат мастерской сегодня (remaining_refunded_at)
    const { data: remainingRefunds } = await supabase
      .from('service_orders')
      .select('service_price, parts_price, prepayment, original_prepayment, remaining_refund_method')
      .eq('created_branch_id', branchId)
      .gte('remaining_refunded_at', todayStr + 'T00:00:00')
      .lte('remaining_refunded_at', todayStr + 'T23:59:59')
      .not('remaining_refunded_at', 'is', null);

    const remainingRefund = sumByPaymentMethod(
      remainingRefunds,
      o => o.remaining_refund_method,
      o => Math.max(0, o.service_price + o.parts_price - (o.original_prepayment ?? o.prepayment))
    );

    // Возвраты товаров за сегодня (stock_movements type=return, price=null → берём из sale_items)
    const { data: returnMovements } = await supabase
      .from('stock_movements')
      .select('quantity, product_id, reference_id')
      .eq('type', 'return')
      .eq('branch_id', branchId)
      .gte('created_at', todayStr + 'T00:00:00')
      .lte('created_at', todayStr + 'T23:59:59');

    // Возврат вычитается из ТОГО кармана, которым платили за исходную продажу
    // (раньше всегда из наличных — при возврате Kaspi-продажи наличные занижались,
    // Kaspi оставался завышенным, у менеджера вылезала ложная недостача).
    let returns: ReturnAllocation = { cash: 0, kaspi: 0, halyk: 0, kaspiTransfer: 0 };
    const returnSaleIds = [
      ...new Set((returnMovements ?? []).map(r => r.reference_id).filter(Boolean)),
    ] as string[];
    if (returnSaleIds.length > 0) {
      const [{ data: saleItems }, { data: returnSales }] = await Promise.all([
        supabase
          .from('sale_items')
          .select('sale_id, product_id, price')
          .in('sale_id', returnSaleIds),
        supabase
          .from('sales')
          .select('id, paid_cash, paid_kaspi, paid_halyk, paid_kaspi_transfer')
          .in('id', returnSaleIds),
      ]);

      const salesById: Record<string, SalePaidSplit> = {};
      (returnSales ?? []).forEach((s: { id: string } & SalePaidSplit) => {
        salesById[s.id] = s;
      });

      returns = allocateReturnsByPaymentMethod(
        sumReturnedValueBySale(returnMovements ?? [], saleItems ?? []),
        salesById
      );
    }

    // Приход по каждому карману минус возвраты по нему же. Долг и доплата
    // мастерской теперь умеют все 4 способа (POST и перевод раньше терялись).
    const income = (p: keyof ReturnAllocation) =>
      wsPrepaid[p] + preorderPaid[p] + wsRemaining[p] + debtSettled[p]
      - prepayRefund[p] - remainingRefund[p] - returns[p];

    const systemCash = salesCash + income('cash');
    const systemKaspi = salesKaspi + income('kaspi');
    // Halyk/Kaspi-перевод не хранятся отдельными колонками в cash_sessions — пересчитываются
    // каждый раз наравне с остальным, но не входят в system_cash (не требуют физической сдачи)
    const halykTotal = salesHalyk + income('halyk');
    const kaspiTransferTotal = salesKaspiTransfer + income('kaspiTransfer');
    setSystemHalyk(halykTotal);
    setSystemKaspiTransfer(kaspiTransferTotal);
    const systemTotal = systemCash + systemKaspi + halykTotal + kaspiTransferTotal;

    const { data: updated } = await supabase
      .from('cash_sessions')
      .update({ system_cash: systemCash, system_kaspi: systemKaspi, system_total: systemTotal })
      .eq('id', existing.id)
      .select()
      .single();
    setSession((updated || existing) as CashSession);

    const exps = await getExpensesForDate(branchId, todayStr);
    const cashExps = exps.filter(e => e.payment_method === 'cash');
    const total = cashExps.reduce((s, e) => s + e.amount, 0);
    setCashExpenses(total);
    setKaspiExpenses(
      exps.filter(e => e.payment_method === 'kaspi').reduce((s, e) => s + e.amount, 0)
    );
    const byCat: Record<string, number> = {};
    for (const e of cashExps) {
      const key = e.category?.name ?? 'Прочее';
      byCat[key] = (byCat[key] ?? 0) + e.amount;
    }
    setCashExpenseItems(Object.entries(byCat).map(([name, amount]) => ({ name, amount })));
    setLoading(false);
  };

  useEffect(() => { loadSession(); }, [branchId]);

  // Обновить кассу после возврата продажи и после любой другой денежной операции
  // (погашение долга, новая продажа, расход — см. services/cashEvents.ts).
  // Без этого итог кассы оставался старым до перезагрузки страницы, а при закрытии
  // смены устаревшая сумма замерзала в истории навсегда.
  useEffect(() => {
    const refresh = () => loadSession();
    window.addEventListener('sale-returned', refresh);
    window.addEventListener(CASH_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener('sale-returned', refresh);
      window.removeEventListener(CASH_CHANGED_EVENT, refresh);
    };
  }, []);

  const handleClose = async () => {
    if (!session || !actualCash || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSaving(true);
    try {
      // Принудительный пересчёт ПЕРЕД закрытием. close_cash_session берёт суммы
      // из строки cash_sessions как есть и не пересчитывает — то есть замораживает
      // в историю то, что последним записал браузер. Без этого любая операция,
      // сделанная после последнего пересчёта, терялась навсегда (реальный случай:
      // погашение долга 3000 ₸ за 3 минуты до закрытия кассы «Гум»).
      // silent — чтобы модал закрытия не подменился спиннером.
      await loadSession(true);
      await closeCashSession(session.id, parseFloat(actualCash), employeeId, notes);
      setShowModal(false);
      setActualCash('');
      setNotes('');
      loadSession();
    } catch (e: any) {
      alert(`Ошибка закрытия кассы: ${e.message}`);
    } finally {
      isSubmittingRef.current = false;
      setSaving(false);
    }
  };

  const handleOpen = async () => {
    if (opening) return;
    setOpening(true);
    try {
      await openCashSession(branchId, employeeId);
      await loadSession();
    } catch (e: any) {
      alert(`Ошибка открытия кассы: ${e.message}`);
    } finally {
      setOpening(false);
    }
  };

  const handleReopen = async () => {
    if (!session || reopening) return;
    if (!confirm('Переоткрыть кассу? Данные закрытия (сдано наличными, расхождение) будут сброшены.')) return;
    setReopening(true);
    try {
      await reopenCashSession(session.id);
      await loadSession();
    } catch (e: any) {
      alert(`Ошибка переоткрытия кассы: ${e.message}`);
    } finally {
      setReopening(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <Banknote className="w-4 h-4 text-gray-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">Касса сегодня</h3>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            Не открыта
          </span>
        </div>
        <p className="text-sm text-gray-500">
          Откройте кассу, чтобы оформлять продажи и расходы сегодня.
        </p>
        <button
          type="button"
          onClick={handleOpen}
          disabled={opening}
          className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          {opening ? 'Открываем...' : 'Открыть кассу'}
        </button>
      </div>
    );
  }

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

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Наличные</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">{fmt(session.system_cash)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Kaspi QR</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">{fmt(session.system_kaspi)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Kaspi перевод</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">{fmt(systemKaspiTransfer)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">POST</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">{fmt(systemHalyk)}</p>
          </div>
        </div>

        <div className="bg-emerald-50 rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-emerald-600 uppercase tracking-wide">Итого</p>
          <p className="text-base font-bold text-emerald-700 mt-0.5">{fmt(session.system_total)}</p>
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

        {/* Расходы по Kaspi: физической сдачи не требуют, но Kaspi-итог уменьшают.
            Раньше в кассе филиала не показывались вовсе — расходились с админкой. */}
        {kaspiExpenses > 0 && (
          <div className="border-t pt-2 mt-1 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Расходы по Kaspi</span>
              <span className="text-red-500">−{kaspiExpenses.toLocaleString('ru-KZ')} ₸</span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t border-gray-100 pt-1.5">
              <span className="text-gray-700">Kaspi за вычетом расходов</span>
              <span className="text-gray-900">{(session.system_kaspi - kaspiExpenses).toLocaleString('ru-KZ')} ₸</span>
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

        {closures.length > 1 && (
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Предыдущие закрытия сегодня</p>
            {closures.slice(0, -1).map((c, idx) => {
              const cDiscrepancy = c.cash_discrepancy;
              const cHasDiscrepancy = Math.abs(cDiscrepancy) > 0;
              return (
                <div key={c.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-2.5 py-2">
                  <div className="text-gray-500">
                    Закрытие {idx + 1} · {new Date(c.closed_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="text-right">
                    <span className="text-gray-700 font-medium">{fmt(c.actual_cash)}</span>
                    {cHasDiscrepancy && (
                      <span className={`ml-1.5 font-medium ${cDiscrepancy > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {fmt(Math.abs(cDiscrepancy))} {cDiscrepancy > 0 ? '(недостача)' : '(излишек)'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isClosed && (
          <button
            type="button"
            onClick={handleReopen}
            disabled={reopening}
            className="w-full py-2 border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {reopening ? 'Открываем...' : 'Переоткрыть кассу'}
          </button>
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
