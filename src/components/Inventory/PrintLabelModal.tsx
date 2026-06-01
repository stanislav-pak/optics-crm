import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Pencil, Printer, Save, Trash2, Wifi } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import type { Product } from '../../types';
import { usePrinter } from '../../hooks/usePrinter';
import { useLabelTemplates } from '../../hooks/useLabelTemplates';
import type { LabelField } from '../../hooks/useLabelTemplates';

interface Props {
  product: Product;
  onClose: () => void;
}

type LabelSize = '40x30' | '40x25' | '50x30' | '58x40';

const SIZES: { id: LabelSize; label: string; mm: [number, number] }[] = [
  { id: '40x30', label: '40Г—30 РјРј', mm: [40, 30] },
  { id: '40x25', label: '40Г—25 РјРј', mm: [40, 25] },
  { id: '50x30', label: '50Г—30 РјРј', mm: [50, 30] },
  { id: '58x40', label: '58Г—40 РјРј', mm: [58, 40] },
];

const MM_TO_PX = 8;

function getDefaultFields(product: Product): LabelField[] {
  const brandName = (product.brand as any)?.name ?? '';
  return [
    { key: 'name',           label: 'РќР°Р·РІР°РЅРёРµ',        enabled: true,  customText: undefined },
    { key: 'barcode',        label: 'РЁС‚СЂРёС…РєРѕРґ',        enabled: !!product.barcode },
    { key: 'price_sale',     label: 'Р¦РµРЅР° РїСЂРѕРґР°Р¶Рё',    enabled: true  },
    { key: 'price_purchase', label: 'Р¦РµРЅР° Р·Р°РєСѓРїРєРё',    enabled: false },
    { key: 'sku',            label: 'РђСЂС‚РёРєСѓР»',         enabled: !!product.sku },
    { key: 'brand',          label: 'Р‘СЂРµРЅРґ',           enabled: !!brandName },
    { key: 'category',       label: 'РљР°С‚РµРіРѕСЂРёСЏ',       enabled: false },
    { key: 'custom',         label: 'РЎРІРѕР№ С‚РµРєСЃС‚',      enabled: false, customText: '' },
  ];
}

function fieldValue(key: string, product: Product, customText?: string): string {
  const categoryName = (product.category as any)?.name ?? '';
  const brandName    = (product.brand as any)?.name ?? '';
  switch (key) {
    case 'name':           return product.name;
    case 'barcode':        return product.barcode ?? '';
    case 'price_sale':     return `\u20B8${product.price.toLocaleString()}`;
    case 'price_purchase': return product.cost_price > 0 ? `\u20B8${product.cost_price.toLocaleString()}` : '';
    case 'sku':            return product.sku ?? '';
    case 'brand':          return brandName;
    case 'category':       return categoryName;
    case 'custom':         return customText ?? '';
    default:               return '';
  }
}

