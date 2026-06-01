path = 'src/components/Inventory/PrintLabelModal.tsx'
with open(path, 'r', encoding='utf-8-sig') as f:
    content = f.read()

lines = content.split('\n')
start = None
for i, line in enumerate(lines):
    if 'function handleUsbPrint()' in line:
        start = i
        break

depth = 0
end = None
for i in range(start, len(lines)):
    depth += lines[i].count('{') - lines[i].count('}')
    if depth == 0 and i > start:
        end = i
        break

print(f"Replacing lines {start+1}-{end+1}")

new_func = '''  function handleUsbPrint() {
    const [mmW, mmH] = currentSize.mm;
    // 203 DPI = 8px/mm — точное разрешение XP-235B, 1 этикетка
    const pxPerMm = MM_TO_PX; // 8
    const pW = mmW * pxPerMm; // 320
    const pH = mmH * pxPerMm; // 240

    const printCanvas = document.createElement('canvas');
    printCanvas.width = pW;
    printCanvas.height = pH;
    const ctx = printCanvas.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pW, pH);

    const padding = 4;
    const maxW = pW - padding * 2;
    const showBarcode = fields.find(f => f.key === 'barcode')?.enabled && product.barcode;
    const nameField = fields.find(f => f.key === 'name' && f.enabled);
    const otherFields = fields.filter(f => f.enabled && f.key !== 'barcode' && f.key !== 'name');

    const nameFontSize  = Math.min(10, Math.max(7, pH * 0.13));
    const otherFontSize = Math.min(8,  Math.max(6, pH * 0.10));
    const barcodeH      = showBarcode ? Math.min(38, pH * 0.50) : 0;
    const nameH         = nameField ? nameFontSize + 2 : 0;
    const otherH        = otherFields.reduce((acc, f) => {
      const val = fieldValue(f.key, product, f.customText);
      return val ? acc + otherFontSize + 2 : acc;
    }, 0);
    const gapCount  = (nameH ? 1 : 0) + (barcodeH ? 1 : 0);
    const freeSpace = pH - padding * 2 - nameH - barcodeH - otherH;
    const gap       = gapCount > 0 ? Math.max(2, freeSpace / (gapCount + 1)) : 0;

    const drawCentered = (text: string, y: number, font: string, color: string) => {
      ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'top';
      let t = text;
      while (ctx.measureText(t).width > maxW && t.length > 3) t = t.slice(0, -1);
      if (t !== text) t += '\u2026';
      ctx.fillText(t, (pW - ctx.measureText(t).width) / 2, y);
    };

    let y = padding + (gapCount > 0 ? gap : freeSpace / 2);

    if (nameField) {
      const val = fieldValue('name', product, nameField.customText);
      if (val) {
        drawCentered(val, y, `bold ${nameFontSize}px sans-serif`, '#111827');
        y += nameFontSize + 2 + gap;
      }
    }

    if (showBarcode && product.barcode) {
      try {
        const bc = document.createElement('canvas');
        JsBarcode(bc, product.barcode, {
          format: 'CODE128',
          width: 2,
          height: Math.max(20, barcodeH - 10),
          displayValue: true,
          fontSize: 8,
          margin: 0,
          background: '#ffffff',
          lineColor: '#000000',
        });
        const scale = Math.min(1, maxW / bc.width);
        ctx.drawImage(bc, (pW - bc.width * scale) / 2, y, bc.width * scale, bc.height * scale);
        y += bc.height * scale + gap;
      } catch { /* invalid barcode */ }
    }

    for (const field of otherFields) {
      const val = fieldValue(field.key, product, field.customText);
      if (!val) continue;
      const isPrice = field.key === 'price_sale' || field.key === 'price_purchase';
      drawCentered(val, y, `${isPrice ? 'bold ' : ''}${otherFontSize}px sans-serif`, isPrice ? '#1d4ed8' : '#374151');
      y += otherFontSize + 2;
    }

    printCanvas.toBlob((blob) => {
      if (!blob) return;
      blob.arrayBuffer().then((buf) => {
        // 203 DPI -> 7992 dots/meter
        const dpm = 7992;
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
  }
'''

new_lines = lines[:start] + new_func.split('\n') + lines[end+1:]

with open(path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(new_lines))

print("Done!")
