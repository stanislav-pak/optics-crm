import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SignupForm } from '@/components/Auth/SignupForm'
import { supabase } from '@/services/supabase'

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}))

const BRANCHES = [{ id: 'b1', name: 'Филиал 1' }]

function mockBranchesQuery() {
  vi.mocked(supabase.from).mockReturnValue({
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: BRANCHES }),
  } as any)
}

async function fillAndSubmit(opts: { adminCode?: string } = {}) {
  render(<SignupForm onBack={vi.fn()} />)

  await waitFor(() => expect(screen.getByText('Филиал 1')).toBeInTheDocument())

  fireEvent.change(screen.getByPlaceholderText('Иван Иванов'), { target: { value: 'Иван' } })
  fireEvent.change(screen.getByPlaceholderText('ivan@optics.kz'), { target: { value: 'ivan@optics.kz' } })
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } })
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b1' } })

  if (opts.adminCode) {
    fireEvent.change(screen.getByPlaceholderText('Только для руководителей'), { target: { value: opts.adminCode } })
  }

  fireEvent.click(screen.getByText('Зарегистрироваться'))
}

describe('SignupForm — код руководителя проверяется на сервере (RPC), не на клиенте', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBranchesQuery()
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: { id: 'u1' } },
      error: null,
    } as any)
    vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null } as any)
  })

  it('верный код руководителя (по ответу RPC role=admin) → экран "Добро пожаловать!"', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ employee_id: 'e1', role: 'admin', is_active: true, branch_id: 'sklad' }],
      error: null,
    } as any)

    await fillAndSubmit({ adminCode: 'correct-code' })

    await waitFor(() => expect(screen.getByText('Добро пожаловать!')).toBeInTheDocument())
    expect(supabase.rpc).toHaveBeenCalledWith('register_employee', expect.objectContaining({
      p_admin_code: 'correct-code',
    }))
  })

  it('неверный код руководителя (RPC вернул role=manager) → "Заявка отправлена", не admin', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ employee_id: 'e1', role: 'manager', is_active: false, branch_id: 'b1' }],
      error: null,
    } as any)

    await fillAndSubmit({ adminCode: 'wrong-code' })

    await waitFor(() => expect(screen.getByText('Заявка отправлена')).toBeInTheDocument())
  })

  it('без кода руководителя → обычная регистрация менеджера, "Заявка отправлена"', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ employee_id: 'e1', role: 'manager', is_active: false, branch_id: 'b1' }],
      error: null,
    } as any)

    await fillAndSubmit()

    await waitFor(() => expect(screen.getByText('Заявка отправлена')).toBeInTheDocument())
    expect(supabase.rpc).toHaveBeenCalledWith('register_employee', expect.objectContaining({
      p_admin_code: null,
    }))
  })

  it('RPC вернул employee_already_exists → показывает ошибку и не открывает success-экран', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'employee_already_exists' },
    } as any)

    await fillAndSubmit()

    await waitFor(() =>
      expect(screen.getByText('Аккаунт с этим email уже зарегистрирован. Войдите в систему.')).toBeInTheDocument()
    )
    expect(screen.queryByText('Заявка отправлена')).not.toBeInTheDocument()
    expect(screen.queryByText('Добро пожаловать!')).not.toBeInTheDocument()
  })

  it('нигде не читает и не сравнивает VITE_ADMIN_CODE на клиенте — только передаёт код в RPC как есть', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ employee_id: 'e1', role: 'manager', is_active: false, branch_id: 'b1' }],
      error: null,
    } as any)

    await fillAndSubmit({ adminCode: 'anything-typed-here' })

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())
    // Клиент не решает роль сам — просто пробрасывает введённый код в RPC как есть,
    // без всякого сравнения с локальной константой/env-переменной.
    expect(supabase.rpc).toHaveBeenCalledWith('register_employee', expect.objectContaining({
      p_admin_code: 'anything-typed-here',
    }))
  })
})
