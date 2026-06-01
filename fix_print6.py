import re

path = 'src/components/Inventory/PrintLabelModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Полная замена handleUsbPrint с вшитым DPI 203
old_pattern = r'function handleUsbPrint\(\) \{[\s\S]*?\n  \}'

new_func = '''function handleUsbPrint() {
    const canvas = document.getElementById('print-label-canvas') as HTMLCanvasElement;
    if (!canvas) return;

    const [mmW, mmH] = currentSize.mm;

    // CRC32 для PNG chunks
    const makeCRCTable = () => {
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c;
      }
      return table;
    };
    const crcTable = makeCRCTable();
    const crc32 = (bytes: Uint8Array) => {
      let crc = 0xffffffff;
      for (const b of bytes) crc = (crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8));
      return ((crc ^ 0xffffffff) >>> 0);
    };

    // Вшиваем DPI 203 в PNG (pHYs chunk)
    const injectDPI = (pngBytes: Uint8Array, dpi: number): Uint8Array => {
      const dpm = Math.round(dpi * 39.3701); // dots per meter
      const type = new Uint8Array([112, 72, 89, 115]); // "pHYs"
      const data = new Uint8Array(9);
      const dv = new DataView(data.buffer);
      dv.setUint32(0, dpm); dv.setUint32(4, dpm); data[8] = 1;
      const forCRC = new Uint8Array(13);
      forCRC.set(type); forCRC.set(data, 4);
      const crc = crc32(forCRC);
      const chunk = new Uint8Array(4 + 4 + 9 + 4);
      const cv = new DataView(chunk.buffer);
      cv.setUint32(0, 9); chunk.set(type, 4); chunk.set(data, 8); cv.setUint32(21, crc);
      // Вставляем после IHDR (позиция 33)
      const pos = 33;
      const result = new Uint8Array(pngBytes.length + chunk.length);
      result.set(pngBytes.slice(0, pos)); result.set(chunk, pos); result.set(pngBytes.slice(pos), pos + chunk.length);
      return result;
    };

    canvas.toBlob((blob) => {
      if (!blob) return;
      blob.arrayBuffer().then((buf) => {
        const withDPI = injectDPI(new Uint8Array(buf), 203);
        const outBlob = new Blob([withDPI], { type: 'image/png' });
        const url = URL.createObjectURL(outBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `label_${mmW}x${mmH}mm.png`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }, 'image/png');
  }'''

content_new, n = re.subn(old_pattern, new_func, content, count=1)
print(f"Replaced: {n}")

if n > 0:
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content_new)
    print("Done!")
else:
    print("FAILED — function not found in file")
