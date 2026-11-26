# Справочник электрика

Расчёты, интерактивные схемы, краткие нормы (ПУЭ, ДБН, ДСТУ), электроника и чек-листы. Русский и украинский, работает без интернета.

Один и тот же код работает в трёх местах:
- **телефон и браузер** — `site/spravka/` (GitHub Pages, ставится на главный экран, офлайн);
- **Windows-программа** — `win/` (Go + WebView2, как ЭлектроЩит);
- **ЭлектроЩит** — кнопка «📘 Справочник» на экране проектов и в редакторе, справочник открывается поверх щита.

## Исходники
- `src/core.js` — формулы и таблицы (ПУЭ табл. 1.3.4–1.3.7, поправки, петля, падение напряжения, электроника); проверка: `node src/test.js`.
- `src/calcs.js` — калькуляторы: поля ввода и вывод.
- `src/circuits.js` — интерактивные схемы и небольшой «симулятор» соединений.
- `src/content.js` — нормы, обозначения, чек-листы.
- `src/ui.js`, `src/style.css` — интерфейс (`Spravka.mount`, `Spravka.open`).

## Сборка
```
python3 spravka/build.py                      # site/spravka/ и dist/spravka.js, dist/spravka.css, dist/index.html
cp spravka/dist/index.html spravka/win/web/   # затем в spravka/win:
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "-H windowsgui -s -w" -o "Справочник электрика.exe" .
python3 spravka/tools/shchit.py ЭлектроЩит.exe ЭлектроЩит-новый.exe   # нужен pefile
```
