import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAdminCashData } from '@/services/cashAdmin'
import { sumByPaymentMethod } from '@/services/cashCalc'
import { supabase } from '@/services/supabase'

// Три бага, которые тут закрыты:
//  * деньги предзаказа (orders) не попадали в кассу вообще — продажа под
//    предзаказом не создаётся, а таблицу orders касса не читала;
//  * админский свод не вычитал возвраты ДОПЛАТ мастерской (касса филиала
//    вычитала) — две витрины расходились;
//  * долг и доплату можно было закрыть только наличными или Kaspi QR, оплата
//    через POST и перевод просто терялась.

type Filters = { notCols: string[]; isNullCols: string[] }

interface Dataset {
  sales?: unknown[]
  service_orders_prepaid?: unknown[]
  service_orders_remaining?: unknown[]
  service_orders_prepay_refund?: unknown[]
  service_orders_remaining_refund?: unknown[]
  sales_debt?: unknown[]
  orders?: unknown[]
  stock_movements?: unknown[]
  expenses?: unknown[]
}

// Фейковый билдер повторяет семантику фильтров: какая именно из пяти выборок по
// service_orders/sales идёт, определяем по колонке в .not(...) — ровно так их
// различает сам сервис.
function makeSupabaseMock(data: Dataset) {
  return (table: string) => {
    const filters: Filters = { notCols: [], isNullCols: [] }
    const rows = (): unknown[] => {
      if (table === 'service_orders') {
        if (filters.notCols.includes('prepayment_paid_at')) return data.service_orders_prepaid ?? []
        if (filters.notCols.includes('remaining_paid_at')) return data.service_orders_remaining ?? []
        if (filters.notCols.includes('prepayment_refunded_at')) return data.service_orders_prepay_refund ?? []
        if (filters.notCols.includes('remaining_refunded_at')) return data.service_orders_remaining_refund ?? []
        return []
      }
      if (table === 'sales') {
        return filters.notCols.includes('debt_paid_at') ? (data.sales_debt ?? []) : (data.sales ?? [])
      }
      if (table === 'orders') return data.orders ?? []
      if (table === 'stock_movements') return data.stock_movements ?? []
      if (table === 'expenses') return data.expenses ?? []
      return []
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
}

function load(data: Dataset) {
  vi.mocked(supabase.from).mockImplementation(makeSupabaseMock(data) as never)
  return getAdminCashData('branch-1', '2026-08-11T00:00:00', '2026-08-11T23:59:59')
}

describe('касса: предзаказы', () => {
  beforeEach(() => { vi.mocked(supabase.from).mockReset() })

  it('предоплата предзаказа попадает в кассу по своему способу оплаты', async () => {
    const data = await load({
      orders: [{ prepayment_amount: 7000, prepayment_method: 'cash' }],
    })

    expect(data.preorderPaid.cash).toBe(7000)
    expect(data.systemCash).toBe(7000)
  })

  it('100% оплата предзаказа не теряется (раньше писался 0 и денег не было нигде)', async () => {
    const data = await load({
      orders: [{ prepayment_amount: 25000, prepayment_method: 'kaspi' }],
    })

    expect(data.preorderPaid.kaspi).toBe(25000)
    expect(data.systemKaspi).toBe(25000)
  })

  it('предзаказ, оплаченный через POST, идёт в POST, а не в наличные', async () => {
    const data = await load({
      orders: [{ prepayment_amount: 9000, prepayment_method: 'halyk' }],
    })

    expect(data.preorderPaid.halyk).toBe(9000)
    expect(data.systemCash).toBe(0)
    expect(data.systemKaspi).toBe(0)
    // POST физической сдачи не требует, но в общий итог входит
    expect(data.systemTotal).toBe(9000)
  })

  it('без предзаказов ничего не добавляется', async () => {
    const data = await load({})

    expect(data.preorderPaid).toEqual({ cash: 0, kaspi: 0, halyk: 0, kaspiTransfer: 0 })
    expect(data.systemTotal).toBe(0)
  })
})

describe('касса: возврат доплаты мастерской в админском своде', () => {
  beforeEach(() => { vi.mocked(supabase.from).mockReset() })

  it('возврат доплаты вычитается (раньше админка его игнорировала)', async () => {
    const data = await load({
      // Доплата 3000 принята наличными и в тот же период возвращена
      service_orders_remaining: [{
        service_price: 5000, parts_price: 0, prepayment: 2000,
        original_prepayment: 2000, remaining_payment_method: 'cash',
      }],
      service_orders_remaining_refund: [{
        service_price: 5000, parts_price: 0, prepayment: 2000,
        original_prepayment: 2000, remaining_refund_method: 'cash',
      }],
    })

    expect(data.workshopRemaining.cash).toBe(3000)
    expect(data.remainingRefund.cash).toBe(3000)
    // Приняли и вернули — в кассе ноль
    expect(data.systemCash).toBe(0)
  })
})

describe('касса: POST и перевод для долга и доплаты', () => {
  beforeEach(() => { vi.mocked(supabase.from).mockReset() })

  it('долг, погашенный через POST, идёт в POST, а не теряется', async () => {
    const data = await load({
      sales_debt: [{ debt_amount: 20000, debt_payment_method: 'halyk' }],
    })

    expect(data.saleDebtSettled.halyk).toBe(20000)
    expect(data.systemCash).toBe(0)
    expect(data.systemTotal).toBe(20000)
  })

  it('долг, погашенный переводом, идёт в перевод', async () => {
    const data = await load({
      sales_debt: [{ debt_amount: 4000, debt_payment_method: 'kaspi_transfer' }],
    })

    expect(data.saleDebtSettled.kaspiTransfer).toBe(4000)
    expect(data.systemTotal).toBe(4000)
  })

  it('доплата мастерской через POST попадает в POST', async () => {
    const data = await load({
      service_orders_remaining: [{
        service_price: 6000, parts_price: 1000, prepayment: 1000,
        original_prepayment: 1000, remaining_payment_method: 'halyk',
      }],
    })

    expect(data.workshopRemaining.halyk).toBe(6000)
    expect(data.systemCash).toBe(0)
  })
})

describe('sumByPaymentMethod', () => {
  it('раскладывает по всем четырём карманам', () => {
    const r = sumByPaymentMethod(
      [
        { m: 'cash', a: 100 },
        { m: 'kaspi', a: 200 },
        { m: 'halyk', a: 300 },
        { m: 'kaspi_transfer', a: 400 },
      ],
      r => r.m, r => r.a
    )

    expect(r).toEqual({ cash: 100, kaspi: 200, halyk: 300, kaspiTransfer: 400 })
  })

  // Способ может быть не проставлен у старых записей — такие суммы просто
  // не должны попасть ни в один карман (а не свалиться в наличные).
  it('записи без способа оплаты не падают в наличные', () => {
    const r = sumByPaymentMethod(
      [{ m: null, a: 500 }, { m: undefined, a: 600 }, { m: 'cash', a: 100 }],
      r => r.m as string | null | undefined, r => r.a
    )

    expect(r.cash).toBe(100)
    expect(r.kaspi + r.halyk + r.kaspiTransfer).toBe(0)
  })
})
