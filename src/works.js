// Сопоставление продиктованной работы с каталогом сметы ДомоПлана
(function (root) {
  'use strict';
  var STOP = {'и':1,'в':1,'на':1,'с':1,'со':1,'по':1,'под':1,'до':1,'из':1,'для':1,'от':1,'без':1,'мм':1,'слоя':1,'слой':1,'шт':1};
  function nrm(s) { return String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function stems(s) { return nrm(s).split(' ').filter(function (w) { return w.length > 1 && !STOP[w] && !/^\d+$/.test(w); }).map(function (w) { return w.length > 5 ? w.slice(0, w.length > 7 ? 6 : 5) : w; }); }
  var SYN = {'покрас': ['покрас', 'окрас'], 'шпакле': ['шпакл'], 'шпакл': ['шпакл'], 'грунто': ['грунт'], 'грунт': ['грунт'], 'потоло': ['потол'], 'потол': ['потол'], 'обои': ['обоев', 'обои'], 'обоев': ['обоев', 'обои'], 'ламина': ['ламин'], 'плитки': ['плитк'], 'плитка': ['плитк'], 'плитку': ['плитк'], 'кафель': ['плитк']};
  var CAT = null, IDX = null;
  function init(cat) {
    CAT = cat; IDX = cat.map(function (w) { return stems(w[3]); });
  }
  function match(text, n) {
    if (!CAT) return [];
    var q = stems(text);
    if (!q.length) return [];
    var res = [];
    for (var i = 0; i < CAT.length; i++) {
      var ns = IDX[i], score = 0, hit = 0;
      q.forEach(function (qs) {
        var alts = SYN[qs] || [qs], best = 0;
        alts.forEach(function (a) {
          ns.forEach(function (t) {
            var k = Math.min(a.length, t.length, 5);
            if (k >= 3 && a.slice(0, k) === t.slice(0, k)) best = Math.max(best, k >= 4 ? 1 : 0.6);
          });
        });
        if (best) hit++;
        score += best;
      });
      if (!hit) continue;
      score = score / q.length - 0.04 * Math.max(0, ns.length - hit) + (CAT[i][1] !== 'manual' ? 0.03 : 0) + (/^wx_/.test(CAT[i][0]) ? 0 : 0.02);
      if (/^(d_|wx_[1-9]$|wx_[1-8][0-9]$)/.test(CAT[i][0]) && !/демонт|снят|удал|сбив|отбив|разбор|снести|сломать/.test(nrm(text))) score -= 0.3;
      res.push({i: i, s: score});
    }
    res.sort(function (a, b) { return b.s - a.s; });
    return res.slice(0, n || 5).map(function (r) { var w = CAT[r.i]; return {id: w[0], base: w[1], unit: w[2], name: w[3], score: Math.round(r.s * 100) / 100}; });
  }
  var BASE_RU = {walls: 'стены без проёмов', floor: 'пол', ceil: 'потолок', plinth: 'плинтус', slopeL: 'откосы, п.м', slopeA: 'откосы, м²', per: 'периметр', door: 'двери', win: 'окна', manual: 'вручную'};
  function qty(base, c) {
    switch (base) {
      case 'walls': return c.wallsNet; case 'floor': return c.floor; case 'ceil': return c.ceiling;
      case 'plinth': return c.plinth; case 'slopeL': return c.revealLen; case 'slopeA': return c.revealArea;
      case 'per': return c.perimeter; case 'door': return c.doors; case 'win': return c.windows;
    }
    return null;
  }
  var api = {init: init, match: match, qty: qty, BASE_RU: BASE_RU};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ObmerWorks = api;
})(this);
