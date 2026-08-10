// Общая арифметика кассы, вынесенная из CashSessionCard и cashAdmin, чтобы касса
// филиала и админский свод считали одинаково.

export interface SalePaidSplit {
  paid_cash: number;
  paid_kaspi: number;
  paid_halyk: number;
  paid_kaspi_transfer: number;
}

export interface ReturnAllocation {
  cash: number;
  kaspi: number;
  halyk: number;
  kaspiTransfer: number;
}

/** Четыре «кармана» кассы. Совпадает по форме с ReturnAllocation. */
export type PocketTotals = ReturnAllocation;

/** Способы оплаты, которыми можно закрыть долг/доплату/предоплату. */
export type PaymentMethodKey = 'cash' | 'kaspi' | 'halyk' | 'kaspi_transfer';

/** Порядок кнопок выбора способа оплаты — одинаковый во всех местах. */
export const PAYMENT_METHODS: readonly PaymentMethodKey[] = [
  'cash', 'kaspi', 'halyk', 'kaspi_transfer',
];

/** Короткие подписи для кнопок (места мало, особенно на телефоне). */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKey, string> = {
  cash: 'Нал',
  kaspi: 'Kaspi',
  halyk: 'POST',
  kaspi_transfer: 'Перевод',
};

/**
 * Сырые строки за день/период, из которых считается касса. Одинаковый набор
 * тянут и карточка филиала, и админский свод, и серверная функция
 * compute_cash_session_totals — она зеркалит арифметику computeCashTotals
 * один в один (см. миграцию 20260811_compute_cash_session_totals.sql).
 */
export interface CashTotalsInput {
  sales: SalePaidSplit[];
  workshopPrepayments: { prepayment: number; prepayment_method?: string | null }[];
  workshopRemaining: {
    service_price: number; parts_price: number; prepayment: number;
    original_prepayment?: number | null; remaining_payment_method?: string | null;
  }[];
  debtSettlements: { debt_amount: number; debt_payment_method?: string | null }[];
  preorderPayments: { prepayment_amount: number; prepayment_method?: string | null }[];
  prepaymentRefunds: { original_prepayment?: number | null; prepayment_refund_method?: string | null }[];
  remainingRefunds: {
    service_price: number; parts_price: number; prepayment: number;
    original_prepayment?: number | null; remaining_refund_method?: string | null;
  }[];
  returnMovements: { quantity: number; product_id: string; reference_id: string | null }[];
  returnSaleItems: { sale_id: string; product_id: string; price: number }[];
  returnSales: ({ id: string } & SalePaidSplit)[];
  expenses: { amount: number; payment_method?: string | null }[];
}

export interface CashTotals {
  sales: PocketTotals;
  workshopPrepaid: PocketTotals;
  workshopRemaining: PocketTotals;
  debtSettled: PocketTotals;
  preorderPaid: PocketTotals;
  prepaymentRefund: PocketTotals;
  remainingRefund: PocketTotals;
  returns: PocketTotals;
  systemCash: number;
  systemKaspi: number;
  systemHalyk: number;
  systemKaspiTransfer: number;
  systemTotal: number;
  expensesCash: number;
  expensesKaspi: number;
}

const ZERO: ReturnAllocation = { cash: 0, kaspi: 0, halyk: 0, kaspiTransfer: 0 };

function sumField<T>(rows: T[] | null | undefined, get: (row: T) => number): number {
  return (rows ?? []).reduce((s, r) => s + (Number(get(r)) || 0), 0);
}

export function emptyPockets(): PocketTotals {
  return { ...ZERO };
}

/**
 * Раскладывает суммы по карманам согласно способу оплаты каждой записи.
 * Заменяет повторяющиеся `.filter(m === 'cash').reduce(...)` — раньше они были
 * написаны по два раза на каждый денежный поток и знали только про наличные и
 * Kaspi QR, из-за чего оплата через POST или Kaspi-перевод просто терялась.
 * Неизвестный способ игнорируется (в карман не попадёт).
 */
