"""Тревоги для часов: берёт siren.pp.ua и пишет компактный site/clock/alerts.json.

Формат: {"u": время сборки (мс), "a": {"id области": начало тревоги (мс)},
         "vp": [["район Винницкой обл.", начало (мс)], ...]}
id областей совпадают с картой site/clock/ukraine-map.js.
"""
import json, sys, time, urllib.request
from datetime import datetime

NAMES = {
    'Автономна Республіка Крим': 'crimea', 'Вінницька область': 'vinnytsia', 'Волинська область': 'volyn',
    'Дніпропетровська область': 'dnipropetrovsk', 'Донецька область': 'donetsk', 'Житомирська область': 'zhytomyr',
    'Закарпатська область': 'zakarpattia', 'Запорізька область': 'zaporizhia', 'Івано-Франківська область': 'ivano-frankivsk',
    'Київська область': 'kyiv', 'Кіровоградська область': 'kirovohrad', 'Луганська область': 'luhansk',
    'Львівська область': 'lviv', 'Миколаївська область': 'mykolaiv', 'Одеська область': 'odessa',
    'Полтавська область': 'poltava', 'Рівненська область': 'rivne', 'Сумська область': 'sumy',
    'Тернопільська область': 'ternopil', 'Харківська область': 'kharkiv', 'Херсонська область': 'kherson',
    'Хмельницька область': 'khmelnytskyi', 'Черкаська область': 'cherkasy', 'Чернівецька область': 'chernivtsi',
    'Чернігівська область': 'chernihiv', 'м. Київ': 'kyiv-city',
}
VIN_DISTRICTS = ['Вінницький район', 'Гайсинський район', 'Жмеринський район',
                 'Могилів-Подільський район', 'Тульчинський район', 'Хмільницький район']


def ms(s):
    s = (s or '').replace('Z', '+00:00')
    if '.' in s:  # микросекунды бывают разной длины
        head, rest = s.split('.', 1)
        frac, tz = rest[:rest.find('+')] if '+' in rest else rest, rest[rest.find('+'):] if '+' in rest else ''
        s = head + '.' + (frac + '000000')[:6] + tz
    try:
        return int(datetime.fromisoformat(s).timestamp() * 1000)
    except ValueError:
        return None


def main(out):
    req = urllib.request.Request('https://siren.pp.ua/api/v3/alerts', headers={'User-Agent': 'clock-page'})
    data = json.load(urllib.request.urlopen(req, timeout=30))
    res = {'u': int(time.time() * 1000), 'a': {}, 'vp': []}
    for r in data:
        air = [a for a in r.get('activeAlerts') or [] if a.get('type') == 'AIR']
        if not air:
            continue
        starts = [ms(l.get('createdAt')) for a in air for l in a.get('activeAlertLevels') or []]
        starts = [x for x in starts if x] or [ms(air[0].get('lastUpdate'))]
        start = min(x for x in starts if x) if any(starts) else None
        name = (r.get('regionName') or '').strip()
        if r.get('regionType') == 'State' and name in NAMES:
            res['a'][NAMES[name]] = start
        elif name in VIN_DISTRICTS:
            res['vp'].append([name, start])
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(res, ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1])
