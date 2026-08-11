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

type SwipeOpts = {
  /** false — не слать touchmove вовсе (палец «телепортировался») */
  move?: boolean
  /** промежуточные точки траектории */
  path?: Point[]
  /** элемент, на котором палец оторвался (по умолчанию тот же) */
  endTarget?: EventTarget
}

function swipe(from: Point, to: Point, target: EventTarget = document.body, opts: SwipeOpts = {}) {
  document.dispatchEvent(touchEvent('touchstart', [from], target))
  if (opts.move !== false) {
    for (const p of opts.path ?? []) {
      document.dispatchEvent(touchEvent('touchmove', [p], target))
    }
    document.dispatchEvent(touchEvent('touchmove', [to], target))
  }
  document.dispatchEvent(touchEvent('touchend', [to], opts.endTarget ?? target))
}

function mockSelection(text: string) {
  vi.spyOn(window, 'getSelection').mockReturnValue({
    isCollapsed: text.length === 0,
    toString: () => text,
  } as unknown as Selection)
}

/**
 * jsdom не поддерживает свойство touch-action в CSS-движке, поэтому задаём его
 * и в атрибуте, и напрямую в объекте style — хук читает computed, а при пустом
 * значении откатывается на inline.
 */
function withTouchAction(el: HTMLElement, value: string) {
  el.setAttribute('style', `touch-action: ${value}`)
  Object.defineProperty(el.style, 'touchAction', { value, configurable: true })
  return el
}

