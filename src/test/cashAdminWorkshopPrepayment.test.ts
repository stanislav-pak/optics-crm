import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAdminCashData } from '@/services/cashAdmin'
import { supabase } from '@/services/supabase'

// Баг: заказ мастерской, оформленный ВНУТРИ продажи, кладёт одну и ту же сумму
// в два места — в paid_cash/paid_kaspi самой продажи и в prepayment заказа.
// Касса складывала оба → ремонт на 500 ₸ показывал 1000 ₸.
// Фикс: в подсчёт предоплат мастерской берём только заказы БЕЗ продажи
// (sale_id IS NULL). Тест проверяет ОБА направления: заказ с продажей не
// считается, заказ без продажи считается как раньше.
//
// Фейковый билдер повторяет семантику .is('sale_id', null): он реально
// фильтрует набор по записанному условию, а не просто проверяет, что метод
// вызвали. Если убрать .is() из запроса — вернутся все 4 заказа и тест упадёт
// на суммах, а не на «не вызвали метод».

const WORKSHOP_ORDERS = [
  // Созданы напрямую через мастерскую — продажи под ними нет, деньги учтены
  // только здесь. Должны считаться.
  { sale_id: null, prepayment: 3000, prepayment_method: 'cash' },
  { sale_id: null, prepayment: 2000, prepayment_method: 'kaspi' },
  // Оформлены внутри продажи — деньги уже посчитаны в самой продаже.
  // Считаться НЕ должны.
  { sale_id: 'sale-1', prepayment: 700, prepayment_method: 'cash' },
  { sale_id: 'sale-2', prepayment: 500, prepayment_method: 'kaspi' },
]

type Filters = { isNullCols: string[]; notCols: string[] }

function makeBuilder(table: string, calls: { table: string; filters: Filters }[]) {
  const filters: Filters = { isNullCols: [], notCols: [] }
  calls.push({ table, filters })

  const rows = () => {
    if (table !== 'service_orders') return []
    // Три разных запроса к service_orders различаем по колонке в .not(...):
    // предоплаты / доплаты при выдаче / возвраты предоплат.
    if (!filters.notCols.includes('prepayment_paid_at')) return []
    return WORKSHOP_ORDERS.filter(o =>
      filters.isNullCols.includes('sale_id') ? o.sale_id === null : true
    )
  }

  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    in: () => builder,
    gt: () => builder,
    gte: () => builder,
    lte: () => builder,
    order: () => builder,
    limit: () => builder,
    is: (col: string, val: unknown) => {
      if (val === null) filters.isNullCols.push(col)
      return builder
    },
    not: (col: string) => {
      filters.notCols.push(col)
      return builder
    },
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
      resolve({ data: rows(), error: null }),
  }
  return builder
}

describe('getAdminCashData — предоплаты мастерской', () => {
  let calls: { table: string; filters: Filters }[]

  beforeEach(() => {
    calls = []
    vi.mocked(supabase.from).mockReset()
    vi.mocked(supabase.from).mockImplementation(
      ((table: string) => makeBuilder(table, calls)) as never
    )
  })

  it('не считает предоплату заказа, оформленного внутри продажи (иначе касса двоит)', async () => {
    const data = await getAdminCashData('branch-1', '2026-08-10T00:00:00', '2026-08-10T23:59:59')

    // 700 (cash) и 500 (kaspi) сидят в привязанных продажах — сюда попасть не должны
    expect(data.workshopPrepaidCash).toBe(3000)
    expect(data.workshopPrepaidKaspi).toBe(2000)
  })

  it('заказ мастерской БЕЗ продажи по-прежнему считается — оба кармана', async () => {
    const data = await getAdminCashData('branch-1', '2026-08-10T00:00:00', '2026-08-10T23:59:59')

    // Обратный случай: если бы фильтр отрезал вообще всё, суммы были бы 0
    expect(data.workshopPrepaidCash).toBeGreaterThan(0)
    expect(data.workshopPrepaidKaspi).toBeGreaterThan(0)
  })

  it('фильтр sale_id IS NULL применён именно к запросу предоплат', async () => {
    await getAdminCashData('branch-1', '2026-08-10T00:00:00', '2026-08-10T23:59:59')

    const prepaymentQuery = calls.find(
      c => c.table === 'service_orders' && c.filters.notCols.includes('prepayment_paid_at')
    )
    expect(prepaymentQuery?.filters.isNullCols).toContain('sale_id')
  })

  // Доплата при выдаче фиксируется только в самом заказе, продажи под ней нет —
  // задвоения не даёт, и фильтр по sale_id её бы НЕПРАВИЛЬНО отрезал.
  it('запрос доплат при выдаче фильтром по sale_id НЕ трогается', async () => {
    await getAdminCashData('branch-1', '2026-08-10T00:00:00', '2026-08-10T23:59:59')

    const remainingQuery = calls.find(
      c => c.table === 'service_orders' && c.filters.notCols.includes('remaining_paid_at')
    )
    expect(remainingQuery).toBeDefined()
    expect(remainingQuery?.filters.isNullCols).not.toContain('sale_id')
  })
})
