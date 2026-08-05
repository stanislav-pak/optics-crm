import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AddSaleModal from '@/components/Inventory/AddSaleModal'
import type { Product } from '@/types'

vi.mock('@/services/inventory', () => ({
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
  createService: vi.fn().mockResolvedValue({
    data: { id: 'svc-1', name: 'Ремонт оправы', price: 0, branch_id: null, is_active: true, created_at: new Date().toISOString() },
    error: null,
  }),
}))

vi.mock('@/services/orders', () => ({
  createOrder: vi.fn().mockResolvedValue({ id: 'preorder-1' }),
}))

import { createSale, getProductsFromStock } from '@/services/inventory'
import { createServiceOrder } from '@/services/workshop'
import { supabase } from '@/services/supabase'

// Одна мастерская — auto-select срабатывает (workshopBranches.length === 1),
// поведение не отличается от старого хардкода WORKSHOP_BRANCH_ID
const mockWorkshopBranches = [{ id: 'workshop-1', name: 'Мастерская' }]

const mockProduct: Product = {
  id: 'p1',
  name: 'Оправа Ray-Ban',
  price: 1000,
  cost_price: 500,
  min_stock: 0,
  unit: 'шт',
  attributes: {},
  is_active: true,
  created_at: new Date().toISOString(),
  stock: [{ product_id: 'p1', branch_id: 'branch-1', quantity: 5 } as any],
}

// Находит <input> рядом с текстовой меткой (компонент не использует htmlFor/id)
function inputNearLabel(labelText: string): HTMLInputElement {
  const label = screen.getByText(labelText)
  const container = label.closest('div')
  const input = container?.querySelector('input')
  if (!input) throw new Error(`Input near label "${labelText}" not found`)
  return input as HTMLInputElement
}

async function openWorkshopSectionWithService() {
  render(
    <AddSaleModal
      branchId="branch-1"
      employeeId="emp-1"
      onClose={vi.fn()}
      onSuccess={vi.fn()}
      workshopBranches={mockWorkshopBranches}
    />
  )

  // дождаться начальной загрузки (getProductsFromStock/fetchServices/clients)
  await waitFor(() => expect(screen.getByText('Новая продажа')).toBeInTheDocument())

  fireEvent.click(screen.getByText('Добавить заказ в мастерскую'))

  // открыть выбор услуги → создать новую услугу инлайн, чтобы получить непустое workshopServiceName
  fireEvent.click(screen.getByText('— выберите услугу —'))
  fireEvent.mouseDown(screen.getByText('+ Создать услугу'))
  fireEvent.change(screen.getByPlaceholderText('Название услуги'), { target: { value: 'Ремонт оправы' } })
  fireEvent.click(screen.getByText('Сохранить'))

  await waitFor(() => expect(screen.getByText('Ремонт оправы')).toBeInTheDocument())
}

