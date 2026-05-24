import { useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';

export function useBarcodeScanner(
  onDetected: (barcode: string) => void,
  onStatus?: (status: string) => void
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = () => {
    try { BrowserMultiFormatReader.releaseAllStreams(); } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    readerRef.current = null;
    setIsActive(false);
  };

  const initReader = async (video: HTMLVideoElement) => {
    try {
      onStatus?.('Запрос камеры...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      onStatus?.('Камера получена');
      video.srcObject = stream;
      await video.play();
      onStatus?.('Видео запущено');

      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      onStatus?.('Сканирование...');

      await reader.decodeFromVideoDevice(undefined, video, (result, err) => {
        if (result) {
          const text = result.getText();
          onStatus?.('Найден: ' + text);
          onDetected(text);
          stop();
        }
        if (err && !(err instanceof NotFoundException)) {
          // ignore
        }
      });
    } catch (e) {
      const msg = String(e);
      onStatus?.('Ошибка: ' + msg);
      setError('Нет доступа к камере');
      setIsActive(false);
    }
  };

  const start = () => {
    setError(null);
    setIsActive(true);
  };

  // Callback ref — вызывается React когда video появляется в DOM
  const videoCallbackRef = (video: HTMLVideoElement | null) => {
    (videoRef as any).current = video;
    if (video) {
      // Небольшая задержка чтобы DOM успел отрендериться
      setTimeout(() => initReader(video), 100);
    }
  };

  return { videoRef, videoCallbackRef, isActive, error, start, stop };
}
