#!/usr/bin/env python3
"""Домашний посредник тревог для часов на iPad.

Каждые 10 секунд спрашивает siren.pp.ua, есть ли воздушная тревога в Винницкой
области, и отдаёт ответ iPad-у по домашней сети. Старый iPad (iOS 9) сам не может
открыть сайты тревог, а маленькую картинку с ноутбука по http открыть может.

Ответ зашифрован в размере картинки /s.bmp:
  ширина 1  — спокойно;
  ширина 2  — тревога во всей Винницкой области;
  ширина 10+N — тревога в части районов, N — битовая маска районов (см. DISTRICTS);
  ширина 4  — нет связи с сайтом тревог больше 2 минут;
  высота    — сколько минут идёт тревога, плюс 1.

Запуск: python3 relay.py   (порт 8088; другой: python3 relay.py 8099)
Проверка в браузере ноутбука: http://localhost:8088/
Учебная тревога на 3 минуты:   http://localhost:8088/test  (или /test?part)

Только стандартная библиотека Python 3, ничего ставить не нужно.
"""
import json, os, struct, sys, threading, time, urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

URL = os.environ.get('RELAY_SOURCE', 'https://siren.pp.ua/api/v3/alerts')
EVERY = 10          # секунд между опросами
STALE = 120         # секунд без ответа, после которых считаем «нет связи»
REGION = 'Вінницька область'
DISTRICTS = ['Вінницький район', 'Гайсинський район', 'Жмеринський район',
             'Могилів-Подільський район', 'Тульчинський район', 'Хмільницький район']
UA = {'User-Agent': 'obmer-clock-relay/1.0 (+https://dimasbors-design.github.io/obmer/clock/)'}

state = {'ok_at': 0, 'full': None, 'parts': {}, 'err': '', 'test_until': 0, 'test_part': False}
lock = threading.Lock()


def ms(s):
    """Время из API (UTC, ISO) в секунды. Микросекунды бывают разной длины."""
    s = (s or '').replace('Z', '+00:00')
    if '.' in s:
        head, rest = s.split('.', 1)
        i = max(rest.find('+'), rest.find('-'))
        frac, tz = (rest[:i], rest[i:]) if i >= 0 else (rest, '')
        s = head + '.' + (frac + '000000')[:6] + tz
    try:
        return datetime.fromisoformat(s).timestamp()
    except ValueError:
        return None


def start_of(r):
    air = [a for a in r.get('activeAlerts') or [] if a.get('type') == 'AIR']
    if not air:
        return None
    starts = [ms(l.get('createdAt')) for a in air for l in a.get('activeAlertLevels') or []]
    starts = [x for x in starts if x] or [ms(air[0].get('lastUpdate')) or time.time()]
    return min(starts)


def poll_once():
    data = json.load(urllib.request.urlopen(urllib.request.Request(URL, headers=UA), timeout=15))
    full, parts = None, {}
    for r in data:
        name = (r.get('regionName') or '').strip()
        st = start_of(r)
        if st is None:
            continue
        if name == REGION and r.get('regionType') == 'State':
            full = st
        elif name in DISTRICTS:
            parts[name] = st
    return full, parts


def poller():
    while True:
        try:
            full, parts = poll_once()
            with lock:
                changed = (full is None) != (state['full'] is None) or set(parts) != set(state['parts'])
                state.update(ok_at=time.time(), full=full, parts=parts, err='')
            if changed:
                print(time.strftime('%H:%M:%S'), 'ТРЕВОГА: область' if full else
                      ('ТРЕВОГА: ' + ', '.join(parts)) if parts else 'спокойно', flush=True)
        except Exception as e:
            with lock:
                state['err'] = str(e)[:200]
            print(time.strftime('%H:%M:%S'), 'нет связи:', e, flush=True)
        time.sleep(EVERY)


def current():
    """(код ширины, начало тревоги в секундах или None, подпись)."""
    now = time.time()
    with lock:
        s = dict(state)
    if now < s['test_until']:
        st = s['test_until'] - 180
        if s['test_part']:
            return 10 + 1, st, 'УЧЕБНАЯ тревога: Вінницький район'
        return 2, st, 'УЧЕБНАЯ тревога: вся область'
    if now - s['ok_at'] > STALE:
        return 4, None, 'нет связи с siren.pp.ua: ' + (s['err'] or 'ещё не было ответа')
    if s['full']:
        return 2, s['full'], 'ТРЕВОГА: вся Винницкая область'
    if s['parts']:
        mask = sum(1 << i for i, d in enumerate(DISTRICTS) if d in s['parts'])
        return 10 + mask, min(s['parts'].values()), 'ТРЕВОГА: ' + ', '.join(s['parts'])
    return 1, None, 'спокойно'


def bmp(w, h):
    """Однотонная 24-битная BMP-картинка w×h (серая, её никто не видит)."""
    row = (w * 3 + 3) & ~3
    pix = (b'\x80' * (w * 3)).ljust(row, b'\0') * h
    head = struct.pack('<2sIHHI', b'BM', 54 + len(pix), 0, 0, 54)
    info = struct.pack('<IiiHHIIiiII', 40, w, h, 1, 24, 0, len(pix), 2835, 2835, 0, 0)
    return head + info + pix


class H(BaseHTTPRequestHandler):
    def send(self, code, body, ctype):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path, _, query = self.path.partition('?')
        code, st, text = current()
        mins = int((time.time() - st) // 60) if st else 0
        if path == '/s.bmp':
            return self.send(200, bmp(code, max(1, min(mins + 1, 999))), 'image/bmp')
        if path == '/s.json':
            return self.send(200, json.dumps({'code': code, 'start': st, 'text': text}, ensure_ascii=False).encode(),
                             'application/json; charset=utf-8')
        if path == '/test':
            with lock:
                state['test_until'] = time.time() + 180
                state['test_part'] = 'part' in query
            return self.redirect()
        if path == '/test/stop':
            with lock:
                state['test_until'] = 0
            return self.redirect()
        if path == '/':
            since = (' с ' + time.strftime('%H:%M', time.localtime(st)) + f' ({mins} мин)') if st else ''
            color = {1: '#2a6', 2: '#d42a22', 4: '#777'}.get(code, '#f2c200')
            page = f'''<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="5"><title>Посредник тревог</title></head>
<body style="font-family:sans-serif;background:#111;color:#eee;padding:2em">
<h1 style="background:{color};padding:.5em;border-radius:.3em">{text}{since}</h1>
<p>Опрос siren.pp.ua каждые {EVERY} с. Последний удачный ответ: {time.strftime('%H:%M:%S', time.localtime(state['ok_at'])) if state['ok_at'] else 'ещё не было'}.</p>
<p><a style="color:#8cf" href="/test">Учебная тревога (вся область, 3 мин)</a> ·
<a style="color:#8cf" href="/test?part">Учебная тревога (район)</a> ·
<a style="color:#8cf" href="/test/stop">Остановить учебную</a></p>
</body></html>'''
            return self.send(200, page.encode(), 'text/html; charset=utf-8')
        self.send(404, b'not found', 'text/plain')

    def redirect(self):
        self.send_response(303)
        self.send_header('Location', '/')
        self.end_headers()

    def log_message(self, *a):
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8088
    threading.Thread(target=poller, daemon=True).start()
    print(f'Посредник тревог слушает порт {port}. Проверка: http://localhost:{port}/', flush=True)
    ThreadingHTTPServer(('0.0.0.0', port), H).serve_forever()


if __name__ == '__main__':
    main()
