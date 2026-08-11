import { useEffect } from 'react'

// Жест «назад» намеренно консервативный: в любой спорной ситуации не срабатываем.
// Минимальный горизонтальный путь
const MIN_DX = 80
// Горизонталь должна быть вдвое длиннее вертикали
const DIRECTION_RATIO = 2
// Максимальное вертикальное отклонение за ВСЁ движение
const MAX_DEVIATION_DY = 40
// Движение меньше этого считаем дрожанием пальца, а не жестом
const MOVE_THRESHOLD = 10
// Удержание дольше этого без движения — долгий тап, не свайп
const LONG_PRESS_MS = 500

/** Элементы, на которых жест не начинаем: у них свои касания и перетаскивания */
const INTERACTIVE_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  'button',
  'a[href]',
  'label',
  '[role="slider"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="button"]',
  '[role="menuitem"]',
  '[draggable="true"]',
  'canvas',
  '[data-no-swipe]',
].join(', ')
// Обычные фото и видео жесту не мешают — блокируем их только если они перетаскиваемые
// (это покрывает селектор [draggable="true"] выше).

/** Контейнеры, внутри которых жест не начинаем */
const BLOCKING_SELECTOR = '[data-modal="true"], [data-no-swipe]'

/** Открыт любой модал — «назад» не даём, даже если палец вне него */
const isAnyModalOpen = (): boolean => !!document.querySelector('[data-modal="true"]')

/** Есть ли на странице непустое выделение текста */
const hasTextSelection = (): boolean => {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) return false
  return selection.toString().trim().length > 0
}

const toElement = (target: EventTarget | null): Element | null =>
  target instanceof Element ? target : null

const isInteractive = (el: Element | null): boolean => !!el?.closest(INTERACTIVE_SELECTOR)

/**
 * touch-action, отличный от auto/manipulation, означает, что элемент сам
 * распоряжается касаниями (карта, слайдер, карусель) — не вмешиваемся.
 */
const hasCustomTouchAction = (node: Element): boolean => {
  const computed = window.getComputedStyle(node).touchAction
  // jsdom не считает touch-action, поэтому откатываемся на inline-стиль
  const value = computed || (node instanceof HTMLElement ? node.style.touchAction : '') || ''
  return /\bnone\b|\bpan-x\b|\bpan-y\b/.test(value)
}

/**
 * Жест не начинаем, если он стартовал внутри:
 * — модалки/оверлея (position: fixed или data-modal);
 * — блока с реальной горизонтальной прокруткой (таблица, карусель);
 * — элемента с собственной обработкой касаний (touch-action).
 */
const isBlockedContainer = (el: Element | null): boolean => {
  if (el?.closest(BLOCKING_SELECTOR)) return true

  let node: Element | null = el
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node)

    if (style.position === 'fixed') return true

    if (
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      node.scrollWidth > node.clientWidth + 1
    ) {
      return true
    }

    if (hasCustomTouchAction(node)) return true

    node = node.parentElement
  }
  return false
}

export const useSwipeBack = (onBack: () => void) => {
  useEffect(() => {
    let tracking = false
    let startX = 0
    let startY = 0
    let startedAt = 0
    let firstMoveAt = 0
    let maxDeviationY = 0
    let moved = false

    const cancel = () => {
      tracking = false
    }

    const onTouchStart = (e: TouchEvent) => {
      // мультитач (зум, две руки) — не наш жест
      if (e.touches.length > 1) return cancel()

      const target = toElement(e.target)
      if (isAnyModalOpen()) return cancel()
      if (hasTextSelection()) return cancel()
      if (isInteractive(target)) return cancel()
      if (isBlockedContainer(target)) return cancel()

      tracking = true
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      startedAt = Date.now()
      firstMoveAt = 0
      maxDeviationY = 0
      moved = false
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return
      if (e.touches.length > 1) return cancel()

      const dx = e.touches[0].clientX - startX
      const dy = e.touches[0].clientY - startY

      maxDeviationY = Math.max(maxDeviationY, Math.abs(dy))
      if (!moved && (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD)) {
        moved = true
        firstMoveAt = Date.now()
      }

      // ушли по вертикали — это скролл, жест отменяем сразу
      if (maxDeviationY > MAX_DEVIATION_DY) cancel()
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false

      // палец не двигался: тап или долгое удержание
      if (!moved) return
      // палец сначала долго лежал и только потом поехал — так на iOS выделяют текст
      if (firstMoveAt - startedAt > LONG_PRESS_MS) return

      const dx = e.changedTouches[0].clientX - startX
      const dy = e.changedTouches[0].clientY - startY

      if (Math.max(maxDeviationY, Math.abs(dy)) > MAX_DEVIATION_DY) return
      if (dx <= MIN_DX) return
      if (dx <= Math.abs(dy) * DIRECTION_RATIO) return

      // модал мог открыться уже по ходу жеста
      if (isAnyModalOpen()) return

      // палец оторвался на кнопке/ссылке — считаем это нажатием, а не свайпом
      if (isInteractive(toElement(e.target))) return

      // пользователь выделял текст вправо, а не листал назад
      if (hasTextSelection()) return

      onBack()
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    document.addEventListener('touchcancel', cancel, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', cancel)
    }
  }, [onBack])
}
