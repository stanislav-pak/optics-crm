import { supabase } from './supabase';
import type { Branch } from '../types';
import {
  allocateReturnsByPaymentMethod, sumReturnedValueBySale, sumByPaymentMethod,
  type ReturnAllocation, type SalePaidSplit, type PocketTotals,
} from './cashCalc';

export interface AdminCashData {
  salesCash: number;
  salesKaspi: number;
  salesHalyk: number;
  salesKaspiTransfer: number;
  salesCount: number;
  avgCheck: number;
  workshopPrepaidCash: number;
  workshopPrepaidKaspi: number;
  workshopRemainingCash: number;
  workshopRemainingKaspi: number;
  saleDebtSettledCash: number;
  saleDebtSettledKaspi: number;
  /** Погашения долга по всем 4 способам (POST/перевод раньше были недоступны). */
  saleDebtSettled: PocketTotals;
  /** Доплаты мастерской по всем 4 способам. */
  workshopRemaining: PocketTotals;
  /** Оплаты предзаказов (предоплата и 100%) — раньше в кассу не попадали вовсе. */
  preorderPaid: PocketTotals;
  /** Возвраты доплат мастерской — раньше админский свод их не вычитал. */
  remainingRefund: PocketTotals;
  refundCash: number;
  refundKaspi: number;
  returnsCash: number;
  returnsKaspi: number;
  expensesCash: number;
  expensesKaspi: number;
  expenseItems: { name: string; amount: number }[];
  systemCash: number;
  systemKaspi: number;
  systemTotal: number;
  session: { id: string; status: string; actual_cash: number | null; cash_discrepancy: number | null } | null;
}

