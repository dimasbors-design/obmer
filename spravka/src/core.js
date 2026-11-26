// Справочник электрика: расчётное ядро (без интерфейса). Все функции чистые, проверяются в test.js.
var SPC = (function () {
  'use strict';
  var C = {};

  // ---------- Допустимые длительные токи, ПУЭ табл. 1.3.4–1.3.7 (изоляция ПВХ/резина, жила 65 °C, воздух 25 °C, земля 15 °C) ----------
  // Провода: [открыто, 2 одножильных в трубе, 3 одножильных, 4 одножильных, 1 двухжильный в трубе, 1 трёхжильный в трубе]
  // Кабели:  [одножильный в воздухе, двухжильный в воздухе, двухжильный в земле, трёхжильный в воздухе, трёхжильный в земле]
  C.SECTIONS = [1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120];
  C.T = {
    cu_w: { 1: [17, 16, 15, 14, 15, 14], 1.5: [23, 19, 17, 16, 18, 15], 2.5: [30, 27, 25, 25, 25, 21], 4: [41, 38, 35, 30, 32, 27], 6: [50, 46, 42, 40, 40, 34], 10: [80, 70, 60, 50, 55, 50], 16: [100, 85, 80, 75, 80, 70], 25: [140, 115, 100, 90, 100, 85], 35: [170, 135, 125, 115, 125, 100], 50: [215, 185, 170, 150, 160, 135], 70: [270, 225, 210, 185, 195, 175], 95: [330, 275, 255, 225, 245, 215], 120: [385, 315, 290, 260, 295, 250] },
    al_w: { 2.5: [24, 20, 19, 19, 19, 16], 4: [32, 28, 28, 23, 25, 21], 6: [39, 36, 32, 30, 31, 26], 10: [60, 50, 47, 39, 42, 38], 16: [75, 60, 60, 55, 60, 55], 25: [105, 85, 80, 70, 75, 65], 35: [130, 100, 95, 85, 95, 75], 50: [165, 140, 130, 120, 125, 105], 70: [210, 175, 165, 140, 150, 135], 95: [255, 215, 200, 175, 190, 165], 120: [295, 245, 220, 200, 230, 190] },
    cu_c: { 1.5: [23, 19, 33, 19, 27], 2.5: [30, 27, 44, 25, 38], 4: [41, 38, 55, 35, 49], 6: [50, 50, 70, 42, 60], 10: [80, 70, 105, 55, 90], 16: [100, 90, 135, 75, 115], 25: [140, 115, 175, 95, 150], 35: [170, 140, 210, 120, 180], 50: [215, 175, 265, 145, 225], 70: [270, 215, 320, 180, 275], 95: [325, 260, 385, 220, 330], 120: [385, 300, 445, 260, 385] },
    al_c: { 2.5: [23, 21, 34, 19, 29], 4: [31, 29, 42, 27, 38], 6: [38, 38, 55, 32, 46], 10: [60, 55, 80, 42, 70], 16: [75, 70, 105, 60, 90], 25: [105, 90, 135, 75, 115], 35: [130, 105, 160, 90, 140], 50: [165, 135, 205, 110, 175], 70: [210, 165, 245, 140, 210], 95: [250, 200, 295, 170, 255], 120: [295, 230, 340, 200, 295] }
  };
  // Способы прокладки: таблица (w — провода, c — кабели), столбец, земля ли (норм. температура 15 °C)
  C.LAYING = {
    wall1: { t: 'w', col: 4, gnd: false },   // 1 двух-/трёхжильный кабель (1ф с PE) скрыто в стене, в трубе, в гофре
    wall3: { t: 'w', col: 5, gnd: false },   // 1 четырёх-/пятижильный кабель (3ф) скрыто, в трубе
    air2: { t: 'c', col: 1, gnd: false },    // кабель 1ф открыто по стене, в лотке, в воздухе
    air3: { t: 'c', col: 3, gnd: false },    // кабель 3ф открыто
    gnd2: { t: 'c', col: 2, gnd: true },     // кабель 1ф в земле
    gnd3: { t: 'c', col: 4, gnd: true },     // кабель 3ф в земле
    open: { t: 'w', col: 0, gnd: false },    // одножильные провода открыто
    pipe2: { t: 'w', col: 1, gnd: false },   // 2 одножильных провода в одной трубе
    pipe3: { t: 'w', col: 2, gnd: false },
    pipe4: { t: 'w', col: 3, gnd: false }
  };
  C.BREAKERS = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250];
  C.RHO = { cu: 0.0225, al: 0.036 }; // Ом·мм²/м, жила в рабочем режиме (≈1,25·ρ20, как в IEC 60364-5-52)
  C.X = 0.00008; // Ом/м, индуктивное сопротивление кабеля до 1 кВ

  C.iTab = function (mat, lay, s) {
    var L = C.LAYING[lay]; if (!L) return null;
    var tb = C.T[mat + '_' + L.t]; var r = tb && tb[s];
    return r ? r[L.col] : null;
  };
  // Поправка на температуру среды (ПУЭ табл. 1.3.3 — та же формула)
  C.kTemp = function (tAmb, gnd) {
    var tn = gnd ? 15 : 25, tmax = 65;
    if (tAmb >= tmax) return 0;
    return Math.sqrt((tmax - tAmb) / (tmax - tn));
  };
  // Поправка на группу кабелей, проложенных рядом (IEC 60364-5-52, табл. B.52.17, пучок на поверхности)
  C.kGroup = function (n) {
    var t = { 1: 1, 2: 0.8, 3: 0.7, 4: 0.65, 5: 0.6, 6: 0.57, 7: 0.54, 8: 0.52, 9: 0.5 };
    n = Math.max(1, Math.round(n || 1));
    if (t[n]) return t[n];
    if (n <= 12) return 0.45; if (n <= 16) return 0.41; return 0.38;
  };
  C.current = function (pKw, phases, u, cos) {
    var p = pKw * 1000; cos = cos || 1;
    return phases === 3 ? p / (Math.sqrt(3) * u * cos) : p / (u * cos);
  };
  C.power = function (i, phases, u, cos) {
    cos = cos || 1;
    return (phases === 3 ? Math.sqrt(3) * u * i * cos : u * i * cos) / 1000;
  };
  C.nextBreaker = function (i) { for (var k = 0; k < C.BREAKERS.length; k++) if (C.BREAKERS[k] >= i - 1e-9) return C.BREAKERS[k]; return null; };
  C.maxBreaker = function (iz) { var r = null; for (var k = 0; k < C.BREAKERS.length; k++) if (C.BREAKERS[k] <= iz + 1e-9) r = C.BREAKERS[k]; return r; };

  // Подбор сечения по току. Возвращает строки таблицы и минимальное подходящее сечение.
  C.cable = function (o) {
    var L = C.LAYING[o.lay];
    var kt = C.kTemp(o.t == null ? (L.gnd ? 15 : 25) : o.t, L.gnd), kg = C.kGroup(o.n);
    var k = kt * kg, rows = [], pick = null;
    var minS = o.mat === 'cu' ? (o.minS || 1.5) : 2.5;
    C.SECTIONS.forEach(function (s) {
      var it = C.iTab(o.mat, o.lay, s); if (it == null) return;
      var iz = it * k, qf = C.maxBreaker(iz);
      var ok = iz >= o.i && s >= minS;
      // защита автоматом: нужен номинал In, где Ib ≤ In ≤ Iz
      var inb = C.nextBreaker(o.i), prot = inb != null && inb <= iz + 1e-9;
      rows.push({ s: s, it: it, iz: iz, qf: qf, ok: ok, prot: prot });
      if (pick == null && ok && prot) pick = s;
    });
    return { k: k, kt: kt, kg: kg, rows: rows, pick: pick, minS: minS };
  };

  // Падение напряжения. L — длина линии в одну сторону, м.
  C.vdrop = function (o) {
    var r = C.RHO[o.mat] / o.s, x = C.X, cos = o.cos || 1, sin = Math.sqrt(Math.max(0, 1 - cos * cos));
    var z = r * cos + x * sin;
    var du = o.phases === 3 ? Math.sqrt(3) * o.i * o.l * z : 2 * o.i * o.l * z;
    var pct = du / o.u * 100;
    var lmax = function (p) { return p / 100 * o.u / ((o.phases === 3 ? Math.sqrt(3) : 2) * o.i * z); };
    var ploss = (o.phases === 3 ? 3 : 2) * o.i * o.i * r * o.l; // Вт
    return { du: du, pct: pct, uEnd: o.u - du, l3: lmax(3), l5: lmax(5), ploss: ploss };
  };

  // Петля фаза-ноль (TN). Zext — сопротивление петли до начала линии (замер в щите), Ом.
  C.MULT = { B: 5, C: 10, D: 20 };
  C.loop = function (o) {
    var rl = 2 * C.RHO[o.mat] * o.l / o.s;
    var zs = (o.zext || 0) + rl;
    var ik = 0.95 * 230 / zs;
    var ia = C.MULT[o.curve] * o.inom;
    var zmax = 0.95 * 230 / ia;
    var lmax = Math.max(0, (zmax - (o.zext || 0)) * o.s / (2 * C.RHO[o.mat]));
    return { rl: rl, zs: zs, ik: ik, ia: ia, ok: ik >= ia, zmax: zmax, lmax: lmax };
  };

  // Диаметр ↔ сечение
  C.secFromD = function (d, n) { return (n || 1) * Math.PI * d * d / 4; };
  C.dFromSec = function (s, n) { return Math.sqrt(4 * s / ((n || 1) * Math.PI)); };
  // AWG
  C.awgD = function (n) { return 0.127 * Math.pow(92, (36 - n) / 39); };
  C.AWG = [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];
  C.awgName = function (n) { return n === -3 ? '0000 (4/0)' : n === -2 ? '000 (3/0)' : n === -1 ? '00 (2/0)' : String(n); };
  C.awgFromSec = function (s) {
    var best = null, bd = 1e9;
    C.AWG.forEach(function (n) { var a = C.secFromD(C.awgD(n)); var d = Math.abs(Math.log(a / s)); if (d < bd) { bd = d; best = n; } });
    return best;
  };

  // Конденсатор для трёхфазного двигателя в однофазной сети
  C.motorCap = function (o) {
    var i = o.i;
    if (!i) i = o.p * 1000 / (Math.sqrt(3) * (o.conn === 'delta' ? 230 : 400) * o.eta * o.cos);
    var k = o.conn === 'delta' ? 4800 : 2800;
    var cr = k * i / o.u;
    return { i: i, cr: cr, cp: cr * 2.5, pout: o.p ? o.p * 0.65 : null };
  };

  // Освещённость (метод коэффициента использования)
  C.UTIL = [[0.5, 0.3], [0.6, 0.35], [0.8, 0.42], [1, 0.47], [1.25, 0.52], [1.5, 0.56], [2, 0.62], [2.5, 0.66], [3, 0.69], [4, 0.73], [5, 0.75]];
  C.interp = function (tab, x) {
    if (x <= tab[0][0]) return tab[0][1];
    for (var k = 1; k < tab.length; k++) if (x <= tab[k][0]) { var a = tab[k - 1], b = tab[k]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
    return tab[tab.length - 1][1];
  };
  C.light = function (o) {
    var s = o.a * o.b, hp = Math.max(0.3, o.h - (o.hw || 0) - (o.hc || 0));
    var idx = s / (hp * (o.a + o.b));
    var eta = o.eta || C.interp(C.UTIL, idx);
    var ftot = o.e * s * o.kz / eta;
    var n = Math.ceil(ftot / o.f - 1e-9);
    return { s: s, idx: idx, eta: eta, ftot: ftot, n: n, eReal: n * o.f * eta / (s * o.kz), w: o.lmw ? ftot / o.lmw : null };
  };

  // Автономность от аккумуляторов через инвертор
  C.ups = function (o) {
    var wh = o.v * o.ah * (o.cnt || 1);
    var use = wh * o.dod * o.eta;
    var h = use / o.p;
    var need = o.hours ? o.p * o.hours / (o.v * o.dod * o.eta) : null; // А·ч при данном напряжении
    return { wh: wh, use: use, h: h, need: need };
  };

  // Вертикальный заземлитель (стержень), сопротивление растеканию
  C.SOIL = { peat: 20, clay: 40, loam: 100, chern: 200, sandloam: 300, sand: 500, stony: 1000 };
  C.ETA_ROW = { 1: [[1, 1], [2, 0.85], [3, 0.8], [5, 0.7], [10, 0.59], [15, 0.54], [20, 0.49]], 2: [[1, 1], [2, 0.91], [3, 0.87], [5, 0.81], [10, 0.75], [15, 0.71], [20, 0.68]], 3: [[1, 1], [2, 0.94], [3, 0.91], [5, 0.87], [10, 0.81], [15, 0.78], [20, 0.75]] };
  C.ground = function (o) {
    var L = o.l, d = o.d / 1000, t = o.t0 + L / 2, rho = o.rho * (o.psi || 1);
    var r1 = rho / (2 * Math.PI * L) * (Math.log(2 * L / d) + 0.5 * Math.log((4 * t + L) / (4 * t - L)));
    var ratio = Math.max(1, Math.min(3, Math.round(o.a / L)));
    var eta = o.n > 1 ? C.interp(C.ETA_ROW[ratio], o.n) : 1;
    var rn = r1 / (o.n * eta);
    return { r1: r1, eta: eta, rn: rn, ratio: ratio };
  };

  // ---------- Электроника ----------
  C.E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
  C.e24Up = function (r) {
    if (!(r > 0)) return null;
    var dec = Math.pow(10, Math.floor(Math.log10(r)));
    for (var k = 0; k < 2; k++) { for (var j = 0; j < C.E24.length; j++) { var v = C.E24[j] * dec; if (v >= r * (1 - 1e-9)) return +v.toPrecision(3); } dec *= 10; }
    return null;
  };
  C.e24Near = function (r) {
    if (!(r > 0)) return null;
    var dec = Math.pow(10, Math.floor(Math.log10(r))), best = null, bd = 1e9;
    [dec / 10, dec, dec * 10].forEach(function (dd) { C.E24.forEach(function (m) { var v = m * dd, e = Math.abs(Math.log(v / r)); if (e < bd) { bd = e; best = +v.toPrecision(3); } }); });
    return best;
  };
  C.PWR = [0.125, 0.25, 0.5, 1, 2, 3, 5, 10];
  C.pwrUp = function (p) { for (var k = 0; k < C.PWR.length; k++) if (C.PWR[k] >= p) return C.PWR[k]; return null; };
  // Закон Ома: любые две величины из U, I, R, P
  C.ohm = function (o) {
    var U = o.u, I = o.i, R = o.r, P = o.p, has = function (v) { return v != null && isFinite(v) && v !== '' ; };
    var n = [U, I, R, P].filter(has).length; if (n < 2) return null;
    if (has(U) && has(I)) { R = U / I; P = U * I; }
    else if (has(U) && has(R)) { I = U / R; P = U * I; }
    else if (has(U) && has(P)) { I = P / U; R = U / I; }
    else if (has(I) && has(R)) { U = I * R; P = U * I; }
    else if (has(I) && has(P)) { U = P / I; R = U / I; }
    else if (has(R) && has(P)) { U = Math.sqrt(P * R); I = U / R; }
    return { u: U, i: I, r: R, p: P };
  };
  C.ledRes = function (o) {
    var drop = o.us - o.uf * (o.n || 1);
    if (drop <= 0) return { err: true };
    var r = drop / (o.ma / 1000), re = C.e24Up(r), ireal = drop / re * 1000, pr = drop * drop / re;
    return { r: r, re: re, ireal: ireal, pr: pr, prate: C.pwrUp(pr * 2), pled: o.uf * ireal / 1000 };
  };
  C.divider = function (o) { return o.uin * o.r2 / (o.r1 + o.r2); };
  C.dividerR1 = function (o) { return o.r2 * (o.uin - o.uout) / o.uout; };
  // Цветовая маркировка резисторов
  C.COLORS = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white', 'gold', 'silver'];
  C.HEX = { black: '#111', brown: '#7a4a1e', red: '#d32f2f', orange: '#f57c00', yellow: '#fbc02d', green: '#388e3c', blue: '#1976d2', violet: '#7b1fa2', grey: '#8a8a8a', white: '#f4f4f4', gold: '#c9a227', silver: '#b8bec5' };
  C.MULTC = { black: 1, brown: 10, red: 100, orange: 1e3, yellow: 1e4, green: 1e5, blue: 1e6, violet: 1e7, grey: 1e8, white: 1e9, gold: 0.1, silver: 0.01 };
  C.TOL = { brown: 1, red: 2, green: 0.5, blue: 0.25, violet: 0.1, grey: 0.05, gold: 5, silver: 10, none: 20 };
  C.TCR = { black: 250, brown: 100, red: 50, orange: 15, yellow: 25, green: 20, blue: 10, violet: 5, grey: 1 };
  C.resColor = function (bands) { // bands: массив названий цветов (4, 5 или 6)
    var n = bands.length, dig = n === 4 ? 2 : 3, v = 0;
    for (var k = 0; k < dig; k++) { var d = C.COLORS.indexOf(bands[k]); if (d < 0 || d > 9) return null; v = v * 10 + d; }
    var m = C.MULTC[bands[dig]]; if (m == null) return null;
    return { r: +(v * m).toPrecision(6), tol: C.TOL[bands[dig + 1]], tcr: n === 6 ? C.TCR[bands[5]] : null };
  };
  // SMD-код резистора: 3 цифры, 4 цифры, R-обозначение, EIA-96
  C.EIA96 = [100, 102, 105, 107, 110, 113, 115, 118, 121, 124, 127, 130, 133, 137, 140, 143, 147, 150, 154, 158, 162, 165, 169, 174, 178, 182, 187, 191, 196, 200, 205, 210, 215, 221, 226, 232, 237, 243, 249, 255, 261, 267, 274, 280, 287, 294, 301, 309, 316, 324, 332, 340, 348, 357, 365, 374, 383, 392, 402, 412, 422, 432, 442, 453, 464, 475, 487, 499, 511, 523, 536, 549, 562, 576, 590, 604, 619, 634, 649, 665, 681, 698, 715, 732, 750, 768, 787, 806, 825, 845, 866, 887, 909, 931, 953, 976];
  C.EIAM = { Z: 0.001, Y: 0.01, R: 0.01, X: 0.1, S: 0.1, A: 1, B: 10, H: 10, C: 100, D: 1000, E: 10000, F: 100000 };
  C.smd = function (code) {
    var s = String(code || '').trim().toUpperCase().replace(',', '.');
    var m;
    if ((m = s.match(/^(\d{2})([ZYRXSABHCDEF])$/))) { var i = +m[1]; if (i < 1 || i > 96) return null; return { r: +(C.EIA96[i - 1] * C.EIAM[m[2]]).toPrecision(6), kind: 'eia96', tol: 1 }; }
    if ((m = s.match(/^(\d*)R(\d*)$/)) && (m[1] || m[2])) return { r: parseFloat((m[1] || '0') + '.' + (m[2] || '0')), kind: 'r' };
    if ((m = s.match(/^(\d*)M(\d+)$/)) && m[1]) return { r: parseFloat(m[1] + '.' + m[2]) * 1e-3, kind: 'r' };
    if (/^\d{3}$/.test(s)) return { r: +s.slice(0, 2) * Math.pow(10, +s[2]), kind: '3', tol: 5 };
    if (/^\d{4}$/.test(s)) return { r: +s.slice(0, 3) * Math.pow(10, +s[3]), kind: '4', tol: 1 };
    if (s === '0' || s === '00' || s === '000') return { r: 0, kind: 'jumper' };
    return null;
  };
  // Код конденсатора (пФ): 104 = 10·10⁴ пФ = 100 нФ; 4R7 = 4,7 пФ
  C.CTOL = { B: '±0,1 pF', C: '±0,25 pF', D: '±0,5 pF', F: '±1 %', G: '±2 %', J: '±5 %', K: '±10 %', M: '±20 %', Z: '+80/−20 %' };
  C.capCode = function (code) {
    var s = String(code || '').trim().toUpperCase().replace(',', '.'), m, tol = null;
    if ((m = s.match(/^(.*?)([BCDFGJKMZ])$/)) && m[1]) { tol = C.CTOL[m[2]]; s = m[1]; }
    var pf = null;
    if ((m = s.match(/^(\d+)R(\d+)$/))) pf = parseFloat(m[1] + '.' + m[2]);
    else if ((m = s.match(/^(\d*)([PNU])(\d*)$/)) && (m[1] || m[3])) pf = parseFloat((m[1] || '0') + '.' + (m[3] || '0')) * { P: 1, N: 1e3, U: 1e6 }[m[2]];
    else if (/^\d{3}$/.test(s)) pf = +s.slice(0, 2) * Math.pow(10, +s[2] === 9 ? -1 : +s[2] === 8 ? -2 : +s[2]);
    else if (/^\d{1,2}$/.test(s)) pf = +s;
    if (pf == null) return null;
    return { pf: +pf.toPrecision(6), tol: tol };
  };
  // Блок питания для LED-ленты
  C.ledPsu = function (o) {
    var p = o.wm * o.len;
    var need = p * 1.2;
    var std = [15, 25, 36, 50, 60, 75, 100, 120, 150, 200, 240, 300, 350, 400, 480, 600];
    var psu = null; for (var k = 0; k < std.length; k++) if (std[k] >= need) { psu = std[k]; break; }
    var i = p / o.v;
    var maxLen = o.v <= 5 ? 2 : o.v <= 12 ? 5 : o.v <= 24 ? 10 : 20; // длина при одностороннем подключении без подпитки
    return { p: p, need: need, psu: psu, i: i, feed: o.len > maxLen, maxLen: maxLen };
  };

  // ---------- Форматирование ----------
  C.fmt = function (v, d) {
    if (v == null || !isFinite(v)) return '—';
    if (d == null) d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
    var s = (+v).toFixed(d);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ').replace(/(,\d*?) (?=\d)/g, '$1');
  };
  C.fmtSI = function (v, unit) {
    if (v == null || !isFinite(v)) return '—';
    var a = Math.abs(v), p = [[1e9, 'Г'], [1e6, 'М'], [1e3, 'к'], [1, ''], [1e-3, 'м'], [1e-6, 'мк'], [1e-9, 'н'], [1e-12, 'п']];
    if (a === 0) return '0 ' + unit;
    for (var k = 0; k < p.length; k++) if (a >= p[k][0] * 0.9995) return C.fmt(+(v / p[k][0]).toPrecision(4)) + ' ' + p[k][1] + unit;
    return C.fmt(v) + ' ' + unit;
  };
  C.fmtOhm = function (r) {
    if (r == null || !isFinite(r)) return '—';
    if (r >= 1e6) return C.fmt(+(r / 1e6).toPrecision(4)) + ' МОм';
    if (r >= 1e3) return C.fmt(+(r / 1e3).toPrecision(4)) + ' кОм';
    return C.fmt(+r.toPrecision(4)) + ' Ом';
  };
  C.fmtPf = function (pf) {
    if (pf >= 1e6) return C.fmt(+(pf / 1e6).toPrecision(4)) + ' мкФ';
    if (pf >= 1e3) return C.fmt(+(pf / 1e3).toPrecision(4)) + ' нФ';
    return C.fmt(+pf.toPrecision(4)) + ' пФ';
  };
  C.fmtHours = function (h) {
    if (!isFinite(h)) return '—';
    var m = Math.round(h * 60); return Math.floor(m / 60) + ' ч ' + String(m % 60).padStart(2, '0') + ' мин';
  };
  return C;
})();
if (typeof module !== 'undefined') module.exports = SPC;
