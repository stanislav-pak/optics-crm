import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AddSaleModal from '@/components/Inventory/AddSaleModal'
import type { Product } from '@/types'

vi.mock('@/services/inventory', () => ({
  getProductsForSale: vi.fn().mockResolvedValue([]),
  getProductsFromStock: vi.fn().mockResolvedValue([]),
  getProductByBarcode: vi.fn().mockResolvedValue(null),
  createStockRequest: vi.fn().mockResolvedValue({ id: 'req-1' }),
  createSale: vi.fn().mockResolvedValue({ id: 'sale-1' }),
}))

vi.mock('@/services/cashSessions', () => ({
  isCashSessionOpenToday: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/services/workshop', () => ({
  fetchServices: vi.fn().mockResolvedValue([]),
  createServiceOrder: vi.fn().mockResolvedValue({ id: 'order-1' }),
  createService: vi.fn().mockResolvedValue({ data: null, error: null }),
}))

vi.mock('@/services/orders', () => ({
  createOrder: vi.fn().mockResolvedValue({ id: 'preorder-1' }),
}))

import { createSale, getProductsForSale } from '@/services/inventory'
import { supabase } from '@/services/supabase'

// Товар, которого в филиале нет вообще: строки в stock нет (после снятия
// фильтра .gt('quantity', 0) такие товары обязаны попадать в список продажи)
const zeroStockProduct: Product = {
  id: 'p1',
  name: 'Оправа Ray-Ban',
  price: 1000,
  cost_price: 500,
  min_stock: 0,
  unit: 'шт',
  attributes: {},
  is_active: true,
  created_at: new Date().toISOString(),
  stock: [{ product_id: 'p1', branch_id: 'branch-1', quantity: 0 } as any],
}

// Тот же товар, но остаток есть — продажа в пределах остатка не должна
// ничего спрашивать (регресс-защита: предупреждение не мешает обычной работе)
const inStockProduct: Product = {
  ...zeroStockProduct,
  stock: [{ product_id: 'p1', branch_id: 'branch-1', quantity: 5 } as any],
}

// Актуальные остатки, которые handleSubmit перезапрашивает перед продажей
function mockStockRows(rows: Array<{ product_id: string; quantity: number }>) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve: any) =>
        resolve(table === 'stock' ? { data: rows, error: null } : { data: [], error: null }),
    }
    return chain
  })
}

async function openSaleWith(product: Product) {
  vi.mocked(getProductsForSale).mockResolvedValueOnce([product])
  render(
    <AddSaleModal
      branchId="branch-1"
      employeeId="emp-1"
      onClose={vi.fn()}
      onSuccess={vi.fn()}
      workshopBranches={[]}
    />
  )
  await waitFor(() => expect(screen.getByText('Новая продажа')).toBeInTheDocument())

  fireEvent.change(screen.getByPlaceholderText('Поиск по названию или штрихкоду...'), {
    target: { value: 'Ray-Ban' },
  })
  await waitFor(() => expect(screen.getByText('Оправа Ray-Ban')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Оправа Ray-Ban'))
  await waitFor(() => expect(screen.getByText('Оплата товаров')).toBeInTheDocument())
}

describe('AddSaleModal — продажа в минус (остатка нет или не хватает)', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    confirmSpy.mockRestore()
  })

  it('товар с нулевым остатком грузится в список продажи (не отфильтрован)', async () => {
    await openSaleWith(zeroStockProduct)
    expect(getProductsForSale).toHaveBeenCalledWith('branch-1')
    expect(screen.getByText('Оправа Ray-Ban')).toBeInTheDocument()
  })

  it('продажа при нулевом остатке проходит: createSale вызывается, остаток уходит в минус', async () => {
    mockStockRows([])
    await openSaleWith(zeroStockProduct)

    fireEvent.click(screen.getByText(/Оформить продажу/))

    await waitFor(() => expect(createSale).toHaveBeenCalledTimes(1))
    const [salePayload, itemsPayload] = vi.mocked(createSale).mock.calls[0]
    expect(salePayload.total).toBe(1000)
    expect(itemsPayload).toEqual([
      expect.objectContaining({ product_id: 'p1', quantity: 1, price: 1000 }),
    ])
  })

  it('перед продажей в минус менеджер видит предупреждение с товаром и итоговым остатком', async () => {
    mockStockRows([])
    await openSaleWith(zeroStockProduct)

    fireEvent.click(screen.getByText(/Оформить продажу/))

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1))
    const message = String(confirmSpy.mock.calls[0][0])
    expect(message).toContain('минус')
    expect(message).toContain('Оправа Ray-Ban')
    expect(message).toContain('−1')
  })

  it('отмена в предупреждении не создаёт продажу', async () => {
    mockStockRows([])
    confirmSpy.mockReturnValue(false)
    await openSaleWith(zeroStockProduct)

    fireEvent.click(screen.getByText(/Оформить продажу/))

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1))
    expect(createSale).not.toHaveBeenCalled()
    // Модал остаётся открытым, кнопка снова активна — можно поправить количество
    expect(screen.getByText(/Оформить продажу/)).not.toBeDisabled()
  })

  it('количество можно увеличить выше остатка (клемпа больше нет)', async () => {
    mockStockRows([{ product_id: 'p1', quantity: 1 }])
    await openSaleWith(inStockProduct)

    const qtyInput = screen.getByDisplayValue('1') as HTMLInputElement
    fireEvent.change(qtyInput, { target: { value: '9' } })
    fireEvent.blur(qtyInput)

    await waitFor(() => expect(screen.getByDisplayValue('9')).toBeInTheDocument())

    fireEvent.click(screen.getByText(/Оформить продажу/))
    await waitFor(() => expect(createSale).toHaveBeenCalledTimes(1))
    const [, itemsPayload] = vi.mocked(createSale).mock.calls[0]
    expect(itemsPayload[0].quantity).toBe(9)
  })

  it('в карточке позиции видно, что остаток уйдёт в минус', async () => {
    await openSaleWith(zeroStockProduct)
    expect(screen.getByText(/остаток уйдёт в минус/i)).toBeInTheDocument()
  })

  it('продажа в пределах остатка ничего не спрашивает', async () => {
    mockStockRows([{ product_id: 'p1', quantity: 5 }])
    await openSaleWith(inStockProduct)

    expect(screen.queryByText(/остаток уйдёт в минус/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText(/Оформить продажу/))

    await waitFor(() => expect(createSale).toHaveBeenCalledTimes(1))
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})
