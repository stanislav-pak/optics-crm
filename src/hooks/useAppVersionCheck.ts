import { useEffect, useRef, useState } from 'react';

const CHECK_INTERVAL_MS = 12 * 60 * 1000;

// Сверяет версию, зашитую в текущий загруженный бандл (__APP_VERSION__), с той,
// что отдаёт dist/version.json на сервере. В dev-режиме файла version.json нет —
// fetch просто не проходит (!res.ok или сетевая ошибка), баннер не показываем,
// в консоль ничего не пишем.
export function useAppVersionCheck(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const foundRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const checkVersion = async () => {
      if (foundRef.current) return;
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.version && data.version !== __APP_VERSION__) {
          foundRef.current = true;
          setUpdateAvailable(true);
        }
      } catch {
        // dev-режим или сеть недоступна — молча игнорируем
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, CHECK_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };
    window.addEventListener('focus', checkVersion);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', checkVersion);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return updateAvailable;
}
