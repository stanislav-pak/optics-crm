import { useEffect } from 'react'

// Минимальный горизонтальный путь, который считаем жестом «назад»
const MIN_DX = 80
// Горизонталь должна быть заметно длиннее вертикали
const DIRECTION_RATIO = 1.5
// Вертикальный сдвиг, после которого жест считаем скроллом и отменяем
const CANCEL_DY = 40
// Доля экрана, начиная с которой fixed-элемент считаем перекрывающим оверлеем
const OVERLAY_COVERAGE = 0.9

/** Есть ли на странице непустое выделение текста */
const hasTextSelection = (): boolean => {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) return false
  return selection.toString().trim().length > 0
}

/** Касание внутри поля ввода — там свои жесты и своё выделение */
const isEditableTarget = (el: Element | null): boolean =>
  !!el?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')

/**
 * Жест не начинаем, если он стартовал внутри:
 * — оверлея (position: fixed), закрывающего почти весь экран (модалка, шторка);
 * — блока с реальной горизонтальной прокруткой (таблица, карусель).
 */
const isBlockedContainer = (el: Element | null): boolean => {
  let node: Element | null = el
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node)

    if (style.position === 'fixed') {
      const rect = node.getBoundingClientRect()
      if (
        rect.width >= window.innerWidth * OVERLAY_COVERAGE &&
        rect.height >= window.innerHeight * OVERLAY_COVERAGE
      ) {
        return true
      }
    }

    if (
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      node.scrollWidth > node.clientWidth + 1
    ) {
      return true
    }

    node = node.parentElement
  }
  return false
}

export const useSwipeBack = (onBack: () => void) => {
  useEffect(() => {
    let tracking = false
    let startX = 0
    let startY = 0

    const cancel = () => {
      tracking = false
    }

    const onTouchStart = (e: TouchEvent) => {
      // мультитач (зум, две руки) — не наш жест
      if (e.touches.length > 1) return cancel()

      const target = e.target instanceof Element ? e.target : null
      if (isEditableTarget(target)) return cancel()
      if (hasTextSelection()) return cancel()
      if (isBlockedContainer(target)) return cancel()

      tracking = true
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return
      if (e.touches.length > 1) return cancel()

      const dx = e.touches[0].clientX - startX
      const dy = e.touches[0].clientY - startY
      // ушли по вертикали — это скролл, жест отменяем
      if (Math.abs(dy) > CANCEL_DY && Math.abs(dy) > Math.abs(dx)) cancel()
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false

      const dx = e.changedTouches[0].clientX - startX
      const dy = e.changedTouches[0].clientY - startY

      if (dx <= MIN_DX) return
      if (dx <= Math.abs(dy) * DIRECTION_RATIO) return
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
