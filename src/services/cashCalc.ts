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

const ZERO: ReturnAllocation = { cash: 0, kaspi: 0, halyk: 0, kaspiTransfer: 0 };

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
