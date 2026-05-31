import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Pencil, Printer, Save, Trash2 } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import type { Product } from '../../types';
import { usePrinter } from '../../hooks/usePrinter';
import { useLabelTemplates } from '../../hooks/useLabelTemplates';
import type { LabelField } from '../../hooks/useLabelTemplates';

interface Props {
  product: Product;
  onClose: () => void;
}

type LabelSize = '40x25' | '50x30' | '58x40';

const SIZES: { id: LabelSize; label: string; mm: [number, number] }[] = [
  { id: '40x25', label: '40×25 мм', mm: [40, 25] },
  { id: '50x30', label: '50×30 мм', mm: [50, 30] },
  { id: '58x40', label: '58×40 мм', mm: [58, 40] },
];

// px at 8px/mm for preview canvas
const MM_TO_PX = 8;

function getDefaultFields(product: Product): LabelField[] {
  const categoryName = (product.category as any)?.name ?? '';
  const brandName = (product.brand as any)?.name ?? '';
  return [
    { key: 'name',          label: 'Название',        enabled: true,  customText: undefined },
    { key: 'barcode',       label: 'Штрихкод',        enabled: !!product.barcode },
    { key: 'price_sale',    label: 'Цена продажи',    enabled: true  },
    { key: 'price_purchase',label: 'Цена закупки',    enabled: false },
    { key: 'sku',           label: 'Артикул',         enabled: !!product.sku },
    { key: 'brand',         label: 'Бренд',           enabled: !!brandName },
    { key: 'category',      label: 'Категория',       enabled: false },
    { key: 'custom',        label: 'Свой текст',      enabled: false, customText: '' },
  ];
}

function fieldValue(key: string, product: Product, customText?: string): string {
  const categoryName = (product.category as any)?.name ?? '';
  const brandName = (product.brand as any)?.name ?? '';
  switch (key) {
    case 'name':          return product.name;
    case 'barcode':       return product.barcode ?? '';
    case 'price_sale':    return `₸${product.price.toLocaleString()}`;
    case 'price_purchase':return product.cost_price > 0 ? `₸${product.cost_price.toLocaleString()}` : '';
    case 'sku':           return product.sku ?? '';
    case 'brand':         return brandName;
    case 'category':      return categoryName;
    case 'custom':        return customText ?? '';
    default:              return '';
  }
}

