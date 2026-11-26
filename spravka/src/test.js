// Проверка расчётного ядра: node spravka/src/test.js
var C = require('./core.js'), ok = 0, bad = 0;
function eq(name, a, b, tol) { if (Math.abs(a - b) <= (tol || 1e-6)) ok++; else { bad++; console.log('FAIL', name, a, '≠', b); } }
eq('1 кВт 230 В', C.current(1, 1, 230, 1), 4.3478, 1e-3);
eq('10 кВт 400 В 3ф', C.current(10, 3, 400, 1), 14.434, 1e-3);
eq('ПУЭ: медь 2,5 в трубе 2ж', C.iTab('cu', 'wall1', 2.5), 25);
eq('ПУЭ: медь 1,5 3ж в воздухе', C.iTab('cu', 'air3', 1.5), 19);
eq('ПУЭ: алюм. 16 3ж в земле', C.iTab('al', 'gnd3', 16), 90);
eq('поправка 35 °C', C.kTemp(35, false), 0.866, 1e-3);
eq('сечение для 25 А в стене', C.cable({ i: 25, mat: 'cu', lay: 'wall1', n: 1 }).pick, 2.5);
eq('сечение для 32 А в стене', C.cable({ i: 32, mat: 'cu', lay: 'wall1', n: 1 }).pick, 4);
eq('ΔU 16 А 30 м 2,5', C.vdrop({ mat: 'cu', s: 2.5, l: 30, i: 16, u: 230, phases: 1, cos: 1 }).pct, 3.7565, 1e-3);
eq('петля C16 2,5 40 м', C.loop({ zext: 0.3, mat: 'cu', s: 2.5, l: 40, curve: 'C', inom: 16 }).ik, 0.95 * 230 / (0.3 + 0.72), 1e-6);
eq('AWG 12', C.secFromD(C.awgD(12)), 3.309, 1e-3);
eq('AWG 0000 диаметр', C.awgD(-3), 11.684, 1e-3);
eq('конденсатор', C.motorCap({ i: 5, conn: 'delta', u: 230 }).cr, 4800 * 5 / 230, 1e-9);
eq('SMD 01C', C.smd('01C').r, 10000);
eq('SMD 4R7', C.smd('4R7').r, 4.7);
eq('SMD 1002', C.smd('1002').r, 10000);
eq('кондер 104', C.capCode('104').pf, 100000);
eq('кондер 4n7', C.capCode('4n7').pf, 4700);
eq('цвет 4 полосы', C.resColor(['yellow', 'violet', 'red', 'gold']).r, 4700);
eq('цвет 5 полос', C.resColor(['brown', 'black', 'black', 'brown', 'brown']).r, 1000);
eq('E24 вверх 118', C.e24Up(118), 120);
eq('LED 12 В 3×3,2 20 мА', C.ledRes({ us: 12, uf: 3.2, n: 3, ma: 20 }).re, 120);
eq('ИБП 24 В 100 А·ч LFP 300 Вт', C.ups({ v: 24, ah: 100, dod: 0.9, eta: 0.9, p: 300 }).h, 6.48, 1e-9);
console.log(ok + ' ok, ' + bad + ' fail'); process.exit(bad ? 1 : 0);
