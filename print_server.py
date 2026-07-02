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
    print('Error: install pywin32 -> pip install pywin32')
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


# ─── EAN-13 BITMAP (растягивание до произвольной ширины) ─────────────────────

_L = ['0001101','0011001','0010011','0111101','0100011',
      '0110001','0101111','0111011','0110111','0001011']
_G = ['0100111','0110011','0011011','0100001','0011101',
      '0111001','0000101','0010001','0001001','0010111']
_R = ['1110010','1100110','1101100','1000010','1011100',
      '1001110','1010000','1000100','1001000','1110100']
_P = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG',
      'LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL']

def _ean13_modules(code: str) -> list:
    """113 модулей EAN-13 (0=белый, 1=чёрный), включая тихие зоны (11 слева, 7 справа).
    Тихие зоны (белые поля) обязательны — без них сканер не находит границы кода."""
    c = code[:13]
    p = _P[int(c[0])]
    m = [0] * 11 + [1, 0, 1]                                  # тихая зона + левый страж
    for i, d in enumerate(c[1:7]):
        m += [int(b) for b in (_L[int(d)] if p[i] == 'L' else _G[int(d)])]
    m += [0, 1, 0, 1, 0]                                      # центральный страж
    for d in c[7:]:
        m += [int(b) for b in _R[int(d)]]
    m += [1, 0, 1] + [0] * 7                                  # правый страж + тихая зона
    return m                                                  # len = 113

