# Встроить справочник в ЭлектроЩит.exe: python3 tools/shchit.py <ЭлектроЩит.exe> <новый ЭлектроЩит.exe>
# Достаёт веб-часть из exe, добавляет spravka.js/spravka.css и кнопки «📘 Справочник», кладёт обратно (patchweb.py).
import os, sys, shutil, tempfile
H = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, H)
import embedfs, patchweb
src, dst = sys.argv[1], sys.argv[2]
tmp = tempfile.mkdtemp()
embedfs.extract(src, tmp)
web = os.path.join(tmp, 'web')
for f in ['spravka.js', 'spravka.css']: shutil.copy(os.path.join(H, '..', 'dist', f), os.path.join(web, f))
p = os.path.join(web, 'index.html'); s = open(p, encoding='utf8').read()
if 'spravka.js' not in s:
    s = s.replace('<link rel="stylesheet" href="style.css">', '<link rel="stylesheet" href="style.css">\n<link rel="stylesheet" href="spravka.css">', 1)
    s = s.replace('<button class="btn primary big" id="btnNew">', '<button class="btn ghost" id="btnSpravka" title="Справочник электрика: расчёты, схемы, нормы">📘 Справочник</button>\n      <button class="btn primary big" id="btnNew">', 1)
    s = s.replace('<button class="tb-btn" id="btnNotes"', '<button class="tb-btn" id="btnSpravka2" title="Справочник электрика: расчёты, схемы, нормы">📘<span class="lbl"> Справочник</span></button>\n      <button class="tb-btn" id="btnNotes"', 1)
    s = s.replace('<script src="app.js"></script>', '<script src="app.js"></script>\n<script src="spravka.js"></script>\n<script>[\'btnSpravka\', \'btnSpravka2\'].forEach(function (id) { var b = document.getElementById(id); if (b) b.onclick = function () { Spravka.open(); }; });</script>', 1)
    assert s.count('Spravka') == 5, 'разметка ЭлектроЩита изменилась — проверьте вставку кнопок'
    open(p, 'w', encoding='utf8').write(s)
patchweb.patch(src, web, dst)
