import re

path = 'src/components/Inventory/PrintLabelModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Заменяем toBlob обратно на toDataURL (canvas маленький, не заморозит)
old = r'''canvas\.toBlob\(\(blob\) => \{
      if \(!blob\) return;
      const blobUrl = URL\.createObjectURL\(blob\);
      const labels = Array\(quantity\)
        \.fill\(`<img src="\$\{blobUrl\}" style="width:\$\{mmW\}mm;height:\$\{mmH\}mm;display:block;page-break-after:always;">`)
        \.join\(''\);'''

new = '''const dataURL = canvas.toDataURL('image/png');
      const labels = Array(quantity)
        .fill(`<img src="${dataURL}" style="width:${mmW}mm;height:${mmH}mm;display:block;page-break-after:always;">`)
        .join('');'''

content_new, n = re.subn(old, new, content, count=1)
print(f"Step 1 (toDataURL): {n}")

# Убираем }, 'image/png'); в конце и заменяем на просто закрывающую скобку функции
old2 = r"}, 'image/png'\);"
new2 = "  }"
content_new, n2 = re.subn(old2, new2, content_new, count=1)
print(f"Step 2 (close): {n2}")

# Убираем URL.revokeObjectURL
old3 = r"\s*URL\.revokeObjectURL\(blobUrl\);"
content_new, n3 = re.subn(old3, '', content_new, count=1)
print(f"Step 3 (revokeObjectURL): {n3}")

if n > 0:
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content_new)
    print("Done!")
else:
    print("FAILED")
