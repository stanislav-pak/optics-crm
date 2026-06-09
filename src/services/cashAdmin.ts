import { supabase } from './supabase';
import type { Branch } from '../types';

export interface AdminCashData {
  salesCash: number;
  salesKaspi: number;
  workshopPrepaidCash: number;
  workshopPrepaidKaspi: number;
  workshopRemainingCash: number;
  workshopRemainingKaspi: number;
  refundCash: number;
  refundKaspi: number;
  returnsCash: number;
  expensesCash: number;
  expensesKaspi: number;
  expenseItems: { name: string; amount: number }[];
  systemCash: number;
  systemKaspi: number;
  systemTotal: number;
  session: { status: string; actual_cash: number | null; cash_discrepancy: number | null } | null;
}

export async function getAdminCashData(branchId: string, date: string): Promise<AdminCashData> {
  const dateStart = date + 'T00:00:00';
  const dateEnd = date + 'T23:59:59';

  const [salesRes, prepaidRes, remainingRes, refundsRes, returnMovementsRes, expensesRes, sessionRes] =
    await Promise.all([
      // 1. Sales
      supabase
        .from('sales')
        .select('paid_cash, paid_kaspi')
        .eq('branch_id', branchId)
        .in('status', ['paid', 'refunded', 'partially_refunded'])
        .gte('created_at', dateStart)
        .lte('created_at', dateEnd),

      // 2. Workshop prepayments
      supabase
        .from('service_orders')
        .select('prepayment, prepayment_method')
        .eq('created_branch_id', branchId)
        .gte('prepayment_paid_at', dateStart)
        .lte('prepayment_paid_at', dateEnd)
        .gt('prepayment', 0)
        .not('prepayment_paid_at', 'is', null),

      // 3. Workshop remaining payments
      supabase
        .from('service_orders')
        .select('service_price, parts_price, prepayment, remaining_payment_method')
        .eq('created_branch_id', branchId)
        .gte('remaining_paid_at', dateStart)
        .lte('remaining_paid_at', dateEnd)
        .not('remaining_paid_at', 'is', null),

      // 4. Workshop prepayment refunds
      supabase
        .from('service_orders')
        .select('original_prepayment, prepayment_refund_method')
        .eq('created_branch_id', branchId)
        .gte('prepayment_refunded_at', dateStart)
        .lte('prepayment_refunded_at', dateEnd)
        .not('prepayment_refunded_at', 'is', null),

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
        .eq('date', date),

      // 7. Cash session
      supabase
        .from('cash_sessions')
        .select('status, actual_cash, cash_discrepancy')
        .eq('branch_id', branchId)
        .eq('date', date)
        .maybeSingle(),
    ]);

  // 1. Sales totals
  const salesCash = (salesRes.data ?? []).reduce((s, x) => s + (Number(x.paid_cash) || 0), 0);
  const salesKaspi = (salesRes.data ?? []).reduce((s, x) => s + (Number(x.paid_kaspi) || 0), 0);

  // 2. Workshop prepayments
  const workshopPrepaidCash = (prepaidRes.data ?? [])
    .filter(o => o.prepayment_method === 'cash')
    .reduce((s, o) => s + (o.prepayment ?? 0), 0);
  const workshopPrepaidKaspi = (prepaidRes.data ?? [])
    .filter(o => o.prepayment_method === 'kaspi')
    .reduce((s, o) => s + (o.prepayment ?? 0), 0);

  // 3. Workshop remaining
  const workshopRemainingCash = (remainingRes.data ?? [])
    .filter(o => o.remaining_payment_method === 'cash')
    .reduce((s, o) => s + (o.service_price + o.parts_price - o.prepayment), 0);
  const workshopRemainingKaspi = (remainingRes.data ?? [])
    .filter(o => o.remaining_payment_method === 'kaspi')
    .reduce((s, o) => s + (o.service_price + o.parts_price - o.prepayment), 0);

  // 4. Prepayment refunds
  const refundCash = (refundsRes.data ?? [])
    .filter(o => o.prepayment_refund_method === 'cash')
    .reduce((s, o) => s + (o.original_prepayment ?? 0), 0);
  const refundKaspi = (refundsRes.data ?? [])
    .filter(o => o.prepayment_refund_method === 'kaspi')
    .reduce((s, o) => s + (o.original_prepayment ?? 0), 0);

  // 5. Returns cash (sale items price × returned quantity)
  let returnsCash = 0;
  const returnMovements = returnMovementsRes.data ?? [];
  const returnSaleIds = [...new Set(returnMovements.map(r => r.reference_id).filter(Boolean))] as string[];
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

    returnsCash = returnMovements.reduce((sum, r) => {
      const unitPrice = priceMap[r.reference_id ?? '']?.[r.product_id] ?? 0;
      return sum + r.quantity * unitPrice;
    }, 0);
  }

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
  const systemCash =
    salesCash + workshopPrepaidCash + workshopRemainingCash - refundCash - returnsCash;
  const systemKaspi =
    salesKaspi + workshopPrepaidKaspi + workshopRemainingKaspi - refundKaspi;
  const systemTotal = systemCash + systemKaspi;

  return {
    salesCash,
    salesKaspi,
    workshopPrepaidCash,
    workshopPrepaidKaspi,
    workshopRemainingCash,
    workshopRemainingKaspi,
    refundCash,
    refundKaspi,
    returnsCash,
    expensesCash,
    expensesKaspi,
    expenseItems,
    systemCash,
    systemKaspi,
    systemTotal,
    session: sessionRes.data ?? null,
  };
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
