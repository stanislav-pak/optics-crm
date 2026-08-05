import { describe, it, expect, vi, beforeEach } from 'vitest'
import { settleSaleDebt } from '@/services/inventory'
import { supabase } from '@/services/supabase'

// settleSaleDebt делает две отдельные цепочки supabase.from('sales'): сначала
// чтение текущей строки, потом update+select().single() (антипаттерн "тихого
// no-op" при заблокированной RLS — см. RLS-заметка в PROJECT_MEMORY.md).
// mockImplementationOnce дважды подряд позволяет вернуть разные цепочки на
// каждый вызов .from(), не путая чтение с записью.
function mockReadThenUpdate(
  row: Record<string, unknown> | null,
  updateResult: { data: unknown; error: unknown } = { data: { id: 'sale-1' }, error: null }
) {
  const updateSpy = vi.fn().mockReturnThis()
  const isSpy = vi.fn().mockReturnThis()
  vi.mocked(supabase.from)
    .mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: row, error: row ? null : { message: 'not found' } }),
    } as any))
    .mockImplementationOnce(() => ({
      update: updateSpy,
      eq: vi.fn().mockReturnThis(),
      is: isSpy,
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(updateResult),
    } as any))
  return { updateSpy, isSpy }
}

describe('settleSaleDebt', () => {
  // mockReset (не clearAllMocks) — тесты, где settleSaleDebt бросает ошибку сразу
  // после чтения, потребляют только первую из двух заранее выставленных
  // mockImplementationOnce; clearAllMocks не убирает оставшуюся в очереди вторую,
  // и она утекает в первый вызов .from() следующего теста.
  beforeEach(() => { vi.mocked(supabase.from).mockReset() })

  // paid_cash/paid_kaspi НЕ должны меняться погашением долга — касса уже
  // отдельно суммирует debt_amount по debt_paid_at (как original_prepayment/
  // remaining_paid_at у мастерской). Если бы погашение ещё и прибавляло
  // debt_amount к paid_cash, кассовый отчёт задвоил бы сумму при погашении
  // в тот же день, что и сама продажа (нашёл ревьюер до коммита).
  it('погашение наличными выставляет debt_paid_at/debt_payment_method и НЕ трогает paid_cash/paid_kaspi', async () => {
    const { updateSpy, isSpy } = mockReadThenUpdate({ debt_amount: 600, debt_paid_at: null })

    await settleSaleDebt('sale-1', 'cash')

    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ debt_payment_method: 'cash' }))
    const updates = updateSpy.mock.calls[0][0]
    expect(updates.paid_cash).toBeUndefined()
    expect(updates.paid_kaspi).toBeUndefined()
    expect(updates.debt_amount).toBeUndefined()
    expect(updates.debt_paid_at).toEqual(expect.any(String))
    // Атомарная защита от гонки при двойном клике: UPDATE условен на debt_paid_at IS NULL
    expect(isSpy).toHaveBeenCalledWith('debt_paid_at', null)
  })

  it('погашение через Kaspi выставляет debt_payment_method=kaspi', async () => {
    const { updateSpy } = mockReadThenUpdate({ debt_amount: 250, debt_paid_at: null })

    await settleSaleDebt('sale-1', 'kaspi')

    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ debt_payment_method: 'kaspi' }))
  })

  it('бросает ошибку, если по продаже нет долга', async () => {
    mockReadThenUpdate({ debt_amount: 0, debt_paid_at: null })
    await expect(settleSaleDebt('sale-1', 'cash')).rejects.toThrow('нет долга')
  })

  it('бросает ошибку, если долг уже погашен', async () => {
    mockReadThenUpdate({ debt_amount: 600, debt_paid_at: '2026-08-01T10:00:00Z' })
    await expect(settleSaleDebt('sale-1', 'cash')).rejects.toThrow('уже погашен')
  })

  it('RLS/гонка блокирует UPDATE (0 строк) → явная ошибка, а не тихий успех', async () => {
    mockReadThenUpdate(
      { debt_amount: 600, debt_paid_at: null },
      { data: null, error: { message: 'no rows' } }
    )
    await expect(settleSaleDebt('sale-1', 'cash')).rejects.toThrow(/уже погашен|нет прав/)
  })
})