describe('AddSaleModal — клемп предоплаты мастерской (workshopPrepayment)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('перепечатка стоимости услуги ПОСЛЕ ввода предоплаты не портит уже введённую предоплату', async () => {
    await openWorkshopSectionWithService()

    fireEvent.change(inputNearLabel('Стоимость услуги ₸'), { target: { value: '2000' } })
    fireEvent.click(screen.getByText('Предоплата'))

    const prepaymentInput = inputNearLabel('Сумма предоплаты ₸')
    fireEvent.change(prepaymentInput, { target: { value: '1500' } })
    fireEvent.blur(prepaymentInput)
    expect(prepaymentInput.value).toBe('1500')

    // Оператор перепечатывает стоимость услуги — предоплата НЕ должна занизиться реактивно
    fireEvent.change(inputNearLabel('Стоимость услуги ₸'), { target: { value: '500' } })
    expect(prepaymentInput.value).toBe('1500')

    // Теперь предоплата превышает новую стоимость — должна появиться подсказка,
    // а кнопка отправки должна быть заблокирована
    expect(screen.getByText('Предоплата не может превышать стоимость услуги и запчастей')).toBeInTheDocument()
    const submitBtn = screen.getByText(/Оформить продажу/)
    expect(submitBtn).toBeDisabled()

    fireEvent.click(submitBtn)
    expect(createSale).not.toHaveBeenCalled()

    // Клемп применяется на blur самого поля предоплаты
    fireEvent.blur(prepaymentInput)
    expect(prepaymentInput.value).toBe('500')
    expect(submitBtn).not.toBeDisabled()
  })

  it('реальный submit отправляет клемпнутую сумму предоплаты в createServiceOrder', async () => {
    await openWorkshopSectionWithService()

    fireEvent.change(inputNearLabel('Стоимость услуги ₸'), { target: { value: '1000' } })
    fireEvent.change(inputNearLabel('Стоимость запчастей ₸'), { target: { value: '500' } })
    fireEvent.click(screen.getByText('Предоплата'))

    const prepaymentInput = inputNearLabel('Сумма предоплаты ₸')
    fireEvent.change(prepaymentInput, { target: { value: '900' } })
    fireEvent.blur(prepaymentInput)
    expect(prepaymentInput.value).toBe('900')

    const submitBtn = screen.getByText(/Оформить продажу/)
    expect(submitBtn).not.toBeDisabled()
    fireEvent.click(submitBtn)

    await waitFor(() => expect(createServiceOrder).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(createServiceOrder).mock.calls[0][0]
    expect(payload.prepayment).toBe(900)
    expect(payload.service_price).toBe(1000)
    expect(payload.parts_price).toBe(500)
    // Единственная мастерская выбирается автоматически (регресс-проверка) —
    // заказ всё равно уходит по явному branch_id, не по хардкоду константы
    expect(payload.branch_id).toBe('workshop-1')
  })

  it('заблокированный submit не отправляет продажу, если предоплата превышает стоимость даже без blur', async () => {
    await openWorkshopSectionWithService()

    fireEvent.change(inputNearLabel('Стоимость услуги ₸'), { target: { value: '300' } })
    fireEvent.click(screen.getByText('Предоплата'))

    const prepaymentInput = inputNearLabel('Сумма предоплаты ₸')
    fireEvent.change(prepaymentInput, { target: { value: '5000' } })
    // без blur — клемп ещё не применился, но кнопка уже должна быть заблокирована
    expect(screen.getByText(/Оформить продажу/)).toBeDisabled()

    fireEvent.click(screen.getByText(/Оформить продажу/))
    expect(createSale).not.toHaveBeenCalled()
  })

  it('blur не стирает предоплату, если стоимость услуги ещё не введена (total=0)', async () => {
    await openWorkshopSectionWithService()
    fireEvent.click(screen.getByText('Предоплата'))

    const prepaymentInput = inputNearLabel('Сумма предоплаты ₸')
    fireEvent.change(prepaymentInput, { target: { value: '700' } })
    fireEvent.blur(prepaymentInput)

    // Клемпить нечем (стоимость = 0) — значение должно остаться как есть, а не стереться в ''
    expect(prepaymentInput.value).toBe('700')
    expect(screen.getByText('Предоплата не может превышать стоимость услуги и запчастей')).toBeInTheDocument()
    expect(screen.getByText(/Оформить продажу/)).toBeDisabled()
  })
})

