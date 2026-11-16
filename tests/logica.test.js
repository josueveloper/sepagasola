// Pruebas del cálculo y de los enlaces para compartir. Uso: node tests/logica.test.js
// Ejecutan el bloque <script id="logica"> de index.html tal cual, sin navegador.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const bloque = html.match(/<script id="logica">([\s\S]*?)<\/script>/);
assert.ok(bloque, 'index.html no tiene <script id="logica">');
const ctx = {}; vm.runInNewContext(bloque[1], ctx);
const L = ctx.SimLogica, D = L.DEFAULTS;

let fallas = 0; const pruebas = [];
const prueba = (nombre, fn) => pruebas.push([nombre, fn]);
const sim = cambios => L.simulate(Object.assign({}, D, cambios));
// Los objetos de la lógica nacen en otro contexto (vm): se comparan como copias planas
const igual = (a, b, msg) => assert.deepStrictEqual(Object.assign({}, a), Object.assign({}, b), msg);
const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || 'valor'}: ${a} no está a ${tol} de ${b}`);
// Resumen redondeado de una simulación, para comparar contra valores de referencia
const resumen = s => ({ be: s.be, meses: s.months.length, intereses: Math.round(s.interest), pago0: Math.round(s.months[0].pay), bolsa: Math.round(s.pocket), bolsaTotal: Math.round(s.pocketAll) });

prueba('mensualidad de un crédito (fórmula de anualidad)', () => {
  cerca(L.pmtR(100000, 0.01, 12), 8884.88, 0.01);
  assert.strictEqual(L.pmtR(120000, 0, 12), 10000, 'sin interés se reparte parejo');
  assert.strictEqual(L.pmtR(0, 0.01, 12), 0, 'sin deuda no hay pago');
});

prueba('sin abonos el crédito dura el plazo completo y los intereses cuadran', () => {
  const pago = L.pmtR(1620000, 0.105 / 12, 360);
  const s = sim({ pago });
  assert.strictEqual(s.months.length, 360);
  cerca(s.interest, pago * 360 - 1620000, 1, 'intereses = pagos − préstamo');
  cerca(s.months[359].B, 0, 0.5, 'saldo final');
  assert.strictEqual(s.short, 0);
});

prueba('el saldo nunca sube ni queda negativo, en los tres financiamientos', () => {
  for (const fin of ['banco', 'apoyo', 'cofinavit']) {
    const s = sim({ fin }); let antes = s.loan;
    for (const m of s.months) { assert.ok(m.B <= antes + 1e-6 && m.B >= 0, `${fin}, mes ${m.m}`); antes = m.B; }
    cerca(antes, 0, 0.5, 'saldo final ' + fin);
  }
});

prueba('ejemplo inicial: valores de referencia', () => {
  const s = sim({});
  assert.deepStrictEqual(resumen(s), { be: 67, meses: 142, intereses: 1211935, pago0: 14819, bolsa: 716425, bolsaTotal: 1315866 });
  assert.strictEqual(s.loan, 1620000); assert.strictEqual(s.cashEng, 180000); assert.strictEqual(s.N, 360);
});

prueba('pagando lo mismo, la deuda baja igual en los tres caminos; cambia cuándo se paga sola', () => {
  const [mens, hib, plazo] = ['mensualidad', 'hibrido', 'plazo'].map(modo => sim({ modo }));
  for (const s of [hib, plazo]) {
    assert.strictEqual(s.months.length, mens.months.length);
    cerca(s.interest, mens.interest, 0.01, 'intereses');
  }
  assert.strictEqual(hib.be, 67);
  assert.strictEqual(plazo.be, 141, 'con pago fijo la renta lo alcanza mucho después');
  // Bajar mensualidad: el pago exigido baja mes a mes. Bajar plazo: se queda fijo.
  assert.ok(mens.months[60].pay < mens.months[0].pay - 1000);
  cerca(plazo.months[60].pay, plazo.months[0].pay, 0.01, 'pago fijo');
});

prueba('híbrido: al pagarse sola, la mensualidad deja de bajar', () => {
  const s = sim({ modo: 'hibrido' });
  const congelada = s.months[s.be].pay;
  for (let m = s.be; m < s.months.length - 1; m++) cerca(s.months[m].pay, congelada, 0.01, 'mes ' + m);
});

prueba('la meta puede ser la renta neta o la completa', () => {
  const neta = sim({}), bruta = sim({ meta: 'bruta' });
  assert.strictEqual(bruta.be, 53);
  assert.ok(bruta.be < neta.be, 'la renta completa alcanza antes a la mensualidad');
  cerca(neta.months[0].net, 9900 * 11 / 12 - 650, 0.01, 'renta neta = renta × meses rentado ÷ 12 − mantenimiento');
  cerca(neta.months[12].rent, 9900 * 1.04, 0.01, 'la renta sube cada año');
});

prueba('la renta y el extra anual aceleran el pago', () => {
  assert.deepStrictEqual(resumen(sim({ conRenta: 'si' })), { be: 36, meses: 76, intereses: 613500, pago0: 14819, bolsa: 720000, bolsaTotal: 1514638 });
  assert.deepStrictEqual(resumen(sim({ anual: 50000 })), { be: 48, meses: 105, intereses: 862173, pago0: 14819, bolsa: 728760, bolsaTotal: 1435216 });
});

prueba('si el pago no alcanza la mensualidad, se avisa y no hay abonos', () => {
  const s = sim({ pago: 0 });
  assert.strictEqual(s.short, 360); assert.strictEqual(s.months.length, 360);
  assert.ok(s.months.every(m => m.userExtra === 0));
});

prueba('Apoyo Infonavit: la aportación del patrón va a capital y la subcuenta queda en garantía', () => {
  const s = sim({ fin: 'apoyo' });
  assert.deepStrictEqual(resumen(s), { be: 56, meses: 119, intereses: 990440, pago0: 14819, bolsa: 609028, bolsaTotal: 1155242 });
  assert.strictEqual(s.guarantee, 100000); assert.strictEqual(s.loan, 1620000, 'la subcuenta no baja el préstamo');
  assert.strictEqual(s.months[0].emp, 2000);
  const soloPlazo = sim({ fin: 'apoyo', aportModo: 'plazo' });
  assert.strictEqual(soloPlazo.months.length, 119, 'termina igual');
  assert.strictEqual(soloPlazo.be, 64, 'pero la mensualidad baja más lento');
});

prueba('Cofinavit: la subcuenta cubre primero el enganche y lo que sobra baja el préstamo', () => {
  const s = sim({ fin: 'cofinavit' });
  assert.deepStrictEqual(resumen(s), { be: 61, meses: 117, intereses: 936400, pago0: 14486, bolsa: 658771, bolsaTotal: 1131575 });
  assert.deepStrictEqual([s.subToEng, s.cashEng, s.sub, s.Li0, s.Lb0], [100000, 80000, 0, 500000, 1120000]);
  cerca(s.months[0].payI, L.pmtR(500000, 0.096 / 12, 360), 0.01, 'pago fijo de Infonavit');
  const grande = sim({ fin: 'cofinavit', subcuenta: 300000 });
  assert.deepStrictEqual([grande.subToEng, grande.cashEng, grande.sub, grande.Li0, grande.Lb0], [180000, 0, 120000, 500000, 1000000]);
});

prueba('valores raros no rompen ni congelan el cálculo', () => {
  const t = Date.now();
  const s = sim({ plazo: 1e9, pago: 0 });
  assert.strictEqual(s.N, 1200, 'el plazo tiene tope de 100 años');
  assert.ok(Date.now() - t < 2000);
  assert.strictEqual(sim({ precio: 0 }).months.length, 0);
  assert.strictEqual(sim({ eng: 100 }).loan, 0);
  assert.strictEqual(sim({ tasa: 0, pago: 0 }).interest, 0);
  assert.strictEqual(sim({ plazo: NaN }).N, 1);
});

prueba('normalize: completa lo que falta y descarta lo que no sirve', () => {
  igual(L.normalize(null), D);
  igual(L.normalize('hola'), D);
  igual(L.normalize({ precio: 2500000, fin: 'apoyo' }), Object.assign({}, D, { precio: 2500000, fin: 'apoyo' }));
  igual(L.normalize({ precio: 'abc', eng: Infinity, tasa: null, plazo: '', pago: 1e99, fin: 'otro', modo: 7, basura: 1 }), D);
  igual(L.normalize({ precio: '2000000', aumento: -3, pago: 0 }), Object.assign({}, D, { precio: 2000000, aumento: -3, pago: 0 }));
  const sucio = JSON.parse('{"__proto__":{"precio":1},"constructor":2}');
  igual(L.normalize(sucio), D);
  assert.notStrictEqual(L.normalize(D), D, 'devuelve una copia');
});

prueba('enlace: solo lleva lo que cambia y se lee igual de vuelta', () => {
  const st = Object.assign({}, D, { fin: 'cofinavit', precio: 2500000, tasa: 9.75, conRenta: 'si', aumento: -1.5 });
  const h = L.toHash(st);
  assert.strictEqual(h, 'precio=2500000&tasa=9.75&aumento=-1.5&fin=cofinavit&conRenta=si');
  igual(L.fromHash('#' + h), st);
  igual(L.fromHash(h), st, 'con o sin #');
  assert.strictEqual(L.toHash(D), 'precio=1800000', 'el ejemplo también da un enlace que se puede abrir');
  igual(L.fromHash('#' + L.toHash(D)), D);
});

prueba('enlace: ignora anclas, claves desconocidas y valores dañados', () => {
  for (const h of ['', '#', '#guia-t', '#otra=1&cosa=2', '#=5', '#precio', undefined, null]) assert.strictEqual(L.fromHash(h), null, String(h));
  igual(L.fromHash('#precio=abc&fin=xx&plazo=20&__proto__=1&tasa=%E0%A4%A'), Object.assign({}, D, { plazo: 20 }));
  igual(L.fromHash('#precio=1e99'), D, 'un número absurdo vuelve al ejemplo');
});

(async () => {
  for (const [nombre, fn] of pruebas) {
    try { await fn(); console.log('ok   ' + nombre); }
    catch (e) { fallas++; console.log('FALLA ' + nombre + '\n      ' + String(e.message).replace(/\n/g, '\n      ')); }
  }
  console.log(`\n${pruebas.length - fallas} de ${pruebas.length} pruebas pasaron`);
  process.exit(fallas ? 1 : 0);
})();
