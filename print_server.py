#!/usr/bin/env python3
"""
TSC TE200 Print Server — optics-crm
Запуск: python print_server.py  или  TSC_PrintServer.exe
Слушает порт 5000, принимает POST /print, печатает на TSC через USB.
"""

import sys
from flask import Flask, request, jsonify

try:
    import win32print
except ImportError:
    print('Ошибка: установи pywin32 → pip install pywin32')
    sys.exit(1)

app = Flask(__name__)
DPI = 203  # TSC TE200 — 203 DPI


# ─── CORS ────────────────────────────────────────────────────────────────────

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


# ─── Поиск принтера ──────────────────────────────────────────────────────────

def find_tsc_printer() -> str:
    printers = win32print.EnumPrinters(
        win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    )
    for p in printers:
        n = p[2].upper()
        if 'TSC' in n or 'TE200' in n or 'TE-200' in n:
            return p[2]
    return win32print.GetDefaultPrinter()


# ─── EAN-13 BITMAP (промежуточная ширина между M=1 и M=2) ────────────────────

_L = ['0001101','0011001','0010011','0111101','0100011',
      '0110001','0101111','0111011','0110111','0001011']
_G = ['0100111','0110011','0011011','0100001','0011101',
      '0111001','0000101','0010001','0001001','0010111']
_R = ['1110010','1100110','1101100','1000010','1011100',
      '1001110','1010000','1000100','1001000','1110100']
_P = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG',
      'LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL']

def _ean13_modules(code: str) -> list:
    c = code[:13]
    p = _P[int(c[0])]
    m = [0]*11 + [1,0,1]
    for i, d in enumerate(c[1:7]):
        m += [int(b) for b in (_L[int(d)] if p[i]=='L' else _G[int(d)])]
    m += [0,1,0,1,0]
    for d in c[7:]:
        m += [int(b) for b in _R[int(d)]]
    m += [1,0,1] + [0]*7
    return m  # 113 модулей

def _ean13_bitmap(code: str, x: int, y: int, w_dots: int, h_dots: int) -> bytes:
    """TSPL BITMAP — EAN-13 масштабированный до w_dots точек. Без \r\n в конце."""
    modules = _ean13_modules(code)
    n = len(modules)
    row = [modules[int(i * n / w_dots)] for i in range(w_dots)]
    w_bytes = (w_dots + 7) // 8
    bmp = bytearray()
    for _ in range(h_dots):
        for bi in range(w_bytes):
            byte_val = 0
            for bit in range(8):
                pi = bi * 8 + bit
                if pi < w_dots and row[pi]:
                    byte_val |= (0x80 >> bit)
            bmp.append(byte_val)
    header = f'BITMAP {x},{y},{w_bytes},{h_dots},0,'.encode('ascii')
    return header + bytes(bmp)  # без \r\n: принтер читает ровно w_bytes*h_dots байт


# ─── Генерация TSPL ──────────────────────────────────────────────────────────

def build_tspl(data: dict, quantity: int) -> bytes:
    size    = data.get('size', '45x10')
    w_mm, h_mm = map(int, size.split('x'))
    barcode = data.get('barcode', '').strip()
    fields  = data.get('fields', [])

    def field_val(key: str) -> str:
        return next((f['value'] for f in fields if f['key'] == key and f.get('value')), '')

    H = int(h_mm * DPI / 25.4)
    W = int(w_mm * DPI / 25.4)

    result = bytearray()

    def cmd(text: str):
        result.extend((text + '\r\n').encode('cp1251', errors='replace'))

    cmd(f'SIZE {w_mm} mm,{h_mm} mm')
    cmd('GAP 3 mm,0 mm')
    cmd('DIRECTION 0')
    cmd('CODEPAGE 1251')
    cmd('CLS')

    if h_mm <= 12:
        # Узкая этикетка — только штрихкод
        if barcode:
            bar_h    = max(20, H - 22)
            readable = 1 if H >= 38 else 0
            if len(barcode) == 13 and barcode.isdigit():
                # EAN-13: BITMAP во второй половине этикетки — штрихкод на одной стороне при складывании
                result.extend(_ean13_bitmap(barcode, W // 2, 0, W // 2, bar_h))
                result.extend(b'\r\n')
                if readable:
                    cmd(f'TEXT {W // 2},{bar_h + 2},"1",0,1,1,"{barcode}"')
            else:
                cmd(f'BARCODE 0,0,"128",{bar_h},{readable},0,2,2,"{barcode}"')
        else:
            name  = field_val('name')
            price = field_val('price_sale')
            y = 0
            if name:
                cmd(f'TEXT {W//2},{y},"1",0,1,1,"{name}"')
                y += 12
            if price and y < H:
                cmd(f'TEXT {W//2},{y},"1",0,1,1,"{price}"')
    else:
        # Большая этикетка — название + штрихкод + цена
        name  = field_val('name')
        price = field_val('price_sale')
        y = 0
        if name:
            cmd(f'TEXT 5,{y},"2",0,1,1,"{name}"')
            y += 20
        if barcode:
            bc_type = 'EAN13' if (len(barcode) == 13 and barcode.isdigit()) else '128'
            bar_h   = min(80, H - y - (20 if price else 0))
            cmd(f'BARCODE 5,{y},"{bc_type}",{bar_h},1,0,2,2,"{barcode}"')
            y += bar_h + 16
        if price and y < H:
            cmd(f'TEXT 5,{y},"2",0,1,1,"{price}"')

    cmd(f'PRINT {quantity},1')
    cmd('END')

    return bytes(result)


# ─── Отправка RAW на принтер ─────────────────────────────────────────────────

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


# ─── Маршруты ────────────────────────────────────────────────────────────────

@app.route('/print', methods=['POST'])
def print_label():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({'error': 'Нет JSON'}), 400
    quantity = max(1, int(data.get('quantity', 1)))
    try:
        tspl    = build_tspl(data, quantity)
        printer = find_tsc_printer()
        print(f'  → {printer}  |  {data.get("size")}  |  x{quantity}  |  {data.get("barcode","—")}')
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


# ─── Запуск ──────────────────────────────────────────────────────────────────

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
    print('─' * 50)
    app.run(host='0.0.0.0', port=5000, debug=False)
