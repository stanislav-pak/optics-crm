import re

path = 'src/components/Inventory/PrintLabelModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Заменяем iframe.onload блок на простой setTimeout
pattern = r'// [^\n]*\n\s*iframe\.onload\s*=\s*\(\)\s*=>\s*\{[\s\S]*?setTimeout\(\(\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\d+\)\s*\}[^\n]*\n\s*\};'

replacement = '''      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (document.body.contains(iframe)) document.body.removeChild(iframe);
          URL.revokeObjectURL(blobUrl);
        }, 2000);
      }, 500);
    }, 'image/png');'''

content_new, n = re.subn(pattern, replacement, content, count=1)

if n == 0:
    # Fallback: ищем просто iframe.onload блок
    pattern2 = r'iframe\.onload\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\};\s*\n(\s*\})'
    replacement2 = '''      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (document.body.contains(iframe)) document.body.removeChild(iframe);
          URL.revokeObjectURL(blobUrl);
        }, 2000);
      }, 500);
    }, 'image/png');
\\1'''
    content_new, n = re.subn(pattern2, replacement2, content, count=1)
    print(f"Fallback regex: {n} replacement(s)")
else:
    print(f"OK: {n} replacement(s)")

if n > 0:
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content_new)
    print("File saved!")
else:
    print("FAILED — покажи содержимое файла вокруг iframe.onload")
