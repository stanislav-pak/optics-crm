import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

function Smoke({ text }: { text: string }) {
  return <div data-testid="smoke">{text}</div>
}

describe('TDD setup', () => {
  it('рендерит компонент', () => {
    render(<Smoke text="New Line CRM" />)
    expect(screen.getByTestId('smoke')).toBeInTheDocument()
  })

  it('jest-dom matchers работают', () => {
    const { container } = render(<Smoke text="ok" />)
    expect(container.firstChild).toBeVisible()
  })
})
