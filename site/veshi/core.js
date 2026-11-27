// «Где лежит» — разбор фраз и поиск вещей без ИИ и без интернета.
// Работает и в браузере (window.GL), и в Node для проверок (require).
(function (root) {
  'use strict';

  // ---------- нормализация и основы слов ----------
  function norm(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // окончания от длинных к коротким; основа не короче 3 букв
  var ENDS = ['иями', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'иях', 'иям', 'ием', 'ией', 'ешь', 'ишь', 'ете', 'ите', 'ов', 'ев', 'ей', 'ой', 'ий', 'ый', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ую', 'юю', 'ам', 'ям', 'ах', 'ях', 'ом', 'ем', 'ою', 'ею', 'ия', 'ья', 'ье', 'ьи', 'ию', 'ью', 'а', 'я', 'о', 'е', 'ы', 'и', 'у', 'ю', 'ь', 'й'];
  function stem(w) {
    if (!/[а-я]/.test(w) || w.length <= 3) return w;
    for (var i = 0; i < ENDS.length; i++) {
      var e = ENDS[i];
      if (w.length - e.length >= 3 && w.slice(-e.length) === e) return w.slice(0, -e.length);
    }
    return w;
  }
  // слова, которые в поиске ничего не значат
  var STOP = {};
  ('что чего где мой моя мое мои моего моей лежит лежат лежал лежала лежали находится находятся найди найти найду ищу искать поищи покажи есть у меня мне а в во на с со из и или то это эта этот там тут здесь пожалуйста подскажи скажи куда такой такая такое вещь вещи наш наша наше наши какой какая где-то все всех ли же бы не нибудь когда-то я ты он она мы они был была были будет еще уже вот ну').split(' ').forEach(function (w) { STOP[w] = 1; });
  function words(s) { var n = norm(s); return n ? n.split(' ') : []; }
  function keyWords(s) { return words(s).filter(function (w) { return !STOP[w]; }); }

  // похожие названия одной вещи (основы сравниваются после stem)
  var SYN_GROUPS = [
    'крестообразная крестовая крестовой крест филипс phillips ph',
    'плоская шлицевая прямая',
    'рубашка сорочка',
    'футболка майка',
    'штаны брюки',
    'кофта свитер джемпер',
    'куртка ветровка',
    'удлинитель переноска пилот тройник',
    'плоскогубцы пассатижи',
    'болгарка ушм',
    'фонарь фонарик',
    'ведро ведерко',
    'аптечка лекарства таблетки',
    'зарядка зарядное зарядник',
    'документы бумаги',
    'изолента изоляционная',
    'шуруповерт дрель-шуруповерт',
    'стремянка лестница',
    'кисть кисточка',
    'ключи ключ',
    'нож ножик',
    'кастрюля кастрюлька',
    'сковорода сковородка',
    'одеяло плед',
    'шапка шапочка',
    'носки носочки',
    'обувь ботинки туфли',
    'игрушки игрушка',
    'гирлянда гирлянды',
    'провод кабель шнур'
  ];
  var SYN = {};
  SYN_GROUPS.forEach(function (g, i) { g.split(' ').forEach(function (w) { SYN[stem(norm(w))] = 'g' + i; }); });

  // расстояние Левенштейна с ранним выходом
  function lev(a, b, max) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i]; var best = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  function allowed(n) { return n >= 8 ? 2 : n >= 4 ? 1 : 0; }

  // насколько слово запроса q похоже на слово вещи t (обе — основы), 0…1
  // группа похожих названий, даже если слово сказано с опечаткой («пасатижи»)
  var synCache = {};
  function synOf(w) {
    if (w in synCache) return synCache[w];
    var g = SYN[w] || null;
    if (!g && w.length >= 5) for (var k in SYN) { var m = allowed(Math.min(k.length, w.length)); if (m && lev(w, k, m) <= m) { g = SYN[k]; break; } }
    return (synCache[w] = g);
  }
  function lcp(a, b) { var i = 0; while (i < a.length && a[i] === b[i]) i++; return i; }
  function tokScore(q, t) {
    if (!q || !t) return 0;
    if (q === t) return 1;
    var g = synOf(q);
    if (g && g === synOf(t)) return 0.95;
    if (q.length >= 3 && t.indexOf(q) === 0) return 0.9;          // «крест» → «крестообразная»
    if (t.length >= 3 && q.indexOf(t) === 0) return 0.8;          // «отверточка» → «отвертк»
    var m = allowed(Math.min(q.length, t.length));
    if (m) {
      var d = lev(q, t, m);
      if (d <= m) return d === 1 ? 0.75 : 0.6;                   // опечатка / ослышка
    }
    if (q.length >= 4 && t.length > q.length && lev(q, t.slice(0, q.length), 1) <= 1) return 0.65; // начало с опечаткой
    var c = lcp(q, t);
    if (c >= 5 && c >= 0.7 * Math.min(q.length, t.length)) return 0.6;  // «молоточек» ~ «молоток»
    return 0;
  }

  function stems(s) { return keyWords(s).map(stem); }

  // ---------- поиск ----------
  function byId(list) { var m = {}; list.forEach(function (x) { m[x.id] = x; }); return m; }

  function best(q, list, w) {
    var b = 0;
    for (var i = 0; i < list.length; i++) { var s = tokScore(q, list[i]) * w; if (s > b) b = s; }
    return b;
  }

  // поиск вещей: возвращает отсортированный список {item, place, room, score}
  function search(data, query) {
    var q = stems(query);
    if (!q.length) return {items: [], places: [], rooms: [], q: q};
    var P = byId(data.places), R = byId(data.rooms);
    var out = [];
    data.items.forEach(function (it) {
      var pl = P[it.placeId] || {name: '?'}, rm = R[pl.roomId] || {name: '?'};
      var nameT = stems(it.name), aliasT = stems((it.aliases || []).join(' ')), noteT = stems(it.note || '');
      var locT = stems(rm.name + ' ' + pl.name);
      var sum = 0, nameHit = 0, used = {};
      q.forEach(function (w) {
        var sName = Math.max(best(w, nameT, 1), best(w, aliasT, 1));
        var s = Math.max(sName, best(w, noteT, 0.6), best(w, locT, 0.5));
        if (sName >= 0.6) { nameHit++; nameT.forEach(function (t, i) { if (tokScore(w, t) >= 0.6) used[i] = 1; }); }
        sum += s;
      });
      if (!nameHit) return;
      var score = sum / q.length + 0.1 * (Object.keys(used).length / Math.max(1, nameT.length));
      if (score >= 0.45) out.push({item: it, place: pl, room: rm, score: score});
    });
    out.sort(function (a, b) { return b.score - a.score || (b.item.updated || 0) - (a.item.updated || 0); });
    // если самое лучшее совпадение сильно лучше — хвост слабых не показываем
    if (out.length && out[0].score >= 0.9) out = out.filter(function (r) { return r.score >= out[0].score - 0.35; });
    return {items: out.slice(0, 20), places: findPlaces(data, query).filter(function (p) { return p.score >= 0.75; }).slice(0, 3),
      rooms: findRooms(data, query).filter(function (r) { return r.score >= 0.75; }).slice(0, 3), q: q};
  }

  // места хранения по словам («гараж стеллаж», «шкаф в спальне»)
  function findPlaces(data, text) {
    var q = stems(text);
    if (!q.length) return [];
    var R = byId(data.rooms), out = [];
    data.places.forEach(function (pl) {
      var rm = R[pl.roomId] || {name: ''};
      var pT = stems(pl.name), rT = stems(rm.name), sum = 0, hitP = 0, hitR = 0;
      q.forEach(function (w) {
        var a = best(w, pT, 1), b = best(w, rT, 1);
        if (a >= 0.6) hitP++; if (b >= 0.6) hitR++;
        sum += Math.max(a, b);
      });
      var score = sum / q.length;
      if (hitP && pT.length) score += 0.1 * Math.min(1, hitP / pT.length);
      if (!hitP) score -= 0.25;                   // назван только дом/комната — место не угадано
      if (score >= 0.4) out.push({place: pl, room: rm, score: score, roomOnly: !hitP});
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }
  function findRooms(data, text) {
    var q = stems(text);
    if (!q.length) return [];
    return data.rooms.map(function (rm) {
      var t = stems(rm.name), sum = 0;
      q.forEach(function (w) { sum += best(w, t, 1); });
      return {room: rm, score: sum / q.length};
    }).filter(function (r) { return r.score >= 0.6; }).sort(function (a, b) { return b.score - a.score; });
  }

  // запомнить, как ещё назвали вещь (самообучение)
  function learn(item, query) {
    var nameT = stems(item.name).concat(stems((item.aliases || []).join(' ')));
    var add = keyWords(query).filter(function (w) {
      var s = stem(w);
      return s.length >= 3 && !nameT.some(function (t) { return tokScore(s, t) >= 0.9; });
    });
    if (!add.length) return false;
    item.aliases = (item.aliases || []).concat([add.join(' ')]);
    return true;
  }

  // ---------- разбор того, что надиктовано ----------
  function cap(s) { s = String(s).trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function clean(s) {
    return String(s).replace(/^[\s,.;:!?—–-]+|[\s,.;:!?—–-]+$/g, '')
      .replace(/^(а\s+)?(тут|здесь|там)?\s*(лежит|лежат|стоит|стоят|висит|висят|хранится|хранятся|есть)\s+/i, '')
      .replace(/^(а\s+)?(тут|здесь|там|также|ещё|еще|и)\s+/i, '')
      .replace(/\s+/g, ' ').trim();
  }
  // «молоток, отвёртка и клей» → три вещи
  function splitItems(text) {
    return String(text).split(/[,;\n]+|\.(?!\d)|\s+(?:и|а также|также|ещё|еще|плюс)\s+/i)
      .map(clean).filter(function (s) { return s && !STOP[norm(s)]; }).map(cap);
  }

  // «Гараж, стеллаж: молоток, клей. Полка верхняя: фонарик»
  // возвращает блоки {room, place, items}; room/place = null — «текущее»
  function parseAdd(text) {
    var blocks = [], cur = {room: null, place: null, items: []};
    function push() { if (cur.items.length) blocks.push(cur); }
    String(text).split(/\n+|(?:[.!?;](?!\d))/).forEach(function (sent) {
      sent = sent.trim(); if (!sent) return;
      var m;
      if (sent.indexOf(':') >= 0) {
        var head = sent.slice(0, sent.indexOf(':')), rest = sent.slice(sent.indexOf(':') + 1);
        var hp = head.split(',').map(clean).filter(Boolean);
        push();
        if (hp.length >= 2) cur = {room: cap(hp[0]), place: cap(hp.slice(1).join(', ')), items: []};
        else cur = {room: cur.room, place: hp[0] ? cap(hp[0]) : cur.place, items: [], placeOnly: true};
        cur.items = splitItems(rest);
      } else if ((m = sent.match(/^(?:помещение|комната)\s+(.+)$/i))) {
        push(); cur = {room: cap(clean(m[1])), place: null, items: []};
      } else if ((m = sent.match(/^(?:место|мебель)\s+(.+)$/i))) {
        push(); cur = {room: cur.room, place: cap(clean(m[1])), items: []};
      } else {
        cur.items = cur.items.concat(splitItems(sent));
      }
    });
    push();
    return blocks;
  }

  // команды из строки поиска
  var MOVE = /^(?:я\s+)?(?:переложил[аи]?|переложи|перенес(?:ла|ли)?|перенеси|перевез(?:ла|ли)?|перевези|переставил[аи]?|переставь|перевесил[аи]?|убрал[аи]?|убери|отнес(?:ла|ли)?|отнеси)\s+(.+?)\s+(?:в|во|на|под|за)\s+(.+)$/i;
  var ADD = /^(?:я\s+)?(?:положил[аи]?|положи|добавь|добавить|запиши|записать|поставил[аи]?|поставь|повесил[аи]?|повесь|спрятал[аи]?)\s+(.+?)\s+(?:в|во|на|под|за)\s+(.+)$/i;
  var DEL = /^(?:я\s+)?(?:удали|удалить|выбросил[аи]?|выкинул[аи]?|выброси|выкинь|отдал[аи]?|продал[аи]?|потерял[аи]?|сломал[аи]?|больше нет|нет больше)\s+(.+)$/i;
  function parseCommand(text) {
    var t = String(text || '').trim().replace(/[.!?]+$/, '');
    var m;
    if (!t) return {type: 'none'};
    if ((m = t.match(MOVE))) return {type: 'move', what: clean(m[1]), to: clean(m[2])};
    if ((m = t.match(ADD))) return {type: 'addTo', items: splitItems(m[1]), to: clean(m[2])};
    if ((m = t.match(DEL))) return {type: 'remove', what: clean(m[1])};
    if (t.indexOf(':') > 0) return {type: 'add', blocks: parseAdd(t)};
    return {type: 'search', q: t};
  }

  // ---------- ответ голосом ----------
  function where(r) { return r.room.name + ', ' + r.place.name; }
  function answer(res, query) {
    var it = res.items;
    if (!it.length) {
      if (res.places.length && !res.places[0].roomOnly) return 'Вещь не нашёл. Есть место: ' + where(res.places[0]) + '.';
      if (res.rooms && res.rooms.length) return 'Вещь не нашёл. Есть помещение ' + res.rooms[0].room.name + ', его можно открыть.';
      return 'Не нашёл «' + query + '». Попробуйте назвать по-другому.';
    }
    if (it.length === 1 || it[0].score - it[1].score > 0.3) return it[0].item.name + ' — ' + where(it[0]) + '.';
    var n = Math.min(3, it.length);
    var s = 'Нашёл ' + it.length + '. ';
    for (var i = 0; i < n; i++) s += it[i].item.name + ' — ' + where(it[i]) + '. ';
    if (it.length > n) s += 'И ещё ' + (it.length - n) + ' на экране.';
    return s.trim();
  }

  // «в спальню на комод» → {room: 'Спальня', place: 'Комод'} (догадка для нового места)
  function nom(w) {
    return w.replace(/(ую)$/, 'ая').replace(/(юю)$/, 'яя').replace(/([^аеиоуыэюя])ю$/, '$1я').replace(/([^аеиоуыэюя]{1}[^аеиоуыэюя\s]?)у$/, function (m) { return m.length > 1 ? m.slice(0, -1) + 'а' : m; });
  }
  function guessTarget(text) {
    var parts = String(text).split(/\s+(?:в|во|на|под|за|у)\s+/i).map(clean).filter(Boolean);
    function fix(s) { return cap(s.split(' ').map(nom).join(' ')); }
    if (parts.length >= 2) return {room: fix(parts[0]), place: fix(parts.slice(1).join(', '))};
    return {room: '', place: fix(parts[0] || '')};
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  var GL = {norm: norm, stem: stem, words: words, keyWords: keyWords, stems: stems, lev: lev, tokScore: tokScore,
    search: search, findPlaces: findPlaces, findRooms: findRooms, learn: learn,
    splitItems: splitItems, parseAdd: parseAdd, parseCommand: parseCommand, answer: answer, where: where, guessTarget: guessTarget, nom: nom, cap: cap, uid: uid};
  if (typeof module !== 'undefined' && module.exports) module.exports = GL; else root.GL = GL;
})(this);
