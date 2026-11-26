// Справочник электрика: интерфейс. Spravka.mount(элемент, {embedded, hash, onClose})
var Spravka = (function () {
  'use strict';
  var C = SPC, LANGKEY = 'spr.lang', VKEY = 'spr.v.', CKEY = 'spr.chk.';
  var lang = 'ru';
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  try { lang = store(LANGKEY) || ((navigator.language || '').indexOf('uk') === 0 ? 'uk' : 'ru'); } catch (e) { }
  function t(x) { if (x == null) return ''; if (typeof x === 'string' || typeof x === 'number') return String(x); if (Array.isArray(x)) return x.length > 1 && lang === 'uk' ? x[1] : x[0]; return x[lang] || x.ru || ''; }
  function h(tag, a, kids) {
    var e = document.createElement(tag);
    if (a) for (var k in a) { var v = a[k]; if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v); }
    (kids || []).forEach(function (c) { if (c == null || c === false) return; e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))); });
    return e;
  }
  var TABS = [
    { id: 'calc', icon: '🧮', name: ['Расчёты', 'Розрахунки'] },
    { id: 'circ', icon: '〰', name: ['Схемы', 'Схеми'] },
    { id: 'norm', icon: '📘', name: ['Нормы', 'Норми'] },
    { id: 'ee', icon: '🔧', name: ['Электроника', 'Електроніка'] },
    { id: 'chk', icon: '✅', name: ['Чек-листы', 'Чек-листи'] }
  ];

  function mount(root, opt) {
    opt = opt || {};
    root.classList.add('spr');
    if (opt.embedded) { root.classList.add('spr-embedded'); root.classList.add('spr-light'); }
    var state = { tab: 'calc', item: null, q: '' };
    var main, nav, side, searchIn, title;

    function shell() {
      root.innerHTML = '';
      searchIn = h('input', { class: 'spr-search', type: 'search', placeholder: t(['Поиск: кабель, УЗО, ванная…', 'Пошук: кабель, ПЗВ, ванна…']), oninput: function () { state.q = searchIn.value.trim(); state.item = null; render(); } });
      title = h('div', { class: 'spr-title' }, [h('b', {}, [t(['Справочник электрика', 'Довідник електрика'])]), h('span', {}, [t(['нормы Украины · без интернета', 'норми України · без інтернету'])])]);
      var langBtn = h('button', { class: 'spr-lang', title: 'Мова / Язык', onclick: function () { lang = lang === 'ru' ? 'uk' : 'ru'; store(LANGKEY, lang); shell(); render(); } }, [lang === 'ru' ? 'УКР' : 'РУС']);
      var head = h('header', { class: 'spr-head' }, [h('div', { class: 'spr-logo' }, ['⚡']), title, searchIn, langBtn, opt.onClose ? h('button', { class: 'spr-close', title: t(['Закрыть', 'Закрити']), onclick: opt.onClose }, ['✕']) : null]);
      side = h('nav', { class: 'spr-side' }); nav = h('nav', { class: 'spr-nav' });
      TABS.forEach(function (tb) {
        [side, nav].forEach(function (n) { n.appendChild(h('button', { 'data-tab': tb.id, onclick: function () { go(tb.id, null); } }, [h('span', { class: 'i' }, [tb.icon]), h('span', { class: 'n' }, [t(tb.name)])])); });
      });
      main = h('main', { class: 'spr-main' });
      root.appendChild(head); root.appendChild(h('div', { class: 'spr-body' }, [side, main])); root.appendChild(nav);
    }
    function go(tab, item, noHist) {
      state.tab = tab; state.item = item; state.q = ''; if (searchIn) searchIn.value = '';
      if (opt.hash && !noHist) { var hs = '#/' + tab + (item ? '/' + item : ''); if (location.hash !== hs) history.pushState(null, '', hs); }
      render(); main.scrollTop = 0; try { window.scrollTo(0, 0); } catch (e) { }
    }
    function fromHash() { var m = (location.hash || '').match(/^#\/(\w+)(?:\/([\w-]+))?/); if (m && TABS.some(function (x) { return x.id === m[1]; })) { state.tab = m[1]; state.item = m[2] || null; } else { state.tab = 'calc'; state.item = null; } render(); }
    function render() {
      [side, nav].forEach(function (n) { Array.prototype.forEach.call(n.children, function (b) { b.classList.toggle('on', b.dataset.tab === state.tab && !state.q); }); });
      main.innerHTML = '';
      if (state.q) return renderSearch();
      var tab = state.tab, it = state.item;
      if (tab === 'calc') return it ? renderCalc(find(SPCalcs.el, it)) : renderList(SPCalcs.el, 'calc', t(['Расчёты', 'Розрахунки']));
      if (tab === 'ee') return it === 'symbols' ? renderSymbols() : it ? (find(SPCalcs.ee, it).custom === 'rcolor' ? renderRColor(find(SPCalcs.ee, it)) : renderCalc(find(SPCalcs.ee, it))) : renderList(SPCalcs.ee.concat([{ id: 'symbols', icon: '⊕', title: ['Условные обозначения', 'Умовні позначення'], sub: ['Элементы схем по ДСТУ / IEC', 'Елементи схем за ДСТУ / IEC'] }]), 'ee', t(['Электроника', 'Електроніка']));
      if (tab === 'circ') return it ? renderCirc(find(SPCirc.list, it)) : renderList(SPCirc.list, 'circ', t(['Интерактивные схемы', 'Інтерактивні схеми']), t(['Нажимайте на выключатели и кнопки — схема покажет, где есть напряжение', 'Натискайте на вимикачі та кнопки — схема покаже, де є напруга']));
      if (tab === 'norm') return it ? renderNorm(find(SPContent.norms, it)) : renderList(SPContent.norms, 'norm', t(['Краткие нормы', 'Короткі норми']), t(['ПУЭ, ДБН, ДСТУ — самое нужное на объекте', 'ПУЕ, ДБН, ДСТУ — найпотрібніше на об’єкті']));
      if (tab === 'chk') return it ? renderCheck(find(SPContent.checks, it)) : renderList(SPContent.checks, 'chk', t(['Чек-листы', 'Чек-листи']), t(['Отметки сохраняются на этом устройстве', 'Позначки зберігаються на цьому пристрої']));
    }
    function find(arr, id) { return arr.find(function (x) { return x.id === id; }) || arr[0]; }
    function back(tab) { return h('button', { class: 'spr-back', onclick: function () { go(tab, null); } }, ['‹ ' + t(['Назад', 'Назад'])]); }
    function pageHead(tab, item) { return h('div', { class: 'spr-phead' }, [back(tab), h('h1', {}, [h('span', { class: 'spr-pico' }, [item.icon || '〰']), t(item.title)]), item.sub ? h('p', { class: 'spr-psub' }, [t(item.sub)]) : null]); }

    function renderList(items, tab, head, sub) {
      main.appendChild(h('div', { class: 'spr-lhead' }, [h('h1', {}, [head]), sub ? h('p', {}, [sub]) : null]));
      var g = h('div', { class: 'spr-grid' });
      items.forEach(function (it, i) {
        g.appendChild(h('button', { class: 'spr-card', onclick: function () { go(tab, it.id); } }, [h('span', { class: 'spr-cico' }, [it.icon || String(i + 1)]), h('span', { class: 'spr-ctx' }, [h('b', {}, [t(it.title)]), it.sub || it.note ? h('small', {}, [t(it.sub || (it.note && it.note[0]))]) : null]), h('span', { class: 'spr-arr' }, ['›'])]));
      });
      main.appendChild(g);
    }

    // ---------- калькулятор ----------
    function renderCalc(cd) {
      main.appendChild(pageHead(state.tab, cd));
      var v = {}, saved = null;
      try { saved = JSON.parse(store(VKEY + cd.id) || 'null'); } catch (e) { }
      cd.inputs.forEach(function (inp) { v[inp.k] = saved && saved[inp.k] !== undefined ? saved[inp.k] : (Array.isArray(inp.def) ? JSON.parse(JSON.stringify(inp.def)) : inp.def); });
      var form = h('div', { class: 'spr-form' }), out = h('div', { class: 'spr-out' });
      var wrap = h('div', { class: 'spr-calc' }, [form, out]);
      main.appendChild(wrap);
      var fields = [];
      function num(x) { if (x === '' || x == null) return null; var n = parseFloat(String(x).replace(',', '.').replace(/\s/g, '')); return isFinite(n) ? n : null; }
      function build() {
        form.innerHTML = ''; fields = [];
        cd.inputs.forEach(function (inp) {
          var row = h('div', { class: 'spr-field' }); fields.push([inp, row]); form.appendChild(row);
          if (inp.label) row.appendChild(h('label', {}, [t(inp.label)]));
          if (inp.type === 'seg') {
            var sg = h('div', { class: 'spr-seg' });
            inp.opts.forEach(function (o) { sg.appendChild(h('button', { class: String(v[inp.k]) === String(o[0]) ? 'on' : '', onclick: function () { v[inp.k] = o[0]; if (cd.fix) cd.fix(v, inp.k); build(); calc(); } }, [t(o[1])])); });
            row.appendChild(sg);
          } else if (inp.type === 'sel') {
            var s = h('select', { class: 'spr-in', onchange: function () { var o = inp.opts[s.selectedIndex]; v[inp.k] = o[0]; if (cd.fix) { cd.fix(v, inp.k); build(); } calc(); } });
            inp.opts.forEach(function (o) { var op = h('option', {}, [t(o[1])]); if (String(o[0]) === String(v[inp.k])) op.selected = true; s.appendChild(op); });
            row.appendChild(s);
          } else if (inp.type === 'list') {
            row.appendChild(listEditor(inp));
          } else {
            var box = h('div', { class: 'spr-inbox' });
            var ip = h('input', { class: 'spr-in', type: inp.type === 'text' ? 'text' : 'text', inputmode: inp.type === 'text' ? 'text' : 'decimal', value: v[inp.k] == null ? '' : String(v[inp.k]).replace('.', ','), oninput: function () { v[inp.k] = inp.type === 'text' ? ip.value : num(ip.value); calc(); } });
            box.appendChild(ip); if (inp.unit) box.appendChild(h('span', { class: 'spr-unit' }, [t(inp.unit)]));
            row.appendChild(box);
          }
          if (inp.hint) row.appendChild(h('small', { class: 'spr-hint' }, [t(inp.hint)]));
        });
        vis();
      }
      function vis() { fields.forEach(function (f) { f[1].style.display = f[0].show && !f[0].show(v) ? 'none' : ''; }); }
      function listEditor(inp) {
        var box = h('div', { class: 'spr-list' });
        function draw() {
          box.innerHTML = '';
          box.appendChild(h('div', { class: 'spr-lrow spr-lh' }, [h('span', {}, [t(['Прибор', 'Прилад'])]), h('span', {}, [t(['Вт', 'Вт'])]), h('span', {}, [t(['ч/сут', 'год/доб'])]), h('span', {}, [t(['шт', 'шт'])]), h('span')]));
          v[inp.k].forEach(function (r, i) {
            var cell = function (key, w) { var e = h('input', { class: 'spr-in', inputmode: key === 'n' ? 'text' : 'decimal', value: key === 'n' ? t(r.n) : String(r[key]).replace('.', ','), oninput: function () { r[key] = key === 'n' ? e.value : (num(e.value) || 0); calc(); } }); return e; };
            box.appendChild(h('div', { class: 'spr-lrow' }, [cell('n'), cell('w'), cell('h'), cell('c'), h('button', { class: 'spr-x', title: t(['Удалить', 'Видалити']), onclick: function () { v[inp.k].splice(i, 1); draw(); calc(); } }, ['✕'])]));
          });
          var sel = h('select', { class: 'spr-in', onchange: function () { var p = inp.presets[sel.selectedIndex - 1]; if (p) v[inp.k].push({ n: t(p[0]), w: p[1], h: p[2], c: 1 }); else if (sel.selectedIndex === inp.presets.length + 1) v[inp.k].push({ n: t(['Прибор', 'Прилад']), w: 100, h: 1, c: 1 }); draw(); calc(); } });
          sel.appendChild(h('option', {}, ['＋ ' + t(['Добавить прибор…', 'Додати прилад…'])]));
          inp.presets.forEach(function (p) { sel.appendChild(h('option', {}, [t(p[0]) + ' — ' + p[1] + ' Вт'])); });
          sel.appendChild(h('option', {}, [t(['Свой прибор', 'Свій прилад'])]));
          box.appendChild(sel);
        }
        draw(); return box;
      }
      function calc() {
        vis();
        try { store(VKEY + cd.id, JSON.stringify(v)); } catch (e) { }
        out.innerHTML = '';
        var bad = cd.inputs.some(function (inp) { return (inp.type === 'num') && !inp.empty && (!inp.show || inp.show(v)) && (v[inp.k] == null || isNaN(v[inp.k])); });
        if (bad) { out.appendChild(h('div', { class: 'spr-empty' }, [t(['Заполните поля', 'Заповніть поля'])])); return; }
        var r; try { r = cd.run(v, t); } catch (e) { out.appendChild(h('div', { class: 'spr-empty' }, [t(['Проверьте введённые значения', 'Перевірте введені значення'])])); return; }
        var res = h('div', { class: 'spr-res' });
        (r.res || []).forEach(function (x) { res.appendChild(h('div', { class: 'spr-rrow ' + (x[2] || '') }, [h('span', {}, [t(x[0])]), h('b', {}, [t(x[1])])])); });
        out.appendChild(res);
        (r.warn || []).forEach(function (w) { out.appendChild(h('div', { class: 'spr-warn' }, ['⚠ ' + t(Array.isArray(w[0]) ? w[0] : w)])); });
        if (r.table) out.appendChild(table(r.table));
        (r.notes || []).forEach(function (n) { out.appendChild(h('p', { class: 'spr-note' }, [t(n)])); });
      }
      build(); calc();
      main.appendChild(h('button', { class: 'spr-reset', onclick: function () { try { localStorage.removeItem(VKEY + cd.id); } catch (e) { } go(state.tab, cd.id, true); } }, ['↺ ' + t(['Значения по умолчанию', 'Значення за замовчуванням'])]));
    }
    function table(tb) {
      var tbl = h('table', { class: 'spr-tbl' });
      tbl.appendChild(h('thead', {}, [h('tr', {}, tb.head.map(function (x) { return h('th', {}, [t(x)]); }))]));
      var body = h('tbody');
      tb.rows.forEach(function (r) { var cells = r.c || r; body.appendChild(h('tr', { class: (r.hl ? 'hl ' : '') + (r.dim ? 'dim' : '') }, cells.map(function (x) { return h('td', {}, [t(x)]); }))); });
      tbl.appendChild(body);
      return h('div', { class: 'spr-tblw' }, [tbl]);
    }

    // ---------- цветовая маркировка ----------
    function renderRColor(cd) {
      main.appendChild(pageHead('ee', cd));
      var n = 4, bands = { 4: ['yellow', 'violet', 'red', 'gold'], 5: ['brown', 'black', 'black', 'brown', 'brown'], 6: ['brown', 'black', 'black', 'brown', 'brown', 'brown'] };
      var box = h('div', { class: 'spr-calc' }); main.appendChild(box);
      var nm = { black: ['чёрный', 'чорний'], brown: ['коричневый', 'коричневий'], red: ['красный', 'червоний'], orange: ['оранжевый', 'помаранчевий'], yellow: ['жёлтый', 'жовтий'], green: ['зелёный', 'зелений'], blue: ['синий', 'синій'], violet: ['фиолетовый', 'фіолетовий'], grey: ['серый', 'сірий'], white: ['белый', 'білий'], gold: ['золотой', 'золотий'], silver: ['серебристый', 'сріблястий'] };
      function opts(i) {
        var dig = n === 4 ? 2 : 3;
        if (i < dig) return C.COLORS.slice(i === 0 ? 1 : 0, 10);
        if (i === dig) return C.COLORS.slice();
        if (i === dig + 1) return ['brown', 'red', 'green', 'blue', 'violet', 'grey', 'gold', 'silver'];
        return ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey'];
      }
      function role(i) { var dig = n === 4 ? 2 : 3; return i < dig ? t(['цифра', 'цифра']) + ' ' + (i + 1) : i === dig ? t(['множитель', 'множник']) : i === dig + 1 ? t(['допуск', 'допуск']) : 'ТКС'; }
      function draw() {
        box.innerHTML = '';
        var sg = h('div', { class: 'spr-seg' }); [4, 5, 6].forEach(function (k) { sg.appendChild(h('button', { class: n === k ? 'on' : '', onclick: function () { n = k; draw(); } }, [k + ' ' + t(['полос', 'смуг'])])); });
        box.appendChild(h('div', { class: 'spr-form' }, [sg]));
        var b = bands[n];
        var svg = '<svg viewBox="0 0 300 80" class="spr-resistor"><line x1="0" y1="40" x2="300" y2="40" stroke="#9aa" stroke-width="5"/><rect x="55" y="14" width="190" height="52" rx="22" fill="#e8d3a6" stroke="#b39a6a"/>';
        b.forEach(function (c, i) { var x = n === 4 ? [85, 115, 145, 205][i] : n === 5 ? [80, 105, 130, 155, 210][i] : [78, 100, 122, 144, 190, 222][i]; svg += '<rect x="' + x + '" y="14" width="13" height="52" fill="' + C.HEX[c] + '" stroke="rgba(0,0,0,.15)"/>'; });
        box.appendChild(h('div', { class: 'spr-rsvg', html: svg + '</svg>' }));
        var f = h('div', { class: 'spr-form' });
        b.forEach(function (c, i) {
          var row = h('div', { class: 'spr-field' }, [h('label', {}, [role(i)])]);
          var sw = h('div', { class: 'spr-swatches' });
          opts(i).forEach(function (col) { sw.appendChild(h('button', { class: 'spr-sw' + (col === c ? ' on' : ''), style: 'background:' + C.HEX[col], title: t(nm[col]), onclick: function () { b[i] = col; draw(); } })); });
          row.appendChild(sw); f.appendChild(row);
        });
        box.appendChild(f);
        var r = C.resColor(b), out = h('div', { class: 'spr-out' });
        if (r) out.appendChild(h('div', { class: 'spr-res' }, [h('div', { class: 'spr-rrow big' }, [h('span', {}, [t(['Сопротивление', 'Опір'])]), h('b', {}, [C.fmtOhm(r.r)])]), h('div', { class: 'spr-rrow' }, [h('span', {}, [t(['Допуск', 'Допуск'])]), h('b', {}, ['±' + C.fmt(r.tol) + ' %'])]), r.tcr ? h('div', { class: 'spr-rrow' }, [h('span', {}, ['ТКС']), h('b', {}, [r.tcr + ' ppm/°C'])]) : null]));
        out.appendChild(h('p', { class: 'spr-note' }, [t(['Читайте от полосы, которая ближе к краю. Золотая или серебряная полоса (допуск) всегда последняя.', 'Читайте від смуги, яка ближче до краю. Золота або срібна смуга (допуск) завжди остання.'])]));
        box.appendChild(out);
      }
      draw();
    }
    function renderSymbols() {
      main.appendChild(pageHead('ee', { icon: '⊕', title: ['Условные обозначения', 'Умовні позначення'], sub: ['Основные элементы электрических схем и планов', 'Основні елементи електричних схем і планів'] }));
      var g = h('div', { class: 'spr-syms' });
      SPContent.sym.forEach(function (s) { g.appendChild(h('div', { class: 'spr-sym' }, [h('div', { class: 'spr-symg', html: '<svg viewBox="0 -2 60 44" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">' + s[2] + '</svg>' }), h('span', {}, [t(s[1])])])); });
      main.appendChild(g);
      main.appendChild(h('p', { class: 'spr-note' }, [t(['Обозначения по ДСТУ EN 60617 (IEC 60617). На старых схемах встречаются обозначения ГОСТ 2.7xx — они в основном совпадают.', 'Позначення за ДСТУ EN 60617 (IEC 60617). На старих схемах трапляються позначення ГОСТ 2.7xx — вони здебільшого збігаються.'])]));
    }

    // ---------- схема ----------
    function renderCirc(d) {
      main.appendChild(pageHead('circ', d));
      var box = h('div', { class: 'spr-circbox' }), info = h('div', { class: 'spr-cinfo' });
      main.appendChild(box); main.appendChild(info);
      function onInfo(list) { info.innerHTML = ''; list.forEach(function (x) { info.appendChild(h('div', { class: 'spr-msg ' + x[0] }, [x[1]])); }); }
      var ctl = d.custom ? d.render(box, t, onInfo) : SPCirc.render(box, d, t, onInfo);
      main.appendChild(h('div', { class: 'spr-legend' }, [['L', '#8d5524', ['фаза', 'фаза']], ['N', '#1e6fd9', ['ноль', 'нуль']], ['PE', 'linear-gradient(90deg,#2e9e44 50%,#f2c200 50%)', ['защитный', 'захисний']]].map(function (x) { return h('span', {}, [h('i', { style: 'background:' + x[1] }), x[0] + ' — ' + t(x[2])]); }).concat([h('span', {}, [h('i', { class: 'dead' }), t(['бледный — без напряжения', 'блідий — без напруги'])])])));
      main.appendChild(h('button', { class: 'spr-reset', onclick: function () { ctl.reset(); } }, ['↺ ' + t(['Сбросить схему', 'Скинути схему'])]));
      (d.note || []).forEach(function (n) { main.appendChild(h('p', { class: 'spr-note' }, [t(n)])); });
    }

    // ---------- нормы ----------
    function renderNorm(a) {
      main.appendChild(pageHead('norm', a));
      var art = h('article', { class: 'spr-art' });
      a.body.forEach(function (b) {
        if (b[0] === 'p') art.appendChild(h('p', {}, [t(b[1])]));
        else if (b[0] === 'w') art.appendChild(h('div', { class: 'spr-warn' }, ['⚠ ' + t(b[1])]));
        else if (b[0] === 'src') art.appendChild(h('p', { class: 'spr-src' }, [t(b[1])]));
        else if (b[0] === 'l') art.appendChild(h('ul', {}, b[1].map(function (x) { return h('li', {}, [t(x)]); })));
        else if (b[0] === 't') art.appendChild(table(b[1]));
        else if (b[0] === 'colors') art.appendChild(colorsBlock());
        else if (b[0] === 'zones') art.appendChild(zonesBlock());
        else if (b[0] === 'earth') art.appendChild(earthBlock());
      });
      main.appendChild(art);
    }
    function colorsBlock() {
      var rows = [['L1', '#8d5524', ['коричневый', 'коричневий']], ['L2', '#262626', ['чёрный', 'чорний']], ['L3', '#8c8c8c', ['серый', 'сірий']], ['N', '#1e6fd9', ['синий (голубой)', 'синій (блакитний)']], ['PE', 'repeating-linear-gradient(135deg,#2e9e44 0 8px,#f2c200 8px 16px)', ['жёлто-зелёный', 'жовто-зелений']], ['PEN', 'repeating-linear-gradient(135deg,#2e9e44 0 8px,#f2c200 8px 16px)', ['жёлто-зелёный + синие метки', 'жовто-зелений + сині мітки']]];
      return h('div', { class: 'spr-wires' }, rows.map(function (r) { return h('div', { class: 'spr-wire' }, [h('i', { style: 'background:' + r[1] + (r[0] === 'PEN' ? ';box-shadow:inset 10px 0 0 #1e6fd9,inset -10px 0 0 #1e6fd9' : '') }), h('b', {}, [r[0]]), h('span', {}, [t(r[2])])]); }));
    }
    function zonesBlock() {
      var s = '<svg viewBox="0 0 360 200" class="spr-zones"><rect x="0" y="0" width="360" height="200" fill="none"/>' +
        '<rect x="40" y="20" width="230" height="160" fill="rgba(30,136,229,.07)"/><rect x="100" y="20" width="110" height="160" fill="rgba(30,136,229,.16)"/>' +
        '<path d="M100 150h110v30H100z" fill="rgba(30,136,229,.35)"/><path d="M100 150h110" stroke="#1e6fd9" stroke-width="3"/>' +
        '<line x1="0" y1="20" x2="360" y2="20" stroke="#999" stroke-dasharray="4 4"/><text x="300" y="16" font-size="10" fill="currentColor">2,25 м</text>' +
        '<text x="155" y="170" font-size="12" text-anchor="middle" fill="currentColor" font-weight="700">0</text><text x="155" y="90" font-size="14" text-anchor="middle" fill="currentColor" font-weight="700">1</text>' +
        '<text x="70" y="90" font-size="14" text-anchor="middle" fill="currentColor" font-weight="700">2</text><text x="240" y="90" font-size="14" text-anchor="middle" fill="currentColor" font-weight="700">2</text>' +
        '<text x="315" y="90" font-size="11" text-anchor="middle" fill="currentColor">' + t(['вне зон', 'поза зонами']) + '</text>' +
        '<path d="M40 192h60M210 192h60" stroke="currentColor"/><text x="70" y="200" font-size="9" text-anchor="middle" fill="currentColor">0,6 м</text><text x="240" y="200" font-size="9" text-anchor="middle" fill="currentColor">0,6 м</text>' +
        '<text x="155" y="140" font-size="10" text-anchor="middle" fill="currentColor">' + t(['ванна', 'ванна']) + '</text></svg>';
      return h('div', { class: 'spr-zonesw', html: s });
    }
    function earthBlock() {
      var sys = [['TN-C', 'C'], ['TN-S', 'S'], ['TN-C-S', 'CS'], ['TT', 'T']], g = h('div', { class: 'spr-earth' });
      sys.forEach(function (s) {
        var k = s[1], y = [16, 32, 48], P = '#2e9e44', N = '#1e6fd9', L = '#8d5524';
        var o = '<svg viewBox="0 0 220 90" class="spr-esvg"><rect x="4" y="6" width="34" height="52" rx="5" fill="none" stroke="currentColor"/><text x="21" y="36" font-size="9" text-anchor="middle" fill="currentColor">ТП</text>' +
          '<rect x="170" y="6" width="44" height="52" rx="5" fill="none" stroke="currentColor"/><text x="192" y="36" font-size="9" text-anchor="middle" fill="currentColor">' + t(['дом', 'дім']) + '</text>' +
          '<path d="M38 ' + y[0] + 'H170" stroke="' + L + '" stroke-width="2.5"/>';
        if (k === 'C') o += '<path d="M38 32H170" stroke="' + P + '" stroke-width="3"/><path d="M38 32H170" stroke="' + N + '" stroke-width="1" stroke-dasharray="5 5"/>';
        if (k === 'S') o += '<path d="M38 32H170" stroke="' + N + '" stroke-width="2.5"/><path d="M38 48H170" stroke="' + P + '" stroke-width="2.5"/>';
        if (k === 'CS') o += '<path d="M38 32H130" stroke="' + P + '" stroke-width="3"/><path d="M38 32H130" stroke="' + N + '" stroke-width="1" stroke-dasharray="5 5"/><path d="M130 32H170" stroke="' + N + '" stroke-width="2.5"/><path d="M130 32V48H170" stroke="' + P + '" stroke-width="2.5" fill="none"/><circle cx="130" cy="32" r="3" fill="currentColor"/><path d="M130 48V70" stroke="' + P + '" stroke-width="2"/><path d="M122 70h16M125 75h10M128 80h4" stroke="' + P + '" stroke-width="2"/>';
        if (k === 'T') o += '<path d="M38 32H170" stroke="' + N + '" stroke-width="2.5"/><path d="M192 58V70" stroke="' + P + '" stroke-width="2"/><path d="M184 70h16M187 75h10M190 80h4" stroke="' + P + '" stroke-width="2"/>';
        o += '<path d="M21 58V70" stroke="' + P + '" stroke-width="2"/><path d="M13 70h16M16 75h10M19 80h4" stroke="' + P + '" stroke-width="2"/></svg>';
        g.appendChild(h('div', { class: 'spr-ecard' }, [h('b', {}, [s[0]]), h('div', { html: o })]));
      });
      return g;
    }

    // ---------- чек-листы ----------
    function renderCheck(c) {
      main.appendChild(pageHead('chk', c));
      var done = {}; try { done = JSON.parse(store(CKEY + c.id) || '{}'); } catch (e) { }
      var list = h('div', { class: 'spr-checks' }), prog = h('div', { class: 'spr-prog' });
      function upd() { var n = c.items.filter(function (x, i) { return done[i]; }).length; prog.innerHTML = ''; prog.appendChild(h('div', { class: 'bar' }, [h('i', { style: 'width:' + (n / c.items.length * 100) + '%' })])); prog.appendChild(h('span', {}, [n + ' / ' + c.items.length])); store(CKEY + c.id, JSON.stringify(done)); }
      c.items.forEach(function (it, i) {
        var cb = h('input', { type: 'checkbox', onchange: function () { done[i] = cb.checked; row.classList.toggle('done', cb.checked); upd(); } }); cb.checked = !!done[i];
        var row = h('label', { class: 'spr-check' + (done[i] ? ' done' : '') }, [cb, h('span', {}, [t(it)])]);
        list.appendChild(row);
      });
      main.appendChild(prog); main.appendChild(list);
      main.appendChild(h('button', { class: 'spr-reset', onclick: function () { done = {}; store(CKEY + c.id, '{}'); go('chk', c.id, true); } }, ['↺ ' + t(['Снять все отметки', 'Зняти всі позначки'])]));
      upd();
    }

    // ---------- поиск ----------
    function textOf(x) { return [x.ru || (Array.isArray(x) ? x.join(' ') : x)].join(' '); }
    function flat(o) { var s = ''; (function walk(v) { if (v == null) return; if (typeof v === 'string') s += ' ' + v; else if (Array.isArray(v)) v.forEach(walk); else if (typeof v === 'object') Object.keys(v).forEach(function (k) { if (typeof v[k] !== 'function') walk(v[k]); }); })(o); return s.toLowerCase(); }
    var index = null;
    function buildIndex() {
      index = [];
      SPCalcs.el.forEach(function (x) { index.push(['calc', x, flat([x.title, x.sub, x.inputs.map(function (i) { return i.label; })])]); });
      SPCalcs.ee.forEach(function (x) { index.push(['ee', x, flat([x.title, x.sub])]); });
      index.push(['ee', { id: 'symbols', icon: '⊕', title: ['Условные обозначения', 'Умовні позначення'] }, flat(['обозначения позначення символ схема', SPContent.sym.map(function (s) { return s[1]; })])]);
      SPCirc.list.forEach(function (x) { index.push(['circ', x, flat([x.title, x.note])]); });
      SPContent.norms.forEach(function (x) { index.push(['norm', x, flat([x.title, x.body])]); });
      SPContent.checks.forEach(function (x) { index.push(['chk', x, flat([x.title, x.items])]); });
    }
    function renderSearch() {
      if (!index) buildIndex();
      var words = state.q.toLowerCase().split(/\s+/).filter(Boolean).map(function (w) { return w.replace('ё', 'е'); });
      var hits = index.filter(function (e) { var s = e[2].replace(/ё/g, 'е'); return words.every(function (w) { return s.indexOf(w) >= 0; }); });
      hits.sort(function (a, b) { var ta = flat(a[1].title), tb = flat(b[1].title); return (words.every(function (w) { return tb.indexOf(w) >= 0; }) ? 1 : 0) - (words.every(function (w) { return ta.indexOf(w) >= 0; }) ? 1 : 0); });
      main.appendChild(h('div', { class: 'spr-lhead' }, [h('h1', {}, [t(['Поиск', 'Пошук'])]), h('p', {}, [hits.length ? t(['Найдено', 'Знайдено']) + ': ' + hits.length : t(['Ничего не найдено', 'Нічого не знайдено'])])]));
      var g = h('div', { class: 'spr-grid' });
      hits.forEach(function (e) { var tb = TABS.find(function (x) { return x.id === e[0]; }); g.appendChild(h('button', { class: 'spr-card', onclick: function () { go(e[0], e[1].id); } }, [h('span', { class: 'spr-cico' }, [e[1].icon || tb.icon]), h('span', { class: 'spr-ctx' }, [h('b', {}, [t(e[1].title)]), h('small', {}, [t(tb.name)])]), h('span', { class: 'spr-arr' }, ['›'])])); });
      main.appendChild(g);
    }
    void textOf;

    shell();
    if (opt.hash) { window.addEventListener('popstate', fromHash); fromHash(); } else render();
    return { go: go, root: root };
  }

  // Окно поверх другой программы (ЭлектроЩит)
  var overlay = null;
  function open(where) {
    if (!overlay) {
      overlay = document.createElement('div'); overlay.className = 'spr-overlay'; overlay.tabIndex = -1;
      var inner = document.createElement('div'); overlay.appendChild(inner); document.body.appendChild(overlay);
      overlay._app = mount(inner, { embedded: true, onClose: close });
      // пока справочник открыт, клавиши не доходят до программы под ним (иначе сработают её горячие клавиши)
      var guard = function (e) { if (overlay.style.display === 'none') return; if (e.type === 'keydown' && e.key === 'Escape') close(); e.stopPropagation(); };
      document.addEventListener('keydown', function (e) { if (overlay.style.display !== 'none' && !overlay.contains(e.target)) { guard(e); if (e.key !== 'Escape') e.preventDefault(); } }, true);
      document.addEventListener('keyup', function (e) { if (overlay.style.display !== 'none' && !overlay.contains(e.target)) e.stopPropagation(); }, true);
      overlay.addEventListener('keydown', guard);
      overlay.addEventListener('keyup', function (e) { e.stopPropagation(); });
      overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    }
    overlay.style.display = ''; if (!overlay.contains(document.activeElement)) overlay.focus();
    if (where) overlay._app.go(where[0], where[1] || null);
  }
  function close() { if (overlay) overlay.style.display = 'none'; }
  return { mount: mount, open: open, close: close, t: t };
})();
