// ДомоПлан Обмер — ядро: разбор фраз, геометрия, расчёт объёмов.
(function (root) {
  'use strict';
  var UNITS = {ноль:0,нуль:0,один:1,одна:1,одно:1,раз:1,два:2,две:2,три:3,четыре:4,пять:5,шесть:6,семь:7,восемь:8,девять:9};
  var TEENS = {десять:10,одиннадцать:11,двенадцать:12,тринадцать:13,четырнадцать:14,пятнадцать:15,шестнадцать:16,семнадцать:17,восемнадцать:18,девятнадцать:19};
  var TENS = {двадцать:20,тридцать:30,сорок:40,пятьдесят:50,шестьдесят:60,семьдесят:70,восемьдесят:80,девяносто:90};
  var HUND = {сто:100,двести:200,триста:300,четыреста:400,пятьсот:500,шестьсот:600,семьсот:700,восемьсот:800,девятьсот:900};
  var THOUS = {тысяча:1,тысячи:1,тысяч:1};

  function norm(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е')
      .replace(/(\d)\s*[,.]\s*(\d)/g, '$1#$2')       // десятичная запятая
      .replace(/(\d)\s*(мм|см|м)\b/g, '$1 $2')
      .replace(/[^a-zа-я0-9#\s-]/g, ' ').replace(/-/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function tokens(s) { var n = norm(s); return n ? n.split(' ') : []; }

  function numInfo(w) {
    if (/^\d+#\d+$/.test(w)) return {v: parseFloat(w.replace('#', '.')), r: 0, dec: true};
    if (/^\d+$/.test(w)) return {v: parseInt(w, 10), r: 0, dig: true};
    if (w in UNITS) return {v: UNITS[w], r: 1};
    if (w in TEENS) return {v: TEENS[w], r: 1.5};
    if (w in TENS) return {v: TENS[w], r: 2};
    if (w in HUND) return {v: HUND[w], r: 3};
    if (w in THOUS) return {v: 1000, r: 4, th: true};
    return null;
  }
  function unitWord(w) {
    if (/^(м|метр|метра|метров)$/.test(w)) return 'm';
    if (/^(см|сантиметр|сантиметра|сантиметров)$/.test(w)) return 'cm';
    if (/^(мм|миллиметр|миллиметра|миллиметров)$/.test(w)) return 'mm';
    return null;
  }
  // Читает подряд идущие числа начиная с i. Возвращает {groups:[...], unit, next}
  function readNumber(tk, i) {
    var groups = [], cur = null, unit = null;
    for (; i < tk.length; i++) {
      var w = tk[i], u = unitWord(w);
      if (u) { unit = unit || u; continue; }
      var n = numInfo(w);
      if (!n) break;
      if (n.r === 0) { if (cur) groups.push(cur); cur = {v: n.v, last: 9, dec: n.dec}; continue; }
      if (n.th) { if (!cur) cur = {v: 1, last: 0}; cur.v *= 1000; cur.last = 4; continue; }
      var cont = cur && !cur.dec && cur.last !== 9 && (
        (cur.last === 4 && n.r < 4) || (cur.last === 3 && n.r < 3) || (cur.last === 2 && n.r === 1));
      if (cont) { cur.v += n.v; cur.last = n.r; }
      else { if (cur) groups.push(cur); cur = {v: n.v, last: n.r}; }
    }
    if (cur) groups.push(cur);
    return {groups: groups, unit: unit, next: i};
  }
  // Группы чисел -> метры
  function toMeters(groups, unit) {
    if (!groups.length) return null;
    var g = groups.map(function (x) { return x.v; });
    if (groups.length === 1) {
      var v = g[0];
      if (unit === 'm' || groups[0].dec) return v;
      if (unit === 'cm') return v / 100;
      if (unit === 'mm') return v / 1000;
      if (v < 10) return v;
      if (v < 1000) return v / 100;
      return v / 1000;
    }
    var m = g[0], rest = g.slice(1);
    if (rest.length === 2 && rest[0] === 0) return m + rest[1] / 100;   // «три ноль пять»
    var r = rest[0];
    if (unit === 'mm' || r >= 100) return m + r / 1000;
    return m + r / 100;
  }
  function round3(x) { return Math.round(x * 1000) / 1000; }

  var OPEN = {окно:'window',окна:'window',дверь:'door',двери:'door',проем:'opening',проема:'opening',арка:'opening',ниша:'niche',ниши:'niche',короб:'box',выступ:'box',колонна:'box',пилон:'box'};
  var ITEMS = {радиатор:'radiator',батарея:'radiator',стояк:'riser',щиток:'panel',щит:'panel',розетка:'socket',выключатель:'switch',вентиляция:'vent',вытяжка:'vent',труба:'pipe',счетчик:'meter',котел:'boiler'};
  var FIELD = {отступ:'offset',слева:'offset',ширина:'width',шириной:'width',высота:'height',высотой:'height',подоконник:'sill',низ:'sill',откос:'reveal',откосы:'reveal',глубина:'depth',глубиной:'depth',толщина:'reveal'};
  var POS = ['offset', 'width', 'height', 'sill', 'reveal'];

  function parseFields(tk, start, posOrder) {
    var out = {}, field = null, pos = 0, i = start, extra = [];
    while (i < tk.length) {
      var w = tk[i];
      if (w === 'от' && (tk[i + 1] === 'угла' || tk[i + 1] === 'края')) { field = 'offset'; i += 2; continue; }
      if (w in FIELD) { field = FIELD[w]; i++; continue; }
      if (w === 'в' || w === 'на') {          // «в коридор»
        var rest = []; i++;
        while (i < tk.length && !(tk[i] in FIELD) && !numInfo(tk[i])) { rest.push(tk[i]); i++; }
        if (rest.length) out.to = rest.join(' ');
        continue;
      }
      if (numInfo(w)) {
        var r = readNumber(tk, i);
        if (field) { out[field] = round3(toMeters(r.groups, r.unit)); field = null; }
        else {
          // без ключевых слов — каждая группа отдельное значение по порядку
          r.groups.forEach(function (g) { while (pos < posOrder.length && out[posOrder[pos]] != null) pos++; if (pos < posOrder.length) out[posOrder[pos++]] = round3(toMeters([g], r.unit)); });
        }
        i = r.next; continue;
      }
      extra.push(w); i++;
    }
    if (extra.length) out.note = extra.join(' ');
    return out;
  }

  var TYPE_RU = {window:'окно',door:'дверь',opening:'проём',niche:'ниша',box:'короб',radiator:'радиатор',riser:'стояк',panel:'щиток',socket:'розетка',switch:'выключатель',vent:'вентиляция',pipe:'труба',meter:'счётчик',boiler:'котёл'};
  function fmt(m) { return m == null ? '—' : (Math.round(m * 100) / 100).toFixed(2).replace('.', ','); }
  function say(m) { // для озвучки: 3.42 -> «3 42»
    if (m == null) return '';
    var cm = Math.round(m * 100), a = Math.floor(cm / 100), b = cm % 100;
    return a ? (b ? a + ' ' + (b < 10 ? '0' + b : b) : a + ' метра') : b + ' сантиметров';
  }

  // Разбор одной фразы -> команда
  function parse(text) {
    var tk = tokens(text);
    if (!tk.length) return {cmd: 'none'};
    var s = tk.join(' ');
    var S = ' ' + s + ' ';
    function starts(list) { return list.some(function (w) { return (s + ' ').indexOf(w + ' ') === 0; }); }
    function has(list) { return list.some(function (w) { return S.indexOf(' ' + w + ' ') >= 0; }); }
    if (starts(['отмена', 'отменить', 'отмени', 'удали', 'удалить', 'назад'])) return {cmd: 'undo'};
    if (starts(['повтори', 'повторить', 'что записано'])) return {cmd: 'repeat'};
    if (starts(['готово', 'следующая комната', 'следующее помещение', 'закончить комнату', 'комната готова'])) return {cmd: 'done'};
    if (starts(['заметка', 'примечание', 'комментарий'])) return {cmd: 'note', text: s.replace(/^\S+\s*/, '')};
    if (has(['внутренний угол', 'угол внутренний', 'внутренний'])) return {cmd: 'turn', turn: -90};
    if (has(['наружный угол', 'угол наружный', 'обычный угол', 'прямой угол'])) return {cmd: 'turn', turn: 90};
    var head = tk[0];
    if (head === 'работа' || head === 'работы' || head === 'сделать' || head === 'нужно' || head === 'надо' || head === 'добавь' || head === 'работу') {
      var rest = tk.slice(1); if (rest[0] === 'сделать' || rest[0] === 'нужно') rest = rest.slice(1);
      var words = [], q = null;
      for (var wi = 0; wi < rest.length; wi++) {
        if (numInfo(rest[wi])) { var rq = readNumber(rest, wi); q = rq.groups.length === 1 ? rq.groups[0].v : toMeters(rq.groups, rq.unit); wi = rq.next - 1; continue; }
        if (/^(штук|штуки|шт|точек|точки|точка|штука|метров|метра|метр|квадратов|квадрата|квадрат|м2|кубов)$/.test(rest[wi])) continue;
        words.push(rest[wi]);
      }
      if (!words.length) return {cmd: 'error', msg: 'Скажите, какая работа: «работа покраска стен»'};
      return {cmd: 'work', text: words.join(' '), qty: q};
    }
    if (head === 'комната' || head === 'помещение') {
      var num = null, name = [], i = 1;
      if (tk[1] === 'номер') i = 2;
      if (i < tk.length && numInfo(tk[i])) { var r = readNumber(tk, i); num = r.groups[0].v; i = r.next; }
      for (; i < tk.length; i++) name.push(tk[i]);
      return {cmd: 'room', number: num, name: name.join(' ')};
    }
    if (head === 'угол') {
      var ra = readNumber(tk, 1);
      if (ra.groups.length) return {cmd: 'turn', turn: 180 - ra.groups[0].v};
      return {cmd: 'error', msg: 'Скажите «угол сто тридцать пять» или «внутренний угол»'};
    }
    if (head === 'высота' || head === 'потолок') {
      var rh = readNumber(tk, 1); var hv = toMeters(rh.groups, rh.unit);
      return hv ? {cmd: 'height', value: round3(hv)} : {cmd: 'error', msg: 'Не расслышал высоту'};
    }
    if (head === 'стена') {
      var j = 1; if (tk[1] === 'номер') { j = 2; var rn = readNumber(tk, 2); if (rn.groups.length > 1) { j = rn.next; } }
      var rw = readNumber(tk, j); var lv = toMeters(rw.groups, rw.unit);
      var turn = null;
      var tail = tk.slice(rw.next).join(' ');
      if (/внутренн/.test(tail)) turn = -90;
      return lv ? {cmd: 'wall', length: round3(lv), turn: turn} : {cmd: 'error', msg: 'Не расслышал длину стены'};
    }
    if (head === 'диагональ') {
      var rd = readNumber(tk, 1), from = 1, to = 3;
      // «диагональ один три пять двадцать» — если групп >= 3, первые две — углы
      var gs = rd.groups;
      if (gs.length >= 3 && gs[0].v < 10 && gs[1].v < 10) { from = gs[0].v; to = gs[1].v; gs = gs.slice(2); }
      var dv = toMeters(gs, rd.unit);
      return dv ? {cmd: 'diag', from: from, to: to, length: round3(dv)} : {cmd: 'error', msg: 'Не расслышал диагональ'};
    }
    if (head in OPEN) {
      var t0 = OPEN[head];
      var f = parseFields(tk, 1, (t0 === 'niche' || t0 === 'box') ? ['offset', 'width', 'depth', 'height'] : t0 === 'window' ? POS : ['offset', 'width', 'height', 'reveal']);
      f.type = OPEN[head];
      return {cmd: 'opening', item: f};
    }
    if (head in ITEMS) {
      var fi = parseFields(tk, 1, ['offset', 'width', 'height']);
      fi.type = ITEMS[head];
      return {cmd: 'item', item: fi};
    }
    // просто число — считаем следующей стеной
    if (numInfo(head)) { var rr = readNumber(tk, 0); var v = toMeters(rr.groups, rr.unit); if (v) return {cmd: 'wall', length: round3(v), turn: null}; }
    return {cmd: 'error', msg: 'Не понял: «' + text + '»'};
  }

  // ---------- Модель ----------
  function newProject(name) {
    return {format: 'domoplan-obmer', version: 1, units: 'm', name: name || 'Объект', created: new Date().toISOString(), rooms: []};
  }
  function newRoom(p, number, name) {
    var n = number || (p.rooms.length ? Math.max.apply(null, p.rooms.map(function (r) { return r.number || 0; })) + 1 : 1);
    var prevH = p.rooms.length ? p.rooms[p.rooms.length - 1].height : null;
    var r = {id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), number: n, name: name || ('Комната ' + n), height: prevH, walls: [], diagonals: [], notes: [], works: []};
    p.rooms.push(r);
    return r;
  }

  // Применяет команду к проекту. Возвращает {ok, msg, speak}
  function apply(p, st, c) {
    var room = p.rooms[st.room];
    function needRoom() { if (!room) { room = newRoom(p); st.room = p.rooms.length - 1; } return room; }
    function lastWall() { return room && room.walls[room.walls.length - 1]; }
    switch (c.cmd) {
      case 'room':
        var r = newRoom(p, c.number, c.name ? c.name.charAt(0).toUpperCase() + c.name.slice(1) : null);
        st.room = p.rooms.length - 1;
        return {ok: true, msg: 'Новое помещение №' + r.number + ': ' + r.name, speak: 'Комната ' + r.number + (c.name ? ', ' + c.name : '')};
      case 'height':
        needRoom().height = c.value;
        return {ok: true, msg: 'Высота ' + fmt(c.value) + ' м', speak: 'Высота ' + say(c.value)};
      case 'wall':
        needRoom();
        if (c.turn != null && lastWall()) lastWall().turn = c.turn;
        room.walls.push({length: c.length, turn: 90, openings: [], items: []});
        return {ok: true, msg: 'Стена ' + room.walls.length + ': ' + fmt(c.length) + ' м', speak: 'Стена ' + room.walls.length + ', ' + say(c.length)};
      case 'turn':
        if (!lastWall()) return {ok: false, msg: 'Сначала продиктуйте стену'};
        lastWall().turn = c.turn;
        return {ok: true, msg: 'Угол после стены ' + room.walls.length + ': ' + (c.turn === -90 ? 'внутренний' : c.turn === 90 ? 'обычный 90°' : (180 - c.turn) + '°'), speak: c.turn === -90 ? 'внутренний угол' : 'угол ' + (180 - c.turn)};
      case 'opening':
      case 'item':
        if (!lastWall()) return {ok: false, msg: 'Сначала продиктуйте стену, на которой это находится'};
        var it = c.item, w = lastWall();
        (c.cmd === 'opening' ? w.openings : w.items).push(it);
        var parts = [];
        if (it.offset != null) parts.push('отступ ' + fmt(it.offset));
        if (it.width != null) parts.push('ширина ' + fmt(it.width));
        if (it.height != null) parts.push('высота ' + fmt(it.height));
        if (it.sill != null) parts.push('подоконник ' + fmt(it.sill));
        if (it.reveal != null) parts.push('откос ' + fmt(it.reveal));
        if (it.depth != null) parts.push('глубина ' + fmt(it.depth));
        if (it.to) parts.push('в ' + it.to);
        var warn = '';
        if (c.cmd === 'opening' && (it.type === 'window' || it.type === 'door' || it.type === 'opening') && (it.width == null || it.height == null)) warn = ' (не хватает ширины или высоты)';
        return {ok: true, msg: TYPE_RU[it.type] + ' на стене ' + room.walls.length + ': ' + parts.join(', ') + warn, speak: TYPE_RU[it.type] + (warn ? ', не хватает размеров' : ', записал')};
      case 'diag':
        needRoom().diagonals = [{from: c.from, to: c.to, length: c.length}];
        return {ok: true, msg: 'Диагональ ' + c.from + '–' + c.to + ': ' + fmt(c.length) + ' м', speak: 'Диагональ ' + say(c.length)};
      case 'work':
        needRoom(); room.works = room.works || [];
        var WK = (typeof ObmerWorks !== 'undefined') ? ObmerWorks : (root.ObmerWorks || null);
        var m = WK ? WK.match(c.text, 5) : [];
        var wk = {said: c.text};
        if (m.length) { wk.id = m[0].id; wk.name = m[0].name; wk.base = m[0].base; wk.unit = m[0].unit; wk.alts = m.slice(1).map(function (x) { return x.id; }); }
        else { wk.name = c.text; wk.base = 'manual'; }
        if (c.qty != null) wk.qty = c.qty;
        room.works.push(wk);
        return {ok: true, msg: 'Работа: ' + wk.name + (c.qty != null ? ', ' + c.qty : '') + (m.length ? '' : ' (нет в каталоге сметы)'), speak: 'Работа, ' + wk.name};
      case 'note':
        needRoom().notes.push(c.text);
        return {ok: true, msg: 'Заметка: ' + c.text, speak: 'Заметка записана'};
      case 'done':
        var g = geometry(needRoom());
        return {ok: true, msg: 'Помещение готово. ' + closureText(g), speak: g.closed ? 'Комната сошлась' : closureText(g)};
      case 'error':
        return {ok: false, msg: c.msg, speak: c.msg};
    }
    return {ok: false, msg: 'Пустая команда'};
  }
  function closureText(g) {
    if (g.walls < 3) return 'Мало стен для контура.';
    if (g.byDiag) return 'Форма построена по диагонали.';
    return g.gap <= 0.02 ? 'Контур сошёлся (невязка ' + Math.round(g.gap * 1000) + ' мм).' : 'Контур не сходится на ' + Math.round(g.gap * 100) + ' см — перемерьте стену или снимите диагональ.';
  }

  // ---------- Геометрия ----------
  function circleIntersect(p0, r0, p1, r1, side) {
    var dx = p1.x - p0.x, dy = p1.y - p0.y, d = Math.hypot(dx, dy);
    if (d < 1e-9 || d > r0 + r1 + 1e-6 || d < Math.abs(r0 - r1) - 1e-6) return null;
    var a = (r0 * r0 - r1 * r1 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r0 * r0 - a * a));
    var mx = p0.x + a * dx / d, my = p0.y + a * dy / d;
    // side=+1: справа от направления p0->p1 (экранные координаты, y вниз)
    return {x: mx - side * h * dy / d, y: my + side * h * dx / d};
  }
  function geometry(room) {
    var W = room.walls, pts = [{x: 0, y: 0}], ang = 0, byDiag = false;
    if (W.length === 4 && room.diagonals && room.diagonals[0] && room.diagonals[0].from === 1 && room.diagonals[0].to === 3) {
      var dg = room.diagonals[0].length, P1 = {x: 0, y: 0}, P2 = {x: W[0].length, y: 0};
      var P3 = circleIntersect(P1, dg, P2, W[1].length, 1);
      var P4 = P3 && circleIntersect(P3, W[2].length, P1, W[3].length, -1);
      if (P3 && P4) { pts = [P1, P2, P3, P4, P1]; byDiag = true; }
    }
    if (!byDiag) {
      for (var i = 0; i < W.length; i++) {
        var p = pts[pts.length - 1];
        pts.push({x: p.x + W[i].length * Math.cos(ang), y: p.y + W[i].length * Math.sin(ang)});
        ang += (W[i].turn == null ? 90 : W[i].turn) * Math.PI / 180;
      }
    }
    var last = pts[pts.length - 1], gap = Math.hypot(last.x, last.y);
    var poly = pts.slice(0, Math.max(pts.length - 1, 1));
    var area = 0;
    for (var k = 0; k < poly.length; k++) { var a = poly[k], b = poly[(k + 1) % poly.length]; area += a.x * b.y - b.x * a.y; }
    area = Math.abs(area) / 2;
    return {pts: pts, gap: gap, closed: W.length >= 3 && (byDiag || gap <= 0.02), area: W.length >= 3 ? area : 0, walls: W.length, byDiag: byDiag};
  }

  // ---------- Объёмы ----------
  function calc(room) {
    var g = geometry(room), h = room.height || 0, per = 0, open = 0, revL = 0, revA = 0, sills = 0, sillL = 0, doorW = 0, nWin = 0, nDoor = 0, nOpen = 0, extraWall = 0;
    room.walls.forEach(function (w) {
      per += w.length;
      w.openings.forEach(function (o) {
        var ow = o.width || 0, oh = o.height || 0;
        if (o.type === 'window' || o.type === 'door' || o.type === 'opening') {
          open += ow * oh;
          var lin = 2 * oh + ow; // без низа
          if (o.reveal) { revL += lin; revA += lin * o.reveal; }
          if (o.type === 'window') { nWin++; sills++; sillL += ow; }
          else { doorW += ow; if (o.type === 'door') nDoor++; else nOpen++; }
        } else if (o.type === 'niche' || o.type === 'box') {
          extraWall += 2 * (o.depth || 0) * (o.height || h);
        }
      });
    });
    var gross = per * h;
    return {
      floor: g.area, ceiling: g.area, perimeter: per, height: h, volume: g.area * h,
      wallsGross: gross, openings: open, wallsNet: Math.max(0, gross - open + extraWall),
      revealLen: revL, revealArea: revA, plinth: Math.max(0, per - doorW),
      windows: nWin, doors: nDoor, passages: nOpen, sills: sills, sillLen: sillL, geom: g
    };
  }
  function totals(p) {
    var t = {floor: 0, perimeter: 0, volume: 0, wallsNet: 0, openings: 0, revealLen: 0, revealArea: 0, plinth: 0, windows: 0, doors: 0, passages: 0, sillLen: 0};
    p.rooms.forEach(function (r) { var c = calc(r); for (var k in t) t[k] += c[k]; });
    return t;
  }

  function workQty(w, c) {
    if (w.qty != null) return w.qty;
    var WK = (typeof ObmerWorks !== 'undefined') ? ObmerWorks : null;
    return WK ? WK.qty(w.base, c) : null;
  }
  // ---------- CSV (Excel, ; и запятая) ----------
  function csv(p) {
    var rows = [['Помещение', 'Элемент', 'Стена', 'Длина/ширина, м', 'Высота, м', 'Отступ, м', 'Подоконник, м', 'Откос/глубина, м', 'Примечание']];
    function n(x) { return x == null ? '' : String(round3(x)).replace('.', ','); }
    p.rooms.forEach(function (r) {
      var c = calc(r), nm = r.number + '. ' + r.name;
      rows.push([nm, 'Высота помещения', '', '', n(r.height), '', '', '', '']);
      r.walls.forEach(function (w, i) {
        rows.push([nm, 'Стена', i + 1, n(w.length), n(r.height), '', '', '', w.turn === 90 ? '' : (w.turn === -90 ? 'внутренний угол после стены' : 'угол ' + (180 - w.turn) + '°')]);
        w.openings.concat(w.items).forEach(function (o) {
          rows.push([nm, TYPE_RU[o.type], i + 1, n(o.width), n(o.height), n(o.offset), n(o.sill), n(o.reveal != null ? o.reveal : o.depth), [o.to ? 'в ' + o.to : '', o.note || ''].join(' ').trim()]);
        });
      });
      (r.diagonals || []).forEach(function (d) { rows.push([nm, 'Диагональ ' + d.from + '–' + d.to, '', n(d.length), '', '', '', '', '']); });
      r.notes.forEach(function (t) { rows.push([nm, 'Заметка', '', '', '', '', '', '', t]); });
      (r.works || []).forEach(function (w) { var q = workQty(w, c); rows.push([nm, 'Работа: ' + w.name, '', n(q), '', '', '', '', (w.unit || '') + (w.id ? ' · ' + w.id : ' · нет в каталоге')]); });
      rows.push([nm, 'ИТОГО: пол ' + n(c.floor) + ' м²; периметр ' + n(c.perimeter) + ' м; стены без проёмов ' + n(c.wallsNet) + ' м²; откосы ' + n(c.revealLen) + ' п.м / ' + n(c.revealArea) + ' м²; плинтус ' + n(c.plinth) + ' м; объём ' + n(c.volume) + ' м³', '', '', '', '', '', '', '']);
    });
    return '﻿' + rows.map(function (r) { return r.map(function (x) { x = String(x); return /[;"\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(';'); }).join('\r\n');
  }

  var api = {workQty: workQty, parse: parse, apply: apply, geometry: geometry, calc: calc, totals: totals, csv: csv, newProject: newProject, newRoom: newRoom, fmt: fmt, TYPE_RU: TYPE_RU, toMeters: toMeters, readNumber: readNumber, tokens: tokens, closureText: closureText};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Obmer = api;
})(this);
