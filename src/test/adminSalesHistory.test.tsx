import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import AdminSalesHistory, { ADMIN_SALES_PAGE_SIZE } from '@/components/Admin/AdminSalesHistory'
import { supabase } from '@/services/supabase'

// toLocaleString('ru-RU') использует спец-пробел (NBSP/narrow NBSP) как
// разделитель разрядов — RTL нормализует его в обычный пробел при сравнении
// текста узла, поэтому нормализуем тем же способом и ожидаемые строки.
const normalize = (s: string) => s.replace(/\s+/g, ' ')
// Карточки сводки — общий label (fmt-значения могут совпасть между карточками,
// напр. "Продано" и "Собрано" оба 5000 ₸) — скоупим по соседнему элементу.
function getSummaryValue(label: string): string {
  const labelEl = screen.getByText(label)
  const valueEl = labelEl.nextElementSibling as HTMLElement | null
  return normalize(valueEl?.textContent ?? '')
}
function fmt(n: number) { return normalize(n.toLocaleString('ru-RU') + ' ₸') }
function fmtDateTime(iso: string) {
  return normalize(new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }))
}

function makeChain(resolveValue: { data: unknown; error: unknown }) {
  const chain: any = {
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    or: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    then: (resolve: any) => resolve(resolveValue),
  }
  return chain
}

// AdminSalesHistory делает ДВА независимых запроса к 'sales' на каждую загрузку —
// список (постранично, с items:sale_items в select) и сводку (плоские суммы, без
// items). Различаем их по аргументу .select(), а не по порядку вызова — так мок
// не зависит от порядка выполнения Promise.all внутри компонента.
function mockSupabase({
  branches = [] as any[],
  salesPages = [[]] as any[][],
  summaryRows = [] as any[],
}) {
  let pageIndex = 0
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'branches') return makeChain({ data: branches, error: null })
    if (table === 'sales') {
      const chain: any = {
        select: vi.fn((arg: string) => {
          chain.__isList = typeof arg === 'string' && arg.includes('items:sale_items')
          return chain
        }),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        or: vi.fn(() => chain),
        then: (resolve: any) => {
          if (chain.__isList) {
            const page = salesPages[Math.min(pageIndex, salesPages.length - 1)]
            pageIndex++
            return resolve({ data: page, error: null })
          }
          return resolve({ data: summaryRows, error: null })
        },
      }
      return chain
    }
    // orders / service_orders — вкладки "Предзаказы"/"Мастерская" не в скоупе этой задачи
    return makeChain({ data: [], error: null })
  })
}

const saleWithDiscount = {
  id: 's1',
  created_at: '2026-08-06T14:35:00.000Z',
  status: 'paid',
  total: 8000,
  payment_method: 'cash',
  paid_cash: 8000, paid_kaspi: 0, paid_halyk: 0, paid_kaspi_transfer: 0,
  debt_amount: 0, debt_paid_at: null,
  client: { name: 'Аружан', phone: '+77771234567' },
  employee: { name: 'Иван' },
  branch: { name: 'Абая 34' },
  items: [
    { id: 'i1', product_id: 'p1', quantity: 2, price: 4000, list_price: 5000, product: { name: 'Оправа Ray-Ban' } },
  ],
}

