"""Новости Винницы для часов: заголовки из RSS в компактный site/clock/news.json.

Формат: {"u": время сборки (мс), "src": "...", "items": [{"t": "заголовок", "ms": время (мс)}, ...]}
"""
import json, sys, time, urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime

FEEDS = [
    ('20 хвилин', 'https://vn.20minut.ua/rss/'),
    # запасной: Google Новости по запросу «Вінниця»
    ('Google Новини', 'https://news.google.com/rss/search?q=%D0%92%D1%96%D0%BD%D0%BD%D0%B8%D1%86%D1%8F&hl=uk&gl=UA&ceid=UA:uk'),
]
UA = {'User-Agent': 'Mozilla/5.0 (compatible; obmer-clock/1.0; +https://dimasbors-design.github.io/obmer/clock/)'}


def when(s):
    s = (s or '').strip()
    for parse in (parsedate_to_datetime, lambda x: datetime.fromisoformat(x.replace('Z', '+00:00'))):
        try:
            return int(parse(s).timestamp() * 1000)
        except Exception:
            pass
    return 0


def main(out):
    for name, url in FEEDS:
        try:
            root = ET.fromstring(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read())
            items = []
            for it in root.iter('item'):
                t = ' '.join((it.findtext('title') or '').split())
                if t and name.startswith('Google'):
                    t = t.rsplit(' - ', 1)[0]  # убрать « - название сайта»
                if t:
                    items.append({'t': t, 'ms': when(it.findtext('pubDate'))})
            items.sort(key=lambda x: -x['ms'])
            if len(items) >= 3:
                res = {'u': int(time.time() * 1000), 'src': name, 'items': items[:10]}
                with open(out, 'w', encoding='utf-8') as f:
                    json.dump(res, f, ensure_ascii=False, separators=(',', ':'))
                print(json.dumps(res, ensure_ascii=False, indent=1))
                return
            print(name, 'мало новостей:', len(items))
        except Exception as e:
            print(name, 'ошибка:', e)
    sys.exit(1)


if __name__ == '__main__':
    main(sys.argv[1])