export async function getAdminCashData(branchId: string, dateStart: string, dateEnd: string): Promise<AdminCashData> {
  const dateFrom = dateStart.split('T')[0];
  const dateTo = dateEnd.split('T')[0];

  const [
    salesRes, prepaidRes, remainingRes, debtSettledRes, refundsRes,
    remainingRefundsRes, preorderRes, returnMovementsRes, expensesRes, sessionRes,
  ] =
    await Promise.all([
      // 1. Sales
      supabase
        .from('sales')
        .select('paid_cash, paid_kaspi, paid_halyk, paid_kaspi_transfer, status')
        .eq('branch_id', branchId)
        .in('status', ['paid', 'refunded', 'partially_refunded'])
        .gte('created_at', dateStart)
        .lte('created_at', dateEnd),

      // 2. Workshop prepayments
      // ТОЛЬКО заказы без привязанной продажи (sale_id IS NULL). Заказ, оформленный
      // внутри продажи (AddSaleModal), кладёт ту же сумму и в paid_cash/paid_kaspi
      // самой продажи, и в prepayment заказа — считать оба значит задвоить кассу.
      // Заказ, созданный напрямую через мастерскую, продажи под собой не имеет,
      // деньги учтены только здесь — его считать обязательно.
      supabase
        .from('service_orders')
        .select('prepayment, prepayment_method')
        .eq('created_branch_id', branchId)
        .is('sale_id', null)
        .gte('prepayment_paid_at', dateStart)
        .lte('prepayment_paid_at', dateEnd)
        .gt('prepayment', 0)
        .not('prepayment_paid_at', 'is', null),

      // 3. Workshop remaining payments
      supabase
        .from('service_orders')
        .select('service_price, parts_price, prepayment, original_prepayment, remaining_payment_method')
        .eq('created_branch_id', branchId)
        .gte('remaining_paid_at', dateStart)
        .lte('remaining_paid_at', dateEnd)
        .not('remaining_paid_at', 'is', null),

      // 3.5. Sale debt settlements (частичная оплата товара, без мастерской)
      supabase
        .from('sales')
        .select('debt_amount, debt_payment_method')
        .eq('branch_id', branchId)
        .gte('debt_paid_at', dateStart)
        .lte('debt_paid_at', dateEnd)
        .not('debt_paid_at', 'is', null),

      // 4. Workshop prepayment refunds
      supabase
        .from('service_orders')
        .select('original_prepayment, prepayment_refund_method')
        .eq('created_branch_id', branchId)
        .gte('prepayment_refunded_at', dateStart)
        .lte('prepayment_refunded_at', dateEnd)
        .not('prepayment_refunded_at', 'is', null),

      // 4б. Возвраты ДОПЛАТ мастерской. Касса филиала их вычитала, админский свод —
      // нет, из-за чего две витрины по одним данным давали разные суммы.
      supabase
        .from('service_orders')
        .select('service_price, parts_price, prepayment, original_prepayment, remaining_refund_method')
        .eq('created_branch_id', branchId)
        .gte('remaining_refunded_at', dateStart)
        .lte('remaining_refunded_at', dateEnd)
        .not('remaining_refunded_at', 'is', null),

      // 4в. Предзаказы, оплаченные в периоде (предоплата или 100%). Продажа под
      // предзаказом не создаётся, поэтому деньги берём прямо из orders — иначе
      // они не попадают в кассу вообще.
      supabase
        .from('orders')
        .select('prepayment_amount, prepayment_method')
        .eq('branch_id', branchId)
        .gte('prepayment_paid_at', dateStart)
        .lte('prepayment_paid_at', dateEnd)
        .gt('prepayment_amount', 0)
        .not('prepayment_paid_at', 'is', null)
        .neq('status', 'cancelled'),

      // 5. Return stock movements
      supabase
        .from('stock_movements')
        .select('quantity, product_id, reference_id')
        .eq('type', 'return')
        .eq('branch_id', branchId)
        .gte('created_at', dateStart)
        .lte('created_at', dateEnd),

      // 6. Expenses
      supabase
        .from('expenses')
        .select('amount, payment_method, category:expense_categories(name)')
        .eq('branch_id', branchId)
        .gte('date', dateFrom)
        .lte('date', dateTo),

      // 7. Cash session (последняя за период)
      supabase
        .from('cash_sessions')
        .select('id, status, actual_cash, cash_discrepancy')
        .eq('branch_id', branchId)
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  // 1. Sales totals
  const salesRows = salesRes.data ?? [];
  // Halyk и Kaspi-перевод — банковские переводы (вбиваются вручную, без API),
  // физически в кассе их нет — считаются отдельно от наличных
  const salesCash = salesRows.reduce((s, x) => s + (Number(x.paid_cash) || 0), 0);
  const salesKaspi = salesRows.reduce((s, x) => s + (Number(x.paid_kaspi) || 0), 0);
  const salesHalyk = salesRows.reduce((s, x) => s + (Number(x.paid_halyk) || 0), 0);
  const salesKaspiTransfer = salesRows.reduce((s, x) => s + (Number(x.paid_kaspi_transfer) || 0), 0);
  const salesCount = salesRows.filter(x => x.status === 'paid').length;
  const avgCheck = salesCount > 0 ? (salesCash + salesKaspi + salesHalyk + salesKaspiTransfer) / salesCount : 0;

  // 2. Workshop prepayments
  const wsPrepaid = sumByPaymentMethod(
    prepaidRes.data, o => o.prepayment_method, o => o.prepayment ?? 0
  );

  // 3. Workshop remaining (используем original_prepayment — неизменяемое поле)
  const wsRemaining = sumByPaymentMethod(
    remainingRes.data,
    o => o.remaining_payment_method,
    o => o.service_price + o.parts_price - (o.original_prepayment ?? o.prepayment)
  );

  // 3.5. Sale debt settlements
  const debtSettled = sumByPaymentMethod(
    debtSettledRes.data, s => s.debt_payment_method, s => s.debt_amount ?? 0
  );

  // 3.6. Предзаказы, оплаченные в периоде
  const preorderPaid = sumByPaymentMethod(
    preorderRes.data, o => o.prepayment_method, o => o.prepayment_amount ?? 0
  );

  // 4. Prepayment refunds
  const prepayRefund = sumByPaymentMethod(
    refundsRes.data, o => o.prepayment_refund_method, o => o.original_prepayment ?? 0
  );

  // 4б. Возвраты доплат мастерской
  const remainingRefund = sumByPaymentMethod(
    remainingRefundsRes.data,
    o => o.remaining_refund_method,
    o => Math.max(0, o.service_price + o.parts_price - (o.original_prepayment ?? o.prepayment))
  );

  // 5. Возвраты товаров — вычитаем из того кармана, которым платили за исходную
  // продажу (раньше всё уходило в минус по наличным). Общая логика с кассой
  // филиала — см. services/cashCalc.ts.
  let returns: ReturnAllocation = { cash: 0, kaspi: 0, halyk: 0, kaspiTransfer: 0 };
  const returnMovements = returnMovementsRes.data ?? [];
  const returnSaleIds = [...new Set(returnMovements.map(r => r.reference_id).filter(Boolean))] as string[];
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
      sumReturnedValueBySale(returnMovements, saleItems ?? []),
      salesById
    );
  }
  const returnsCash = returns.cash;
  const returnsKaspi = returns.kaspi;

  // 6. Expenses
  const expenses = expensesRes.data ?? [];
  const expensesCash = expenses
    .filter(e => e.payment_method === 'cash')
    .reduce((s, e) => s + e.amount, 0);
  const expensesKaspi = expenses
    .filter(e => e.payment_method === 'kaspi')
    .reduce((s, e) => s + e.amount, 0);

  const byCat: Record<string, number> = {};
  for (const e of expenses) {
    const cat = (e.category as { name: string } | null);
    const key = cat?.name ?? 'Прочее';
    byCat[key] = (byCat[key] ?? 0) + e.amount;
  }
  const expenseItems = Object.entries(byCat)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);

  // Formulas
  // Приход по каждому карману минус возвраты по нему же.
  const income = (p: keyof ReturnAllocation) =>
    wsPrepaid[p] + preorderPaid[p] + wsRemaining[p] + debtSettled[p]
    - prepayRefund[p] - remainingRefund[p] - returns[p];

  const systemCash = salesCash + income('cash');
  const systemKaspi = salesKaspi + income('kaspi');
  const systemTotal =
    systemCash + systemKaspi
    + (salesHalyk + income('halyk'))
    + (salesKaspiTransfer + income('kaspiTransfer'));

  return {
    salesCash,
    salesKaspi,
    salesHalyk,
    salesKaspiTransfer,
    salesCount,
    avgCheck,
    workshopPrepaidCash: wsPrepaid.cash,
    workshopPrepaidKaspi: wsPrepaid.kaspi,
    workshopRemainingCash: wsRemaining.cash,
    workshopRemainingKaspi: wsRemaining.kaspi,
    workshopRemaining: wsRemaining,
    saleDebtSettledCash: debtSettled.cash,
    saleDebtSettledKaspi: debtSettled.kaspi,
    saleDebtSettled: debtSettled,
    preorderPaid,
    refundCash: prepayRefund.cash,
    refundKaspi: prepayRefund.kaspi,
    remainingRefund,
    returnsCash,
    returnsKaspi,
    expensesCash,
    expensesKaspi,
    expenseItems,
    systemCash,
    systemKaspi,
    systemTotal,
    session: sessionRes.data ?? null,
  };
}

export async function getAdminStockValue(branchId: string): Promise<number> {
  const { data } = await supabase
    .from('stock')
    .select('quantity, products(price)')
    .eq('branch_id', branchId)
    .gt('quantity', 0);

  if (!data) return 0;
  return data.reduce((sum, row: any) => {
    const price = row.products?.price ?? 0;
    return sum + (row.quantity * price);
  }, 0);
}

export async function getAdminBranches(): Promise<Branch[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('is_warehouse', false)
    .order('name');
  if (error) throw error;
  return (data ?? []) as Branch[];
}