export default function PrintLabelModal({ product, onClose }: Props) {
  const [fields,        setFields]        = useState<LabelField[]>(() => getDefaultFields(product));
  const [size,          setSize]          = useState<LabelSize>('40x30');
  const [quantity,      setQuantity]      = useState(1);
  const [editingIp,     setEditingIp]     = useState(false);
  const [ipInput,       setIpInput]       = useState('');
  const [savingName,    setSavingName]    = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const canvasRef        = useRef<HTMLCanvasElement>(null);
  const barcodeCanvasRef = useRef<HTMLCanvasElement>(null);

  const { printing, error, printLabel, getPrinterIp, savePrinterIp } = usePrinter();
  const { templates, loadTemplates, saveTemplate, deleteTemplate }    = useLabelTemplates();

  const currentSize = SIZES.find(s => s.id === size)!;
  const canvasW     = currentSize.mm[0] * MM_TO_PX;
  const canvasH     = currentSize.mm[1] * MM_TO_PX;

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  useEffect(() => {
    const start = { x: 0, y: 0 };
    const onStart = (e: TouchEvent) => { start.x = e.touches[0].clientX; start.y = e.touches[0].clientY; };
    const onEnd   = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = Math.abs(e.changedTouches[0].clientY - start.y);
      if (dx > 60 && dy < 80) onClose();
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend',   onEnd,   { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend',   onEnd);
    };
  }, []);

  const renderPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width  = canvasW;
    canvas.height = canvasH;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth   = 1;
    ctx.strokeRect(0.5, 0.5, canvasW - 1, canvasH - 1);

    const padding     = 6;
    const maxW        = canvasW - padding * 2;
    const showBarcode = fields.find(f => f.key === 'barcode')?.enabled && product.barcode;
    const nameField   = fields.find(f => f.key === 'name' && f.enabled);
    const otherFields = fields.filter(f => f.enabled && f.key !== 'barcode' && f.key !== 'name');

    const drawCentered = (text: string, y: number, font: string, color: string) => {
      ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'top';
      let t = text;
      while (ctx.measureText(t).width > maxW && t.length > 3) t = t.slice(0, -1);
      if (t !== text) t += '\u2026';
      ctx.fillText(t, (canvasW - ctx.measureText(t).width) / 2, y);
      return parseInt(font);
    };

    const nameFontSize  = Math.min(10, Math.max(7, canvasH * 0.13));
    const otherFontSize = Math.min(8,  Math.max(6, canvasH * 0.10));
    const barcodeH      = showBarcode ? Math.min(30, canvasH * 0.40) : 0;
    const nameH         = nameField ? nameFontSize + 2 : 0;
    const otherH        = otherFields.reduce((acc, f) => {
      const val = fieldValue(f.key, product, f.customText);
      return val ? acc + otherFontSize + 2 : acc;
    }, 0);
    const totalContentH = nameH + barcodeH + otherH;
    const freeSpace     = canvasH - padding * 2 - totalContentH;
    const gapCount      = (nameH ? 1 : 0) + (barcodeH ? 1 : 0);
    const gap           = gapCount > 0 ? Math.max(3, freeSpace / (gapCount + 1)) : 0;

    let y = padding + (gapCount > 0 ? gap : freeSpace / 2);

    if (nameField) {
      const val = fieldValue('name', product, nameField.customText);
      if (val) { drawCentered(val, y, `bold ${nameFontSize}px sans-serif`, '#111827'); y += nameFontSize + 2 + gap; }
    }
    if (showBarcode && barcodeCanvasRef.current) {
      try {
        JsBarcode(barcodeCanvasRef.current, product.barcode!, {
          format: 'CODE128', width: 1.2, height: Math.max(8, barcodeH - 12),
          displayValue: true, fontSize: 7, margin: 2, background: '#ffffff', lineColor: '#000000',
        });
        const srcW = barcodeCanvasRef.current.width, srcH = barcodeCanvasRef.current.height;
        const scale = Math.min(1, maxW / srcW);
        ctx.drawImage(barcodeCanvasRef.current, (canvasW - srcW * scale) / 2, y, srcW * scale, srcH * scale);
        y += srcH * scale + gap;
      } catch { /* invalid barcode */ }
    }
    for (const field of otherFields) {
      const val = fieldValue(field.key, product, field.customText);
      if (!val) continue;
      const isPrice = field.key === 'price_sale' || field.key === 'price_purchase';
      drawCentered(val, y, `${isPrice ? 'bold ' : ''}${otherFontSize}px sans-serif`, isPrice ? '#1d4ed8' : '#374151');
      y += otherFontSize + 2;
    }
  }, [fields, size, product, canvasW, canvasH]);

  useEffect(() => { renderPreview(); }, [renderPreview]);

  function toggleField(key: string) {
    setFields(prev => prev.map(f => f.key === key ? { ...f, enabled: !f.enabled } : f));
  }
  function setCustomText(key: string, text: string) {
    setFields(prev => prev.map(f => f.key === key ? { ...f, customText: text } : f));
  }
  function applyTemplate(id: string) {
    if (id === '__default__') { setFields(getDefaultFields(product)); return; }
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;
    setFields(tpl.fields); setSize(tpl.size as LabelSize);
  }
  async function handleSaveTemplate() {
    if (!savingName.trim()) return;
    await saveTemplate(savingName.trim(), fields, size);
    setSavingName(''); setShowSaveInput(false);
  }

  async function handleWifiPrint() {
    const activeFields = fields.filter(f => f.enabled).map(f => ({
      key: f.key, label: f.label, value: fieldValue(f.key, product, f.customText),
    }));
    await printLabel({ name: product.name, barcode: product.barcode, price: product.price, fields: activeFields, size, quantity });
  }

  function handleUsbPrint() {
    const [mmW, mmH] = currentSize.mm;
    // Рендерим в 4x разрешении для чёткой печати (32px/mm = ~812 DPI)
    const SCALE = 4;
    const pxPerMm = MM_TO_PX * SCALE;
    const pW = mmW * pxPerMm;
    const pH = mmH * pxPerMm;

    const printCanvas = document.createElement('canvas');
    printCanvas.width = pW;
    printCanvas.height = pH;
    const ctx = printCanvas.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pW, pH);

    const padding = 6 * SCALE;
    const maxW = pW - padding * 2;
    const showBarcode = fields.find(f => f.key === 'barcode')?.enabled && product.barcode;
    const nameField = fields.find(f => f.key === 'name' && f.enabled);
    const otherFields = fields.filter(f => f.enabled && f.key !== 'barcode' && f.key !== 'name');

    const nameFontSize  = Math.min(10, Math.max(7, pH * 0.13)) * SCALE;
    const otherFontSize = Math.min(8,  Math.max(6, pH * 0.10)) * SCALE;
    const barcodeH      = showBarcode ? Math.min(30, pH * 0.40) : 0;
    const nameH         = nameField ? nameFontSize + 2 * SCALE : 0;
    const otherH        = otherFields.reduce((acc, f) => {
      const val = fieldValue(f.key, product, f.customText);
      return val ? acc + otherFontSize + 2 * SCALE : acc;
    }, 0);
    const gapCount  = (nameH ? 1 : 0) + (barcodeH ? 1 : 0);
    const freeSpace = pH - padding * 2 - nameH - barcodeH - otherH;
    const gap       = gapCount > 0 ? Math.max(3 * SCALE, freeSpace / (gapCount + 1)) : 0;

    const drawCentered = (text: string, y: number, font: string, color: string) => {
      ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'top';
      let t = text;
      while (ctx.measureText(t).width > maxW && t.length > 3) t = t.slice(0, -1);
      if (t !== text) t += '…';
      ctx.fillText(t, (pW - ctx.measureText(t).width) / 2, y);
    };

    let y = padding + (gapCount > 0 ? gap : freeSpace / 2);

    if (nameField) {
      const val = fieldValue('name', product, nameField.customText);
      if (val) {
        drawCentered(val, y, `bold ${nameFontSize}px sans-serif`, '#111827');
        y += nameFontSize + 2 * SCALE + gap;
      }
    }

    const barcodeDrawPromise = new Promise<void>((resolve) => {
      if (!showBarcode || !product.barcode) { resolve(); return; }
      try {
        const bc = document.createElement('canvas');
        const barsH = Math.max(8 * SCALE, barcodeH - 12 * SCALE);
        JsBarcode(bc, product.barcode, {
          format: 'CODE128', width: 1.2 * SCALE, height: barsH,
          displayValue: true, fontSize: 7 * SCALE, margin: 2 * SCALE,
          background: '#ffffff', lineColor: '#000000',
        });
        const scale = Math.min(1, maxW / bc.width);
        ctx.drawImage(bc, (pW - bc.width * scale) / 2, y, bc.width * scale, bc.height * scale);
        y += bc.height * scale + gap;
      } catch { /* invalid barcode */ }
      resolve();
    });

    barcodeDrawPromise.then(() => {
      for (const field of otherFields) {
        const val = fieldValue(field.key, product, field.customText);
        if (!val) continue;
        const isPrice = field.key === 'price_sale' || field.key === 'price_purchase';
        drawCentered(val, y, `${isPrice ? 'bold ' : ''}${otherFontSize}px sans-serif`, isPrice ? '#1d4ed8' : '#374151');
        y += otherFontSize + 2 * SCALE;
      }

      printCanvas.toBlob((blob) => {
        if (!blob) return;
        blob.arrayBuffer().then((buf) => {
          // Вшиваем DPI в PNG (pxPerMm * 1000 / 25.4 = dots per inch, convert to per meter)
          const dpi = Math.round(pxPerMm * 25.4);
          const dpm = Math.round(dpi * 39.3701);
          const type = new Uint8Array([112, 72, 89, 115]);
          const data = new Uint8Array(9);
          const dv = new DataView(data.buffer);
          dv.setUint32(0, dpm); dv.setUint32(4, dpm); data[8] = 1;
          const forCRC = new Uint8Array(13);
          forCRC.set(type); forCRC.set(data, 4);
          const tbl = new Uint32Array(256);
          for (let i = 0; i < 256; i++) {
            let c = i;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            tbl[i] = c;
          }
          let crc = 0xffffffff;
          for (const b of forCRC) crc = (tbl[(crc ^ b) & 0xff] ^ (crc >>> 8));
          crc = ((crc ^ 0xffffffff) >>> 0);
          const chunk = new Uint8Array(21);
          const cv = new DataView(chunk.buffer);
          cv.setUint32(0, 9); chunk.set(type, 4); chunk.set(data, 8); cv.setUint32(17, crc);
          const png = new Uint8Array(buf);
          const result = new Uint8Array(png.length + chunk.length);
          const pos = 33;
          result.set(png.slice(0, pos)); result.set(chunk, pos); result.set(png.slice(pos), pos + chunk.length);
          const out = new Blob([result], { type: 'image/png' });
          const url = URL.createObjectURL(out);
          const a = document.createElement('a');
          a.href = url;
          a.download = `label_${mmW}x${mmH}mm.png`;
          a.click();
          URL.revokeObjectURL(url);
        });
      }, 'image/png');
    });
  }




  async function handleAndroidPrint() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'label.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Р­С‚РёРєРµС‚РєР°' }); } catch { /* cancelled */ }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'label.png'; a.click();
        URL.revokeObjectURL(url);
      }
    }, 'image/png');
  }

  const printerIp = getPrinterIp();

  return (
    <div data-modal="true" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Printer size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">РџРµС‡Р°С‚СЊ СЌС‚РёРєРµС‚РєРё</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">РЁР°Р±Р»РѕРЅ</label>
            <div className="flex gap-2">
              <select onChange={e => applyTemplate(e.target.value)} defaultValue="__default__"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="__default__">РЎС‚Р°РЅРґР°СЂС‚</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button type="button" onClick={() => setShowSaveInput(v => !v)}
                className="flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                <Save size={14} />
              </button>
            </div>
            {showSaveInput && (
              <div className="flex gap-2 mt-2">
                <input value={savingName} onChange={e => setSavingName(e.target.value)} placeholder="РќР°Р·РІР°РЅРёРµ С€Р°Р±Р»РѕРЅР°"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button type="button" onClick={handleSaveTemplate} disabled={!savingName.trim()}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                  РЎРѕС…СЂР°РЅРёС‚СЊ
                </button>
              </div>
            )}
            {templates.length > 0 && (
              <div className="mt-2 space-y-1">
                {templates.map(t => (
                  <div key={t.id} className="flex items-center justify-between text-xs text-gray-500 px-1">
                    <span>{t.name} В· {t.size} РјРј</span>
                    <button onClick={() => deleteTemplate(t.id)} className="text-red-400 hover:text-red-600">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">РџРѕР»СЏ СЌС‚РёРєРµС‚РєРё</label>
            <div className="space-y-2">
              {fields.map(f => (
                <div key={f.key}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={f.enabled} onChange={() => toggleField(f.key)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm text-gray-700 flex-1">{f.label}</span>
                    {f.key !== 'custom' && (
                      <span className="text-xs text-gray-400 truncate max-w-[120px]">
                        {fieldValue(f.key, product) || 'вЂ”'}
                      </span>
                    )}
                  </label>
                  {f.key === 'custom' && f.enabled && (
                    <input value={f.customText ?? ''} onChange={e => setCustomText('custom', e.target.value)}
                      placeholder="Р’РІРµРґРёС‚Рµ С‚РµРєСЃС‚..."
                      className="mt-1 ml-7 w-[calc(100%-1.75rem)] border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Р Р°Р·РјРµСЂ СЌС‚РёРєРµС‚РєРё</label>
            <div className="grid grid-cols-2 gap-2">
              {SIZES.map(s => (
                <button key={s.id} type="button" onClick={() => setSize(s.id)}
                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                    size === s.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}>
                  {s.label}{s.id === '40x30' ? ' (XP-235B)' : ''}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">РџСЂРµРґРїСЂРѕСЃРјРѕС‚СЂ</label>
            <div className="flex justify-center bg-gray-50 rounded-xl p-4">
              <canvas id="print-label-canvas" ref={canvasRef} width={canvasW} height={canvasH}
                className="shadow-sm rounded" style={{ imageRendering: 'pixelated', maxWidth: '100%' }} />
              <canvas ref={barcodeCanvasRef} style={{ display: 'none' }} />
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">РљРѕРїРёР№:</span>
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button type="button" onMouseDown={e => { e.preventDefault(); setQuantity(q => Math.max(1, q - 1)); }}
                  className="px-3 py-1.5 bg-gray-50 text-gray-600 hover:bg-gray-100 font-medium border-r border-gray-200">в€’</button>
                <span className="px-4 py-1.5 text-sm font-medium text-gray-900">{quantity}</span>
                <button type="button" onMouseDown={e => { e.preventDefault(); setQuantity(q => Math.min(10, q + 1)); }}
                  className="px-3 py-1.5 bg-gray-50 text-gray-600 hover:bg-gray-100 font-medium border-l border-gray-200">+</button>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              {editingIp ? (
                <input value={ipInput} onChange={e => setIpInput(e.target.value)}
                  onBlur={() => { savePrinterIp(ipInput); setEditingIp(false); }}
                  onKeyDown={e => { if (e.key === 'Enter') { savePrinterIp(ipInput); setEditingIp(false); } }}
                  autoFocus className="w-32 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
              ) : (
                <>
                  <span>IP: {printerIp}</span>
                  <button type="button" onClick={() => { setIpInput(printerIp); setEditingIp(true); }} className="text-gray-400 hover:text-gray-600">
                    <Pencil size={11} />
                  </button>
                </>
              )}
            </div>
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

          {(() => {
            const ip        = getPrinterIp();
            const isIOS     = /iPad|iPhone|iPod/.test(navigator.userAgent);
            const isAndroid = /Android/.test(navigator.userAgent);
            const isMobile  = isIOS || isAndroid;
            const hasWifi   = ip && ip !== '192.168.1.100';
            return (
              <div className="space-y-2">
                <div className="flex gap-3">
                  <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                    РћС‚РјРµРЅР°
                  </button>
                  {hasWifi ? (
                    <button onClick={handleWifiPrint} disabled={printing}
                      className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                      {printing ? (
                        <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>РџРµС‡Р°С‚Р°РµРј...</>
                      ) : (
                        <><Wifi size={16} />WiFi{quantity > 1 ? ` x${quantity}` : ''}</>
                      )}
                    </button>
                  ) : !isMobile ? (
                    <button onClick={handleUsbPrint}
                      className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2">
                      <Printer size={16} />
                      РЎРєР°С‡Р°С‚СЊ PNG{quantity > 1 ? ` x${quantity}` : ''}
                    </button>
                  ) : null}
                </div>
                {isAndroid && (
                  <button onClick={handleAndroidPrint}
                    className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 bg-white hover:bg-green-50 transition-colors"
                    style={{ border: '1.5px solid #3ddc84', color: '#1a7a3e' }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="#3ddc84">
                      <path d="M17.523 15.34a1 1 0 1 1-2 0 1 1 0 0 1 2 0m-11.046 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0M17.7 9H6.3C5.03 9 4 10.03 4 11.3v5.4C4 17.97 5.03 19 6.3 19h.7v2.5a1.5 1.5 0 0 0 3 0V19h4v2.5a1.5 1.5 0 0 0 3 0V19h.7c1.27 0 2.3-1.03 2.3-2.3V11.3C20 10.03 18.97 9 17.7 9M7.5 6.5a.5.5 0 0 1-.5-.5c0-2.76 2.24-5 5-5s5 2.24 5 5a.5.5 0 0 1-1 0c0-2.21-1.79-4-4-4S8.5 4.29 8.5 6.5a.5.5 0 0 1-.5.5m-2.06-1.94 1.5-2.6a.5.5 0 0 1 .87.5l-1.5 2.6a.5.5 0 0 1-.87-.5m10.5-2.6 1.5 2.6a.5.5 0 0 1-.87.5l-1.5-2.6a.5.5 0 0 1 .87-.5"/>
                    </svg>
                    РџРµС‡Р°С‚СЊ (Android)
                  </button>
                )}
                <p className="text-center text-xs text-gray-400">
                  {hasWifi ? `WiFi: ${ip}` : isIOS ? 'Р”Р»СЏ iPhone РЅСѓР¶РµРЅ WiFi РїСЂРёРЅС‚РµСЂ' : 'РЎРєР°С‡Р°РµС‚СЃСЏ PNG в†’ РџРљРњ в†’ РќР°РїРµС‡Р°С‚Р°С‚СЊ в†’ XP-235B в†’ Р¤Р°РєС‚РёС‡РµСЃРєРёР№ СЂР°Р·РјРµСЂ'}
                </p>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
