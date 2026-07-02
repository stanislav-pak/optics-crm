import { useEffect, useRef, useState } from 'react';
import { X, Camera, Keyboard } from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException, DecodeHintType, BarcodeFormat } from '@zxing/library';

interface Props {
  onDetected: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const detectedRef = useRef(false);
  const [status, setStatus] = useState('Инициализация...');
  const [error, setError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualValue, setManualValue] = useState('');

  useEffect(() => {
    let cancelled = false;

    let focusInterval: ReturnType<typeof setInterval> | null = null;

    const start = async () => {
      try {
        setStatus('Запрос камеры...');
        const stream = await navigator.mediaDevices.getUserMedia({
          // Явно просим высокое разрешение — без constraint браузер может сам выбрать
          // низкое (например 640x480) по умолчанию, а мелким/плотным штрихкодам (узкие
          // этикетки со штрихкодом в половину ширины) нужно больше пикселей на полоску.
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: 'continuous' }],
          },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        setStatus('Камера получена');

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        setStatus('Сканирование...');

        // На части Android-браузеров `focusMode: 'continuous'` из getUserMedia
        // молча игнорируется и реально применяется только через applyConstraints
        // на уже запущенном треке. Пробуем сразу и повторяем периодически —
        // на некоторых устройствах автофокус "засыпает" и его нужно подталкивать.
        const [track] = stream.getVideoTracks();
        const applyFocus = () => {
          const caps = track.getCapabilities?.() as (MediaTrackCapabilities & { focusMode?: string[] }) | undefined;
          if (!caps?.focusMode?.includes('continuous')) return;
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {});
        };
        applyFocus();
        focusInterval = setInterval(applyFocus, 3000);

        // TRY_HARDER заставляет zxing тратить больше времени на кадр ради надёжности —
        // критично для мелких/плотных штрихкодов (узкая этикетка со штрихкодом в
        // половину ширины). POSSIBLE_FORMATS сужает поиск до реально используемых
        // форматов — меньше ложных срабатываний на других форматах, точнее и быстрее.
        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.CODE_128]);
        const reader = new BrowserMultiFormatReader(hints);
        readerRef.current = reader;

        await reader.decodeFromVideoDevice(undefined, video, (result, err) => {
          if (cancelled) return;
          if (result && !detectedRef.current) {
            detectedRef.current = true;
            setStatus('Найден: ' + result.getText());
            onDetected(result.getText());
            setTimeout(() => onClose(), 500);
          }
          if (err && !(err instanceof NotFoundException)) {
            // ignore scan errors
          }
        });
      } catch (e: any) {
        if (!cancelled) {
          const isPermission = e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError';
          const msg = isPermission
            ? 'Разрешите доступ к камере в настройках браузера'
            : 'Не удалось запустить камеру';
          setStatus('Ошибка: ' + msg);
          setError(msg);
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      if (focusInterval) clearInterval(focusInterval);
      try { BrowserMultiFormatReader.releaseAllStreams(); } catch {}
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  useEffect(() => {
    const startX = { x: 0, y: 0 };
    const onStart = (e: TouchEvent) => {
      startX.x = e.touches[0].clientX;
      startX.y = e.touches[0].clientY;
    };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX.x;
      const dy = Math.abs(e.changedTouches[0].clientY - startX.y);
      if (dx > 60 && dy < 80) handleClose();
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, []);

  const handleClose = () => {
    try { BrowserMultiFormatReader.releaseAllStreams(); } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop());
    onClose();
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = manualValue.trim();
    if (!value || detectedRef.current) return;
    detectedRef.current = true;
    onDetected(value);
    handleClose();
  };

  return (
    <div data-modal="true" className="fixed inset-0 z-[60] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <div className="flex items-center gap-2 text-white">
          <Camera size={18} />
          <span className="text-sm font-medium">Сканирование штрихкода</span>
        </div>
        <button onClick={handleClose} className="text-white/70 hover:text-white">
          <X size={22} />
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        <div className="absolute top-4 left-4 right-4 bg-black/70 text-white text-xs px-3 py-2 rounded-lg text-center z-10">
          {status}
        </div>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-64 h-40">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500 opacity-80 animate-pulse" />
          </div>
        </div>

        {error && (
          <div className="absolute bottom-8 left-4 right-4 bg-red-500/90 text-white text-sm px-4 py-3 rounded-xl text-center">
            {error}
          </div>
        )}
      </div>

      <div className="px-4 py-4 bg-black/80">
        {manualMode ? (
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={manualValue}
              onChange={e => setManualValue(e.target.value)}
              placeholder="Введите штрихкод вручную"
              className="flex-1 min-w-0 bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!manualValue.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40"
            >
              OK
            </button>
          </form>
        ) : (
          <div className="text-center space-y-2">
            <p className="text-white/60 text-xs">Наведи камеру на штрихкод товара</p>
            <button
              type="button"
              onClick={() => setManualMode(true)}
              className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-xs underline underline-offset-2"
            >
              <Keyboard size={13} />
              Штрихкод не считывается — ввести вручную
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
