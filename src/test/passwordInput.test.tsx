import { useState } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PasswordInput } from '@/components/Auth/PasswordInput'

function Harness({ ariaSubject }: { ariaSubject?: string }) {
  const [value, setValue] = useState('')
  return <PasswordInput value={value} onChange={setValue} placeholder="••••••••" ariaSubject={ariaSubject} />
}

describe('PasswordInput', () => {
  it('по умолчанию скрывает пароль (type=password) с кнопкой «Показать пароль»', () => {
    render(<Harness />)
    const input = screen.getByPlaceholderText('••••••••') as HTMLInputElement
    expect(input.type).toBe('password')
    expect(screen.getByLabelText('Показать пароль')).toBeInTheDocument()
  })

  it('клик по кнопке переключает type на text и aria-label на «Скрыть пароль»', () => {
    render(<Harness />)
    fireEvent.click(screen.getByLabelText('Показать пароль'))
    const input = screen.getByPlaceholderText('••••••••') as HTMLInputElement
    expect(input.type).toBe('text')
    expect(screen.getByLabelText('Скрыть пароль')).toBeInTheDocument()
  })

  it('повторный клик возвращает type обратно на password', () => {
    render(<Harness />)
    fireEvent.click(screen.getByLabelText('Показать пароль'))
    fireEvent.click(screen.getByLabelText('Скрыть пароль'))
    const input = screen.getByPlaceholderText('••••••••') as HTMLInputElement
    expect(input.type).toBe('password')
  })

  it('введённое значение сохраняется при переключении видимости', () => {
    render(<Harness />)
    const input = screen.getByPlaceholderText('••••••••') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'secret123' } })
    expect(input.value).toBe('secret123')
    fireEvent.click(screen.getByLabelText('Показать пароль'))
    expect((screen.getByPlaceholderText('••••••••') as HTMLInputElement).value).toBe('secret123')
  })

  it('ariaSubject меняет текст aria-label (напр. «код» для секретного кода приглашения)', () => {
    render(<Harness ariaSubject="код" />)
    expect(screen.getByLabelText('Показать код')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Показать код'))
    expect(screen.getByLabelText('Скрыть код')).toBeInTheDocument()
  })

  it('кнопка не перехватывает Tab-навигацию (tabIndex=-1)', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Показать пароль')).toHaveAttribute('tabindex', '-1')
  })

  it('кнопка типа button (не submit — не отправляет форму по клику)', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Показать пароль')).toHaveAttribute('type', 'button')
  })
})
