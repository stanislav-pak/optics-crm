path = 'src/components/Inventory/PrintLabelModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

fixed = content.replace('cv.setUint32(21, crc)', 'cv.setUint32(17, crc)')

if 'cv.setUint32(17, crc)' in fixed:
    with open(path, 'w', encoding='utf-8') as f:
        f.write(fixed)
    print("Fixed!")
else:
    print("FAILED")
