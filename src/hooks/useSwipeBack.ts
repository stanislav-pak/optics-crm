import { useEffect } from 'react'

export const useSwipeBack = (onBack: () => void) => {
  useEffect(() => {
    let startX = 0
    const onTouchStart = (e: TouchEvent) => { startX = e.touches[0].clientX }
    const onTouchEnd = (e: TouchEvent) => {
      if (startX < 30 && e.changedTouches[0].clientX - startX > 80) onBack()
    }
    document.addEventListener('touchstart', onTouchStart)
    document.addEventListener('touchend', onTouchEnd)
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [onBack])
}
