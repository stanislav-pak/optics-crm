import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSwipeBack } from '../hooks/useSwipeBack'

// --- helpers -------------------------------------------------------------

type Point = { x: number; y: number }

function touchEvent(type: string, points: Point[], target: EventTarget) {
  const list = points.map(p => ({ clientX: p.x, clientY: p.y })) as unknown as Touch[]
  const e = new Event(type, { bubbles: true }) as TouchEvent & {
    touches: Touch[]
    changedTouches: Touch[]
  }
  Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : list })
  Object.defineProperty(e, 'changedTouches', { value: list })
  Object.defineProperty(e, 'target', { value: target })
  return e
}

function swipe(from: Point, to: Point, target: EventTarget = document.body, opts: { move?: boolean } = {}) {
  document.dispatchEvent(touchEvent('touchstart', [from], target))
  if (opts.move !== false) {
    document.dispatchEvent(touchEvent('touchmove', [to], target))
  }
  document.dispatchEvent(touchEvent('touchend', [to], target))
}

function mockSelection(text: string) {
  vi.spyOn(window, 'getSelection').mockReturnValue({
    isCollapsed: text.length === 0,
    toString: () => text,
  } as unknown as Selection)
}

let onBack: Mock<() => void>

beforeEach(() => {
  onBack = vi.fn<() => void>()
  document.body.innerHTML = ''
  // jsdom: элементы без размеров, поэтому окно задаём явно
  Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// --- tests ---------------------------------------------------------------

describe('useSwipeBack — свайп из любого места', () => {
  it('срабатывает при свайпе вправо из середины экрана', () => {
    renderHook(() => useSwipeBack(onBack))
    swipe({ x: 200, y: 400 }, { x: 320, y: 410 })
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('срабатывает при свайпе от левого края (старое поведение сохранено)', () => {
    renderHook(() => useSwipeBack(onBack))
    swipe({ x: 10, y: 300 }, { x: 150, y: 305 })
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('не срабатывает при коротком движении (dx <= 80)', () => {
    renderHook(() => useSwipeBack(onBack))
    swipe({ x: 200, y: 400 }, { x: 260, y: 400 })
    expect(onBack).not.toHaveBeenCalled()
  })

  it('не срабатывает при свайпе влево', () => {
    renderHook(() => useSwipeBack(onBack))
    swipe({ x: 300, y: 400 }, { x: 100, y: 400 })
    expect(onBack).not.toHaveBeenCalled()
  })

  it('не срабатывает при диагонали (dx <= |dy| * 1.5)', () => {
    renderHook(() => useSwipeBack(onBack))
    // dx = 100, dy = 90 -> 100 <= 135
    swipe({ x: 100, y: 300 }, { x: 200, y: 390 }, document.body, { move: false })
    expect(onBack).not.toHaveBeenCalled()
  })

  it('сбрасывает жест при вертикальном движении (скролл)', () => {
    renderHook(() => useSwipeBack(onBack))
    document.dispatchEvent(touchEvent('touchstart', [{ x: 100, y: 300 }], document.body))
    document.dispatchEvent(touchEvent('touchmove', [{ x: 105, y: 200 }], document.body))
    document.dispatchEvent(touchEvent('touchend', [{ x: 250, y: 305 }], document.body))
    expect(onBack).not.toHaveBeenCalled()
  })

  it('сбрасывает жест при мультитаче', () => {
    renderHook(() => useSwipeBack(onBack))
    document.dispatchEvent(
      touchEvent('touchstart', [{ x: 100, y: 300 }, { x: 200, y: 300 }], document.body)
    )
    document.dispatchEvent(touchEvent('touchend', [{ x: 250, y: 300 }], document.body))
    expect(onBack).not.toHaveBeenCalled()
  })

  it('сбрасывается по touchcancel', () => {
    renderHook(() => useSwipeBack(onBack))
    document.dispatchEvent(touchEvent('touchstart', [{ x: 100, y: 300 }], document.body))
    document.dispatchEvent(touchEvent('touchcancel', [{ x: 100, y: 300 }], document.body))
    document.dispatchEvent(touchEvent('touchend', [{ x: 250, y: 300 }], document.body))
    expect(onBack).not.toHaveBeenCalled()
  })

  it('снимает слушатели при размонтировании', () => {
    const { unmount } = renderHook(() => useSwipeBack(onBack))
    unmount()
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 })
    expect(onBack).not.toHaveBeenCalled()
  })
})

describe('useSwipeBack — защита от выделения текста', () => {
  it('не срабатывает, если после жеста есть выделенный текст', () => {
    renderHook(() => useSwipeBack(onBack))
    mockSelection('выделенный текст')
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 })
    expect(onBack).not.toHaveBeenCalled()
  })

  it('срабатывает, если выделение схлопнуто (пустое)', () => {
    renderHook(() => useSwipeBack(onBack))
    mockSelection('')
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 })
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('не начинает жест при касании внутри input', () => {
    renderHook(() => useSwipeBack(onBack))
    const input = document.createElement('input')
    document.body.appendChild(input)
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, input)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('не начинает жест при касании внутри textarea', () => {
    renderHook(() => useSwipeBack(onBack))
    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, ta)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('не начинает жест внутри contenteditable', () => {
    renderHook(() => useSwipeBack(onBack))
    const box = document.createElement('div')
    box.setAttribute('contenteditable', 'true')
    const span = document.createElement('span')
    box.appendChild(span)
    document.body.appendChild(box)
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, span)
    expect(onBack).not.toHaveBeenCalled()
  })
})

describe('useSwipeBack — оверлеи и горизонтальная прокрутка', () => {
  it('не срабатывает, если жест начался внутри полноэкранного fixed-оверлея', () => {
    renderHook(() => useSwipeBack(onBack))
    const overlay = document.createElement('div')
    overlay.style.position = 'fixed'
    overlay.getBoundingClientRect = () =>
      ({ width: 400, height: 800, top: 0, left: 0, right: 400, bottom: 800 }) as DOMRect
    const inner = document.createElement('div')
    overlay.appendChild(inner)
    document.body.appendChild(overlay)
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, inner)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('срабатывает, если fixed-элемент маленький (например, нижняя панель)', () => {
    renderHook(() => useSwipeBack(onBack))
    const bar = document.createElement('div')
    bar.style.position = 'fixed'
    bar.getBoundingClientRect = () =>
      ({ width: 400, height: 60, top: 740, left: 0, right: 400, bottom: 800 }) as DOMRect
    document.body.appendChild(bar)
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, bar)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('не срабатывает внутри блока с горизонтальной прокруткой', () => {
    renderHook(() => useSwipeBack(onBack))
    const scroller = document.createElement('div')
    scroller.style.overflowX = 'auto'
    Object.defineProperty(scroller, 'scrollWidth', { value: 900, configurable: true })
    Object.defineProperty(scroller, 'clientWidth', { value: 300, configurable: true })
    document.body.appendChild(scroller)
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, scroller)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('срабатывает в блоке overflow-x:auto без реальной прокрутки', () => {
    renderHook(() => useSwipeBack(onBack))
    const box = document.createElement('div')
    box.style.overflowX = 'auto'
    Object.defineProperty(box, 'scrollWidth', { value: 300, configurable: true })
    Object.defineProperty(box, 'clientWidth', { value: 300, configurable: true })
    document.body.appendChild(box)
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, box)
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
