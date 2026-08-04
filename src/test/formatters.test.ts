import { describe, it, expect } from 'vitest'
import { clampPrepayment } from '@/utils/formatters'

describe('clampPrepayment', () => {
  it('возвращает значение как есть, если оно в диапазоне [0, total]', () => {
    expect(clampPrepayment(500, 1000)).toBe(500)
  })

  it('обрезает значение сверху до total при превышении', () => {
    expect(clampPrepayment(1500, 1000)).toBe(1000)
  })

  it('обрезает отрицательное значение до 0', () => {
    expect(clampPrepayment(-100, 1000)).toBe(0)
  })

  it('возвращает 0, если total равен 0', () => {
    expect(clampPrepayment(500, 0)).toBe(0)
  })

  it('возвращает 0, если total отрицательный', () => {
    expect(clampPrepayment(500, -50)).toBe(0)
  })

  it('на границе: value === total', () => {
    expect(clampPrepayment(1000, 1000)).toBe(1000)
  })

  it('на границе: value === 0', () => {
    expect(clampPrepayment(0, 1000)).toBe(0)
  })
})
