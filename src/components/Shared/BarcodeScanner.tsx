import { useEffect, useRef, useState } from 'react';
import { X, Camera } from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';

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

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        setStatus('Запрос камеры...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
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

        const reader = new BrowserMultiFormatReader();
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
      } catch (e) {
        if (!cancelled) {
          setStatus('Ошибка: ' + String(e));
          setError(String(e));
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      try { BrowserMultiFormatReader.releaseAllStreams(); } catch {}
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  const handleClose = () => {
    try { BrowserMultiFormatReader.releaseAllStreams(); } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
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

      <div className="px-4 py-4 bg-black/80 text-center">
        <p className="text-white/60 text-xs">Наведи камеру на штрихкод товара</p>
      </div>
    </div>
  );
}