function fixedEl(width: number, height: number) {
  const el = document.createElement('div')
  el.style.position = 'fixed'
  el.getBoundingClientRect = () =>
    ({ width, height, top: 0, left: 0, right: width, bottom: height }) as DOMRect
  return el
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
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// --- срабатывание --------------------------------------------------------

describe('useSwipeBack — явный горизонтальный свайп', () => {
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

  it('срабатывает при плавной траектории с небольшим вертикальным дрожанием', () => {
    renderHook(() => useSwipeBack(onBack))
    swipe({ x: 100, y: 400 }, { x: 260, y: 405 }, document.body, {
      path: [
        { x: 140, y: 395 },
        { x: 190, y: 412 },
        { x: 230, y: 402 },
      ],
    })
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('снимает слушатели при размонтировании', () => {
    const { unmount } = renderHook(() => useSwipeBack(onBack))
    unmount()
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 })
    expect(onBack).not.toHaveBeenCalled()
  })
})

// --- геометрия жеста -----------------------------------------------------

describe('useSwipeBack — траектория', () => {
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

  it('не срабатывает при диагонали — горизонталь не доминирует (dx <= 2 * |dy|)', () => {
    renderHook(() => useSwipeBack(onBack))
    // dx = 100, dy = 60 -> 100 <= 120
    swipe({ x: 100, y: 300 }, { x: 200, y: 360 })
    expect(onBack).not.toHaveBeenCalled()
  })

  it('не срабатывает, если по пути был вертикальный уход больше 40px (диагональ-крюк)', () => {
    renderHook(() => useSwipeBack(onBack))
    // финиш почти на той же высоте, но в середине жеста палец ушёл вниз на 70px
    swipe({ x: 100, y: 300 }, { x: 260, y: 305 }, document.body, {
      path: [
        { x: 150, y: 340 },
        { x: 200, y: 370 },
      ],
    })
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

  it('сбрасывает жест, если второй палец появился по ходу движения', () => {
    renderHook(() => useSwipeBack(onBack))
    document.dispatchEvent(touchEvent('touchstart', [{ x: 100, y: 300 }], document.body))
    document.dispatchEvent(
      touchEvent('touchmove', [{ x: 150, y: 300 }, { x: 250, y: 300 }], document.body)
    )
    document.dispatchEvent(touchEvent('touchend', [{ x: 260, y: 300 }], document.body))
    expect(onBack).not.toHaveBeenCalled()
  })

  it('сбрасывается по touchcancel', () => {
    renderHook(() => useSwipeBack(onBack))
    document.dispatchEvent(touchEvent('touchstart', [{ x: 100, y: 300 }], document.body))
    document.dispatchEvent(touchEvent('touchcancel', [{ x: 100, y: 300 }], document.body))
    document.dispatchEvent(touchEvent('touchend', [{ x: 250, y: 300 }], document.body))
    expect(onBack).not.toHaveBeenCalled()
  })

  it('не срабатывает без единого touchmove (движение не наблюдалось)', () => {
    renderHook(() => useSwipeBack(onBack))
    swipe({ x: 100, y: 300 }, { x: 250, y: 300 }, document.body, { move: false })
    expect(onBack).not.toHaveBeenCalled()
  })

  it('не срабатывает при долгом тапе без движения (>500мс)', () => {
    vi.useFakeTimers()
    renderHook(() => useSwipeBack(onBack))
    document.dispatchEvent(touchEvent('touchstart', [{ x: 100, y: 300 }], document.body))
    vi.advanceTimersByTime(700)
    document.dispatchEvent(touchEvent('touchend', [{ x: 250, y: 300 }], document.body))
    expect(onBack).not.toHaveBeenCalled()
  })

  it('не срабатывает, если палец лежал >500мс и только потом поехал (выделение на iOS)', () => {
    vi.useFakeTimers()
    renderHook(() => useSwipeBack(onBack))
    document.dispatchEvent(touchEvent('touchstart', [{ x: 100, y: 300 }], document.body))
    vi.advanceTimersByTime(700)
    document.dispatchEvent(touchEvent('touchmove', [{ x: 180, y: 300 }], document.body))
    document.dispatchEvent(touchEvent('touchend', [{ x: 260, y: 300 }], document.body))
    expect(onBack).not.toHaveBeenCalled()
  })

  it('срабатывает, если пауза перед движением была короткой', () => {
    vi.useFakeTimers()
    renderHook(() => useSwipeBack(onBack))
    document.dispatchEvent(touchEvent('touchstart', [{ x: 100, y: 300 }], document.body))
    vi.advanceTimersByTime(120)
    document.dispatchEvent(touchEvent('touchmove', [{ x: 180, y: 300 }], document.body))
    document.dispatchEvent(touchEvent('touchend', [{ x: 260, y: 300 }], document.body))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

// --- выделение текста ----------------------------------------------------

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
})

// --- интерактивные элементы ---------------------------------------------

describe('useSwipeBack — жест не начинается на интерактивном элементе', () => {
  const cases: Array<[string, () => HTMLElement]> = [
    ['input', () => document.createElement('input')],
    ['input[type=range]', () => {
      const el = document.createElement('input')
      el.type = 'range'
      return el
    }],
    ['input[type=number]', () => {
      const el = document.createElement('input')
      el.type = 'number'
      return el
    }],
    ['textarea', () => document.createElement('textarea')],
    ['select', () => document.createElement('select')],
    ['button', () => document.createElement('button')],
    ['a[href]', () => {
      const el = document.createElement('a')
      el.href = '#test'
      return el
    }],
    ['label', () => document.createElement('label')],
    ['canvas', () => document.createElement('canvas')],
    ['[role=slider]', () => {
      const el = document.createElement('div')
      el.setAttribute('role', 'slider')
      return el
    }],
    ['[role=switch]', () => {
      const el = document.createElement('div')
      el.setAttribute('role', 'switch')
      return el
    }],
    ['[role=tab]', () => {
      const el = document.createElement('div')
      el.setAttribute('role', 'tab')
      return el
    }],
    ['[role=button]', () => {
      const el = document.createElement('div')
      el.setAttribute('role', 'button')
      return el
    }],
    ['[role=menuitem]', () => {
      const el = document.createElement('div')
      el.setAttribute('role', 'menuitem')
      return el
    }],
    ['[draggable=true]', () => {
      const el = document.createElement('div')
      el.setAttribute('draggable', 'true')
      return el
    }],
    ['[data-no-swipe]', () => {
      const el = document.createElement('div')
      el.setAttribute('data-no-swipe', '')
      return el
    }],
    ['[contenteditable=true]', () => {
      const el = document.createElement('div')
      el.setAttribute('contenteditable', 'true')
      return el
    }],
  ]

  it.each(cases)('не срабатывает при старте на %s', (_name, make) => {
    renderHook(() => useSwipeBack(onBack))
    const el = make()
    document.body.appendChild(el)
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, el)
    expect(onBack).not.toHaveBeenCalled()
  })

  it.each([
    ['img', () => document.createElement('img')],
    ['video', () => document.createElement('video')],
  ])('срабатывает при старте на обычном %s (фото жесту не мешает)', (_name, make) => {
    renderHook(() => useSwipeBack(onBack))
    const el = make()
    document.body.appendChild(el)
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, el)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('не срабатывает при старте на перетаскиваемой картинке', () => {
    renderHook(() => useSwipeBack(onBack))
    const img = document.createElement('img')
    img.setAttribute('draggable', 'true')
    document.body.appendChild(img)
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, img)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('не срабатывает при старте на потомке интерактивного элемента', () => {
    renderHook(() => useSwipeBack(onBack))
    const btn = document.createElement('button')
    const span = document.createElement('span')
    btn.appendChild(span)
    document.body.appendChild(btn)
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, span)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('не срабатывает, если палец оторвался на интерактивном элементе', () => {
    renderHook(() => useSwipeBack(onBack))
    const btn = document.createElement('button')
    document.body.appendChild(btn)
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, document.body, { endTarget: btn })
    expect(onBack).not.toHaveBeenCalled()
  })
})

// --- touch-action --------------------------------------------------------

describe('useSwipeBack — нестандартный touch-action', () => {
  it.each(['none', 'pan-x', 'pan-y', 'pan-y pinch-zoom'])(
    'не срабатывает при touch-action: %s',
    value => {
      renderHook(() => useSwipeBack(onBack))
      const el = withTouchAction(document.createElement('div'), value)
      document.body.appendChild(el)
      swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, el)
      expect(onBack).not.toHaveBeenCalled()
    }
  )

  it('не срабатывает, если touch-action задан у предка', () => {
    renderHook(() => useSwipeBack(onBack))
    const wrap = withTouchAction(document.createElement('div'), 'pan-y')
    const inner = document.createElement('div')
    wrap.appendChild(inner)
    document.body.appendChild(wrap)
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, inner)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('срабатывает при touch-action: auto / manipulation', () => {
    renderHook(() => useSwipeBack(onBack))
    const el = withTouchAction(document.createElement('div'), 'manipulation')
    document.body.appendChild(el)
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, el)
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

// --- оверлеи и прокрутка -------------------------------------------------

describe('useSwipeBack — оверлеи и горизонтальная прокрутка', () => {
  it('не срабатывает внутри полноэкранного fixed-оверлея', () => {
    renderHook(() => useSwipeBack(onBack))
    const overlay = fixedEl(400, 800)
    const inner = document.createElement('div')
    overlay.appendChild(inner)
    document.body.appendChild(overlay)
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, inner)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('не срабатывает и внутри небольшого fixed-элемента (любой fixed — спорный случай)', () => {
    renderHook(() => useSwipeBack(onBack))
    const bar = fixedEl(400, 60)
    document.body.appendChild(bar)
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, bar)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('не срабатывает внутри модалки с data-modal="true"', () => {
    renderHook(() => useSwipeBack(onBack))
    const modal = document.createElement('div')
    modal.setAttribute('data-modal', 'true')
    const inner = document.createElement('div')
    modal.appendChild(inner)
    document.body.appendChild(modal)
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, inner)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('не срабатывает, если где-то на странице открыт модал (палец вне него)', () => {
    renderHook(() => useSwipeBack(onBack))
    const modal = document.createElement('div')
    modal.setAttribute('data-modal', 'true')
    document.body.appendChild(modal)
    swipe({ x: 200, y: 400 }, { x: 320, y: 400 }, document.body)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('не срабатывает, если модал открылся уже по ходу жеста', () => {
    renderHook(() => useSwipeBack(onBack))
    document.dispatchEvent(touchEvent('touchstart', [{ x: 200, y: 400 }], document.body))
    document.dispatchEvent(touchEvent('touchmove', [{ x: 280, y: 400 }], document.body))
    const modal = document.createElement('div')
    modal.setAttribute('data-modal', 'true')
    document.body.appendChild(modal)
    document.dispatchEvent(touchEvent('touchend', [{ x: 320, y: 400 }], document.body))
    expect(onBack).not.toHaveBeenCalled()
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
