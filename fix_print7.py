path = 'src/components/Inventory/PrintLabelModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Находим начало функции
start = None
for i, line in enumerate(lines):
    if 'function handleUsbPrint()' in line:
        start = i
        break

if start is None:
    print("FAILED: function not found")
    exit()

# Находим конец функции подсчётом скобок
depth = 0
end = None
for i in range(start, len(lines)):
    depth += lines[i].count('{') - lines[i].count('}')
    if depth == 0 and i > start:
        end = i
        break

if end is None:
    print("FAILED: closing brace not found")
    exit()

print(f"Found function: lines {start+1} to {end+1}")
print("Current function body:")
for line in lines[start:end+1]:
    print(repr(line))

# Новая функция — скачивает PNG с DPI 203
new_func = '''  function handleUsbPrint() {
    const canvas = document.getElementById('print-label-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const [mmW, mmH] = currentSize.mm;
    canvas.toBlob((blob) => {
      if (!blob) return;
      blob.arrayBuffer().then((buf) => {
        const dpm = Math.round(203 * 39.3701);
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
        const chunk = new Uint8Array(4 + 4 + 9 + 4);
        const cv = new DataView(chunk.buffer);
        cv.setUint32(0, 9); chunk.set(type, 4); chunk.set(data, 8); cv.setUint32(21, crc);
        const png = new Uint8Array(buf);
        const pos = 33;
        const result = new Uint8Array(png.length + chunk.length);
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

# Заменяем
new_lines = lines[:start] + [new_func] + lines[end+1:]
with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"\nReplaced lines {start+1}-{end+1} with clean download function. Done!")
