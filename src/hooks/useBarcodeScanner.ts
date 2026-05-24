import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';

export function useBarcodeScanner(onDetected: (barcode: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    setIsActive(true);
  };

  const stop = () => {
    if (readerRef.current) {
      BrowserMultiFormatReader.releaseAllStreams();
    }
    setIsActive(false);
  };

  useEffect(() => {
    if (!isActive || !videoRef.current) return;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    reader.decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
      if (result) {
        onDetected(result.getText());
        stop();
      }
      if (err && !(err instanceof NotFoundException)) {
        console.error(err);
      }
    }).catch(() => {
      setError('Нет доступа к камере');
      setIsActive(false);
    });
    return () => {
      BrowserMultiFormatReader.releaseAllStreams();
    };
  }, [isActive]);

  return { videoRef, isActive, error, start, stop };
}
