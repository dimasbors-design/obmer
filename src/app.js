(function () {
  'use strict';
  var O = window.Obmer, KEY = 'domoplan-obmer-v1';
  var P, st = {room: -1}, undo = [], log = [];
  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && s.p && s.p.format === 'domoplan-obmer') { P = s.p; st.room = Math.min(s.room, P.rooms.length - 1); return; } } catch (e) {}
    P = O.newProject('Объект ' + new Date().toLocaleDateString('ru-RU'));
  }
  function save() { localStorage.setItem(KEY, JSON.stringify({p: P, room: st.room})); }
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  var f = O.fmt;

  // ---------- озвучка ----------
  var ttsOn = localStorage.getItem(KEY + '-tts') !== '0';
  function speak(t) {
    if (!ttsOn || !t || !window.speechSynthesis) return;
    try { speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(t); u.lang = 'ru-RU'; u.rate = 1.1; speechSynthesis.speak(u); } catch (e) {}
  }

  // ---------- выполнение фразы ----------
  function run(text) {
    text = (text || '').trim(); if (!text) return;
    var c = O.parse(text), res;
    if (c.cmd === 'undo') {
      if (!undo.length) res = {ok: false, msg: 'Нечего отменять'};
      else { var u = undo.pop(); P = u.p; st.room = u.room; st.lastOp = null; res = {ok: true, msg: 'Отменено: ' + u.what, speak: 'Отменил'}; }
    } else if (c.cmd === 'repeat') {
      var r = P.rooms[st.room], w = r && r.walls[r.walls.length - 1];
      res = {ok: true, msg: w ? 'Последняя стена ' + r.walls.length + ': ' + f(w.length) + ' м' : 'Пока ничего нет', speak: w ? 'Стена ' + r.walls.length + ', ' + f(w.length) : 'Пока ничего нет'};
    } else {
      var snap = JSON.stringify(P), room = st.room;
      res = O.apply(P, st, c);
      if (res.ok) { undo.push({p: JSON.parse(snap), room: room, what: text}); if (undo.length > 200) undo.shift(); }
    }
    log.unshift({t: text, msg: res.msg, ok: res.ok});
    log = log.slice(0, 30);
    speak(res.speak || res.msg);
    save(); render();
    if (navigator.vibrate) navigator.vibrate(res.ok ? 30 : [60, 60, 60]);
  }

  // ---------- фраза из элемента (для правки) ----------
  function n(x) { return String(Math.round(x * 1000) / 1000).replace('.', ','); }
  function phrase(o) {
    var s = O.TYPE_RU[o.type] === 'проём' ? 'проем' : O.TYPE_RU[o.type];
    if (o.offset != null) s += ' отступ ' + n(o.offset);
    if (o.width != null) s += ' ширина ' + n(o.width);
    if (o.height != null) s += ' высота ' + n(o.height);
    if (o.sill != null) s += ' подоконник ' + n(o.sill);
    if (o.reveal != null) s += ' откос ' + n(o.reveal);
    if (o.depth != null) s += ' глубина ' + n(o.depth);
    if (o.to) s += ' в ' + o.to;
    return s;
  }
  function mutate(what, fn) { undo.push({p: JSON.parse(JSON.stringify(P)), room: st.room, what: what}); fn(); save(); render(); }

  // ---------- выбор работы ----------
  var CATMAP = {}, modalCtx = null;
  OBMER_CATALOG.forEach(function (w) { CATMAP[w[0]] = w; });
  ObmerWorks.init(OBMER_CATALOG);
  function openWork(room, i) {
    modalCtx = {room: room, i: i};
    var w = room.works[i], c = O.calc(room), auto = ObmerWorks.qty(w.base, c);
    var h = '<div class="mbox"><b>' + esc(w.name) + '</b><div class="said">Сказано: «' + esc(w.said) + '»</div>';
    h += '<div class="mlabel">Количество (' + esc(w.unit || '') + '). Пусто — считать по помещению' + (w.base && w.base !== 'manual' ? ' (' + ObmerWorks.BASE_RU[w.base] + ': ' + f(auto) + ')' : '') + '</div><div class="row"><input id="wq" inputmode="decimal" value="' + (w.qty != null ? String(w.qty).replace('.', ',') : '') + '"><button class="send" data-act="wqty">OK</button></div>';
    h += '<div class="mlabel">Другая работа из каталога сметы:</div><input id="ws" placeholder="поиск: покраска стен, ламинат…" value="' + esc(w.said) + '"><div id="wres"></div><button class="mclose" data-act="wclose">Закрыть</button></div>';
    $('#modal').innerHTML = h; $('#modal').classList.add('open');
    function list() {
      var q = $('#ws').value, r = ObmerWorks.match(q, 12);
      var ids = (w.alts || []).filter(function (x) { return CATMAP[x]; });
      var seen = {}, items = [];
      (q === w.said ? ids.map(function (x) { return {id: x}; }) : []).concat(r).forEach(function (x) { if (!seen[x.id] && x.id !== w.id) { seen[x.id] = 1; items.push(CATMAP[x.id]); } });
      $('#wres').innerHTML = items.map(function (e) { return '<button class="wopt" data-act="wpick" data-id="' + esc(e[0]) + '">' + esc(e[3]) + ' <span>' + esc(e[2]) + ' · ' + ObmerWorks.BASE_RU[e[1]] + '</span></button>'; }).join('') || '<div class="said">Ничего не найдено</div>';
    }
    $('#ws').addEventListener('input', list); list();
  }
  function closeModal() { $('#modal').classList.remove('open'); $('#modal').innerHTML = ''; modalCtx = null; }

  // ---------- чертёж ----------
  function sketch(room, big) {
    var c = O.calc(room), g = c.geom, pts = g.pts;
    if (!room.walls.length) return '<div class="empty">Скажите «стена три сорок» — схема появится здесь</div>';
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs), miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
    var pad = big ? 0.9 : 0.6, w = Math.max(maxx - minx, 1) + 2 * pad, h = Math.max(maxy - miny, 1) + 2 * pad;
    var fs = Math.max(w, h) / (big ? 38 : 22), sw = Math.max(w, h) / (big ? 120 : 70);
    var s = '<svg viewBox="' + (minx - pad) + ' ' + (miny - pad) + ' ' + w + ' ' + h + '" class="sk">';
    // заливка пола
    if (g.walls >= 3) s += '<polygon points="' + pts.slice(0, -1).map(function (p) { return p.x + ',' + p.y; }).join(' ') + '" fill="#eef4fb"/>';
    room.walls.forEach(function (wl, i) {
      var a = pts[i], b = pts[i + 1]; if (!b) return;
      var dx = (b.x - a.x) / (wl.length || 1), dy = (b.y - a.y) / (wl.length || 1), nx = -dy, ny = dx; // nx,ny — внутрь
      s += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="#333" stroke-width="' + sw * 2 + '" stroke-linecap="square"/>';
      wl.openings.forEach(function (o) {
        if (o.offset == null || o.width == null) return;
        var p1 = {x: a.x + dx * o.offset, y: a.y + dy * o.offset}, p2 = {x: a.x + dx * (o.offset + o.width), y: a.y + dy * (o.offset + o.width)};
        var col = {window: '#2b7de9', door: '#b5651d', opening: '#999', niche: '#8a5', box: '#a58'}[o.type] || '#666';
        if (o.type === 'niche' || o.type === 'box') {
          var d = (o.depth || 0.2) * (o.type === 'niche' ? -1 : 1);
          s += '<polyline points="' + p1.x + ',' + p1.y + ' ' + (p1.x + nx * d) + ',' + (p1.y + ny * d) + ' ' + (p2.x + nx * d) + ',' + (p2.y + ny * d) + ' ' + p2.x + ',' + p2.y + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '"/>';
        } else {
          s += '<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '" stroke="#fff" stroke-width="' + sw * 2.6 + '"/>';
          s += '<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '" stroke="' + col + '" stroke-width="' + sw * 1.6 + '"' + (o.type === 'opening' ? ' stroke-dasharray="' + sw * 2 + '"' : '') + '/>';
          if (o.type === 'door') s += '<path d="M' + p1.x + ',' + p1.y + ' L' + (p1.x + nx * o.width) + ',' + (p1.y + ny * o.width) + ' A' + o.width + ',' + o.width + ' 0 0 ' + (1) + ' ' + p2.x + ',' + p2.y + '" fill="none" stroke="' + col + '" stroke-width="' + sw * 0.6 + '"/>';
          if (big) { var mx = (p1.x + p2.x) / 2 + nx * fs * 1.2, my = (p1.y + p2.y) / 2 + ny * fs * 1.2; s += '<text x="' + mx + '" y="' + my + '" font-size="' + fs * 0.8 + '" fill="' + col + '" text-anchor="middle" dominant-baseline="middle">' + f(o.width) + '×' + f(o.height) + '</text>'; }
        }
      });
      var mx2 = (a.x + b.x) / 2 - nx * fs * 1.1, my2 = (a.y + b.y) / 2 - ny * fs * 1.1;
      s += '<text x="' + mx2 + '" y="' + my2 + '" font-size="' + fs + '" text-anchor="middle" dominant-baseline="middle" fill="#111">' + f(wl.length) + '</text>';
      var cx = (a.x + b.x) / 2 + nx * fs * 1.2, cy = (a.y + b.y) / 2 + ny * fs * 1.2;
      if (!big || !wl.openings.length) s += '<text x="' + cx + '" y="' + cy + '" font-size="' + fs * 0.75 + '" text-anchor="middle" dominant-baseline="middle" fill="#c33">' + (i + 1) + '</text>';
    });
    if (!g.closed && g.walls >= 3) { var L = pts[pts.length - 1]; s += '<line x1="' + L.x + '" y1="' + L.y + '" x2="0" y2="0" stroke="#e33" stroke-width="' + sw + '" stroke-dasharray="' + sw * 3 + '"/>'; }
    s += '<circle cx="0" cy="0" r="' + sw * 2.5 + '" fill="#e33"/>';
    return s + '</svg>';
  }

  function totalsTable(c) {
    function row(a, b, u) { return '<tr><td>' + a + '</td><td class="num">' + b + '</td><td>' + u + '</td></tr>'; }
    return '<table class="tot">' +
      row('Пол / потолок', f(c.floor), 'м²') + row('Периметр', f(c.perimeter), 'м') + row('Высота', f(c.height), 'м') +
      row('Стены за вычетом проёмов', f(c.wallsNet), 'м²') + row('Проёмы', f(c.openings), 'м²') +
      row('Откосы', f(c.revealLen) + ' п.м / ' + f(c.revealArea), 'м²') + row('Плинтус', f(c.plinth), 'м') +
      row('Окна / двери / проёмы', c.windows + ' / ' + c.doors + ' / ' + c.passages, 'шт') + row('Подоконники', f(c.sillLen), 'м') + row('Объём', f(c.volume), 'м³') + '</table>';
  }

  // ---------- отрисовка ----------
  function render() {
    $('#pname').value = P.name;
    $('#rooms').innerHTML = P.rooms.map(function (r, i) { return '<button class="tab' + (i === st.room ? ' on' : '') + '" data-room="' + i + '">' + r.number + '. ' + esc(r.name) + '</button>'; }).join('') + '<button class="tab add" data-act="addroom">+ помещение</button>';
    var room = P.rooms[st.room];
    var L = $('#list');
    if (!room) { L.innerHTML = '<div class="empty">Начните с фразы «комната один кухня»</div>'; $('#sk').innerHTML = ''; $('#tot').innerHTML = ''; }
    else {
      var c = O.calc(room), h = '';
      h += '<div class="rhead"><b>' + room.number + '. ' + esc(room.name) + '</b> <button class="mini" data-act="rename">переименовать</button> <button class="mini" data-act="delroom">удалить</button>' +
        '<div class="hrow" data-act="height">Высота: <b>' + f(room.height) + '</b> м</div></div>';
      room.walls.forEach(function (w, i) {
        h += '<div class="wall' + (st.curWall === i + 1 ? ' cur' : '') + '"><div class="wrow" data-act="wall" data-i="' + i + '"><span class="wn">Стена ' + (i + 1) + '</span><b>' + f(w.length) + '</b> м' + (room.autoRect && i >= 2 ? ' <span class="tag auto">как стена ' + (i - 1) + '</span>' : '') + (w.turn !== 90 ? ' <span class="tag">' + (w.turn === -90 ? 'внутр. угол' : 'угол ' + (180 - w.turn) + '°') + '</span>' : '') + '<button class="x" data-act="delwall" data-i="' + i + '">×</button></div>';
        w.openings.concat(w.items).forEach(function (o, k) {
          var isO = k < w.openings.length, kk = isO ? k : k - w.openings.length;
          var parts = [];
          if (o.offset != null) parts.push('от угла ' + f(o.offset));
          if (o.width != null) parts.push(f(o.width) + (o.height != null ? '×' + f(o.height) : ''));
          else if (o.height != null) parts.push('выс. ' + f(o.height));
          if (o.sill != null) parts.push('подок. ' + f(o.sill));
          if (o.reveal != null) parts.push('откос ' + f(o.reveal));
          if (o.depth != null) parts.push('глуб. ' + f(o.depth));
          if (o.to) parts.push('→ ' + esc(o.to));
          if (o.note) parts.push(esc(o.note));
          h += '<div class="orow t-' + o.type + '" data-act="op" data-i="' + i + '" data-k="' + kk + '" data-o="' + (isO ? 1 : 0) + '"><span class="wn">' + O.TYPE_RU[o.type] + '</span>' + parts.join(', ') + '<button class="x" data-act="delop" data-i="' + i + '" data-k="' + kk + '" data-o="' + (isO ? 1 : 0) + '">×</button></div>';
        });
        h += '</div>';
      });
      (room.diagonals || []).forEach(function (d) { h += '<div class="orow">Диагональ ' + d.from + '–' + d.to + ': <b>' + f(d.length) + '</b> м<button class="x" data-act="deldiag">×</button></div>'; });
      room.notes.forEach(function (t, i) { h += '<div class="orow t-note">' + esc(t) + '<button class="x" data-act="delnote" data-i="' + i + '">×</button></div>'; });
      if ((room.works || []).length) {
        h += '<div class="whead">Работы в помещении</div>';
        room.works.forEach(function (w, i) {
          var q = O.workQty(w, c);
          h += '<div class="orow t-work" data-act="work" data-i="' + i + '"><span class="wtxt">' + esc(w.name) + (w.id ? '' : ' <span class="tag">нет в каталоге</span>') + '</span><span class="num"><b>' + (q == null ? '?' : f(q)) + '</b> ' + esc(w.unit || '') + '</span><button class="x" data-act="delwork" data-i="' + i + '">×</button></div>';
        });
      }
      var g = c.geom;
      h += '<div class="closure ' + (g.walls < 3 ? '' : g.closed ? 'ok' : 'bad') + '">' + O.closureText(g) + '</div>';
      L.innerHTML = h;
      $('#sk').innerHTML = sketch(room, document.body.classList.contains('pc'));
      $('#tot').innerHTML = totalsTable(c);
    }
    $('#log').innerHTML = log.slice(0, 6).map(function (e) { return '<div class="' + (e.ok ? 'ok' : 'bad') + '"><span class="heard">«' + esc(e.t) + '»</span> ' + esc(e.msg) + '</div>'; }).join('');
    $('#tts').textContent = ttsOn ? '🔊' : '🔇';
    renderAll();
  }
  function worksAll() {
    var agg = {}, order = [];
    P.rooms.forEach(function (r) { var c = O.calc(r); (r.works || []).forEach(function (w) { var k = w.id || w.name; if (!agg[k]) { agg[k] = {name: w.name, unit: w.unit || '', q: 0, rooms: []}; order.push(k); } var q = O.workQty(w, c); agg[k].q += q || 0; agg[k].rooms.push(r.number); }); });
    if (!order.length) return '';
    return '<h3>Работы по объекту</h3><table class="alltab"><tr><th>Работа</th><th>Кол-во</th><th>Ед.</th><th>Помещения</th></tr>' + order.map(function (k) { var x = agg[k]; return '<tr><td>' + esc(x.name) + '</td><td class="num">' + f(x.q) + '</td><td>' + esc(x.unit) + '</td><td>' + x.rooms.join(', ') + '</td></tr>'; }).join('') + '</table>';
  }
  function renderAll() {
    var t = O.totals(P);
    var rows = P.rooms.map(function (r) { var c = O.calc(r); return '<tr><td>' + r.number + '. ' + esc(r.name) + '</td><td class="num">' + f(c.floor) + '</td><td class="num">' + f(c.perimeter) + '</td><td class="num">' + f(c.height) + '</td><td class="num">' + f(c.wallsNet) + '</td><td class="num">' + f(c.revealLen) + '</td><td class="num">' + f(c.plinth) + '</td><td class="num">' + c.windows + '/' + c.doors + '</td><td class="num">' + f(c.volume) + '</td></tr>'; }).join('');
    $('#all').innerHTML = '<table class="alltab"><tr><th>Помещение</th><th>Пол, м²</th><th>Периметр, м</th><th>Высота, м</th><th>Стены, м²</th><th>Откосы, п.м</th><th>Плинтус, м</th><th>Окна/двери</th><th>Объём, м³</th></tr>' + rows +
      '<tr class="sum"><td>Всего</td><td class="num">' + f(t.floor) + '</td><td class="num">' + f(t.perimeter) + '</td><td></td><td class="num">' + f(t.wallsNet) + '</td><td class="num">' + f(t.revealLen) + '</td><td class="num">' + f(t.plinth) + '</td><td class="num">' + t.windows + '/' + t.doors + '</td><td class="num">' + f(t.volume) + '</td></tr></table>' + worksAll();
  }

  // ---------- клики ----------
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act],[data-room],[data-say]'); if (!b) return;
    if (b.dataset.room != null) { st.room = +b.dataset.room; save(); render(); return; }
    if (b.dataset.say != null) { var inp = $('#cmd'); inp.value = b.dataset.say; inp.focus(); return; }
    var room = P.rooms[st.room], i = +b.dataset.i, k = +b.dataset.k, a = b.dataset.act;
    e.stopPropagation();
    if (a === 'addroom') { var nm = prompt('Название помещения', 'Комната ' + (P.rooms.length + 1)); if (nm != null) run('комната ' + nm); }
    else if (a === 'rename') { var v = prompt('Название', room.name); if (v) mutate('переименование', function () { room.name = v; }); }
    else if (a === 'delroom') { if (confirm('Удалить помещение «' + room.name + '»?')) mutate('удаление помещения', function () { P.rooms.splice(st.room, 1); st.room = Math.min(st.room, P.rooms.length - 1); }); }
    else if (a === 'height') { var hv = prompt('Высота, м', room.height ? n(room.height) : ''); if (hv != null) { var c = O.parse('высота ' + hv); if (c.cmd === 'height') mutate('высота', function () { room.height = c.value; }); } }
    else if (a === 'wall') { var w = room.walls[i]; var lv = prompt('Стена ' + (i + 1) + ': длина в метрах. Угол после стены: «внутренний», «прямой» или «угол 135»', n(w.length)); if (lv != null) { var t = lv.trim().toLowerCase(), ct = O.parse(/^\d/.test(t) ? 'стена ' + t : t); if (ct.cmd === 'turn') mutate('угол', function () { w.turn = ct.turn; }); else { var cw = O.parse('стена ' + t); if (cw.cmd === 'wall') mutate('стена', function () { w.length = cw.length; }); else alert('Не понял'); } } }
    else if (a === 'op') { var arr = b.dataset.o === '1' ? room.walls[i].openings : room.walls[i].items, o = arr[k]; var ph = prompt('Исправьте фразу', phrase(o)); if (ph) { var co = O.parse(ph); if (co.cmd === 'opening' || co.cmd === 'item') mutate('правка', function () { arr[k] = co.item; }); else alert(co.msg || 'Не понял'); } }
    else if (a === 'delwall') { if (confirm('Удалить стену ' + (i + 1) + ' со всеми проёмами?')) mutate('удаление стены', function () { room.walls.splice(i, 1); }); }
    else if (a === 'delop') { mutate('удаление', function () { (b.dataset.o === '1' ? room.walls[i].openings : room.walls[i].items).splice(k, 1); }); }
    else if (a === 'deldiag') mutate('диагональ', function () { room.diagonals = []; });
    else if (a === 'delwork') mutate('работа', function () { room.works.splice(i, 1); });
    else if (a === 'work') openWork(room, i);
    else if (a === 'wpick') { var wk = modalCtx.room.works[modalCtx.i], e2 = CATMAP[b.dataset.id]; mutate('работа', function () { var old = wk.id; wk.id = e2[0]; wk.base = e2[1]; wk.unit = e2[2]; wk.name = e2[3]; wk.alts = (wk.alts || []).filter(function (x) { return x !== e2[0]; }); if (old) wk.alts.unshift(old); }); closeModal(); }
    else if (a === 'wclose') closeModal();
    else if (a === 'wqty') { var wk2 = modalCtx.room.works[modalCtx.i], qv = $('#wq').value.trim().replace(',', '.'); mutate('количество', function () { if (qv === '') delete wk2.qty; else wk2.qty = parseFloat(qv); }); closeModal(); }
    else if (a === 'delnote') mutate('заметка', function () { room.notes.splice(i, 1); });
    else if (a === 'undo') run('отмена');
    else if (a === 'send') { run($('#cmd').value); $('#cmd').value = ''; }
    else if (a === 'tts') { ttsOn = !ttsOn; localStorage.setItem(KEY + '-tts', ttsOn ? '1' : '0'); render(); }
    else if (a === 'view') { document.body.classList.toggle('pc'); render(); }
    else if (a === 'menu') $('#menu').classList.toggle('open');
    else if (a === 'new') { if (confirm('Начать новый объект? Текущий сначала сохраните файлом.')) { undo.push({p: P, room: st.room, what: 'новый объект'}); P = O.newProject(prompt('Название объекта', 'Объект') || 'Объект'); st.room = -1; log = []; save(); render(); } }
    else if (a === 'json') exportFile(JSON.stringify(P, null, 1), fname('json'), 'application/json');
    else if (a === 'csv') exportFile(O.csv(P), fname('csv'), 'text/csv');
    else if (a === 'print') { document.body.classList.add('printing'); buildPrint(); setTimeout(function () { window.print(); }, 100); }
    else if (a === 'open') $('#file').click();
    else if (a === 'help') $('#help').classList.toggle('open');
    if (a !== 'menu' && a !== 'help') $('#menu').classList.remove('open');
  });
  window.addEventListener('afterprint', function () { document.body.classList.remove('printing'); });
  function fname(ext) { return (P.name || 'obmer').replace(/[\\/:*?"<>|]+/g, '_') + '.' + (ext === 'json' ? 'obmer.json' : ext); }
  function exportFile(text, name, type) {
    var blob = new Blob([text], {type: type});
    try {
      var file = new File([blob], name, {type: type});
      if (navigator.canShare && navigator.canShare({files: [file]}) && /iphone|ipad|android/i.test(navigator.userAgent)) { navigator.share({files: [file], title: name}).catch(function () {}); return; }
    } catch (e) {}
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  $('#file').addEventListener('change', function () {
    var fl = this.files[0]; if (!fl) return;
    var rd = new FileReader();
    rd.onload = function () { try { var p = JSON.parse(rd.result); if (p.format !== 'domoplan-obmer') throw 0; undo.push({p: P, room: st.room, what: 'открытие файла'}); P = p; st.room = P.rooms.length ? 0 : -1; save(); render(); } catch (e) { alert('Это не файл обмера'); } };
    rd.readAsText(fl); this.value = '';
  });
  $('#pname').addEventListener('change', function () { P.name = this.value || 'Объект'; save(); });
  $('#cmd').addEventListener('keydown', function (e) { if (e.key === 'Enter') { run(this.value); this.value = ''; } });

  function buildPrint() {
    var t = O.totals(P), h = '<h1>Обмерный план: ' + esc(P.name) + '</h1><p>' + new Date(P.created).toLocaleDateString('ru-RU') + '</p>' + $('#all').innerHTML;
    P.rooms.forEach(function (r) {
      var c = O.calc(r);
      h += '<div class="proom"><h2>' + r.number + '. ' + esc(r.name) + '</h2><div class="pgrid"><div class="psk">' + sketch(r, true) + '</div><div>' + totalsTable(c) + '</div></div>';
      h += '<table class="alltab"><tr><th>Стена</th><th>Длина</th><th>Элемент</th><th>Отступ</th><th>Ширина</th><th>Высота</th><th>Подоконник</th><th>Откос/глуб.</th><th>Примечание</th></tr>';
      r.walls.forEach(function (w, i) {
        h += '<tr><td>' + (i + 1) + '</td><td class="num">' + f(w.length) + '</td><td>' + (w.turn !== 90 ? (w.turn === -90 ? 'внутр. угол' : 'угол ' + (180 - w.turn) + '°') : '') + '</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
        w.openings.concat(w.items).forEach(function (o) { h += '<tr><td></td><td></td><td>' + O.TYPE_RU[o.type] + '</td><td class="num">' + f(o.offset) + '</td><td class="num">' + f(o.width) + '</td><td class="num">' + f(o.height) + '</td><td class="num">' + f(o.sill) + '</td><td class="num">' + f(o.reveal != null ? o.reveal : o.depth) + '</td><td>' + esc([o.to ? '→ ' + o.to : '', o.note || ''].join(' ')) + '</td></tr>'; });
      });
      h += '</table>';
      if ((r.works || []).length) h += '<table class="alltab"><tr><th>Работа</th><th>Кол-во</th><th>Ед.</th></tr>' + r.works.map(function (w) { return '<tr><td>' + esc(w.name) + '</td><td class="num">' + f(O.workQty(w, c)) + '</td><td>' + esc(w.unit || '') + '</td></tr>'; }).join('') + '</table>';
      h += (r.notes.length ? '<p>Заметки: ' + r.notes.map(esc).join('; ') + '</p>' : '') + '</div>';
    });
    $('#print').innerHTML = h;
  }

  // ---------- голос ----------
  // Два движка: «без интернета» (Vosk, модель в телефоне) и «через интернет» (распознавание браузера).
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var canOffline = /^https?:/.test(location.protocol) && !!(window.AudioContext || window.webkitAudioContext) && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  // по умолчанию — распознавание браузера (в Safari оно точнее); без связи само переключается на офлайн
  var engine = localStorage.getItem(KEY + '-engine2') || (SR ? 'online' : 'offline');
  if (engine === 'offline' && !canOffline) engine = 'online';
  var MODEL_URL = new URL('model/vosk-model-small-ru.tar.gz', location.href).href;
  var wantMic = false, rec = null, vModel = null, vRec = null, vCtx = null, vStream = null, vNode = null;
  function busySpeaking() { return window.speechSynthesis && speechSynthesis.speaking; }
  function micState(on) { $('#mic').classList.toggle('on', on); $('#mic').textContent = on ? '■ Стоп' : '🎤 Говорить'; }
  function status(t) { $('#interim').textContent = t || ''; }
  function setEngineLabel() { var b = $('#engine'); if (b) b.textContent = engine === 'offline' ? '🎙 Голос: без интернета (сменить)' : '🎙 Голос: через интернет (сменить)'; }
  function loadScript(src) { return new Promise(function (ok, bad) { if (window.Vosk) return ok(); var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { bad(new Error('нет файла ' + src)); }; document.head.appendChild(s); }); }

  // Словарь для офлайн-распознавания: только нужные слова — так модель путается гораздо меньше
  var GRAMMAR = null;
  function grammar() {
    if (GRAMMAR) return GRAMMAR;
    var base = ('ноль один одна два две три четыре пять шесть семь восемь девять десять одиннадцать двенадцать тринадцать четырнадцать пятнадцать шестнадцать семнадцать восемнадцать девятнадцать ' +
      'двадцать тридцать сорок пятьдесят шестьдесят семьдесят восемьдесят девяносто сто двести триста четыреста пятьсот шестьсот семьсот восемьсот девятьсот тысяча тысячи тысяч ' +
      'метр метра метров сантиметр сантиметра сантиметров миллиметр миллиметра миллиметров ' +
      'сложная непрямоугольная произвольная комната комнату помещение номер высота потолок стена стену стены стенка стене стенке прямоугольник прямоугольная прямоугольный размер размеры угол внутренний наружный обычный прямой градусов диагональ ' +
      'окно окна окошко дверь двери дверной проем проём арка ниша короб выступ колонна пилон отступ от угла края слева ширина высота подоконник откос откосы глубина толщина в на ' +
      'радиатор батарея стояк щиток щит розетка розетки выключатель вентиляция вытяжка труба счетчик счётчик котел котёл ' +
      'заметка примечание отмена отменить отмени удали назад повтори готово следующая следующее закончить работа работы работу сделать нужно надо штук штуки штука точек точки ' +
      'кухня кухню спальня спальню гостиная гостиную зал коридор прихожая прихожую ванная ванную санузел туалет балкон лоджия кладовая кладовку детская детскую кабинет гардеробная холл тамбур котельная мансарда подвал гараж терраса веранда ' +
      'стен стенам пол пола полу потолка трещина плесень сырость старый старая старые новый новая демонтаж снять').split(' ');
    var set = {};
    base.forEach(function (w) { set[w] = 1; });
    OBMER_CATALOG.forEach(function (e) { e[3].toLowerCase().split(/[^а-яё]+/).forEach(function (w) { if (w.length > 1) { set[w] = 1; set[w.replace(/ё/g, 'е')] = 1; } }); });
    GRAMMAR = JSON.stringify(Object.keys(set).concat(['[unk]']));
    return GRAMMAR;
  }
  function startOffline() {
    var AC = window.AudioContext || window.webkitAudioContext;
    try { vCtx = new AC({sampleRate: 16000}); } catch (e) { vCtx = new AC(); }  // модель обучена на 16 кГц
    vCtx.resume && vCtx.resume();          // создаём в нажатии — требование iPhone
    var ctx = vCtx;
    var pStream = navigator.mediaDevices.getUserMedia({video: false, audio: {echoCancellation: true, noiseSuppression: true, channelCount: 1}});
    var pModel = vModel ? Promise.resolve(vModel) : (status('Загружаю модель речи. Первый раз около 45 МБ, потом без интернета…'), loadScript('vendor/vosk.js').then(function () { return Vosk.createModel(MODEL_URL); }));
    Promise.all([pStream, pModel]).then(function (r) {
      if (!wantMic || ctx !== vCtx) { r[0].getTracks().forEach(function (t) { t.stop(); }); return; }
      vStream = r[0]; vModel = r[1];
      vRec = new vModel.KaldiRecognizer(ctx.sampleRate, grammar());
      vRec.on('result', function (m) { var t = m.result && m.result.text; status(''); if (t && !busySpeaking()) run(t); });
      vRec.on('partialresult', function (m) { var t = m.result && m.result.partial; if (t) status(t); });
      var src = ctx.createMediaStreamSource(vStream);
      vNode = ctx.createScriptProcessor(4096, 1, 1);
      vNode.onaudioprocess = function (e) { if (busySpeaking()) return; try { vRec.acceptWaveform(e.inputBuffer); } catch (er) {} };
      src.connect(vNode); vNode.connect(ctx.destination);
      status('Слушаю (без интернета)…');
    }).catch(function (e) {
      wantMic = false; stopOffline(); micState(false);
      status(/Permission|NotAllowed/i.test(String(e && (e.name || e.message))) ? 'Нет доступа к микрофону' : 'Голос без интернета не запустился: ' + (e && e.message || e) + '. Можно переключить в меню на «через интернет».');
    });
  }
  function stopOffline() {
    try { vNode && vNode.disconnect(); } catch (e) {}
    try { vRec && vRec.remove(); } catch (e) {}
    if (vStream) vStream.getTracks().forEach(function (t) { t.stop(); });
    try { vCtx && vCtx.close(); } catch (e) {}
    vNode = vRec = vStream = vCtx = null;
  }
  function startOnline() {
    rec = new SR(); rec.lang = 'ru-RU'; rec.interimResults = true; rec.continuous = !/iphone|ipad/i.test(navigator.userAgent); rec.maxAlternatives = 3;
    rec.onresult = function (ev) {
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var r = ev.results[i];
        if (r.isFinal && busySpeaking()) continue; // не слушаем собственную озвучку
        if (r.isFinal) {
          var best = r[0].transcript;
          for (var j = 0; j < r.length; j++) { if (O.parse(r[j].transcript).cmd !== 'error') { best = r[j].transcript; break; } }
          status(''); run(best);
        } else status(r[0].transcript);
      }
    };
    rec.onerror = function (ev) {
      if (ev.error === 'network' && canOffline && wantMic) { rec.onend = null; engine = 'offline'; setEngineLabel(); status('Нет интернета — перешёл на распознавание без интернета'); startOffline(); return; }
      if (ev.error === 'not-allowed' || ev.error === 'network') wantMic = false; status(ev.error === 'not-allowed' ? 'Нет доступа к микрофону' : ev.error === 'network' ? 'Нет интернета для распознавания: переключите голос на «без интернета» или введите текстом' : ''); };
    rec.onend = function () { if (wantMic) setTimeout(function () { if (wantMic) startOnline(); }, 250); else micState(false); };
    try { rec.start(); } catch (e) { wantMic = false; micState(false); }
  }
  $('#mic').addEventListener('click', function () {
    if (wantMic) { wantMic = false; if (rec) { try { rec.stop(); } catch (e) {} rec = null; } stopOffline(); micState(false); status(''); return; }
    if (engine === 'online' && !SR) { status('Этот браузер не распознаёт речь через интернет. Включите в меню «без интернета» или вводите текстом.'); return; }
    wantMic = true; micState(true);
    if (window.speechSynthesis) speechSynthesis.cancel();
    if (engine === 'offline') startOffline(); else startOnline();
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('[data-act="engine"]')) return;
    if (!canOffline && engine === 'online') { alert('Голос без интернета работает, когда программа открыта по ссылке (с сайта), а не из файла.'); return; }
    engine = engine === 'offline' ? 'online' : 'offline'; localStorage.setItem(KEY + '-engine2', engine); setEngineLabel();
  });
  setEngineLabel();
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () {});

  load(); render();
  if (window.innerWidth >= 1000) { document.body.classList.add('pc'); render(); }
})();
