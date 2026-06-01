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

// ✅ Добавлен 40x30 — реальный размер XP-235B
type LabelSize = '40x30' | '40x25' | '50x30' | '58x40';

const SIZES: { id: LabelSize; label: string; mm: [number, number] }[] = [
  { id: '40x30', label: '40×30 мм', mm: [40, 30] },
  { id: '40x25', label: '40×25 мм', mm: [40, 25] },
  { id: '50x30', label: '50×30 мм', mm: [50, 30] },
  { id: '58x40', label: '58×40 мм', mm: [58, 40] },
];

const MM_TO_PX = 8;

function getDefaultFields(product: Product): LabelField[] {
  const brandName = (product.brand as any)?.name ?? '';
  return [
    { key: 'name',           label: 'Название',        enabled: true,  customText: undefined },
    { key: 'barcode',        label: 'Штрихкод',        enabled: !!product.barcode },
    { key: 'price_sale',     label: 'Цена продажи',    enabled: true  },
    { key: 'price_purchase', label: 'Цена закупки',    enabled: false },
    { key: 'sku',            label: 'Артикул',         enabled: !!product.sku },
    { key: 'brand',          label: 'Бренд',           enabled: !!brandName },
    { key: 'category',       label: 'Категория',       enabled: false },
    { key: 'custom',         label: 'Свой текст',      enabled: false, customText: '' },
  ];
}

function fieldValue(key: string, product: Product, customText?: string): string {
  const categoryName = (product.category as any)?.name ?? '';
  const brandName    = (product.brand as any)?.name ?? '';
  switch (key) {
    case 'name':           return product.name;
    case 'barcode':        return product.barcode ?? '';
    case 'price_sale':     return `₸${product.price.toLocaleString()}`;
    case 'price_purchase': return product.cost_price > 0 ? `₸${product.cost_price.toLocaleString()}` : '';
    case 'sku':            return product.sku ?? '';
    case 'brand':          return brandName;
    case 'category':       return categoryName;
    case 'custom':         return customText ?? '';
    default:               return '';
  }
}

