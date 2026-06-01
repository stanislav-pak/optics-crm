import re

path = 'src/components/Inventory/PrintLabelModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Заменяем всю функцию handleUsbPrint целиком
old_pattern = r'function handleUsbPrint\(\) \{[\s\S]*?\n  \}'

new_func = r'''function handleUsbPrint() {
    const canvas = document.getElementById('print-label-canvas') as HTMLCanvasElement;
    if (!canvas) return;

    const [mmW, mmH] = currentSize.mm;
    const dataURL = canvas.toDataURL('image/png');

    // Убираем предыдущие элементы если есть
    document.getElementById('__lbl_style__')?.remove();
    document.getElementById('__lbl_div__')?.remove();

    // Стили: скрываем всё кроме этикетки при печати
    const style = document.createElement('style');
    style.id = '__lbl_style__';
    style.textContent = `
      @media print {
        @page { size: ${mmW}mm ${mmH}mm; margin: 0; }
        body > *:not(#__lbl_div__) { display: none !important; }
        #__lbl_div__ { display: block !important; }
        #__lbl_div__ img { width: ${mmW}mm; height: ${mmH}mm; display: block; page-break-after: always; }
        #__lbl_div__ img:last-child { page-break-after: avoid; }
      }
      #__lbl_div__ { display: none; }
    `;

    const div = document.createElement('div');
    div.id = '__lbl_div__';
    div.innerHTML = Array(quantity).fill(`<img src="${dataURL}">`).join('');

    document.head.appendChild(style);
    document.body.appendChild(div);

    requestAnimationFrame(() => {
      window.print();
      setTimeout(() => {
        document.getElementById('__lbl_style__')?.remove();
        document.getElementById('__lbl_div__')?.remove();
      }, 1000);
    });
  }'''

content_new, n = re.subn(old_pattern, new_func, content, count=1)
print(f"Replaced: {n}")

if n > 0:
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content_new)
    print("Done!")
else:
    print("FAILED — pattern not found")
