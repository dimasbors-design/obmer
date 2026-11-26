# Сборка справочника электрика:
#  ../site/spravka/  — веб-приложение для телефона и ПК (GitHub Pages, ставится на главный экран, работает офлайн)
#  dist/spravka.js, dist/spravka.css — модуль для встраивания в ЭлектроЩит и в Windows-программу
import os, shutil, json, hashlib, base64
H = os.path.dirname(os.path.abspath(__file__))
def rd(p): return open(os.path.join(H, p), encoding='utf8').read()
JS = ['src/core.js', 'src/circuits.js', 'src/calcs.js', 'src/content.js', 'src/ui.js']
js = '\n'.join(rd(p).replace("if (typeof module !== 'undefined') module.exports", "if (false) module.exports") for p in JS)
css = rd('src/style.css')
os.makedirs(os.path.join(H, 'dist'), exist_ok=True)
open(os.path.join(H, 'dist/spravka.js'), 'w', encoding='utf8').write(js)
open(os.path.join(H, 'dist/spravka.css'), 'w', encoding='utf8').write(css)
ver = hashlib.sha1((js + css).encode()).hexdigest()[:10]
icon64 = base64.b64encode(open(os.path.join(H, 'assets/icon-64.png'), 'rb').read()).decode()
page = rd('src/page.html').replace('/*CSS*/', css).replace('/*JS*/', js).replace('%VER%', ver).replace('%ICON%', icon64)
out = os.path.join(H, '..', 'site', 'spravka'); os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'index.html'), 'w', encoding='utf8').write(page)
open(os.path.join(H, 'dist/index.html'), 'w', encoding='utf8').write(page.replace('<link rel="manifest" href="manifest.webmanifest">', '').replace("if ('serviceWorker' in navigator", "if (false && 'serviceWorker' in navigator"))
for f in ['icon-192.png', 'icon-512.png']: shutil.copy(os.path.join(H, 'assets', f), os.path.join(out, f))
json.dump({"name": "Справочник электрика", "short_name": "Электрик", "start_url": "./", "scope": "./", "display": "standalone", "background_color": "#1f2730", "theme_color": "#1f2730", "lang": "ru",
           "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}]},
          open(os.path.join(out, 'manifest.webmanifest'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
open(os.path.join(out, 'sw.js'), 'w', encoding='utf8').write(rd('src/sw.js').replace('%VER%', ver))
print('ok', ver, len(page))
