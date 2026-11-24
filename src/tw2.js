eval(require('fs').readFileSync('/tmp/obmer/catalog.js','utf8').replace('var OBMER_CATALOG','global.OBMER_CATALOG'));
global.ObmerWorks=require('/tmp/obmer/works.js'); ObmerWorks.init(OBMER_CATALOG);
const O=require('/tmp/obmer/core.js'); const p=O.newProject(); const st={room:-1};
['комната один кухня','высота 2 70','стена 340','окно 40 140 150 85 20','стена 280','стена 340','дверь 10 80 210 12','стена 280','работа штукатурка стен по маякам','работа покраска потолка','работа ламинат','работы установка розеток шесть штук','надо штукатурка откосов','работа'].forEach(t=>console.log(O.apply(p,st,O.parse(t)).msg));
const c=O.calc(p.rooms[0]); p.rooms[0].works.forEach(w=>console.log(w.name,O.workQty(w,c),w.unit,w.alts));