describe('AdminSalesHistory — вкладка «Продажи»', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('показывает дату И точное время продажи (не только дату)', async () => {
    mockSupabase({ salesPages: [[saleWithDiscount]], summaryRows: [saleWithDiscount] })
    render(<AdminSalesHistory />)

    const expected = normalize(fmtDateTime(saleWithDiscount.created_at))
    await waitFor(() => expect(screen.getByText(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument())
  })

  it('показывает товар с ценой за штуку и «было/скидка», когда list_price > price', async () => {
    mockSupabase({ salesPages: [[saleWithDiscount]], summaryRows: [saleWithDiscount] })
    render(<AdminSalesHistory />)

    let card!: HTMLElement
    await waitFor(() => {
      card = screen.getByText(/Оправа Ray-Ban × 2/).closest('.bg-white') as HTMLElement
      expect(card).toBeTruthy()
    })
    // Скоупим на текст всей карточки — "было"/"скидка" со значениями лежат в
    // одном <span>, но getByText с открытым regex ловит совпадение сразу в
    // нескольких элементах-предках (multiple elements found), поэтому вместо
    // getByText сравниваем нормализованный textContent карточки напрямую.
    // Внутри строки позиции формат "₸{число}" (символ перед суммой), а не
    // общий fmt() ("{число} ₸") — это отдельный литерал в компоненте.
    const tg = (n: number) => normalize('₸' + n.toLocaleString('ru-RU'))
    const cardText = normalize(card.textContent ?? '')
    expect(cardText).toContain('4 000/шт')
    expect(cardText).toContain(`было ${tg(5000)}`)
    expect(cardText).toContain(`скидка ${tg(2000)}`)
  })

  it('НЕ показывает «было/скидка», если list_price отсутствует или равен price', async () => {
    const noDiscountSale = {
      ...saleWithDiscount,
      id: 's2',
      items: [{ id: 'i2', product_id: 'p2', quantity: 1, price: 3000, list_price: 3000, product: { name: 'Линза' } }],
    }
    mockSupabase({ salesPages: [[noDiscountSale]], summaryRows: [noDiscountSale] })
    render(<AdminSalesHistory />)

    await waitFor(() => expect(screen.getByText(/Линза × 1/)).toBeInTheDocument())
    expect(screen.queryByText(/скидка/)).not.toBeInTheDocument()
  })

  it('сводка: кол-во, продано (чеки), собрано и долг считаются верно, возвраты исключены', async () => {
    const summaryRows = [
      { total: 10000, status: 'paid', paid_cash: 10000, paid_kaspi: 0, paid_halyk: 0, paid_kaspi_transfer: 0, debt_amount: 0, debt_paid_at: null },
      { total: 5000, status: 'paid', paid_cash: 3000, paid_kaspi: 0, paid_halyk: 0, paid_kaspi_transfer: 0, debt_amount: 2000, debt_paid_at: null },
      { total: 8000, status: 'refunded', paid_cash: 8000, paid_kaspi: 0, paid_halyk: 0, paid_kaspi_transfer: 0, debt_amount: 0, debt_paid_at: null },
    ]
    mockSupabase({ salesPages: [[]], summaryRows })
    render(<AdminSalesHistory />)

    // count=2 (refunded исключён), продано=15000, собрано=13000 (долг не погашен, в paid_* не входит), долг=2000
    await waitFor(() => expect(getSummaryValue('Продано (чеки)')).toBe(fmt(15000)))
    expect(getSummaryValue('Продаж')).toBe('2')
    expect(getSummaryValue('Собрано')).toBe(fmt(13000))
    expect(getSummaryValue('Долг')).toBe(fmt(2000))
  })

  it('сводка: погашенный долг учитывается в «собрано», а не в «долг»', async () => {
    const summaryRows = [
      { total: 5000, status: 'paid', paid_cash: 3000, paid_kaspi: 0, paid_halyk: 0, paid_kaspi_transfer: 0, debt_amount: 2000, debt_paid_at: '2026-08-05T00:00:00Z' },
    ]
    mockSupabase({ salesPages: [[]], summaryRows })
    render(<AdminSalesHistory />)

    // погашено → собрано = 3000+2000 = 5000, долг = 0
    await waitFor(() => expect(getSummaryValue('Собрано')).toBe(fmt(5000)))
    expect(getSummaryValue('Долг')).toBe(fmt(0))
  })

  it('фильтр по филиалу передаётся в запрос списка и сводки продаж', async () => {
    mockSupabase({ branches: [{ id: 'b1', name: 'Абая 34' }], salesPages: [[]], summaryRows: [] })
    render(<AdminSalesHistory />)
    await waitFor(() => expect(screen.getByText('Все филиалы')).toBeInTheDocument())

    vi.mocked(supabase.from).mockClear()
    const branchSelect = screen.getByDisplayValue('Все филиалы')
    fireEvent.change(branchSelect, { target: { value: 'b1' } })

    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('sales'))
  })

  it('гонка фильтров: устаревший ответ сводки не перезаписывает более новый', async () => {
    // Запрос сводки без фильтра (стартовая загрузка) намеренно резолвится
    // ПОЗЖЕ, чем запрос с фильтром branch=b1 (быстрая смена фильтра
    // пользователем) — проверяем, что финальное состояние соответствует
    // последнему выбранному фильтру, а не более раннему, но медленному ответу.
    // Объект-контейнер, а не отдельная `let` — TS иначе сужает тип `let`,
    // переприсвоенной только внутри вложенного замыкания, до `null` в точке
    // использования (не видит, что замыкание выполнится до неё).
    const staleResolver: { current: (() => void) | null } = { current: null }
    let summaryCallCount = 0

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'branches') return makeChain({ data: [{ id: 'b1', name: 'Абая 34' }], error: null })
      if (table === 'sales') {
        const chain: any = {
          select: vi.fn((arg: string) => {
            chain.__isList = typeof arg === 'string' && arg.includes('items:sale_items')
            return chain
          }),
          order: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          eq: vi.fn((_col: string, val: string) => { chain.__branchFilter = val; return chain }),
          gte: vi.fn(() => chain),
          lte: vi.fn(() => chain),
          or: vi.fn(() => chain),
          then: (resolve: any) => {
            if (chain.__isList) return resolve({ data: [], error: null })
            const rows = chain.__branchFilter === 'b1'
              ? [{ total: 2000, status: 'paid', paid_cash: 2000, paid_kaspi: 0, paid_halyk: 0, paid_kaspi_transfer: 0, debt_amount: 0, debt_paid_at: null }]
              : [{ total: 9999, status: 'paid', paid_cash: 9999, paid_kaspi: 0, paid_halyk: 0, paid_kaspi_transfer: 0, debt_amount: 0, debt_paid_at: null }]
            const isStaleCall = summaryCallCount++ === 0 // первый вызов — без фильтра, придержим его
            if (isStaleCall) {
              return new Promise<void>(res => {
                staleResolver.current = () => res(resolve({ data: rows, error: null }))
              })
            }
            return resolve({ data: rows, error: null })
          },
        }
        return chain
      }
      return makeChain({ data: [], error: null })
    })

    render(<AdminSalesHistory />)
    await waitFor(() => expect(screen.getByText('Все филиалы')).toBeInTheDocument())

    // Меняем фильтр, пока первый (устаревший) запрос ещё висит
    fireEvent.change(screen.getByDisplayValue('Все филиалы'), { target: { value: 'b1' } })
    await waitFor(() => expect(getSummaryValue('Продано (чеки)')).toBe(fmt(2000)))

    // Отпускаем устаревший запрос — он не должен перезаписать актуальное состояние
    staleResolver.current?.()
    await new Promise(r => setTimeout(r, 0))
    expect(getSummaryValue('Продано (чеки)')).toBe(fmt(2000))
  })

  it('«Показать ещё» подгружает следующую страницу и скрывается на последней', async () => {
    const fullPage = Array.from({ length: ADMIN_SALES_PAGE_SIZE }, (_, i) => ({
      ...saleWithDiscount,
      id: `page1-${i}`,
      created_at: `2026-08-06T10:${String(i % 60).padStart(2, '0')}:00.000Z`,
    }))
    const secondPage = [{ ...saleWithDiscount, id: 'page2-0' }]
    mockSupabase({ salesPages: [fullPage, secondPage], summaryRows: fullPage })

    render(<AdminSalesHistory />)
    await waitFor(() => expect(screen.getByText('Показать ещё')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Показать ещё'))

    await waitFor(() => expect(screen.queryByText('Показать ещё')).not.toBeInTheDocument())
  })

  it('без «Показать ещё», если первая страница неполная', async () => {
    mockSupabase({ salesPages: [[saleWithDiscount]], summaryRows: [saleWithDiscount] })
    render(<AdminSalesHistory />)
    await waitFor(() => expect(screen.getByText(/Оправа Ray-Ban/)).toBeInTheDocument())
    expect(screen.queryByText('Показать ещё')).not.toBeInTheDocument()
  })
})
