import { useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useAppVersionCheck } from '../../hooks/useAppVersionCheck';

export default function UpdateBanner() {
  const updateAvailable = useAppVersionCheck();
  const [dismissed, setDismissed] = useState(false);

  if (!updateAvailable || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-3 bg-emerald-700 text-white text-xs sm:text-sm px-4 py-2 shadow-md">
      <span>Доступно обновление приложения</span>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 px-3 py-1 rounded-lg font-medium transition-colors flex-shrink-0"
      >
        <RefreshCw size={13} />
        Обновить
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Закрыть"
        className="text-white/60 hover:text-white flex-shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  );
}
