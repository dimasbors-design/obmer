// Справочник электрика: интерактивные схемы. Небольшой «симулятор»: кто с кем соединён при текущем положении выключателей.
var SPCirc = (function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var COL = { L1: '#8d5524', L2: '#262626', L3: '#8c8c8c', L: '#8d5524', N: '#1e6fd9', PE: '#2e9e44', PEN: '#2e9e44', GL: '#8d5524', GN: '#1e6fd9', C: '#c0392b' };

  // ---- типы элементов: выводы относительно (x, y) ----
  var TYPES = {
    sw: { t: { a: [0, 0], b: [0, 44] }, conn: function (s) { return s.on ? [['a', 'b']] : []; }, click: 'toggle' },
    chg: { t: { c: [0, 0], p1: [-16, 44], p2: [16, 44] }, conn: function (s) { return [['c', s.on ? 'p2' : 'p1']]; }, click: 'toggle' },
    cross: { t: { a1: [-16, 0], a2: [16, 0], b1: [-16, 44], b2: [16, 44] }, conn: function (s) { return s.on ? [['a1', 'b2'], ['a2', 'b1']] : [['a1', 'b1'], ['a2', 'b2']]; }, click: 'toggle' },
    btn: { t: { a: [0, 0], b: [0, 44] }, conn: function (s) { return s.pressed ? [['a', 'b']] : []; }, click: 'press' },
    btnnc: { t: { a: [0, 0], b: [0, 44] }, conn: function (s) { return s.pressed ? [] : [['a', 'b']]; }, click: 'press' },
    lamp: { t: { a: [0, 0], b: [0, 44] }, conn: function () { return []; }, load: ['a', 'b'] },
    socket: { t: { L: [-14, 0], N: [0, 0], PE: [14, 0] }, conn: function () { return []; } },
    cb: { t: function (c) { var t = {}; for (var i = 0; i < (c.p || 1); i++) { t['i' + i] = [i * 20, 0]; t['o' + i] = [i * 20, 56]; } return t; }, conn: function (s, c) { var r = []; if (s.on) for (var i = 0; i < (c.p || 1); i++) r.push(['i' + i, 'o' + i]); return r; }, click: 'toggle' },
    rcd: { t: { i0: [0, 0], i1: [20, 0], o0: [0, 64], o1: [20, 64] }, conn: function (s) { return s.on ? [['i0', 'o0'], ['i1', 'o1']] : []; }, click: 'toggle' },
    impulse: { t: { A1: [0, 0], A2: [0, 50], k1: [40, 0], k2: [40, 50] }, conn: function (s) { return s.on ? [['k1', 'k2']] : []; }, coil: ['A1', 'A2'], edge: true },
    contactor: { t: { A1: [0, 0], A2: [0, 50], i0: [40, 0], i1: [60, 0], i2: [80, 0], o0: [40, 50], o1: [60, 50], o2: [80, 50], n13: [110, 0], n14: [110, 50] }, conn: function (s) { return s.on ? [['i0', 'o0'], ['i1', 'o1'], ['i2', 'o2'], ['n13', 'n14']] : []; }, coil: ['A1', 'A2'] },
    motion: { t: { L: [-20, 0], N: [0, 0], Lo: [20, 0] }, conn: function (s) { return s.on && s.powered ? [['L', 'Lo']] : []; }, click: 'toggle', sense: ['L', 'N'] },
    motor: { t: { U: [-20, 0], V: [0, 0], W: [20, 0], PE: [40, 0] }, conn: function () { return []; } },
    ats: { t: { a0: [0, 0], a1: [20, 0], b0: [60, 0], b1: [80, 0], o0: [30, 70], o1: [50, 70] }, conn: function (s) { return !s.pos ? [['a0', 'o0'], ['a1', 'o1']] : s.pos === 2 ? [['b0', 'o0'], ['b1', 'o1']] : []; }, click: 'cycle3' },
    bus: { t: function (c) { var t = {}; for (var i = 0; i < c.n; i++) t['t' + i] = [i * (c.step || 20), 0]; return t; }, conn: function (s, c) { var r = []; for (var i = 1; i < c.n; i++) r.push(['t0', 't' + i]); return r; } },
    node: { t: { p: [0, 0] }, conn: function () { return []; } },
    src: { t: function (c) { var t = {}; c.lines.forEach(function (l, i) { t[l[0]] = [52, 14 + i * 20]; }); return t; }, conn: function () { return []; } },
    leak: { t: { p: [0, 0] }, conn: function () { return []; }, click: 'press' },
    gnd: { t: { p: [0, 0] }, conn: function () { return []; } }
  };
  function terms(c) { var T = TYPES[c.type].t; return typeof T === 'function' ? T(c) : T; }
  function tpos(c, name) { var p = terms(c)[name]; return [c.x + p[0], c.y + p[1]]; }

  // ---- расчёт соединений ----
  function solve(d, st) {
    var par = {};
    function f(x) { while (par[x] !== undefined && par[x] !== x) { par[x] = par[par[x]] !== undefined ? par[par[x]] : par[x]; x = par[x]; } return x; }
    function u(a, b) { if (par[a] === undefined) par[a] = a; if (par[b] === undefined) par[b] = b; var ra = f(a), rb = f(b); if (ra !== rb) par[ra] = rb; }
    function key(r) { if (par[r] === undefined) par[r] = r; return r; }
    d.wires.forEach(function (w) { u(w[0], w[1]); });
    d.comps.forEach(function (c) {
      var T = TYPES[c.type]; Object.keys(terms(c)).forEach(function (n) { key(c.id + '.' + n); });
      T.conn(st[c.id] || {}, c).forEach(function (p) { u(c.id + '.' + p[0], c.id + '.' + p[1]); });
    });
    var pot = {};
    d.comps.forEach(function (c) {
      if (c.type !== 'src') return;
      c.lines.forEach(function (l) { l[1].split('+').forEach(function (p) { var r = f(c.id + '.' + l[0]); (pot[r] = pot[r] || {})[p] = 1; }); });
    });
    function potOf(ref) { var r = f(key(ref)); return pot[r] || {}; }
    return { potOf: potOf, find: f };
  }
  function isPh(p) { return p === 'L1' || p === 'L2' || p === 'L3' || p === 'GL'; }
  function phases(P) { return Object.keys(P).filter(isPh); }
  function neutral(P, grp) { return grp === 'G' ? !!P.GN : !!(P.N); }
  function grpOf(ph) { return ph === 'GL' ? 'G' : ''; }

  // Полное состояние: реле/контакторы устанавливаются за несколько проходов
  function settle(d, st, prev) {
    for (var it = 0; it < 8; it++) {
      var S = solve(d, st), changed = false;
      d.comps.forEach(function (c) {
        var T = TYPES[c.type], s = st[c.id] = st[c.id] || {};
        if (T.coil) {
          var pw = powered(S, c.id + '.' + T.coil[0], c.id + '.' + T.coil[1]);
          if (T.edge) { if (pw && !s.coil) { s.on = !s.on; changed = true; } if (s.coil !== pw) { s.coil = pw; changed = true; } }
          else if (!!s.on !== pw) { s.on = pw; changed = true; }
        }
        if (T.sense) { var p2 = powered(S, c.id + '.' + T.sense[0], c.id + '.' + T.sense[1]); if (!!s.powered !== p2) { s.powered = p2; changed = true; } }
      });
      if (!changed) return S;
    }
    return solve(d, st);
  }
  function powered(S, a, b) {
    var A = S.potOf(a), B = S.potOf(b), pa = phases(A), pb = phases(B);
    if (pa.length === 1 && !pb.length && neutral(B, grpOf(pa[0]))) return true;
    if (pb.length === 1 && !pa.length && neutral(A, grpOf(pb[0]))) return true;
    return false;
  }

  // ---- рисование ----
  function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function txt(parent, x, y, s, o) { o = o || {}; var e = el('text', { x: x, y: y, 'font-size': o.size || 11, fill: o.fill || 'var(--spr-text)', 'text-anchor': o.anchor || 'middle', 'font-weight': o.bold ? 700 : 400 }, parent); e.textContent = s; return e; }

  function render(box, d, t, onInfo) {
    var st = JSON.parse(JSON.stringify(d.init || {}));
    var svg = el('svg', { viewBox: '0 ' + (d.vy || 0) + ' ' + d.w + ' ' + (d.h - (d.vy || 0)), class: 'spr-circ', role: 'img' });
    box.appendChild(svg);
    function draw() {
      var S = settle(d, st);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var defs = el('defs', {}, svg);
      var pat = el('pattern', { id: 'peStripe', patternUnits: 'userSpaceOnUse', width: 10, height: 10, patternTransform: 'rotate(45)' }, defs);
      el('rect', { width: 10, height: 10, fill: '#2e9e44' }, pat); el('rect', { width: 5, height: 10, fill: '#f2c200' }, pat);
      (d.deco || []).forEach(function (o) {
        if (o.box) { el('rect', { x: o.box[0], y: o.box[1], width: o.box[2], height: o.box[3], rx: 8, fill: o.fill || 'none', stroke: 'var(--spr-muted)', 'stroke-dasharray': o.solid ? '' : '5 4', 'stroke-width': 1 }, svg); if (o.label) txt(svg, o.box[0] + 4, o.box[1] - 4, t(o.label), { anchor: 'start', size: 10, fill: 'var(--spr-muted)' }); }
        if (o.text) txt(svg, o.at[0], o.at[1], t(o.text), { anchor: o.anchor || 'middle', size: o.size || 11, bold: o.bold, fill: o.fill });
      });
      var shorts = false, info = [];
      d.wires.forEach(function (w) {
        var a = ref(w[0]), b = ref(w[1]); if (!a || !b) return;
        var pts = [a].concat(w[2] || []).concat([b]);
        var P = S.potOf(w[0]), ph = phases(P), live = ph.length > 0, isN = !!(P.N || P.GN), isPE = !!P.PE;
        var short = ph.length > 1 || (live && (isN || isPE));
        if (short) shorts = true;
        var kind = w[3] || 'L';
        var color = kind === 'PE' ? 'url(#peStripe)' : COL[kind] || COL.L;
        var energized = live || isN || isPE;
        var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(' ');
        if (short) el('path', { d: path, fill: 'none', stroke: '#ff3b30', 'stroke-width': 7, opacity: 0.45, class: 'spr-blink' }, svg);
        el('path', { d: path, fill: 'none', stroke: color, 'stroke-width': kind === 'PE' || kind === 'PEN' ? 4 : 3, 'stroke-linejoin': 'round', opacity: energized ? 1 : 0.28 }, svg);
        if (kind === 'PEN') el('path', { d: path, fill: 'none', stroke: COL.N, 'stroke-width': 1.4, 'stroke-dasharray': '6 6', opacity: energized ? 1 : 0.28 }, svg);
        if (live && !short) el('path', { d: path, fill: 'none', stroke: '#ffd54a', 'stroke-width': 1.3, 'stroke-dasharray': '3 9', class: 'spr-flow' }, svg);
      });
      d.comps.forEach(function (c) { drawComp(svg, c, st[c.id] = st[c.id] || {}, S); });
      d.comps.forEach(function (c) { if (c.type === 'node') el('circle', { cx: c.x, cy: c.y, r: 3.2, fill: 'var(--spr-text)' }, svg); });
      if (shorts) info.push(['bad', t(['Короткое замыкание! Так соединять нельзя.', 'Коротке замикання! Так з’єднувати не можна.'])]);
      if (d.info) d.info(st, S, info, t, { powered: powered, phases: phases });
      onInfo(info);
    }
    function ref(r) { var p = r.split('.'), c = d.comps.find(function (x) { return x.id === p[0]; }); return c ? tpos(c, p[1]) : null; }
    function hit(g, c, w, h, dx, dy) {
      var r = el('rect', { x: c.x + (dx || 0), y: c.y + (dy || 0), width: w, height: h, fill: 'transparent', class: 'spr-hit' }, g);
      return r;
    }
    function drawComp(svg, c, s, S) {
      var g = el('g', { class: 'spr-comp' + (TYPES[c.type].click ? ' spr-click' : '') }, svg);
      var x = c.x, y = c.y, T = TYPES[c.type];
      var lbl = c.label ? t(c.label) : '';
      function dot(p) { el('circle', { cx: p[0], cy: p[1], r: 3, fill: '#fff', stroke: 'var(--spr-text)', 'stroke-width': 1.4 }, g); }
      var tt = terms(c); Object.keys(tt).forEach(function (n) { if (c.type !== 'node' && c.type !== 'bus' && c.type !== 'src') dot([x + tt[n][0], y + tt[n][1]]); });
      switch (c.type) {
        case 'sw': case 'btn': case 'btnnc': {
          var closed = c.type === 'sw' ? s.on : c.type === 'btn' ? s.pressed : !s.pressed;
          if (c.type === 'sw') el('line', { x1: x, y1: y + 44, x2: closed ? x : x + 20, y2: closed ? y + 3 : y + 8, stroke: 'var(--spr-text)', 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
          else {
            var yb = closed ? y + 3 : y + 14;
            el('line', { x1: x - 12, y1: yb + 3, x2: x + 12, y2: yb + 3, stroke: 'var(--spr-text)', 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
            el('line', { x1: x, y1: yb + 3, x2: x, y2: yb - 10, stroke: 'var(--spr-text)', 'stroke-width': 2 }, g);
            el('rect', { x: x - 9, y: yb - 18, width: 18, height: 8, rx: 3, fill: c.type === 'btnnc' ? '#e53935' : '#43a047' }, g);
            el('line', { x1: x, y1: y + 44, x2: x, y2: y + 30, stroke: 'var(--spr-text)', 'stroke-width': 2 }, g);
            el('line', { x1: x, y1: y, x2: x, y2: y + (c.type === 'btnnc' ? 6 : 3), stroke: 'var(--spr-text)', 'stroke-width': 2 }, g);
          }
          if (lbl) txt(g, x + (c.lx || 26), y + 30, lbl, { anchor: c.lx < 0 ? 'end' : 'start', size: 10 });
          hit(g, c, 50, 60, -18, -8);
          break;
        }
        case 'chg': case 'cross': {
          if (c.type === 'chg') el('line', { x1: x, y1: y, x2: x + (s.on ? 14 : -14), y2: y + 38, stroke: 'var(--spr-text)', 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
          else if (!s.on) { el('line', { x1: x - 16, y1: y, x2: x - 16, y2: y + 44, stroke: 'var(--spr-text)', 'stroke-width': 3 }, g); el('line', { x1: x + 16, y1: y, x2: x + 16, y2: y + 44, stroke: 'var(--spr-text)', 'stroke-width': 3 }, g); }
          else { el('line', { x1: x - 16, y1: y, x2: x + 16, y2: y + 44, stroke: 'var(--spr-text)', 'stroke-width': 3 }, g); el('line', { x1: x + 16, y1: y, x2: x - 16, y2: y + 44, stroke: 'var(--spr-text)', 'stroke-width': 3 }, g); }
          el('rect', { x: x - 28, y: y - 10, width: 56, height: 64, rx: 6, fill: 'none', stroke: 'var(--spr-muted)', 'stroke-width': 1 }, g);
          if (lbl) txt(g, x + 34, y + 26, lbl, { anchor: 'start', size: 10 });
          hit(g, c, 56, 64, -28, -10);
          break;
        }
        case 'lamp': {
          var on = powered(S, c.id + '.a', c.id + '.b');
          var cy = y + 22;
          if (on) el('circle', { cx: x, cy: cy, r: 20, fill: '#ffe066', opacity: 0.55, class: 'spr-glow' }, g);
          el('circle', { cx: x, cy: cy, r: 12, fill: on ? '#fff3b0' : 'var(--spr-panel)', stroke: 'var(--spr-text)', 'stroke-width': 1.8 }, g);
          el('path', { d: 'M' + (x - 8.5) + ' ' + (cy - 8.5) + 'L' + (x + 8.5) + ' ' + (cy + 8.5) + 'M' + (x + 8.5) + ' ' + (cy - 8.5) + 'L' + (x - 8.5) + ' ' + (cy + 8.5), stroke: 'var(--spr-text)', 'stroke-width': 1.4 }, g);
          el('line', { x1: x, y1: y, x2: x, y2: cy - 12, stroke: 'var(--spr-text)', 'stroke-width': 1.4 }, g);
          el('line', { x1: x, y1: cy + 12, x2: x, y2: y + 44, stroke: 'var(--spr-text)', 'stroke-width': 1.4 }, g);
          if (lbl) txt(g, x + (c.lx || 18), cy + 4, lbl, { anchor: c.lx < 0 ? 'end' : 'start', size: 10 });
          break;
        }
        case 'socket': {
          var P = S.potOf(c.id + '.L'), ok = powered(S, c.id + '.L', c.id + '.N'), pe = !!S.potOf(c.id + '.PE').PE;
          el('rect', { x: x - 24, y: y + 8, width: 48, height: 40, rx: 8, fill: 'var(--spr-panel)', stroke: 'var(--spr-text)', 'stroke-width': 1.5 }, g);
          el('circle', { cx: x - 8, cy: y + 28, r: 3.4, fill: 'var(--spr-text)' }, g); el('circle', { cx: x + 8, cy: y + 28, r: 3.4, fill: 'var(--spr-text)' }, g);
          if (pe) { el('rect', { x: x - 2, y: y + 11, width: 4, height: 6, fill: '#2e9e44' }, g); el('rect', { x: x - 2, y: y + 39, width: 4, height: 6, fill: '#2e9e44' }, g); }
          txt(g, x, y + 62, ok ? '230 В' : t(['нет', 'немає']), { size: 10, bold: true, fill: ok ? '#27a046' : 'var(--spr-muted)' });
          if (lbl) txt(g, x, y + 75, lbl, { size: 10 });
          void P;
          break;
        }
        case 'cb': case 'rcd': {
          var p = c.type === 'rcd' ? 2 : (c.p || 1), wdt = (p - 1) * 20 + 24, h = c.type === 'rcd' ? 64 : 56;
          el('rect', { x: x - 12, y: y + 8, width: wdt, height: h - 16, rx: 4, fill: c.type === 'rcd' ? '#eaf2ff' : '#fff', stroke: '#555', 'stroke-width': 1.3 }, g);
          for (var i = 0; i < p; i++) {
            var xx = x + i * 20;
            el('line', { x1: xx, y1: y, x2: xx, y2: y + 14, stroke: '#333', 'stroke-width': 1.6 }, g);
            el('line', { x1: xx, y1: y + h, x2: xx, y2: y + h - 14, stroke: '#333', 'stroke-width': 1.6 }, g);
            el('line', { x1: xx, y1: y + h - 14, x2: s.on ? xx : xx + 8, y2: s.on ? y + 14 : y + 18, stroke: '#333', 'stroke-width': 2.2 }, g);
          }
          el('rect', { x: x - 10, y: y + h / 2 - 7, width: 12, height: 14, rx: 2, fill: s.on ? '#2e7d32' : '#c62828' }, g);
          if (c.type === 'rcd') txt(g, x + 10, y + h / 2 + 18, 'T', { size: 9, bold: true, fill: '#555' });
          if (lbl) txt(g, x + wdt - 6, y + h / 2 + 4, lbl, { anchor: 'start', size: 10, bold: true });
          if (c.sub) txt(g, x + wdt - 6, y + h / 2 + 16, t(c.sub), { anchor: 'start', size: 9, fill: 'var(--spr-muted)' });
          hit(g, c, wdt + 4, h, -14, 0);
          break;
        }
        case 'impulse': case 'contactor': {
          var wd = c.type === 'impulse' ? 64 : 136;
          el('rect', { x: x - 14, y: y + 8, width: wd, height: 34, rx: 5, fill: s.on ? '#e8f5e9' : 'var(--spr-panel)', stroke: '#555', 'stroke-width': 1.3 }, g);
          el('rect', { x: x - 8, y: y + 16, width: 16, height: 18, fill: s.coil || s.on && c.type === 'contactor' ? '#ffcc80' : '#fff', stroke: '#333', 'stroke-width': 1.3 }, g);
          el('line', { x1: x, y1: y, x2: x, y2: y + 16, stroke: '#333', 'stroke-width': 1.4 }, g); el('line', { x1: x, y1: y + 34, x2: x, y2: y + 50, stroke: '#333', 'stroke-width': 1.4 }, g);
          var cs = c.type === 'impulse' ? [40] : [40, 60, 80, 110];
          cs.forEach(function (cx) { el('line', { x1: x + cx, y1: y, x2: x + cx, y2: y + 14, stroke: '#333', 'stroke-width': 1.4 }, g); el('line', { x1: x + cx, y1: y + 50, x2: x + cx, y2: y + 36, stroke: '#333', 'stroke-width': 1.4 }, g); el('line', { x1: x + cx, y1: y + 36, x2: s.on ? x + cx : x + cx + 7, y2: s.on ? y + 14 : y + 17, stroke: '#333', 'stroke-width': 2 }, g); });
          if (lbl) txt(g, x + wd - 8, y + 4, lbl, { anchor: 'end', size: 10, bold: true });
          break;
        }
        case 'motion': {
          el('rect', { x: x - 30, y: y - 46, width: 60, height: 40, rx: 20, fill: s.on ? '#fff8e1' : 'var(--spr-panel)', stroke: '#555', 'stroke-width': 1.3 }, g);
          el('circle', { cx: x, cy: y - 26, r: 9, fill: s.powered ? (s.on ? '#ff7043' : '#90a4ae') : '#cfd8dc' }, g);
          txt(g, x, y - 52, s.on ? t(['движение', 'рух']) : t(['нет движения', 'немає руху']), { size: 10, bold: s.on });
          ['L', 'N', 'L’'].forEach(function (n, i) { txt(g, x - 20 + i * 20, y + 16, n, { size: 9, fill: 'var(--spr-muted)' }); });
          hit(g, c, 60, 46, -30, -50);
          break;
        }
        case 'motor': {
          var ph3 = ['U', 'V', 'W'].map(function (n) { return phases(S.potOf(c.id + '.' + n)); });
          var run = ph3.every(function (p) { return p.length === 1; }) && new Set(ph3.map(function (p) { return p[0]; })).size === 3;
          el('circle', { cx: x, cy: y + 40, r: 26, fill: run ? '#e3f2fd' : 'var(--spr-panel)', stroke: '#333', 'stroke-width': 1.8 }, g);
          txt(g, x, y + 37, 'M', { size: 15, bold: true }); txt(g, x, y + 52, '3~', { size: 10 });
          ['U', 'V', 'W'].forEach(function (n, i) { el('line', { x1: x - 20 + i * 20, y1: y, x2: x - 20 + i * 20 * 0.5 + (i - 1) * 4, y2: y + 16, stroke: '#333', 'stroke-width': 1.4 }, g); });
          el('line', { x1: x + 40, y1: y, x2: x + 22, y2: y + 26, stroke: '#2e9e44', 'stroke-width': 1.6 }, g);
          if (run) { var a = el('path', { d: 'M' + (x + 34) + ' ' + (y + 30) + ' a12 12 0 1 1 -4 -9', fill: 'none', stroke: '#1e88e5', 'stroke-width': 2.4, class: 'spr-spin', style: 'transform-origin:' + x + 'px ' + (y + 40) + 'px' }, g); void a; }
          txt(g, x, y + 82, run ? t(['вращается', 'обертається']) : t(['стоит', 'стоїть']), { size: 10, bold: true, fill: run ? '#1e88e5' : 'var(--spr-muted)' });
          break;
        }
        case 'ats': {
          el('rect', { x: x - 14, y: y + 8, width: 108, height: 50, rx: 6, fill: 'var(--spr-panel)', stroke: '#555', 'stroke-width': 1.3 }, g);
          var lab = ['I', '0', 'II'][s.pos || 0];
          var ox = [30, 50];
          ox.forEach(function (xx, i) {
            el('line', { x1: x + xx, y1: y + 70, x2: x + xx, y2: y + 56, stroke: '#333', 'stroke-width': 1.4 }, g);
            var tx = s.pos === 0 ? (i ? 20 : 0) : s.pos === 2 ? (i ? 80 : 60) : xx;
            el('line', { x1: x + xx, y1: y + 56, x2: x + tx, y2: s.pos === 1 ? y + 34 : y + 14, stroke: '#333', 'stroke-width': 2.2 }, g);
          });
          [0, 20, 60, 80].forEach(function (xx) { el('line', { x1: x + xx, y1: y, x2: x + xx, y2: y + 14, stroke: '#333', 'stroke-width': 1.4 }, g); });
          el('circle', { cx: x + 40, cy: y + 33, r: 11, fill: '#ffb300', stroke: '#333' }, g);
          txt(g, x + 40, y + 37, lab, { size: 11, bold: true });
          if (lbl) txt(g, x + 100, y + 36, lbl, { anchor: 'start', size: 10, bold: true });
          hit(g, c, 108, 70, -14, 0);
          break;
        }
        case 'bus': {
          var len = (c.n - 1) * (c.step || 20);
          el('rect', { x: x - 8, y: y - 5, width: len + 16, height: 10, rx: 2, fill: c.kind === 'PE' ? 'url(#peStripe)' : c.kind === 'N' ? COL.N : '#b08d57' }, g);
          for (var k = 0; k < c.n; k++) el('circle', { cx: x + k * (c.step || 20), cy: y, r: 2.6, fill: '#ddd', stroke: '#333', 'stroke-width': 1 }, g);
          if (lbl) txt(g, x + len + 14, y + 4, lbl, { anchor: 'start', size: 10, bold: true });
          break;
        }
        case 'src': {
          var hh = c.lines.length * 20 + 8;
          el('rect', { x: x, y: y, width: 44, height: hh, rx: 6, fill: c.gen ? '#fff3e0' : '#eceff1', stroke: '#555', 'stroke-width': 1.3 }, g);
          c.lines.forEach(function (l, i) { txt(g, x + 22, y + 18 + i * 20, l[2] || l[0], { size: 10, bold: true }); el('line', { x1: x + 44, y1: y + 14 + i * 20, x2: x + 52, y2: y + 14 + i * 20, stroke: '#333', 'stroke-width': 1.4 }, g); });
          if (lbl) txt(g, x + 22, y - 6, lbl, { size: 10, bold: true });
          break;
        }
        case 'leak': {
          el('path', { d: 'M' + x + ' ' + y + 'l-6 10h12z', fill: s.pressed ? '#ff7043' : '#ffcc80', stroke: '#e65100' }, g);
          txt(g, x, y + 24, lbl || t(['утечка', 'витік']), { size: 9, fill: '#e65100', bold: true });
          hit(g, c, 50, 34, -25, -6);
          break;
        }
        case 'gnd': {
          el('line', { x1: x, y1: y, x2: x, y2: y + 12, stroke: '#2e9e44', 'stroke-width': 2 }, g);
          [16, 10, 4].forEach(function (w, i) { el('line', { x1: x - w, y1: y + 12 + i * 5, x2: x + w, y2: y + 12 + i * 5, stroke: '#2e9e44', 'stroke-width': 2 }, g); });
          if (lbl) txt(g, x + 22, y + 22, lbl, { anchor: 'start', size: 10 });
          break;
        }
      }
      if (T.click) {
        g.addEventListener('click', function (ev) {
          ev.preventDefault();
          if (T.click === 'toggle') { s.on = !s.on; draw(); }
          else if (T.click === 'cycle3') { s.pos = ((s.pos || 0) + 1) % 3; draw(); }
          else if (T.click === 'press') {
            s.pressed = true;
            if (c.type === 'leak' && c.rcd) {
              var S2 = settle(d, st);
              if (phases(S2.potOf(c.at)).length) { st[c.rcd].on = false; st[c.rcd].tripped = true; }
            }
            draw();
            setTimeout(function () { s.pressed = false; draw(); }, 350);
          }
        });
      }
    }
    draw();
    return { reset: function () { st = JSON.parse(JSON.stringify(d.init || {})); draw(); } };
  }

  // ---------- Схемы ----------
  var SRC1 = function (x, y, pe) { return { id: 's', type: 'src', x: x, y: y, label: ['Сеть', 'Мережа'], lines: pe === false ? [['L', 'L1'], ['N', 'N']] : [['L', 'L1'], ['N', 'N'], ['PE', 'PE']] }; };
  var D = [];

  D.push({
    id: 'sw1', title: ['Одноклавишный выключатель', 'Одноклавішний вимикач'],
    w: 420, h: 250,
    comps: [SRC1(10, 20), { id: 'q', type: 'sw', x: 170, y: 20, label: ['выключатель', 'вимикач'], lx: 30 }, { id: 'h', type: 'lamp', x: 330, y: 110, label: ['лампа', 'лампа'] }],
    wires: [['s.L', 'q.a', [[170, 34]], 'L'], ['q.b', 'h.a', [[170, 110], [330, 110]], 'L'], ['h.b', 's.N', [[330, 210], [100, 210], [100, 54], [62, 54]], 'N'], ['s.PE', 'h.b', [[80, 74], [80, 230], [345, 230], [345, 158]], 'PE']],
    deco: [{ text: ['Нажмите на выключатель', 'Натисніть на вимикач'], at: [250, 90], size: 10, fill: 'var(--spr-muted)' }],
    note: [['Выключатель всегда разрывает фазу (L), а не ноль. Тогда при выключенном свете на патроне нет опасного напряжения.', 'Вимикач завжди розриває фазу (L), а не нуль. Тоді при вимкненому світлі на патроні немає небезпечної напруги.'],
      ['К светильнику идёт три провода: коммутируемая фаза, ноль N и защитный PE (для металлического корпуса или класса защиты I).', 'До світильника йдуть три проводи: комутована фаза, нуль N і захисний PE (для металевого корпусу або класу захисту I).'],
      ['Типовой кабель — ВВГнг-LS 3×1,5 мм², автомат 10 А.', 'Типовий кабель — ВВГнг-LS 3×1,5 мм², автомат 10 А.']]
  });
  // исправляю: PE подключаем к корпусу лампы отдельной точкой
  D[0].comps.push({ id: 'pe', type: 'node', x: 345, y: 158 });
  D[0].wires[3] = ['s.PE', 'pe.p', [[80, 74], [80, 230], [345, 230]], 'PE'];
  D[0].deco.push({ text: ['PE → корпус', 'PE → корпус'], at: [352, 175], anchor: 'start', size: 9, fill: 'var(--spr-muted)' });

  D.push({
    id: 'sw2', title: ['Двухклавишный выключатель', 'Двоклавішний вимикач'],
    w: 460, h: 260,
    comps: [SRC1(10, 20, false), { id: 'n0', type: 'node', x: 170, y: 34 }, { id: 'q1', type: 'sw', x: 150, y: 70, label: ['1'], lx: -28 }, { id: 'q2', type: 'sw', x: 200, y: 70, label: ['2'] },
      { id: 'h1', type: 'lamp', x: 320, y: 140, label: ['группа 1', 'група 1'] }, { id: 'h2', type: 'lamp', x: 400, y: 140, label: ['2'] }],
    wires: [['s.L', 'n0.p', [], 'L'], ['n0.p', 'q1.a', [[150, 34]], 'L'], ['n0.p', 'q2.a', [[200, 34]], 'L'],
      ['q1.b', 'h1.a', [[150, 130], [320, 130]], 'L'], ['q2.b', 'h2.a', [[200, 120], [400, 120]], 'L'],
      ['h1.b', 's.N', [[320, 220], [100, 220], [100, 54], [62, 54]], 'N'], ['h2.b', 'h1.b', [[400, 220], [320, 220]], 'N']],
    deco: [{ box: [118, 56, 120, 74], label: ['двухклавишный', 'двоклавішний'] }],
    note: [['На общий контакт (обычно помечен L) приходит фаза, с двух выходов уходят две отдельные фазы — по одной на каждую группу ламп. Ноль общий.', 'На загальний контакт (зазвичай позначений L) приходить фаза, з двох виходів ідуть дві окремі фази — по одній на кожну групу ламп. Нуль спільний.'],
      ['Кабель от коробки к выключателю — 3 жилы, к люстре — 3 жилы без PE или 4 жилы с PE.', 'Кабель від коробки до вимикача — 3 жили, до люстри — 3 жили без PE або 4 жили з PE.']]
  });

  D.push({
    id: 'pass2', title: ['Проходные выключатели (2 места)', 'Прохідні вимикачі (2 місця)'],
    w: 480, h: 250,
    comps: [SRC1(10, 20, false), { id: 'a', type: 'chg', x: 160, y: 60, label: ['№1'] }, { id: 'b', type: 'chg', x: 300, y: 60, label: ['№2'] }, { id: 'h', type: 'lamp', x: 420, y: 130 }],
    wires: [['s.L', 'a.c', [[160, 34]], 'L'], ['a.p1', 'b.p1', [[144, 140], [284, 140]], 'L'], ['a.p2', 'b.p2', [[176, 124], [316, 124]], 'L'], ['b.c', 'h.a', [[300, 30], [420, 30]], 'L'], ['h.b', 's.N', [[420, 220], [100, 220], [100, 54], [62, 54]], 'N']],
    deco: [{ text: ['Управление светом из двух мест: коридор, лестница, спальня', 'Керування світлом з двох місць: коридор, сходи, спальня'], at: [240, 245], size: 9, fill: 'var(--spr-muted)' }],
    note: [['У проходного выключателя три вывода: общий и два переключаемых. Фаза — на общий первого, лампа — от общего второго, между ними две перемычки.', 'У прохідного вимикача три виводи: загальний і два перемикальні. Фаза — на загальний першого, лампа — від загального другого, між ними дві перемички.'],
      ['Между выключателями прокладывают 3-жильный кабель (2 жилы — перемычки).', 'Між вимикачами прокладають 3-жильний кабель (2 жили — перемички).']]
  });

  D.push({
    id: 'pass3', title: ['Проходные + перекрёстный (3 места)', 'Прохідні + перехресний (3 місця)'],
    w: 560, h: 250,
    comps: [SRC1(10, 20, false), { id: 'a', type: 'chg', x: 150, y: 60, label: ['№1'] }, { id: 'x', type: 'cross', x: 290, y: 80, label: ['×'] }, { id: 'b', type: 'chg', x: 420, y: 60, label: ['№3'] }, { id: 'h', type: 'lamp', x: 520, y: 130 }],
    wires: [['s.L', 'a.c', [[150, 34]], 'L'], ['a.p1', 'x.a1', [[134, 150], [230, 150], [230, 60], [274, 60], [274, 80]], 'L'], ['a.p2', 'x.a2', [[166, 136], [244, 136], [244, 66], [306, 66], [306, 80]], 'L'],
      ['x.b1', 'b.p1', [[274, 170], [404, 170], [404, 104]], 'L'], ['x.b2', 'b.p2', [[306, 160], [436, 160], [436, 104]], 'L'], ['b.c', 'h.a', [[420, 30], [520, 30]], 'L'], ['h.b', 's.N', [[520, 230], [100, 230], [100, 54], [62, 54]], 'N']],
    note: [['Для трёх и более мест между двумя проходными ставят перекрёстные (по одному на каждое дополнительное место).', 'Для трьох і більше місць між двома прохідними ставлять перехресні (по одному на кожне додаткове місце).'],
      ['Если мест больше трёх, проще поставить импульсное реле и кнопки — см. следующую схему.', 'Якщо місць більше трьох, простіше поставити імпульсне реле і кнопки — див. наступну схему.']]
  });

  D.push({
    id: 'impulse', title: ['Импульсное реле и кнопки', 'Імпульсне реле і кнопки'],
    w: 520, h: 270,
    comps: [SRC1(10, 20, false), { id: 'n1', type: 'node', x: 120, y: 34 }, { id: 'k1', type: 'btn', x: 150, y: 80, label: ['кн.1', 'кн.1'] }, { id: 'k2', type: 'btn', x: 220, y: 80, label: ['кн.2', 'кн.2'] }, { id: 'k3', type: 'btn', x: 290, y: 80, label: ['кн.3', 'кн.3'] },
      { id: 'n2', type: 'node', x: 220, y: 150 }, { id: 'kr', type: 'impulse', x: 340, y: 150, label: ['реле', 'реле'] }, { id: 'h', type: 'lamp', x: 470, y: 150 }],
    wires: [['s.L', 'n1.p', [], 'L'], ['n1.p', 'k1.a', [[120, 64], [150, 64]], 'L'], ['k1.a', 'k2.a', [[150, 64], [220, 64]], 'L'], ['k2.a', 'k3.a', [[220, 64], [290, 64]], 'L'],
      ['k1.b', 'n2.p', [[150, 150]], 'L'], ['k2.b', 'n2.p', [], 'L'], ['k3.b', 'n2.p', [[290, 150]], 'L'], ['n2.p', 'kr.A1', [], 'L'],
      ['n1.p', 'kr.k1', [[120, 34], [380, 34]], 'L'], ['kr.k2', 'h.a', [[380, 210], [430, 210], [430, 140], [470, 140]], 'L'],
      ['kr.A2', 's.N', [[340, 250], [100, 250], [100, 54], [62, 54]], 'N'], ['h.b', 'kr.A2', [[470, 250], [340, 250]], 'N']],
    deco: [{ text: ['Нажимайте любую кнопку', 'Натискайте будь-яку кнопку'], at: [215, 205], size: 10, fill: 'var(--spr-muted)' }],
    note: [['Каждое короткое нажатие на любую кнопку переключает реле: включено → выключено → включено. Кнопки подключаются параллельно, их может быть сколько угодно.', 'Кожне коротке натискання будь-якої кнопки перемикає реле: увімкнено → вимкнено → увімкнено. Кнопки підключаються паралельно, їх може бути скільки завгодно.'],
      ['К кнопкам достаточно двухжильного кабеля (фаза к кнопке и обратно к катушке). Реле ставят в щит на DIN-рейку.', 'До кнопок достатньо двожильного кабелю (фаза до кнопки і назад до котушки). Реле ставлять у щит на DIN-рейку.'],
      ['Нужны кнопки без фиксации (не обычные выключатели). Кнопки с подсветкой могут вызвать ложные срабатывания — смотрите паспорт реле.', 'Потрібні кнопки без фіксації (не звичайні вимикачі). Кнопки з підсвічуванням можуть спричинити хибні спрацювання — дивіться паспорт реле.']]
  });
  D[4].comps.push({ id: 'n3', type: 'node', x: 340, y: 250 });

  D.push({
    id: 'motion', title: ['Датчик движения', 'Датчик руху'],
    w: 460, h: 260,
    comps: [SRC1(10, 20, false), { id: 'm', type: 'motion', x: 200, y: 130, label: [''] }, { id: 'q', type: 'sw', x: 330, y: 40, label: ['обход', 'обхід'] }, { id: 'h', type: 'lamp', x: 400, y: 150 }, { id: 'n1', type: 'node', x: 180, y: 34 }, { id: 'n2', type: 'node', x: 400, y: 140 }],
    wires: [['s.L', 'n1.p', [], 'L'], ['n1.p', 'm.L', [], 'L'], ['n1.p', 'q.a', [[330, 34]], 'L'], ['m.Lo', 'n2.p', [[220, 140]], 'L'], ['q.b', 'n2.p', [[330, 140]], 'L'], ['n2.p', 'h.a', [], 'L'],
      ['m.N', 's.N', [[200, 230], [100, 230], [100, 54], [62, 54]], 'N'], ['h.b', 'm.N', [[400, 230], [200, 230]], 'N']],
    deco: [{ text: ['Нажмите на датчик', 'Натисніть на датчик'], at: [270, 18], size: 10, fill: 'var(--spr-muted)' }],
    note: [['Датчику нужен ноль для собственного питания: L — фаза, N — ноль, L’ (или «A») — выход на лампу.', 'Датчику потрібен нуль для власного живлення: L — фаза, N — нуль, L’ (або «A») — вихід на лампу.'],
      ['Выключатель параллельно датчику («обход») включает свет постоянно — удобно для уборки.', 'Вимикач паралельно датчику («обхід») вмикає світло постійно — зручно для прибирання.'],
      ['Мощность ламп не должна превышать допустимую для датчика; для светодиодных ламп берите запас ×3–5 из-за пускового тока драйверов.', 'Потужність ламп не повинна перевищувати допустиму для датчика; для світлодіодних ламп беріть запас ×3–5 через пусковий струм драйверів.']]
  });

  D.push({
    id: 'sockets', title: ['Розетки: шлейф и звезда', 'Розетки: шлейф і зірка'],
    w: 520, h: 250,
    comps: [SRC1(10, 20), { id: 'x1', type: 'socket', x: 190, y: 120, label: ['1'] }, { id: 'x2', type: 'socket', x: 300, y: 120, label: ['2'] }, { id: 'x3', type: 'socket', x: 410, y: 120, label: ['3'] },
      { id: 'q', type: 'cb', x: 120, y: 10, label: ['16 А'] }],
    wires: [['s.L', 'q.i0', [[90, 34], [90, 4], [120, 4]], 'L'], ['q.o0', 'x1.L', [[120, 92], [176, 92]], 'L'], ['x1.L', 'x2.L', [[176, 92], [286, 92]], 'L'], ['x2.L', 'x3.L', [[286, 92], [396, 92]], 'L'],
      ['s.N', 'x1.N', [[100, 54], [100, 100], [190, 100]], 'N'], ['x1.N', 'x2.N', [[190, 100], [300, 100]], 'N'], ['x2.N', 'x3.N', [[300, 100], [410, 100]], 'N'],
      ['s.PE', 'x1.PE', [[80, 74], [80, 108], [204, 108]], 'PE'], ['x1.PE', 'x2.PE', [[204, 108], [314, 108]], 'PE'], ['x2.PE', 'x3.PE', [[314, 108], [424, 108]], 'PE']],
    deco: [{ text: ['Нажмите на автомат', 'Натисніть на автомат'], at: [300, 40], size: 10, fill: 'var(--spr-muted)' }],
    init: { q: { on: true } },
    note: [['Шлейф: провод идёт от розетки к розетке через её клеммы. Просто, но обрыв в одной клемме отключает все дальше по линии. PE шлейфом через клемму розетки пускать не рекомендуется — лучше ответвление гильзой или клеммой (защитный провод не должен разрываться при снятии розетки).', 'Шлейф: провід іде від розетки до розетки через її клеми. Просто, але обрив в одній клемі вимикає всі далі по лінії. PE шлейфом через клему розетки пускати не рекомендується — краще відгалуження гільзою чи клемою (захисний провід не повинен розриватися при знятті розетки).'],
      ['Звезда: к каждой розетке свой кабель от коробки или щита. Надёжнее, но больше кабеля.', 'Зірка: до кожної розетки свій кабель від коробки або щита. Надійніше, але більше кабелю.'],
      ['Розеточная группа: медь 2,5 мм², автомат 16 А, УЗО или дифавтомат 30 мА. Фаза — на правый контакт (общепринятая практика, нормами не требуется).', 'Розеткова група: мідь 2,5 мм², автомат 16 А, ПЗВ або дифавтомат 30 мА. Фаза — на правий контакт (загальноприйнята практика, нормами не вимагається).']]
  });

  D.push({
    id: 'rcd', title: ['УЗО и автоматы', 'ПЗВ і автомати'],
    w: 520, h: 300,
    comps: [SRC1(10, 20), { id: 'r', type: 'rcd', x: 120, y: 10, label: ['УЗО', 'ПЗВ'], sub: ['40 А 30 мА'] },
      { id: 'q1', type: 'cb', x: 250, y: 100, label: ['16 А'] }, { id: 'q2', type: 'cb', x: 360, y: 100, label: ['16 А'] },
      { id: 'x1', type: 'socket', x: 250, y: 200, label: ['кухня', 'кухня'] }, { id: 'x2', type: 'socket', x: 370, y: 200, label: ['комната', 'кімната'] },
      { id: 'lk', type: 'leak', x: 430, y: 236, rcd: 'r', at: 'x2.L' }, { id: 'nb', type: 'bus', x: 200, y: 92, n: 3, step: 30, kind: 'N', label: ['N'] }],
    wires: [['s.L', 'r.i0', [[90, 34], [90, 4], [120, 4]], 'L'], ['s.N', 'r.i1', [[100, 54], [100, 0], [140, 0]], 'N'],
      ['r.o0', 'q1.i0', [[120, 84], [250, 84]], 'L'], ['q1.i0', 'q2.i0', [[250, 84], [360, 84]], 'L'], ['r.o1', 'nb.t0', [[140, 92]], 'N'],
      ['q1.o0', 'x1.L', [[250, 170], [236, 170]], 'L'], ['q2.o0', 'x2.L', [[360, 170], [356, 170]], 'L'],
      ['nb.t1', 'x1.N', [[230, 178], [250, 178]], 'N'], ['nb.t2', 'x2.N', [[260, 182], [370, 182]], 'N'],
      ['s.PE', 'x1.PE', [[80, 74], [80, 192], [264, 192]], 'PE'], ['x1.PE', 'x2.PE', [[264, 192], [384, 192]], 'PE']],
    init: { r: { on: true }, q1: { on: true }, q2: { on: true } },
    deco: [{ text: ['Нажмите «утечка» — УЗО отключится', 'Натисніть «витік» — ПЗВ вимкнеться'], at: [300, 20], size: 10, fill: 'var(--spr-muted)' }],
    info: function (st, S, info, t) { if (st.r.tripped && !st.r.on) info.push(['warn', t(['УЗО сработало от утечки. Найдите и устраните причину, затем включите УЗО (нажмите на него).', 'ПЗВ спрацювало від витоку. Знайдіть і усуньте причину, потім увімкніть ПЗВ (натисніть на нього).'])]); if (st.r.on) st.r.tripped = false; },
    note: [['УЗО сравнивает ток в фазе и нуле. Если часть тока ушла «мимо» (через человека или корпус на землю), оно отключает линию. От перегрузки и короткого замыкания УЗО само не защищает — для этого автоматы.', 'ПЗВ порівнює струм у фазі й нулі. Якщо частина струму пішла «повз» (через людину чи корпус на землю), воно вимикає лінію. Від перевантаження і короткого замикання ПЗВ саме не захищає — для цього автомати.'],
      ['Ноль после УЗО — только на свою шину N. Нельзя объединять нули разных УЗО или брать ноль «до» УЗО — будут ложные срабатывания.', 'Нуль після ПЗВ — тільки на свою шину N. Не можна об’єднувати нулі різних ПЗВ або брати нуль «до» ПЗВ — будуть хибні спрацювання.'],
      ['Номинал УЗО — не меньше номинала автомата перед ним (лучше на ступень больше). Раз в месяц–квартал нажимайте кнопку «Т».', 'Номінал ПЗВ — не менше номіналу автомата перед ним (краще на ступінь більше). Раз на місяць–квартал натискайте кнопку «Т».']]
  });

  D.push({
    id: 'panel', title: ['Квартирный щит', 'Квартирний щит'],
    w: 660, h: 350, vy: -32,
    comps: [SRC1(10, 30), { id: 'q0', type: 'cb', x: 110, y: 10, p: 2, label: ['QF0'], sub: ['40 А'] },
      { id: 'r1', type: 'rcd', x: 210, y: 10, label: ['УЗО', 'ПЗВ'], sub: ['40 А 30 мА'] },
      { id: 'q1', type: 'cb', x: 310, y: 110, label: ['QF1'], sub: ['10 А'] }, { id: 'q2', type: 'cb', x: 390, y: 110, label: ['QF2'], sub: ['16 А'] }, { id: 'q3', type: 'cb', x: 470, y: 110, label: ['QF3'], sub: ['32 А'] },
      { id: 'h', type: 'lamp', x: 310, y: 230, lx: -16, label: ['свет', 'світло'] }, { id: 'x', type: 'socket', x: 404, y: 240, label: ['розетки', 'розетки'] }, { id: 'pl', type: 'socket', x: 484, y: 240, label: ['плита', 'плита'] },
      { id: 'nb', type: 'bus', x: 530, y: 200, n: 4, step: 25, kind: 'N', label: ['N'] }, { id: 'pb', type: 'bus', x: 560, y: 140, n: 3, step: 20, kind: 'PE', label: ['PE'] }],
    wires: [['s.L', 'q0.i0', [[86, 44], [86, -8], [110, -8]], 'L'], ['s.N', 'q0.i1', [[96, 64], [96, -16], [130, -16]], 'N'],
      ['q0.o0', 'r1.i0', [[110, 82], [190, 82], [190, -4], [210, -4]], 'L'], ['q0.o1', 'r1.i1', [[130, 74], [182, 74], [182, -12], [230, -12]], 'N'],
      ['r1.o0', 'q1.i0', [[210, 92], [310, 92]], 'L'], ['q1.i0', 'q2.i0', [[310, 92], [390, 92]], 'L'], ['q2.i0', 'q3.i0', [[390, 92], [470, 92]], 'L'], ['r1.o1', 'nb.t0', [[230, 84], [530, 84]], 'N'],
      ['q1.o0', 'h.a', [], 'L'], ['q2.o0', 'x.L', [], 'L'], ['q3.o0', 'pl.L', [], 'L'],
      ['nb.t1', 'x.N', [[555, 214], [404, 214]], 'N'], ['nb.t2', 'pl.N', [[580, 226], [484, 226]], 'N'], ['nb.t3', 'h.b', [[605, 325], [310, 325]], 'N'],
      ['s.PE', 'pb.t2', [[76, 84], [76, 338], [640, 338], [640, 140]], 'PE'], ['pb.t0', 'x.PE', [[560, 180], [418, 180]], 'PE'], ['pb.t1', 'pl.PE', [[580, 190], [498, 190]], 'PE']],
    init: { q0: { on: true }, r1: { on: true }, q1: { on: true }, q2: { on: true }, q3: { on: true } },
    deco: [{ box: [70, -28, 590, 360], label: [''], solid: true }],
    note: [['Типовая квартира: вводной автомат (или выключатель нагрузки), реле напряжения, УЗО на группы, автоматы на каждую линию. Освещение — 1,5 мм² / 10 А, розетки — 2,5 мм² / 16 А, плита — 6 мм² / 32 А, ванная и стиральная машина — отдельные линии с УЗО или дифавтоматом 30 мА.', 'Типова квартира: вступний автомат (або вимикач навантаження), реле напруги, ПЗВ на групи, автомати на кожну лінію. Освітлення — 1,5 мм² / 10 А, розетки — 2,5 мм² / 16 А, плита — 6 мм² / 32 А, ванна і пральна машина — окремі лінії з ПЗВ або дифавтоматом 30 мА.'],
      ['Не больше 3–4 групп на одно УЗО. Суммарный ток автоматов после УЗО с учётом одновременности не должен превышать номинал УЗО.', 'Не більше 3–4 груп на одне ПЗВ. Сумарний струм автоматів після ПЗВ з урахуванням одночасності не повинен перевищувати номінал ПЗВ.'],
      ['Шина PE — общая для всех групп и не проходит через УЗО. Корпус щита тоже присоединяют к PE.', 'Шина PE — спільна для всіх груп і не проходить через ПЗВ. Корпус щита теж приєднують до PE.']]
  });

  D.push({
    id: 'ats', title: ['Генератор: переключатель I–0–II', 'Генератор: перемикач I–0–II'],
    w: 520, h: 290,
    comps: [{ id: 's', type: 'src', x: 10, y: 20, label: ['Сеть', 'Мережа'], lines: [['L', 'L1'], ['N', 'N']] }, { id: 'g', type: 'src', x: 10, y: 140, gen: true, label: ['Генератор', 'Генератор'], lines: [['L', 'GL', 'L'], ['N', 'GN', 'N']] },
      { id: 'k', type: 'ats', x: 220, y: 80, label: ['I–0–II'] }, { id: 'h', type: 'lamp', x: 300, y: 200, label: ['дом', 'будинок'] }],
    wires: [['s.L', 'k.a0', [[180, 34], [180, 60], [220, 60]], 'L'], ['s.N', 'k.a1', [[170, 54], [170, 50], [240, 50]], 'N'], ['g.L', 'k.b0', [[200, 154], [200, 30], [280, 30]], 'GL'], ['g.N', 'k.b1', [[190, 174], [190, 20], [300, 20]], 'GN'],
      ['k.o0', 'h.a', [[250, 180], [300, 180]], 'L'], ['k.o1', 'h.b', [[270, 160], [340, 160], [340, 260], [300, 260]], 'N']],
    deco: [{ text: ['Нажимайте на переключатель: I → 0 → II', 'Натискайте на перемикач: I → 0 → II'], at: [260, 284], size: 10, fill: 'var(--spr-muted)' }],
    info: function (st, S, info, t, U) { var p = (st.k || {}).pos || 0; info.push(['ok', p === 0 ? t(['Положение I: дом питается от сети.', 'Положення I: будинок живиться від мережі.']) : p === 2 ? t(['Положение II: дом питается от генератора, сеть отключена.', 'Положення II: будинок живиться від генератора, мережу відключено.']) : t(['Положение 0: всё отключено.', 'Положення 0: усе відключено.'])]); },
    note: [['Переключатель разрывает и фазу, и ноль (2 полюса для 1ф, 4 полюса для 3ф). Генератор никогда не должен оказаться соединённым с сетью: это опасно для электриков на линии и для самого генератора.', 'Перемикач розриває і фазу, і нуль (2 полюси для 1ф, 4 полюси для 3ф). Генератор ніколи не повинен опинитися з’єднаним з мережею: це небезпечно для електриків на лінії і для самого генератора.'],
      ['Подключение генератора через розетку «вилка-вилка» запрещено.', 'Підключення генератора через розетку «вилка-вилка» заборонене.'],
      ['Вместо ручного переключателя можно поставить два контактора с взаимной блокировкой (механической и электрической) — это АВР.', 'Замість ручного перемикача можна поставити два контактори з взаємним блокуванням (механічним і електричним) — це АВР.']]
  });

  D.push({
    id: 'starter', title: ['Магнитный пускатель: Пуск / Стоп', 'Магнітний пускач: Пуск / Стоп'],
    w: 560, h: 335, vy: -12,
    comps: [{ id: 's', type: 'src', x: 10, y: 20, label: ['3ф 400 В', '3ф 400 В'], lines: [['L1', 'L1'], ['L2', 'L2'], ['L3', 'L3'], ['N', 'N'], ['PE', 'PE']] },
      { id: 'q', type: 'cb', x: 300, y: 10, p: 3, label: ['QF'] },
      { id: 'km', type: 'contactor', x: 260, y: 140, label: ['KM'] }, { id: 'm', type: 'motor', x: 340, y: 240 },
      { id: 'sb1', type: 'btnnc', x: 160, y: 120, label: ['Стоп', 'Стоп'] }, { id: 'sb2', type: 'btn', x: 160, y: 190, label: ['Пуск', 'Пуск'] }, { id: 'n1', type: 'node', x: 160, y: 176 }, { id: 'n2', type: 'node', x: 160, y: 250 }],
    wires: [['s.L1', 'q.i0', [[300, 34]], 'L1'], ['s.L2', 'q.i1', [[110, 54], [110, 4], [320, 4]], 'L2'], ['s.L3', 'q.i2', [[118, 74], [118, -2], [340, -2]], 'L3'],
      ['q.o0', 'km.i0', [[300, 120], [300, 140]], 'L1'], ['q.o1', 'km.i1', [], 'L2'], ['q.o2', 'km.i2', [], 'L3'],
      ['km.o0', 'm.U', [[300, 220], [320, 220]], 'L1'], ['km.o1', 'm.V', [[320, 210], [340, 210]], 'L2'], ['km.o2', 'm.W', [[340, 200], [360, 200]], 'L3'],
      ['q.o0', 'sb1.a', [[300, 100], [160, 100]], 'L1'], ['sb1.b', 'n1.p', [], 'L1'], ['n1.p', 'sb2.a', [], 'L1'], ['sb2.b', 'n2.p', [], 'L1'], ['n2.p', 'km.A1', [[230, 250], [230, 132], [260, 132]], 'L1'],
      ['n1.p', 'km.n13', [[130, 176], [130, 110], [370, 110], [370, 140]], 'L1'], ['km.n14', 'n2.p', [[370, 290], [160, 290]], 'L1'],
      ['km.A2', 's.N', [[260, 300], [100, 300], [100, 94], [62, 94]], 'N'], ['s.PE', 'm.PE', [[90, 114], [90, 332], [380, 332]], 'PE']],
    deco: [{ text: ['Нажмите «Пуск», затем «Стоп»', 'Натисніть «Пуск», потім «Стоп»'], at: [460, 60], size: 10, fill: 'var(--spr-muted)' }],
    init: { q: { on: true } },
    note: [['При нажатии «Пуск» катушка KM получает питание, контактор замыкает силовые контакты и вспомогательный контакт 13–14, который «подхватывает» кнопку. Отпустили «Пуск» — двигатель продолжает работать. «Стоп» (нормально замкнутая) разрывает цепь катушки.', 'При натисканні «Пуск» котушка KM отримує живлення, контактор замикає силові контакти і допоміжний контакт 13–14, який «підхоплює» кнопку. Відпустили «Пуск» — двигун продовжує працювати. «Стоп» (нормально замкнена) розриває коло котушки.'],
      ['Катушка здесь на 230 В (фаза + ноль). Бывают катушки на 400 В — тогда вместо нуля берут другую фазу. Смотрите маркировку катушки!', 'Котушка тут на 230 В (фаза + нуль). Бувають котушки на 400 В — тоді замість нуля беруть іншу фазу. Дивіться маркування котушки!'],
      ['Для защиты двигателя от перегрузки добавляют тепловое реле или автомат защиты двигателя.', 'Для захисту двигуна від перевантаження додають теплове реле або автомат захисту двигуна.']]
  });

  D.push({
    id: 'tncs', title: ['Разделение PEN (TN-C-S)', 'Розділення PEN (TN-C-S)'],
    w: 540, h: 300,
    comps: [{ id: 's', type: 'src', x: 10, y: 30, label: ['Ввод TN-C', 'Ввід TN-C'], lines: [['L', 'L1'], ['PEN', 'N+PE', 'PEN']] }, { id: 'brk', type: 'sw', x: 110, y: 90, label: ['целостность PEN', 'цілісність PEN'], lx: -14 },
      { id: 'pb', type: 'bus', x: 160, y: 170, n: 4, step: 22, kind: 'PE', label: ['PE'] }, { id: 'nb', type: 'bus', x: 300, y: 120, n: 3, step: 22, kind: 'N', label: ['N'] },
      { id: 'gz', type: 'gnd', x: 160, y: 230, label: ['повторное заземление', 'повторне заземлення'] },
      { id: 'q', type: 'cb', x: 400, y: 20, label: ['QF'] }, { id: 'x', type: 'socket', x: 440, y: 170 }],
    wires: [['s.L', 'q.i0', [[400, 44]], 'L'], ['s.PEN', 'brk.a', [[110, 64]], 'PEN'], ['brk.b', 'pb.t0', [[110, 170]], 'PEN'], ['pb.t1', 'nb.t0', [[182, 120]], 'N'], ['pb.t0', 'gz.p', [[160, 200]], 'PE'],
      ['q.o0', 'x.L', [[400, 120], [426, 120]], 'L'], ['nb.t2', 'x.N', [[344, 140], [440, 140]], 'N'], ['pb.t3', 'x.PE', [[226, 160], [454, 160]], 'PE']],
    init: { brk: { on: true }, q: { on: true } },
    info: function (st, S, info, t) { if (!st.brk.on) info.push(['bad', t(['Обрыв PEN до точки разделения: ноль и PE в доме отвязаны от трансформатора. Через включённые приборы на PE и корпусах может появиться фазное напряжение! Спасает повторное заземление и реле напряжения, но не УЗО.', 'Обрив PEN до точки розділення: нуль і PE в будинку відв’язані від трансформатора. Через увімкнені прилади на PE і корпусах може з’явитися фазна напруга! Рятує повторне заземлення і реле напруги, але не ПЗВ.'])]); },
    note: [['PEN разделяют один раз — на вводе в здание (ВРУ) или в щите дома: PEN приходит на шину PE, от неё перемычка на шину N. После точки разделения N и PE больше никогда не соединяют.', 'PEN розділяють один раз — на вводі в будівлю (ВРП) або в щиті будинку: PEN приходить на шину PE, від неї перемичка на шину N. Після точки розділення N і PE більше ніколи не з’єднують.'],
      ['В точке разделения рекомендуется повторное заземление (сопротивление не более 30 Ом, ПУЭ 1.7.103). Для частного дома с воздушным вводом это особенно важно.', 'У точці розділення рекомендується повторне заземлення (опір не більше 30 Ом, ПУЕ 1.7.103). Для приватного будинку з повітряним вводом це особливо важливо.'],
      ['PEN-проводник не должен разрываться: в нём запрещено ставить автоматы, предохранители и выключатели.', 'PEN-провідник не повинен розриватися: у ньому заборонено ставити автомати, запобіжники і вимикачі.']]
  });

  // Звезда / треугольник — отдельная отрисовка
  var STARDELTA = {
    id: 'stardelta', title: ['Двигатель: звезда и треугольник', 'Двигун: зірка і трикутник'], custom: true,
    note: [['На шильдике двигателя пишут два напряжения, например Δ/Y 230/400 В. Сеть 3×400 В → «звезда». Сеть 3×230 В (редко) или однофазная сеть через конденсатор → «треугольник».', 'На шильдику двигуна пишуть дві напруги, наприклад Δ/Y 230/400 В. Мережа 3×400 В → «зірка». Мережа 3×230 В (рідко) або однофазна мережа через конденсатор → «трикутник».'],
      ['Двигатели 400/690 В в сети 400 В включают только «треугольником».', 'Двигуни 400/690 В у мережі 400 В вмикають тільки «трикутником».'],
      ['Чтобы изменить направление вращения трёхфазного двигателя, поменяйте местами любые две фазы.', 'Щоб змінити напрямок обертання трифазного двигуна, поміняйте місцями будь-які дві фази.']],
    render: function (box, t, onInfo) {
      var mode = 'star';
      var wrap = document.createElement('div'); box.appendChild(wrap);
      var bar = document.createElement('div'); bar.className = 'spr-seg'; box.insertBefore(bar, wrap);
      [['star', ['Звезда Y', 'Зірка Y']], ['delta', ['Треугольник Δ', 'Трикутник Δ']]].forEach(function (m) {
        var b = document.createElement('button'); b.textContent = t(m[1]); b.onclick = function () { mode = m[0]; draw(); }; b.dataset.m = m[0]; bar.appendChild(b);
      });
      function draw() {
        Array.prototype.forEach.call(bar.children, function (b) { b.classList.toggle('on', b.dataset.m === mode); });
        wrap.innerHTML = '';
        var svg = el('svg', { viewBox: '0 0 460 260', class: 'spr-circ' }, wrap);
        el('rect', { x: 120, y: 60, width: 220, height: 150, rx: 10, fill: 'var(--spr-panel)', stroke: 'var(--spr-muted)' }, svg);
        txt(svg, 230, 52, t(['клеммная коробка двигателя', 'клемна коробка двигуна']), { size: 10, fill: 'var(--spr-muted)' });
        var top = [['W2', 160], ['U2', 230], ['V2', 300]], bot = [['U1', 160], ['V1', 230], ['W1', 300]];
        top.forEach(function (p) { el('circle', { cx: p[1], cy: 100, r: 13, fill: '#fff', stroke: '#333', 'stroke-width': 1.6 }, svg); txt(svg, p[1], 104, p[0], { size: 10, bold: true }); });
        bot.forEach(function (p) { el('circle', { cx: p[1], cy: 170, r: 13, fill: '#fff', stroke: '#333', 'stroke-width': 1.6 }, svg); txt(svg, p[1], 174, p[0], { size: 10, bold: true }); });
        var J = '#c77700';
        if (mode === 'star') el('rect', { x: 146, y: 92, width: 168, height: 16, rx: 6, fill: 'none', stroke: J, 'stroke-width': 4 }, svg);
        else [160, 230, 300].forEach(function (x) { el('rect', { x: x - 8, y: 96, width: 16, height: 78, rx: 6, fill: 'none', stroke: J, 'stroke-width': 4 }, svg); });
        [['L1', 160, COL.L1], ['L2', 230, COL.L2], ['L3', 300, COL.L3]].forEach(function (p) { el('line', { x1: p[1], y1: 183, x2: p[1], y2: 240, stroke: p[2], 'stroke-width': 3 }, svg); txt(svg, p[1] + 16, 236, p[0], { size: 10, bold: true }); });
        // мини-схема обмоток
        var g = el('g', { transform: 'translate(395,130)' }, svg);
        if (mode === 'star') { [[0, -40], [-35, 25], [35, 25]].forEach(function (p) { el('line', { x1: 0, y1: 0, x2: p[0], y2: p[1], stroke: '#333', 'stroke-width': 2.5 }, g); el('circle', { cx: p[0], cy: p[1], r: 3, fill: '#333' }, g); }); }
        else el('path', { d: 'M0 -40 L35 25 L-35 25 Z', fill: 'none', stroke: '#333', 'stroke-width': 2.5 }, g);
        txt(g, 0, 55, mode === 'star' ? 'Y' : 'Δ', { size: 16, bold: true });
        onInfo([['ok', mode === 'star' ? t(['Звезда: перемычка соединяет концы W2–U2–V2. На каждую обмотку 230 В при сети 400 В. Ток в линии равен току обмотки.', 'Зірка: перемичка з’єднує кінці W2–U2–V2. На кожну обмотку 230 В при мережі 400 В. Струм у лінії дорівнює струму обмотки.']) : t(['Треугольник: три перемычки U1–W2, V1–U2, W1–V2. На каждую обмотку линейное напряжение сети. Ток в линии в √3 ≈ 1,73 раза больше тока обмотки.', 'Трикутник: три перемички U1–W2, V1–U2, W1–V2. На кожну обмотку лінійна напруга мережі. Струм у лінії в √3 ≈ 1,73 раза більший за струм обмотки.'])]]);
      }
      draw();
      return { reset: function () { mode = 'star'; draw(); } };
    }
  };
  D.splice(10, 0, STARDELTA);

  return { list: D, render: render, settle: settle, solve: solve, TYPES: TYPES };
})();
if (typeof module !== 'undefined') module.exports = SPCirc;
