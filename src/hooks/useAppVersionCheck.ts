import { useEffect, useRef, useState } from 'react';

const CHECK_INTERVAL_MS = 45 * 1000;
const FETCH_TIMEOUT_MS = 10 * 1000;

// Сверяет версию, зашитую в текущий загруженный бандл (__APP_VERSION__), с той,
// что отдаёт dist/version.json на сервере. В dev-режиме файла version.json нет —
// fetch просто не проходит (!res.ok или сетевая ошибка), баннер не показываем,
// в консоль ничего не пишем.
export function useAppVersionCheck(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const foundRef = useRef(false);
  const checkingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkVersion = async () => {
      if (foundRef.current || checkingRef.current) return;
      checkingRef.current = true;
      const controller = new AbortController();
      controllerRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.version && data.version !== __APP_VERSION__) {
          foundRef.current = true;
          setUpdateAvailable(true);
        }
      } catch {
        // dev-режим, таймаут или сеть недоступна — молча игнорируем
      } finally {
        clearTimeout(timeout);
        // Пишем в общие рефы, только если это всё ещё наш контроллер — иначе
        // можно затереть состояние более нового запроса, стартовавшего после
        // быстрого unmount/remount (например, двойной вызов эффекта в StrictMode).
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          checkingRef.current = false;
        }
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, CHECK_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };
    window.addEventListener('focus', checkVersion);
    window.addEventListener('online', checkVersion);
    window.addEventListener('pageshow', checkVersion);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      controllerRef.current?.abort();
      controllerRef.current = null;
      checkingRef.current = false;
      clearInterval(interval);
      window.removeEventListener('focus', checkVersion);
      window.removeEventListener('online', checkVersion);
      window.removeEventListener('pageshow', checkVersion);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return updateAvailable;
}
