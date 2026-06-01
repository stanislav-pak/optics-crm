import re

path = 'src/components/Inventory/PrintLabelModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_pattern = r'function handleUsbPrint\(\) \{[\s\S]*?\n  \}'

new_func = '''function handleUsbPrint() {
    const canvas = document.getElementById('print-label-canvas') as HTMLCanvasElement;
    if (!canvas) return;

    const [mmW, mmH] = currentSize.mm;

    // Скачиваем PNG — надёжнее чем browser print с нестандартным размером
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `label_${mmW}x${mmH}_${product.name.replace(/[^a-zA-Z0-9а-яА-Я]/g, '_')}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }'''

content_new, n = re.subn(old_pattern, new_func, content, count=1)
print(f"Replaced: {n}")

if n > 0:
    # Меняем текст кнопки с "Печать (USB)" на "Скачать PNG"
    content_new = content_new.replace(
        'Печать (USB)',
        'Скачать PNG'
    )
    # Меняем подсказку под кнопками
    content_new = content_new.replace(
        "'Откроется диалог печати → выберите Xprinter XP-235B'",
        "'Скачается PNG → откройте → ПКМ → Напечатать → выберите Xprinter XP-235B'"
    )
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content_new)
    print("Done!")
else:
    print("FAILED")
