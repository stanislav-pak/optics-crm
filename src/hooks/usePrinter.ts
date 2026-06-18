import { useState } from 'react';

const STORAGE_KEY = 'printer_ip';
const DEFAULT_IP = '127.0.0.1';

export interface PrintLabelData {
  name: string;
  barcode?: string;
  price?: number;
  price_label?: string;
  fields: { key: string; label: string; value: string }[];
  size: '45x10' | '40x25' | '50x30' | '58x40';
  quantity: number;
  image?: string;
}

export function usePrinter() {
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function getPrinterIp(): string {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_IP;
  }

  function savePrinterIp(ip: string) {
    localStorage.setItem(STORAGE_KEY, ip.trim());
  }

  async function printLabel(data: PrintLabelData): Promise<boolean> {
    setPrinting(true);
    setError(null);
    try {
      const ip = getPrinterIp();
      const res = await fetch(`http://${ip}:5000/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`Принтер вернул ошибку ${res.status}: ${text}`);
      }
      return true;
    } catch (e: any) {
      setError(e?.message ?? 'Ошибка печати');
      return false;
    } finally {
      setPrinting(false);
    }
  }

  return { printing, error, printLabel, savePrinterIp, getPrinterIp };
}
