#!/usr/bin/env python3
"""
TSC TE200 Print Server — optics-crm
Запуск: python print_server.py
Слушает порт 5000, принимает POST /print с base64 PNG, печатает на TSC через USB.

Установка зависимостей:
  pip install flask Pillow pywin32
"""

import base64
import io
import sys
from flask import Flask, request, jsonify

try:
    from PIL import Image
except ImportError:
    print('Ошибка: установи Pillow → pip install Pillow')
    sys.exit(1)

try:
    import win32print
except ImportError:
    print('Ошибка: установи pywin32 → pip install pywin32')
    sys.exit(1)

app = Flask(__name__)
DPI = 203  # TSC TE200 — 203 DPI


# ─── CORS (разрешить запросы от Vercel и localhost) ───────────────────────────

@app.after_request
def add_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS'
    return response

@app.route('/print', methods=['OPTIONS'])
@app.route('/status', methods=['OPTIONS'])
def options():
    return '', 204


# ─── Поиск принтера ───────────────────────────────────────────────────────────

def find_tsc_printer() -> str:
    printers = win32print.EnumPrinters(
        win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    )
    names = [p[2] for p in printers]
    for name in names:
        n = name.upper()
        if 'TSC' in n or 'TE200' in n or 'TE-200' in n:
            return name
    return win32print.GetDefaultPrinter()


# ─── Конвертация PNG → TSPL BITMAP ───────────────────────────────────────────

def png_to_tspl_bitmap(png_bytes: bytes, w_mm: int, h_mm: int) -> bytes:
    """Конвертирует PNG в бинарную команду TSPL BITMAP."""
    img = Image.open(io.BytesIO(png_bytes)).convert('RGBA')

    # Белый фон под прозрачность
    bg = Image.new('RGBA', img.size, (255, 255, 255, 255))
    bg.paste(img, mask=img.split()[3])
    img = bg.convert('L')

    # Ресайз до разрешения принтера
    w_dots = int(w_mm * DPI / 25.4)
    h_dots = int(h_mm * DPI / 25.4)
    img = img.resize((w_dots, h_dots), Image.LANCZOS)

    # Порог → 1-бит (чёрное/белое)
    img = img.point(lambda p: 0 if p < 128 else 255).convert('1')

    width_bytes = (w_dots + 7) // 8
    pixels = img.load()

    bitmap = bytearray()
    for row in range(h_dots):
        for col_byte in range(width_bytes):
            byte_val = 0
            for bit in range(8):
                col = col_byte * 8 + bit
                if col < w_dots and pixels[col, row] == 0:  # 0 = чёрный в PIL '1'
                    byte_val |= (0x80 >> bit)
            bitmap.append(byte_val)

    header = f'BITMAP 0,0,{width_bytes},{h_dots},0,'.encode('ascii')
    return header + bytes(bitmap) + b'\r\n'


def build_tspl(png_bytes: bytes, size: str, quantity: int) -> bytes:
    """Собирает полный TSPL-документ для TSC TE200."""
    w_mm, h_mm = map(int, size.split('x'))

    tspl_header = (
        f'SIZE {w_mm} mm,{h_mm} mm\r\n'
        f'GAP 3 mm,0 mm\r\n'
        f'DIRECTION 0\r\n'
        f'REFERENCE 0,0\r\n'
        f'CLS\r\n'
    ).encode('ascii')

    bitmap_cmd = png_to_tspl_bitmap(png_bytes, w_mm, h_mm)

    tspl_footer = (
        f'PRINT {quantity},1\r\n'
        f'END\r\n'
    ).encode('ascii')

    return tspl_header + bitmap_cmd + tspl_footer


# ─── Отправка на принтер (RAW) ────────────────────────────────────────────────

def send_raw(printer_name: str, data: bytes):
    handle = win32print.OpenPrinter(printer_name)
    try:
        win32print.StartDocPrinter(handle, 1, ('Label', None, 'RAW'))
        win32print.StartPagePrinter(handle)
        win32print.WritePrinter(handle, data)
        win32print.EndPagePrinter(handle)
        win32print.EndDocPrinter(handle)
    finally:
        win32print.ClosePrinter(handle)


# ─── Маршруты ─────────────────────────────────────────────────────────────────

@app.route('/print', methods=['POST'])
def print_label():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({'error': 'Нет JSON'}), 400

    image_b64 = data.get('image')
    if not image_b64:
        return jsonify({'error': 'Поле image отсутствует'}), 400

    size = data.get('size', '40x25')
    quantity = max(1, int(data.get('quantity', 1)))

    try:
        png_bytes = base64.b64decode(image_b64)
    except Exception:
        return jsonify({'error': 'Неверный base64'}), 400

    try:
        tspl = build_tspl(png_bytes, size, quantity)
        printer = find_tsc_printer()
        print(f'  → Принтер: {printer}  |  Размер: {size}  |  Копий: {quantity}')
        send_raw(printer, tspl)
        return jsonify({'ok': True, 'printer': printer})
    except Exception as e:
        print(f'  Ошибка: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/status', methods=['GET'])
def status():
    try:
        printer = find_tsc_printer()
        return jsonify({'ok': True, 'printer': printer})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)})


# ─── Запуск ───────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print('─' * 50)
    print('TSC TE200 Print Server — optics-crm')
    print('─' * 50)
    try:
        printer = find_tsc_printer()
        print(f'Принтер найден: {printer}')
    except Exception as e:
        print(f'Предупреждение: принтер не найден ({e})')
    print('Сервер запущен: http://127.0.0.1:5000')
    print('В CRM установи IP принтера → 127.0.0.1')
    print('─' * 50)
    app.run(host='0.0.0.0', port=5000, debug=False)