export function sumByPaymentMethod<T>(
  rows: T[] | null | undefined,
  getMethod: (row: T) => string | null | undefined,
  getAmount: (row: T) => number
): PocketTotals {
  const totals = emptyPockets();
  for (const row of rows ?? []) {
    const amount = Number(getAmount(row)) || 0;
    if (!amount) continue;
    switch (getMethod(row)) {
      case 'cash': totals.cash += amount; break;
      case 'kaspi': totals.kaspi += amount; break;
      case 'halyk': totals.halyk += amount; break;
      case 'kaspi_transfer': totals.kaspiTransfer += amount; break;
      default: break;
    }
  }
  return totals;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Раскидывает суммы возвратов по тем «карманам», которыми была оплачена исходная
 * продажа.
 *
 * Раньше возврат всегда вычитался из наличных, независимо от способа оплаты:
 * вернули товар, купленный по Kaspi — наличные занижались, Kaspi оставался
 * завышенным, и у менеджера при закрытии вылезала ложная недостача.
 *
 * Смешанная оплата делится ПРОПОРЦИОНАЛЬНО фактическим paid_* исходной продажи.
 * Позиция продажи не хранит, чем именно её оплатили, так что точнее пропорции
 * из данных не выжать. Для продажи с одним способом оплаты пропорция вырождается
 * в 100% этого способа — то есть обычный случай считается точно.
 *
 * Вычитаем не больше, чем по продаже реально получено через paid_* (`paidSum`):
 * если клиент оплатил часть, а остаток ушёл в долг, вернуть можно только
 * полученное. Погашенный долг (debt_amount/debt_paid_at) в пропорцию НЕ входит —
 * это отдельный поток со своей датой и своим способом оплаты, он учитывается
 * в кассе отдельной строкой. Из-за этого возврат по продаже, где долг уже
 * погасили, будет вычтен не полностью — редкий стык (нужны и долг, и возврат по
 * одной продаже), сознательно оставлен на отдельную задачу.
 */
export function allocateReturnsByPaymentMethod(
  returnedValueBySaleId: Record<string, number>,
  salesById: Record<string, SalePaidSplit>
): ReturnAllocation {
  const total: ReturnAllocation = { ...ZERO };

  for (const [saleId, returnedValue] of Object.entries(returnedValueBySaleId)) {
    const sale = salesById[saleId];
    if (!sale || returnedValue <= 0) continue;

    const paid = [
      Number(sale.paid_cash) || 0,
      Number(sale.paid_kaspi) || 0,
      Number(sale.paid_halyk) || 0,
      Number(sale.paid_kaspi_transfer) || 0,
    ];
    const paidSum = paid.reduce((s, v) => s + v, 0);
    // По продаже ничего не получено через paid_* — вычитать неоткуда.
    if (paidSum <= 0) continue;

    const amount = Math.min(returnedValue, paidSum);
    const shares = paid.map(v => round2((amount * v) / paidSum));

    // Копейки округления отдаём самому крупному карману, чтобы сумма долей
    // сходилась с amount и деньги не «испарялись» по чуть-чуть.
    const residual = round2(amount - shares.reduce((s, v) => s + v, 0));
    if (residual !== 0) {
      const biggest = paid.indexOf(Math.max(...paid));
      shares[biggest] = round2(shares[biggest] + residual);
    }

    total.cash += shares[0];
    total.kaspi += shares[1];
    total.halyk += shares[2];
    total.kaspiTransfer += shares[3];
  }

  return {
    cash: round2(total.cash),
    kaspi: round2(total.kaspi),
    halyk: round2(total.halyk),
    kaspiTransfer: round2(total.kaspiTransfer),
  };
}

/**
 * Считает стоимость возвращённого по каждой продаже: количество из движения
 * склада × цена этой позиции в исходной продаже.
 */
export function computeCashTotals(input: CashTotalsInput): CashTotals {
  const sales = {
    cash: sumField(input.sales, s => s.paid_cash),
    kaspi: sumField(input.sales, s => s.paid_kaspi),
    halyk: sumField(input.sales, s => s.paid_halyk),
    kaspiTransfer: sumField(input.sales, s => s.paid_kaspi_transfer),
  };

  const workshopPrepaid = sumByPaymentMethod(
    input.workshopPrepayments, o => o.prepayment_method, o => o.prepayment ?? 0
  );
  const workshopRemaining = sumByPaymentMethod(
    input.workshopRemaining,
    o => o.remaining_payment_method,
    o => o.service_price + o.parts_price - (o.original_prepayment ?? o.prepayment)
  );
  const debtSettled = sumByPaymentMethod(
    input.debtSettlements, s => s.debt_payment_method, s => s.debt_amount ?? 0
  );
  const preorderPaid = sumByPaymentMethod(
    input.preorderPayments, o => o.prepayment_method, o => o.prepayment_amount ?? 0
  );
  const prepaymentRefund = sumByPaymentMethod(
    input.prepaymentRefunds, o => o.prepayment_refund_method, o => o.original_prepayment ?? 0
  );
  const remainingRefund = sumByPaymentMethod(
    input.remainingRefunds,
    o => o.remaining_refund_method,
    o => Math.max(0, o.service_price + o.parts_price - (o.original_prepayment ?? o.prepayment))
  );

  const salesById: Record<string, SalePaidSplit> = {};
  for (const s of input.returnSales) salesById[s.id] = s;
  const returns = allocateReturnsByPaymentMethod(
    sumReturnedValueBySale(input.returnMovements, input.returnSaleItems),
    salesById
  );

  // Приход по карману минус возвраты по нему же.
  const income = (p: keyof PocketTotals) =>
    workshopPrepaid[p] + preorderPaid[p] + workshopRemaining[p] + debtSettled[p]
    - prepaymentRefund[p] - remainingRefund[p] - returns[p];

  const systemCash = sales.cash + income('cash');
  const systemKaspi = sales.kaspi + income('kaspi');
  const systemHalyk = sales.halyk + income('halyk');
  const systemKaspiTransfer = sales.kaspiTransfer + income('kaspiTransfer');

  return {
    sales,
    workshopPrepaid,
    workshopRemaining,
    debtSettled,
    preorderPaid,
    prepaymentRefund,
    remainingRefund,
    returns,
    systemCash,
    systemKaspi,
    systemHalyk,
    systemKaspiTransfer,
    systemTotal: systemCash + systemKaspi + systemHalyk + systemKaspiTransfer,
    // Расходы НАМЕРЕННО не входят в system_*: их вычитает close_cash_session
    // при закрытии (наличные) и витрины при показе (Kaspi). Если вычесть их
    // здесь, расхождение при закрытии посчитается по расходам дважды.
    expensesCash: sumField(
      input.expenses.filter(e => e.payment_method === 'cash'), e => e.amount
    ),
    expensesKaspi: sumField(
      input.expenses.filter(e => e.payment_method === 'kaspi'), e => e.amount
    ),
  };
}

export function sumReturnedValueBySale(
  returnMovements: { quantity: number; product_id: string; reference_id: string | null }[],
  saleItems: { sale_id: string; product_id: string; price: number }[]
): Record<string, number> {
  const priceMap: Record<string, Record<string, number>> = {};
  for (const si of saleItems) {
    if (!priceMap[si.sale_id]) priceMap[si.sale_id] = {};
    priceMap[si.sale_id][si.product_id] = si.price;
  }

  const bySale: Record<string, number> = {};
  for (const m of returnMovements) {
    const saleId = m.reference_id;
    if (!saleId) continue;
    const unitPrice = priceMap[saleId]?.[m.product_id] ?? 0;
    bySale[saleId] = (bySale[saleId] ?? 0) + m.quantity * unitPrice;
  }
  return bySale;
}