describe('AddSaleModal — клемп предоплаты предзаказа (prepaymentAmount)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function openPreorderWithItem() {
    vi.mocked(getProductsFromStock).mockResolvedValueOnce([mockProduct])
    render(
      <AddSaleModal
        branchId="branch-1"
        employeeId="emp-1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        initialTab="preorder"
        workshopBranches={[]}
      />
    )
    await waitFor(() => expect(screen.getByText('Новый предзаказ')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText('Поиск по названию или штрихкоду...'), { target: { value: 'Ray-Ban' } })
    await waitFor(() => expect(screen.getByText('Оправа Ray-Ban')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Оправа Ray-Ban'))

    fireEvent.click(screen.getByText('Частичная'))
  }

  it('перепечатка цены товара после ввода предоплаты не портит уже введённую предоплату', async () => {
    await openPreorderWithItem()

    const prepaymentInput = inputNearLabel('Сумма предоплаты ₸')
    fireEvent.change(prepaymentInput, { target: { value: '800' } })
    fireEvent.blur(prepaymentInput)
    expect(prepaymentInput.value).toBe('800')

    // Оператор перепечатывает цену товара ниже уже введённой предоплаты — она не должна занизиться реактивно
    fireEvent.change(inputNearLabel('Цена продажи ₸'), { target: { value: '300' } })
    expect(prepaymentInput.value).toBe('800')
    expect(screen.getByText('Предоплата не может превышать стоимость товаров')).toBeInTheDocument()
    expect(screen.getByText(/Создать предзаказ/)).toBeDisabled()
  })

  it('превышение предоплаты над стоимостью товаров блокирует создание предзаказа', async () => {
    await openPreorderWithItem()

    const prepaymentInput = inputNearLabel('Сумма предоплаты ₸')
    fireEvent.change(prepaymentInput, { target: { value: '5000' } })

    expect(screen.getByText('Предоплата не может превышать стоимость товаров')).toBeInTheDocument()
    const submitBtn = screen.getByText(/Создать предзаказ/)
    expect(submitBtn).toBeDisabled()
  })

  it('blur клемпит предоплату предзаказа до стоимости товаров', async () => {
    await openPreorderWithItem()

    const prepaymentInput = inputNearLabel('Сумма предоплаты ₸')
    fireEvent.change(prepaymentInput, { target: { value: '5000' } })
    fireEvent.blur(prepaymentInput)

    expect(prepaymentInput.value).toBe('1000')
    expect(screen.getByText(/Создать предзаказ/)).not.toBeDisabled()
  })
})

describe('AddSaleModal — предоплата на обычный товар без мастерской (долг)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Продажа с товарами проходит через проверку остатков (supabase.from('stock')...)
  // перед createSale — переопределяем только эту таблицу, остальное как в setup.ts
  function mockStockAvailable() {
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
          resolve(
            table === 'stock'
              ? { data: [{ product_id: 'p1', quantity: 5 }], error: null }
              : { data: [], error: null }
          ),
      }
      return chain
    })
  }

  async function openSaleWithItem() {
    mockStockAvailable()
    vi.mocked(getProductsFromStock).mockResolvedValueOnce([mockProduct])
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

    fireEvent.change(screen.getByPlaceholderText('Поиск по названию или штрихкоду...'), { target: { value: 'Ray-Ban' } })
    await waitFor(() => expect(screen.getByText('Оправа Ray-Ban')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Оправа Ray-Ban'))

    await waitFor(() => expect(screen.getByText('Оплата товаров')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Предоплата'))
  }

  it('onChange без клемпа, onBlur клемпит до суммы товаров, красная подсказка блокирует submit', async () => {
    await openSaleWithItem()

    const prepaymentInput = inputNearLabel('Сумма предоплаты ₸')
    fireEvent.change(prepaymentInput, { target: { value: '5000' } })
    // без blur — клемп ещё не применился, но кнопка уже заблокирована
    expect(screen.getByText('Предоплата не может превышать сумму товаров')).toBeInTheDocument()
    expect(screen.getByText(/Оформить продажу/)).toBeDisabled()

    fireEvent.click(screen.getByText(/Оформить продажу/))
    expect(createSale).not.toHaveBeenCalled()

    // Клемп применяется на blur самого поля предоплаты (mockProduct.price = 1000)
    fireEvent.blur(prepaymentInput)
    expect(prepaymentInput.value).toBe('1000')
    expect(screen.getByText(/Оформить продажу/)).not.toBeDisabled()
  })

  it('реальный submit: paid_cash = сумме предоплаты (не итогу), остаток уходит в debt_amount', async () => {
    await openSaleWithItem()

    const prepaymentInput = inputNearLabel('Сумма предоплаты ₸')
    fireEvent.change(prepaymentInput, { target: { value: '400' } })
    fireEvent.blur(prepaymentInput)
    expect(prepaymentInput.value).toBe('400')
    expect(screen.getByText('Долг клиента: ₸600')).toBeInTheDocument()

    const submitBtn = screen.getByText(/Оформить продажу/)
    expect(submitBtn).not.toBeDisabled()
    fireEvent.click(submitBtn)

    await waitFor(() => expect(createSale).toHaveBeenCalledTimes(1))
    const [salePayload] = vi.mocked(createSale).mock.calls[0]
    expect(salePayload.total).toBe(1000)
    expect(salePayload.paid_cash).toBe(400)
    expect(salePayload.debt_amount).toBe(600)
  })

  it('без предоплаты (оплата полностью) долг не создаётся', async () => {
    await openSaleWithItem()
    // Переключаемся обратно на "Полностью"
    fireEvent.click(screen.getByText('Полностью'))

    const submitBtn = screen.getByText(/Оформить продажу/)
    fireEvent.click(submitBtn)

    await waitFor(() => expect(createSale).toHaveBeenCalledTimes(1))
    const [salePayload] = vi.mocked(createSale).mock.calls[0]
    expect(salePayload.paid_cash).toBe(1000)
    expect(salePayload.debt_amount).toBe(0)
  })
})

describe('AddSaleModal — выбор мастерской, когда их несколько (workshopBranches)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const twoWorkshops = [
    { id: 'workshop-1', name: 'Мастерская на Жандосова' },
    { id: 'workshop-2', name: 'Мастерская на Абая' },
  ]

  function getWorkshopSelect(): HTMLSelectElement {
    const label = screen.getByText('Мастерская *')
    const select = label.closest('div')?.querySelector('select')
    if (!select) throw new Error('Workshop <select> not found')
    return select as HTMLSelectElement
  }

  async function openWorkshopSectionMulti() {
    render(
      <AddSaleModal
        branchId="branch-1"
        employeeId="emp-1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        workshopBranches={twoWorkshops}
      />
    )
    await waitFor(() => expect(screen.getByText('Новая продажа')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Добавить заказ в мастерскую'))

    fireEvent.click(screen.getByText('— выберите услугу —'))
    fireEvent.mouseDown(screen.getByText('+ Создать услугу'))
    fireEvent.change(screen.getByPlaceholderText('Название услуги'), { target: { value: 'Ремонт оправы' } })
    fireEvent.click(screen.getByText('Сохранить'))
    await waitFor(() => expect(screen.getByText('Ремонт оправы')).toBeInTheDocument())
  }

  it('показывает список всех мастерских, по умолчанию ничего не выбрано (не одна — нельзя угадать)', async () => {
    await openWorkshopSectionMulti()
    const select = getWorkshopSelect()
    expect(select.value).toBe('')
    const optionLabels = Array.from(select.options).map(o => o.textContent)
    expect(optionLabels).toEqual(['— выберите мастерскую —', 'Мастерская на Жандосова', 'Мастерская на Абая'])
  })

  it('блокирует submit, пока мастерская не выбрана', async () => {
    await openWorkshopSectionMulti()

    const submitBtn = screen.getByText(/Оформить продажу/)
    expect(submitBtn).toBeDisabled()

    fireEvent.click(submitBtn)
    expect(createServiceOrder).not.toHaveBeenCalled()
  })

  it('заказ уходит именно в выбранную мастерскую, а не в первую попавшуюся', async () => {
    await openWorkshopSectionMulti()

    fireEvent.change(getWorkshopSelect(), { target: { value: 'workshop-2' } })

    const submitBtn = screen.getByText(/Оформить продажу/)
    expect(submitBtn).not.toBeDisabled()
    fireEvent.click(submitBtn)

    await waitFor(() => expect(createServiceOrder).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(createServiceOrder).mock.calls[0][0]
    expect(payload.branch_id).toBe('workshop-2')
    expect(payload.created_branch_id).toBe('branch-1')
  })
})
