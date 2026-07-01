import { useEffect, useRef, useState } from 'react';
import { ChevronUp } from 'lucide-react';

const SHOW_AFTER_PX = 300;

// Приложение не имеет единого скролла window — у каждой вкладки/панели свой
// собственный overflow-y-auto контейнер. Слушаем scroll в capture-фазе на document,
// чтобы поймать событие от ЛЮБОГО вложенного контейнера, не завязываясь на конкретный.
export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);
  const activeElRef = useRef<Element | typeof window | null>(null);

  useEffect(() => {
    function handleScroll(e: Event) {
      const target = e.target;
      const isDocOrWindow = target === document || target === window;
      const el = isDocOrWindow ? window : (target as Element);

      // Внутри модалок (data-modal="true") кнопка не нужна — не мешаем UI поверх модалки
      if (!isDocOrWindow && (target as Element).closest?.('[data-modal="true"]')) return;

      const scrollTop = isDocOrWindow ? window.scrollY : (el as Element).scrollTop;
      if (scrollTop > SHOW_AFTER_PX) {
        activeElRef.current = el;
        setVisible(true);
      } else if (el === activeElRef.current) {
        setVisible(false);
      }
    }
    document.addEventListener('scroll', handleScroll, true);
    return () => document.removeEventListener('scroll', handleScroll, true);
  }, []);

  function scrollToTop() {
    const el = activeElRef.current;
    if (!el) return;
    if (el === window) window.scrollTo({ top: 0, behavior: 'smooth' });
    else (el as Element).scrollTo({ top: 0, behavior: 'smooth' });
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <button
      onClick={scrollToTop}
      aria-label="Наверх"
      className="fixed bottom-24 right-4 z-40 w-11 h-11 rounded-full bg-blue-600 text-white shadow-lg flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-transform"
    >
      <ChevronUp size={22} />
    </button>
  );
}
