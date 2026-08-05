import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LoginForm } from '@/components/Auth/LoginForm'

vi.mock('@/services/auth', () => ({
  signIn: vi.fn(),
}))

describe('LoginForm — поле пароля на экране входа', () => {
  it('поле пароля скрыто по умолчанию и переключается кнопкой «глаз»', () => {
    render(<LoginForm onSuccess={vi.fn()} />)

    const input = screen.getByPlaceholderText('••••••••') as HTMLInputElement
    expect(input.type).toBe('password')

    fireEvent.click(screen.getByLabelText('Показать пароль'))
    expect(input.type).toBe('text')

    fireEvent.click(screen.getByLabelText('Скрыть пароль'))
    expect(input.type).toBe('password')
  })

  it('ввод пароля работает как обычно вместе с toggle', () => {
    render(<LoginForm onSuccess={vi.fn()} />)
    const input = screen.getByPlaceholderText('••••••••') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'mypassword' } })
    expect(input.value).toBe('mypassword')
    fireEvent.click(screen.getByLabelText('Показать пароль'))
    expect((screen.getByPlaceholderText('••••••••') as HTMLInputElement).value).toBe('mypassword')
  })
})
