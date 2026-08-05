import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import ActivityAuditView from '@/components/Admin/ActivityAuditView'
import { supabase } from '@/services/supabase'

vi.mock('@/services/activityAudit', () => ({
  getActivityAudit: vi.fn(),
}))

import { getActivityAudit } from '@/services/activityAudit'
import type { ActivityAuditEntry } from '@/services/activityAudit'

const branchA = { id: 'b1', name: 'Абая 34' }
const branchB = { id: 'b2', name: 'Гум' }

function mockBranchesAndEmployees() {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (resolve: any) => {
        if (table === 'branches') return resolve({ data: [branchA, branchB], error: null })
        if (table === 'employees') return resolve({ data: [{ id: 'e1', name: 'Иван' }], error: null })
        return resolve({ data: [], error: null })
      },
    }
    return chain
  })
}

const entryProduct: ActivityAuditEntry = {
  id: 'a1',
  created_at: '2026-08-06T10:00:00Z',
  actor_employee_id: 'e1',
  actor_role: 'manager',
  action: 'update',
  entity_type: 'products',
  entity_id: 'p1',
  branch_id: 'b1',
  old_data: { price: 12000 },
  new_data: { price: 9000 },
  source: 'app',
  actor: { id: 'e1', name: 'Иван' },
  branch: { id: 'b1', name: 'Абая 34' },
}

describe('ActivityAuditView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBranchesAndEmployees()
  })

  it('рендерит запись со summary, действием и сущностью', async () => {
    vi.mocked(getActivityAudit).mockResolvedValue({ items: [entryProduct], nextCursor: null })
    render(<ActivityAuditView />)

    // toLocaleString('ru-RU') использует спец-пробел (NBSP/narrow NBSP) как
    // разделитель разрядов — RTL нормализует его в обычный пробел при сравнении
    // текста узла, поэтому и ожидаемую строку нормализуем тем же способом.
    const normalize = (s: string) => s.replace(/\s+/g, ' ')
    const priceFrom = (12000).toLocaleString('ru-RU')
    const priceTo = (9000).toLocaleString('ru-RU')
    const expected = normalize(`цена: ${priceFrom}→${priceTo}`)
    let card!: HTMLElement
    await waitFor(() => {
      card = screen.getByText(expected).closest('.bg-white') as HTMLElement
      expect(card).toBeTruthy()
    })
    // Скоупим на карточку записи — "Изменение"/"Товар" совпадают ещё и с
    // опциями фильтров в шапке экрана.
    expect(within(card).getByText('Изменение')).toBeInTheDocument()
    expect(within(card).getByText('Товар')).toBeInTheDocument()
    expect(within(card).getByText(/Иван/)).toBeInTheDocument()
  })

  it('запись от службы (source=system) помечена как «Система»', async () => {
    vi.mocked(getActivityAudit).mockResolvedValue({
      items: [{ ...entryProduct, id: 'a2', actor_employee_id: null, actor: null, source: 'system' }],
      nextCursor: null,
    })
    render(<ActivityAuditView />)
    await waitFor(() => expect(screen.getByText('Система')).toBeInTheDocument())
  })

  it('выбор филиала в фильтре передаётся в getActivityAudit', async () => {
    vi.mocked(getActivityAudit).mockResolvedValue({ items: [], nextCursor: null })
    render(<ActivityAuditView />)
    await waitFor(() => expect(screen.getByText('Все филиалы')).toBeInTheDocument())

    const branchSelect = screen.getByDisplayValue('Все филиалы')
    fireEvent.change(branchSelect, { target: { value: 'b1' } })

    await waitFor(() => {
      const lastCall = vi.mocked(getActivityAudit).mock.calls.at(-1)
      expect(lastCall?.[0]).toMatchObject({ branchId: 'b1' })
    })
  })

  it('«Показать ещё» подгружает следующую страницу по курсору и скрывается, когда курсора больше нет', async () => {
    vi.mocked(getActivityAudit)
      .mockResolvedValueOnce({
        items: [entryProduct],
        nextCursor: { createdAt: '2026-08-06T10:00:00Z', id: 'a1' },
      })
      .mockResolvedValueOnce({ items: [{ ...entryProduct, id: 'a2' }], nextCursor: null })

    render(<ActivityAuditView />)
    await waitFor(() => expect(screen.getByText('Показать ещё')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Показать ещё'))

    await waitFor(() => expect(getActivityAudit).toHaveBeenCalledTimes(2))
    const [, secondCallCursor] = vi.mocked(getActivityAudit).mock.calls[1]
    expect(secondCallCursor).toMatchObject({ id: 'a1' })
    await waitFor(() => expect(screen.queryByText('Показать ещё')).not.toBeInTheDocument())
  })

  it('«Подробнее» разворачивает old_data/new_data', async () => {
    vi.mocked(getActivityAudit).mockResolvedValue({ items: [entryProduct], nextCursor: null })
    render(<ActivityAuditView />)
    await waitFor(() => expect(screen.getByText('Подробнее')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Подробнее'))
    expect(screen.getByText('Было')).toBeInTheDocument()
    expect(screen.getByText('Стало')).toBeInTheDocument()
  })
})
