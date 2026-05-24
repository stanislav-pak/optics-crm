import { useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';

export function useBarcodeScanner(onDetected: (barcode: string) => void, onStatus?: (s: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    setIsActive(true);
  };

  const stop = () => {
    try { BrowserMultiFormatReader.releaseAllStreams(); } catch {}
    // Останавливаем треки вручную для iOS Safari
    try {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach(t => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    } catch {}
    readerRef.current = null;
    setIsActive(false);
  };

  const initReader = async (video: HTMLVideoElement) => {
    try {
      console.log('initReader called', video);
      onStatus?.('Запрос камеры...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      console.log('stream получен', stream);
      onStatus?.('Камера получена');
      video.srcObject = stream;
      await video.play();
      console.log('video играет');
      onStatus?.('Видео запущено');

      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      console.log('reader создан, запускаем decodeFromVideoDevice');
      onStatus?.('Сканирование...');
      await reader.decodeFromVideoDevice(undefined, video, (result, err) => {
        if (result) {
          console.log('штрихкод найден:', result.getText());
          onStatus?.('Найден: ' + result.getText());
          onDetected(result.getText());
          stop();
        }
        if (err && !(err instanceof NotFoundException)) {
          // ignore decode errors during scanning
        }
      });
    } catch (e) {
      console.error('ошибка сканера:', e);
      onStatus?.('Ошибка: ' + String(e));
      setError('Нет доступа к камере: ' + String(e));
      setIsActive(false);
    }
  };

  const videoCallbackRef = (video: HTMLVideoElement | null) => {
    (videoRef as any).current = video;
    if (video && isActive) {
      setTimeout(() => initReader(video), 200);
    }
  };

  return { videoRef, videoCallbackRef, isActive, error, start, stop };
}