export default function PrintLabelModal({ product, onClose }: Props) {
  const [fields, setFields] = useState<LabelField[]>(() => getDefaultFields(product));
  const [size, setSize] = useState<LabelSize>('58x40');
  const [quantity, setQuantity] = useState(1);
  const [editingIp, setEditingIp] = useState(false);
  const [ipInput, setIpInput] = useState('');
  const [savingName, setSavingName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barcodeCanvasRef = useRef<HTMLCanvasElement>(null);

  const { printing, error, printLabel, getPrinterIp, savePrinterIp } = usePrinter();
  const { templates, loadTemplates, saveTemplate, deleteTemplate } = useLabelTemplates();

  const currentSize = SIZES.find(s => s.id === size)!;
  const canvasW = currentSize.mm[0] * MM_TO_PX;
  const canvasH = currentSize.mm[1] * MM_TO_PX;

  // Load templates on mount
  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // Swipe to close
  useEffect(() => {
    const start = { x: 0, y: 0 };
    const onStart = (e: TouchEvent) => { start.x = e.touches[0].clientX; start.y = e.touches[0].clientY; };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = Math.abs(e.changedTouches[0].clientY - start.y);
      if (dx > 60 && dy < 80) onClose();
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, []);

  // Render preview
  const renderPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvasW;
    canvas.height = canvasH;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Border
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, canvasW - 1, canvasH - 1);

    const padding = 6;
    let y = padding;
    const enabledFields = fields.filter(f => f.enabled && f.key !== 'barcode');
    const showBarcode = fields.find(f => f.key === 'barcode')?.enabled && product.barcode;

    // Barcode height
    const barcodeH = showBarcode ? Math.min(28, canvasH * 0.38) : 0;
    const textAreaH = canvasH - barcodeH - padding * 2;
    const lineH = enabledFields.length > 0 ? Math.min(14, textAreaH / enabledFields.length) : 14;

    // Draw text fields
    for (const field of enabledFields) {
      const val = fieldValue(field.key, product, field.customText);
      if (!val) continue;

      const isName = field.key === 'name';
      const isPrice = field.key === 'price_sale' || field.key === 'price_purchase';

      ctx.font = `${isName ? 'bold ' : ''}${isPrice ? 'bold ' : ''}${Math.max(7, lineH - 2)}px sans-serif`;
      ctx.fillStyle = isPrice ? '#1d4ed8' : '#111827';
      ctx.textBaseline = 'top';

      // Truncate if too wide
      let text = val;
      const maxW = canvasW - padding * 2;
      while (ctx.measureText(text).width > maxW && text.length > 3) {
        text = text.slice(0, -1);
      }
      if (text !== val) text += '…';

      ctx.fillText(text, padding, y);
      y += lineH;
    }

    // Draw barcode
    if (showBarcode && barcodeCanvasRef.current) {
      try {
        JsBarcode(barcodeCanvasRef.current, product.barcode!, {
          format: 'CODE128',
          width: 1.2,
          height: barcodeH - 12,
          displayValue: true,
          fontSize: 7,
          margin: 2,
          background: '#ffffff',
          lineColor: '#000000',
        });
        const bw = Math.min(canvasW - padding * 2, barcodeCanvasRef.current.width);
        const bx = (canvasW - bw) / 2;
        const by = canvasH - barcodeH - padding + 2;
        ctx.drawImage(barcodeCanvasRef.current, bx, by, bw, barcodeH);
      } catch {
        // invalid barcode value — skip
      }
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
    const activeFields = fields
      .filter(f => f.enabled)
      .map(f => ({
        key: f.key,
        label: f.label,
        value: fieldValue(f.key, product, f.customText),
      }));
    await printLabel({
      name: product.name,
      barcode: product.barcode,
      price: product.price,
      fields: activeFields,
      size,
      quantity,
    });
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
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
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
            {/* Список шаблонов с удалением */}
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
            <div className="flex gap-2">
              {SIZES.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSize(s.id)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    size === s.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Предпросмотр */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Предпросмотр</label>
            <div className="flex justify-center bg-gray-50 rounded-xl p-4">
              <canvas
                ref={canvasRef}
                width={canvasW}
                height={canvasH}
                className="shadow-sm rounded"
                style={{ imageRendering: 'pixelated', maxWidth: '100%' }}
              />
              {/* Скрытый canvas для JsBarcode */}
              <canvas ref={barcodeCanvasRef} style={{ display: 'none' }} />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 space-y-3">

          {/* Количество + IP */}
          <div className="flex items-center justify-between">
            {/* Кол-во копий */}
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

            {/* IP принтера */}
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              {editingIp ? (
                <div className="flex items-center gap-1">
                  <input
                    value={ipInput}
                    onChange={e => setIpInput(e.target.value)}
                    onBlur={() => { savePrinterIp(ipInput); setEditingIp(false); }}
                    onKeyDown={e => { if (e.key === 'Enter') { savePrinterIp(ipInput); setEditingIp(false); } }}
                    autoFocus
                    className="w-32 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              ) : (
                <>
                  <span>IP: {printerIp}</span>
                  <button
                    type="button"
                    onClick={() => { setIpInput(printerIp); setEditingIp(true); }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <Pencil size={11} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Ошибка */}
          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Кнопки */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
            >
              Отмена
            </button>
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
                <>
                  <Printer size={15} />
                  Печать {quantity > 1 ? `(${quantity} шт)` : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
