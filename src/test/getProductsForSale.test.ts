import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getProductsForSale } from '@/services/inventory'
import { supabase } from '@/services/supabase'

// Слепок ответов Supabase по таблицам: getProductsForSale делает два запроса
// параллельно — по stock филиала и по товарам самого филиала.
function mockTables(responses: {
  stock?: { data?: unknown; error?: unknown }
  products?: { data?: unknown; error?: unknown }
}) {
  const calls: Record<string, Array<[string, unknown]>> = { stock: [], products: [] }

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((col: string, val: unknown) => { calls[table]?.push([col, val]); return chain }),
      then: (resolve: (r: unknown) => unknown) =>
        resolve(
          table === 'stock'
            ? { data: responses.stock?.data ?? [], error: responses.stock?.error ?? null }
            : { data: responses.products?.data ?? [], error: responses.products?.error ?? null }
        ),
    }
    return chain as never
  })

  return calls
}

const product = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, price: 100, cost_price: 50, min_stock: 0, unit: 'шт',
  attributes: {}, is_active: true, created_at: '2026-01-01T00:00:00Z', ...extra,
})

describe('getProductsForSale — список товаров для продажи (минус разрешён)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('берёт товары с нулевым и отрицательным остатком, а не только «в наличии»', async () => {
    mockTables({
      stock: {
        data: [
          { product: product('p1', 'Оправа', { stock: [{ branch_id: 'b1', quantity: 0 }] }) },
          { product: product('p2', 'Линза', { stock: [{ branch_id: 'b1', quantity: -3 }] }) },
        ],
      },
    })

    const result = await getProductsForSale('b1')
    expect(result.map(p => p.id)).toEqual(['p2', 'p1']) // отсортировано по названию
  })

  it('добавляет товары филиала, у которых строки в stock ещё нет вовсе', async () => {
    mockTables({
      stock: { data: [{ product: product('p1', 'Оправа') }] },
      products: { data: [product('p9', 'Ни разу не приходованный')] },
    })

    const result = await getProductsForSale('b1')
    expect(result.map(p => p.id).sort()).toEqual(['p1', 'p9'])
  })

  it('не дублирует товар, попавший в оба запроса', async () => {
    mockTables({
      stock: { data: [{ product: product('p1', 'Оправа') }] },
      products: { data: [product('p1', 'Оправа')] },
    })

    const result = await getProductsForSale('b1')
    expect(result).toHaveLength(1)
  })

  it('удалённые товары (is_active=false) в продажу не попадают', async () => {
    const calls = mockTables({
      stock: {
        data: [
          { product: product('p1', 'Живой') },
          { product: product('p2', 'Удалённый', { is_active: false }) },
          { product: null },
        ],
      },
    })

    const result = await getProductsForSale('b1')
    expect(result.map(p => p.id)).toEqual(['p1'])
    // во втором запросе фильтр по is_active стоит на стороне БД
    expect(calls.products).toContainEqual(['is_active', true])
  })

  it('оба запроса ограничены филиалом', async () => {
    const calls = mockTables({})
    await getProductsForSale('b1')
    expect(calls.stock).toContainEqual(['branch_id', 'b1'])
    expect(calls.products).toContainEqual(['branch_id', 'b1'])
  })

  it('ошибка любого из запросов не проглатывается', async () => {
    mockTables({ stock: { error: { message: 'boom' } } })
    await expect(getProductsForSale('b1')).rejects.toBeTruthy()
  })
})