export default function PrintLabelModal({ product, onClose }: Props) {
  const [fields,       setFields]       = useState<LabelField[]>(() => getDefaultFields(product));
  // ✅ Дефолт 40x30 — реальный размер
  const [size,         setSize]         = useState<LabelSize>('40x30');
  const [quantity,     setQuantity]     = useState(1);
  const [editingIp,    setEditingIp]    = useState(false);
  const [ipInput,      setIpInput]      = useState('');
  const [savingName,   setSavingName]   = useState('');
  const [showSaveInput,setShowSaveInput]= useState(false);

  const canvasRef        = useRef<HTMLCanvasElement>(null);
  const barcodeCanvasRef = useRef<HTMLCanvasElement>(null);

  const { printing, error, printLabel, getPrinterIp, savePrinterIp } = usePrinter();
  const { templates, loadTemplates, saveTemplate, deleteTemplate }    = useLabelTemplates();

  const currentSize = SIZES.find(s => s.id === size)!;
  const canvasW     = currentSize.mm[0] * MM_TO_PX;
  const canvasH     = currentSize.mm[1] * MM_TO_PX;

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // Swipe to close
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

  // Render preview
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

    const padding   = 6;
    const maxW      = canvasW - padding * 2;
    const showBarcode = fields.find(f => f.key === 'barcode')?.enabled && product.barcode;
    const nameField   = fields.find(f => f.key === 'name' && f.enabled);
    const otherFields = fields.filter(f => f.enabled && f.key !== 'barcode' && f.key !== 'name');

    const drawCentered = (text: string, y: number, font: string, color: string): number => {
      ctx.font         = font;
      ctx.fillStyle    = color;
      ctx.textBaseline = 'top';
      let t = text;
      while (ctx.measureText(t).width > maxW && t.length > 3) t = t.slice(0, -1);
      if (t !== text) t += '…';
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
      if (val) {
        drawCentered(val, y, `bold ${nameFontSize}px sans-serif`, '#111827');
        y += nameFontSize + 2 + gap;
      }
    }

    if (showBarcode && barcodeCanvasRef.current) {
      try {
        const barsH = Math.max(8, barcodeH - 12);
        JsBarcode(barcodeCanvasRef.current, product.barcode!, {
          format: 'CODE128', width: 1.2, height: barsH,
          displayValue: true, fontSize: 7, margin: 2,
          background: '#ffffff', lineColor: '#000000',
        });
        const srcW  = barcodeCanvasRef.current.width;
        const srcH  = barcodeCanvasRef.current.height;
        const scale = Math.min(1, maxW / srcW);
        const dw    = srcW * scale;
        const dh    = srcH * scale;
        ctx.drawImage(barcodeCanvasRef.current, (canvasW - dw) / 2, y, dw, dh);
        y += dh + gap;
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
    setFields(tpl.fields);
    setSize(tpl.size);
  }
  async function handleSaveTemplate() {
    if (!savingName.trim()) return;
    await saveTemplate(savingName.trim(), fields, size);
    setSavingName('');
    setShowSaveInput(false);
  }

  async function handlePrint() {
    const activeFields = fields.filter(f => f.enabled).map(f => ({
      key: f.key, label: f.label, value: fieldValue(f.key, product, f.customText),
    }));
    await printLabel({ name: product.name, barcode: product.barcode, price: product.price, fields: activeFields, size, quantity });
  }

  // ✅ ИСПРАВЛЕНО: iframe вместо window.open — Chrome больше не зависает
    function handleUsbPrint() {
    const canvas = document.getElementById('print-label-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const [mmW, mmH] = currentSize.mm;
    // toBlob — асинхронный, не блокирует поток
    canvas.toBlob((blob) => {
      if (!blob) return;
      const blobUrl = URL.createObjectURL(blob);
      const labels = Array(quantity)
        .fill(`<img src="${blobUrl}" style="width:${mmW}mm;height:${mmH}mm;display:block;page-break-after:always;">`)
        .join('');
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:none;opacity:0;';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument!;
      doc.open();
      doc.write(`<!DOCTYPE html>
<html>
<head>
<style>
  @page { size: ${mmW}mm ${mmH}mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${mmW}mm; background: white; }
  img:last-child { page-break-after: avoid; }
</style>
</head>
<body>${labels}</body>
</html>`);
    doc.close();

    // Ждём загрузки изображения в iframe, потом печатаем
          setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (document.body.contains(iframe)) document.body.removeChild(iframe);
          URL.revokeObjectURL(blobUrl);
        }, 2000);
      }, 500);
    }, 'image/png');
  }

  async function handleAndroidPrint() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'label.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Этикетка' }); } catch { /* cancelled */ }
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

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Printer size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">Печать этикетки</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Шаблон */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Шаблон</label>
            <div className="flex gap-2">
              <select
                onChange={e => applyTemplate(e.target.value)}
                defaultValue="__default__"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="__default__">Стандарт</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setShowSaveInput(v => !v)}
                className="flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                title="Сохранить шаблон"
              >
                <Save size={14} />
              </button>
            </div>
            {showSaveInput && (
              <div className="flex gap-2 mt-2">
                <input
                  value={savingName}
                  onChange={e => setSavingName(e.target.value)}
                  placeholder="Название шаблона"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={!savingName.trim()}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  Сохранить
                </button>
              </div>
            )}
            {templates.length > 0 && (
              <div className="mt-2 space-y-1">
                {templates.map(t => (
                  <div key={t.id} className="flex items-center justify-between text-xs text-gray-500 px-1">
                    <span>{t.name} · {t.size} мм</span>
                    <button onClick={() => deleteTemplate(t.id)} className="text-red-400 hover:text-red-600">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Поля */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Поля этикетки</label>
            <div className="space-y-2">
              {fields.map(f => (
                <div key={f.key}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={f.enabled}
                      onChange={() => toggleField(f.key)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 flex-1">{f.label}</span>
                    {f.key !== 'custom' && (
                      <span className="text-xs text-gray-400 truncate max-w-[120px]">
                        {fieldValue(f.key, product) || '—'}
                      </span>
                    )}
                  </label>
                  {f.key === 'custom' && f.enabled && (
                    <input
                      value={f.customText ?? ''}
                      onChange={e => setCustomText('custom', e.target.value)}
                      placeholder="Введите текст..."
                      className="mt-1 ml-7 w-[calc(100%-1.75rem)] border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Размер */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Размер этикетки</label>
            <div className="grid grid-cols-2 gap-2">
              {SIZES.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSize(s.id)}
                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                    size === s.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {s.label}
                  {s.id === '40x30' && <span className="ml-1 text-xs opacity-70">(XP-235B)</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Предпросмотр */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Предпросмотр</label>
            <div className="flex justify-center bg-gray-50 rounded-xl p-4">
              <canvas
                id="print-label-canvas"
                ref={canvasRef}
                width={canvasW}
                height={canvasH}
                className="shadow-sm rounded"
                style={{ imageRendering: 'pixelated', maxWidth: '100%' }}
              />
              <canvas ref={barcodeCanvasRef} style={{ display: 'none' }} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 space-y-3">

          {/* Количество + IP */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">Копий:</span>
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); setQuantity(q => Math.max(1, q - 1)); }}
                  className="px-3 py-1.5 bg-gray-50 text-gray-600 hover:bg-gray-100 font-medium border-r border-gray-200"
                >−</button>
                <span className="px-4 py-1.5 text-sm font-medium text-gray-900">{quantity}</span>
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); setQuantity(q => Math.min(10, q + 1)); }}
                  className="px-3 py-1.5 bg-gray-50 text-gray-600 hover:bg-gray-100 font-medium border-l border-gray-200"
                >+</button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              {editingIp ? (
                <input
                  value={ipInput}
                  onChange={e => setIpInput(e.target.value)}
                  onBlur={() => { savePrinterIp(ipInput); setEditingIp(false); }}
                  onKeyDown={e => { if (e.key === 'Enter') { savePrinterIp(ipInput); setEditingIp(false); } }}
                  autoFocus
                  className="w-32 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
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

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Кнопки */}
          {(() => {
            const ip          = getPrinterIp();
            const isIOS       = /iPad|iPhone|iPod/.test(navigator.userAgent);
            const isAndroid   = /Android/.test(navigator.userAgent);
            const isMobile    = isIOS || isAndroid;
            const hasWifi     = ip && ip !== '192.168.1.100';

            return (
              <div className="space-y-2">
                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Отмена
                  </button>

                  {hasWifi ? (
                    <button
                      onClick={handlePrint}
                      disabled={printing}
                      className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {printing ? (
                        <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Печатаем...
                        </>
                      ) : (
                        <><Wifi size={16} />Печать (WiFi){quantity > 1 ? ` ×${quantity}` : ''}</>
                      )}
                    </button>
                  ) : !isMobile ? (
                    // ✅ Desktop USB — теперь через iframe, Chrome не зависает
                    <button
                      onClick={handleUsbPrint}
                      className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
                    >
                      <Printer size={16} />
                      Печать (USB){quantity > 1 ? ` ×${quantity}` : ''}
                    </button>
                  ) : null}
                </div>

                {isAndroid && (
                  <button
                    onClick={handleAndroidPrint}
                    className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 bg-white hover:bg-green-50 transition-colors"
                    style={{ border: '1.5px solid #3ddc84', color: '#1a7a3e' }}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="#3ddc84">
                      <path d="M17.523 15.34a1 1 0 1 1-2 0 1 1 0 0 1 2 0m-11.046 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0M17.7 9H6.3C5.03 9 4 10.03 4 11.3v5.4C4 17.97 5.03 19 6.3 19h.7v2.5a1.5 1.5 0 0 0 3 0V19h4v2.5a1.5 1.5 0 0 0 3 0V19h.7c1.27 0 2.3-1.03 2.3-2.3V11.3C20 10.03 18.97 9 17.7 9M7.5 6.5a.5.5 0 0 1-.5-.5c0-2.76 2.24-5 5-5s5 2.24 5 5a.5.5 0 0 1-1 0c0-2.21-1.79-4-4-4S8.5 4.29 8.5 6.5a.5.5 0 0 1-.5.5m-2.06-1.94 1.5-2.6a.5.5 0 0 1 .87.5l-1.5 2.6a.5.5 0 0 1-.87-.5m10.5-2.6 1.5 2.6a.5.5 0 0 1-.87.5l-1.5-2.6a.5.5 0 0 1 .87-.5"/>
                    </svg>
                    Печать (Android)
                  </button>
                )}

                <p className="text-center text-xs text-gray-400">
                  {hasWifi
                    ? `WiFi принтер: ${ip}`
                    : isIOS
                    ? 'Для iPhone нужен WiFi принтер — введите IP выше'
                    : 'Откроется диалог печати → выберите Xprinter XP-235B'}
                </p>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}