def _ean13_bitmap(code: str, x: int, y: int, w_dots: int, h_dots: int) -> bytes:
    """TSPL BITMAP: EAN-13 (с тихими зонами) растянут до w_dots точек. Растягивание
    (w_dots > 113), каждый модуль = целое число соседних точек — полосы чёткие."""
    modules = _ean13_modules(code)
    n = len(modules)                                          # 113
    row = [0] * w_dots
    for m in range(n):
        if modules[m]:
            for c in range(m * w_dots // n, (m + 1) * w_dots // n):
                row[c] = 1
    w_bytes = (w_dots + 7) // 8
    bmp = bytearray()
    for _ in range(h_dots):
        for bi in range(w_bytes):
            byte_val = 0
            for bit in range(8):
                pi = bi * 8 + bit
                # TSPL BITMAP: бит 1 = белая точка (не печатать), бит 0 = чёрная.
                # Ставим бит для БЕЛЫХ модулей (row=0) и для добивки за краем ширины.
                if pi >= w_dots or not row[pi]:
                    byte_val |= (0x80 >> bit)
            bmp.append(byte_val)
    header = f'BITMAP {x},{y},{w_bytes},{h_dots},0,'.encode('ascii')
    return header + bytes(bmp) + b'\r\n'


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
    cmd('GAP 7 mm,0 mm')  # физический зазор на 40x10 ролике измерен ~6.5-7мм (было ошибочно 3мм)
    cmd('DIRECTION 0')
    cmd('CODEPAGE 1251')
    cmd('CLS')

    # Физическая калибровка узкой этикетки: печать садится смещённой вправо
    # относительно реального края наклейки. TSPL REFERENCE эта прошивка игнорирует
    # (проверено на печати), поэтому сдвигаем координаты напрямую в каждой команде —
    # только у финальных X, которые реально уходят в TSPL, а не у промежуточных
    # переменных (ширин/центрирования), чтобы не сломать взаимное расположение элементов.
    SHIFT_X = round(15 * DPI / 25.4)  # 15 мм вправо

    if h_mm <= 12:
        # Узкая этикетка — штрихкод справа + цена слева
        if barcode:
            readable = 1 if H >= 38 else 0
            margin_x = round(1 * DPI / 25.4)   # 1 мм ≈ 8 точек
            top_y    = round(1 * DPI / 25.4)   # 1 мм ≈ 8 точек (подняли выше, было 3мм)
            # Высота полосок считается от СТАРОГО отступа (3мм) — не от нового top_y.
            # Раньше bar_h = H - top_y - 16 означало, что при уменьшении top_y полоски
            # становились ВЫШЕ (съедая место, отведённое под цифры снизу). Нужно было
            # просто поднять весь блок, а не увеличивать сами полоски — размер полосок
            # остаётся как раньше, только стартует выше, оставляя больше места цифрам внизу.
            ref_top_y = round(3 * DPI / 25.4)
            # Ширина штрихкода — пропорционально половине этикетки (после линии сгиба),
            # а не фиксированные мм — иначе штрихкод вылезает за сгиб при смене размера этикетки.
            bar_w    = W // 2 - margin_x
            x        = W - bar_w - margin_x    # прижать к правому краю (= W // 2, у линии сгиба)
            bar_h    = max(20, H - ref_top_y - 16)

            price_left_w = x
            if len(barcode) == 13 and barcode.isdigit():
                # EAN-13: BITMAP с тихими зонами
                result.extend(_ean13_bitmap(barcode, x + SHIFT_X, top_y, bar_w, bar_h))
                if readable:
                    text_x = x + max(0, (bar_w - len(barcode) * 8) // 2)
                    cmd(f'TEXT {text_x + SHIFT_X},{top_y + bar_h + 2},"1",0,1,1,"{barcode}"')
            else:
                # CODE128: правая половина этикетки (после линии сгиба)
                is_c128c = barcode.isdigit() and len(barcode) % 2 == 0
                n_modules = (35 + (len(barcode) // 2) * 11) if is_c128c else (35 + len(barcode) * 11)
                # narrow=2 только если штрихкод + тихая зона влезает в правую половину
                narrow = 2 if n_modules * 2 + 10 * 2 + margin_x <= W // 2 else 1
                bc_w = n_modules * narrow
                quiet = 10 * narrow
                x_bc = W - bc_w - quiet - margin_x
                price_left_w = x_bc
                bar_h_bc = max(20, H - ref_top_y - narrow * 16)
                cmd(f'BARCODE {x_bc + SHIFT_X},{top_y},"128",{bar_h_bc},0,0,{narrow},{narrow},"{barcode}"')
                if readable:
                    text_y = top_y + bar_h_bc
                    cover_h = min(narrow * 16, H - text_y)
                    if cover_h > 0:
                        w_bytes = (bc_w + 7) // 8
                        white_row = bytes([0xFF] * w_bytes)
                        bmp = bytearray()
                        for _ in range(cover_h):
                            bmp.extend(white_row)
                        header = f'BITMAP {x_bc + SHIFT_X},{text_y},{w_bytes},{cover_h},0,'.encode('ascii')
                        result.extend(header + bytes(bmp) + b'\r\n')
                    text_x = x_bc + max(0, (bc_w - len(barcode) * 8) // 2)
                    cmd(f'TEXT {text_x + SHIFT_X},{text_y + 2},"1",0,1,1,"{barcode}"')

            # Цена на левой половине (для EAN13 и CODE128)
            price_label = str(data.get('price_label', '')).strip()
            if price_label:
                try:
                    num = int(float(price_label))
                    parts = []
                    n = num
                    while n >= 1000:
                        parts.append(f'{n % 1000:03d}')
                        n //= 1000
                    parts.append(str(n))
                    formatted = ' '.join(reversed(parts))
                except (ValueError, TypeError):
                    formatted = price_label[:8]
                left_w = price_left_w
                ch_w, ch_h = 18, 16
                p_x = max(2, (left_w - len(formatted) * ch_w) // 2)
                p_y = max(0, (H - ch_h) // 2 - 16)   # приподнято вместе со штрихкодом
                cmd(f'TEXT {max(0, p_x + SHIFT_X)},{p_y},"3",0,1,1,"{formatted}"')
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
        print(f'  -> {printer}  |  {data.get("size")}  |  x{quantity}  |  {data.get("barcode","-")}')
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
    print('-' * 50)
    print('TSC TE200 Print Server - optics-crm')
    print('-' * 50)
    try:
        printer = find_tsc_printer()
        print(f'Printer found: {printer}')
    except Exception as e:
        print(f'Warning: printer not found ({e})')
    print('Server running: http://127.0.0.1:5000')
    print('-' * 50)
    app.run(host='0.0.0.0', port=5000, debug=False)
