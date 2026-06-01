import re

path = 'src/components/Inventory/PrintLabelModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old = '''  function handleUsbPrint() {
    const canvas = document.getElementById('print-label-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const dataURL = canvas.toDataURL('image/png');
    const [mmW, mmH] = currentSize.mm;
    // РџРѕРІС‚РѕСЂСЏРµРј РёР·РѕР±СЂР°Р¶РµРЅРёРµ quantity СЂР°Р·
    const labels = Array(quantity)
      .fill(`<img src="${dataURL}" style="width:${mmW}mm;height:${mmH}mm;display:block;page-break-after:always;">`)
      .join('');
    // РЎРѕР·РґР°С'Рј СЃРєСЂС‹С‚С‹Р№ iframe вЂ" РЅРµ Р±Р»РѕРєРёСЂСѓРµС‚ РІРєР»Р°РґРєСѓ
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:none;opacity:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(`<!DOCTYPE html>
<html>'''

new = '''  function handleUsbPrint() {
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
<html>'''

if old in content:
    content = content.replace(old, new, 1)
    print("Step 1 OK")
else:
    print("Step 1 FAILED — trying regex")
    # fallback: найти функцию по сигнатуре
    pattern = r'function handleUsbPrint\(\) \{[\s\S]*?const doc = iframe\.contentDocument!;\s*doc\.open\(\);\s*doc\.write\(`<!DOCTYPE html>\s*<html>'
    replacement = new
    content, n = re.subn(pattern, replacement, content, count=1)
    print(f"Regex replaced: {n}")

# Теперь фиксируем конец функции — убираем onload, добавляем простой setTimeout
old2 = '''      iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.print();
        // Удаляем iframe через секунду после печати
        setTimeout(() => {
          if (document.body.contains(iframe)) document.body.removeChild(iframe);
        }, 2000);
      }, 300);
    };
  }'''

new2 = '''      doc.close();
      // setTimeout вместо onload — избегаем бесконечного цикла
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (document.body.contains(iframe)) document.body.removeChild(iframe);
          URL.revokeObjectURL(blobUrl);
        }, 2000);
      }, 500);
    }, 'image/png');
  }'''

if old2 in content:
    content = content.replace(old2, new2, 1)
    print("Step 2 OK")
else:
    print("Step 2 FAILED — pattern not found, check manually")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done!")
