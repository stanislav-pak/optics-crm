import { describe, it, expect, vi, beforeEach } from 'vitest'
import { settleSaleDebt } from '@/services/inventory'
import { supabase } from '@/services/supabase'

// settleSaleDebt больше не делает SELECT+UPDATE по sales напрямую: RLS-политика
// employees_update_sales пускает не-админа к строке только при status='pending',
// а продажа с долгом создаётся со status='paid' — прямой UPDATE у менеджера
// задевал 0 строк. Теперь вызывается RPC settle_sale_debt (SECURITY DEFINER),
// который сам проверяет права/наличие долга/гонку. Поэтому тесты проверяют две
// вещи: (1) чем именно вызван RPC, (2) как ошибки БД переводятся в текст для
// менеджера.
function mockRpc(result: { error: unknown } = { error: null }) {
  const rpcSpy = vi.mocked(supabase.rpc)
  rpcSpy.mockResolvedValue({ data: null, ...result } as never)
  return rpcSpy
}

describe('settleSaleDebt', () => {
  beforeEach(() => { vi.mocked(supabase.rpc).mockReset() })

  // paid_cash/paid_kaspi/debt_amount НЕ должны меняться погашением долга — касса
  // уже отдельно суммирует debt_amount по debt_paid_at (как original_prepayment/
  // remaining_paid_at у мастерской). Если бы погашение ещё и прибавляло
  // debt_amount к paid_cash, кассовый отчёт задвоил бы сумму при погашении
  // в тот же день, что и сама продажа (нашёл ревьюер до коммита).
  // Теперь это гарантирует сам UPDATE внутри функции БД — клиент передаёт
  // только id продажи и способ оплаты, никаких сумм.
  it('погашение наличными вызывает RPC только с id и способом оплаты', async () => {
    const rpcSpy = mockRpc()

    await settleSaleDebt('sale-1', 'cash')

    expect(rpcSpy).toHaveBeenCalledWith('settle_sale_debt', {
      p_sale_id: 'sale-1',
      p_method: 'cash',
    })
    const payload = rpcSpy.mock.calls[0][1] as Record<string, unknown>
    expect(payload.paid_cash).toBeUndefined()
    expect(payload.paid_kaspi).toBeUndefined()
    expect(payload.debt_amount).toBeUndefined()
    expect(payload.debt_paid_at).toBeUndefined()
  })

  it('погашение через Kaspi передаёт p_method=kaspi', async () => {
    const rpcSpy = mockRpc()

    await settleSaleDebt('sale-1', 'kaspi')

    expect(rpcSpy).toHaveBeenCalledWith('settle_sale_debt', {
      p_sale_id: 'sale-1',
      p_method: 'kaspi',
    })
  })

  it('бросает ошибку, если по продаже нет долга', async () => {
    mockRpc({ error: { message: 'NO_DEBT: по продаже sale-1 нет долга' } })
    await expect(settleSaleDebt('sale-1', 'cash')).rejects.toThrow('нет долга')
  })

  it('бросает ошибку, если долг уже погашен', async () => {
    mockRpc({ error: { message: 'ALREADY_SETTLED: долг уже погашен' } })
    await expect(settleSaleDebt('sale-1', 'cash')).rejects.toThrow('уже погашен')
  })

  it('продажа не найдена → понятная ошибка', async () => {
    mockRpc({ error: { message: 'NOT_FOUND: продажа sale-1 не найдена' } })
    await expect(settleSaleDebt('sale-1', 'cash')).rejects.toThrow('не найдена')
  })

  // Чужой филиал / не сотрудник — функция БД отвечает FORBIDDEN.
  it('нет прав (чужой филиал) → «Недостаточно прав», а не тихий успех', async () => {
    mockRpc({ error: { message: 'FORBIDDEN: продажа относится к другому филиалу' } })
    await expect(settleSaleDebt('sale-1', 'cash')).rejects.toThrow('Недостаточно прав')
  })

  // Незнакомая ошибка не должна проглатываться: кнопка обязана сообщить о сбое,
  // иначе менеджер решит, что долг погашен.
  it('неожиданная ошибка БД → общий текст, но всё равно ошибка', async () => {
    mockRpc({ error: { message: 'connection reset' } })
    await expect(settleSaleDebt('sale-1', 'cash')).rejects.toThrow('Не удалось погасить долг')
  })
})
