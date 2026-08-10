import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, screen, fireEvent } from '@testing-library/react'
import CashSessionCard from '@/components/Inventory/CashSessionCard'
import { notifyCashChanged } from '@/services/cashEvents'
import { getCashSession, closeCashSession } from '@/services/cashSessions'
import { supabase } from '@/services/supabase'

// Итог кассы (cash_sessions.system_*) — кэш: он пересчитывается только когда
// CashSessionCard загружает смену. Раньше кассу обновляли лишь доплата мастерской
// и возврат; погашение долга, новая продажа и расход не обновляли ничего. Из-за
// этого погашение 3000 ₸ по Kaspi не попало в кассу «Гум» и замёрзло в истории
// при закрытии смены. Здесь проверяем, что событие «деньги изменились» реально
// заставляет карточку перечитать и пересчитать смену.

vi.mock('@/services/cashSessions', () => ({
  getCashSession: vi.fn(),
  openCashSession: vi.fn(),
  closeCashSession: vi.fn().mockResolvedValue(undefined),
  reopenCashSession: vi.fn(),
  getCashSessionClosures: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/services/expenses', () => ({
  getExpensesForDate: vi.fn().mockResolvedValue([]),
}))

const OPEN_SESSION = {
  id: 'session-1',
  status: 'open',
  system_cash: 0,
  system_kaspi: 0,
  system_total: 0,
  actual_cash: null,
  cash_discrepancy: null,
}

function fakeBuilder(): Record<string, unknown> {
  const builder: Record<string, unknown> = {
    select: () => builder,
    update: () => builder,
    eq: () => builder,
    neq: () => builder,
    in: () => builder,
    is: () => builder,
    gt: () => builder,
    gte: () => builder,
    lte: () => builder,
    not: () => builder,
    single: () => Promise.resolve({ data: OPEN_SESSION, error: null }),
    then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
      resolve({ data: [], error: null }),
  }
  return builder
}

describe('CashSessionCard — пересчёт кассы', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getCashSession).mockResolvedValue(OPEN_SESSION as never)
    vi.mocked(supabase.from).mockImplementation((() => fakeBuilder()) as never)
  })

  it('пересчитывает смену по событию «деньги изменились» (погашение долга/продажа/расход)', async () => {
    render(<CashSessionCard branchId="branch-1" employeeId="emp-1" />)

    // Первичная загрузка при монтировании
    await waitFor(() => expect(getCashSession).toHaveBeenCalledTimes(1))

    // Событие шлёт handleSettleDebt (погашение долга), создание продажи и расхода
    notifyCashChanged()

    await waitFor(() => expect(getCashSession).toHaveBeenCalledTimes(2))
  })

  it('возврат продажи по-прежнему пересчитывает смену (не сломали старое поведение)', async () => {
    render(<CashSessionCard branchId="branch-1" employeeId="emp-1" />)
    await waitFor(() => expect(getCashSession).toHaveBeenCalledTimes(1))

    window.dispatchEvent(new CustomEvent('sale-returned'))

    await waitFor(() => expect(getCashSession).toHaveBeenCalledTimes(2))
  })

  // close_cash_session замораживает в историю то, что последним записал браузер,
  // и сам ничего не пересчитывает. Поэтому перед закрытием обязателен свежий
  // пересчёт — иначе операция, сделанная после последней загрузки, теряется.
  it('перед закрытием кассы делает пересчёт, и только потом закрывает', async () => {
    const order: string[] = []
    vi.mocked(getCashSession).mockImplementation(async () => {
      order.push('recalc')
      return OPEN_SESSION as never
    })
    vi.mocked(closeCashSession).mockImplementation(async () => {
      order.push('close')
    })

    render(<CashSessionCard branchId="branch-1" employeeId="emp-1" />)
    await waitFor(() => expect(getCashSession).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByText('Закрыть кассу'))
    fireEvent.change(await screen.findByPlaceholderText('0'), { target: { value: '100' } })
    fireEvent.click(screen.getByText('Подтвердить'))

    await waitFor(() => expect(closeCashSession).toHaveBeenCalled())

    // Прямо перед закрытием обязан идти пересчёт. Всего пересчётов минимум два:
    // при монтировании и принудительный перед закрытием (после закрытия карточка
    // грузится ещё раз — это уже не важно).
    const closeIdx = order.indexOf('close')
    expect(closeIdx).toBeGreaterThanOrEqual(2)
    expect(order[closeIdx - 1]).toBe('recalc')
  })
})
