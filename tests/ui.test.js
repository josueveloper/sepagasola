// Pruebas de la página en Chromium (Playwright). Uso: node tests/ui.test.js
// Sirve la carpeta del sitio en un puerto local libre y la abre en escritorio y celular.
const path = require('path'), fs = require('fs'), http = require('http'), assert = require('assert');
const TOOLS = process.env.TOOLS_DIR || '/workspace/.tools';
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(TOOLS, 'browser/pw-browsers');
  const arch = require('os').arch() === 'arm64' ? 'aarch64-linux-gnu' : 'x86_64-linux-gnu';
  process.env.LD_LIBRARY_PATH = ['libs/usr/lib/' + arch, 'libs/lib/' + arch].map(d => path.join(TOOLS, d)).filter(fs.existsSync).concat(process.env.LD_LIBRARY_PATH || []).join(':');
  ({ chromium } = require(path.join(TOOLS, 'browser/node_modules/playwright')));
}
const RAIZ = path.resolve(__dirname, '..'), KEY = 'simHipoteca';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const DESK = { width: 1280, height: 900 }, PHONE = { width: 390, height: 844 };

let browser, servidor, BASE, fallas = 0; const pruebas = [];
const prueba = (nombre, fn) => pruebas.push([nombre, fn]);

function servir() {
  servidor = http.createServer((req, res) => {
    let ruta = decodeURIComponent(req.url.split('?')[0]); if (ruta.endsWith('/')) ruta += 'index.html';
    const archivo = path.join(RAIZ, ruta);
    if (!archivo.startsWith(RAIZ + path.sep) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' }); res.end(fs.readFileSync(archivo));
  });
  return new Promise(ok => servidor.listen(0, '127.0.0.1', () => { BASE = 'http://localhost:' + servidor.address().port + '/'; ok(); }));
}

/* Abre la página. hash: enlace compartido; guardado: lo que hay en localStorage antes de cargar. */
async function abrir({ hash = '', guardado, movil = false, ancho } = {}) {
  const viewport = ancho ? { width: ancho, height: 900 } : movil ? PHONE : DESK;
  const ctx = await browser.newContext({ viewport, isMobile: movil, hasTouch: movil, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage(); p.errores = [];
  p.on('pageerror', e => p.errores.push(e.message)); p.on('console', m => m.type() === 'error' && p.errores.push(m.text()));
  if (guardado !== undefined) await p.addInitScript(([k, v]) => { if (!sessionStorage.getItem('sembrado')) { sessionStorage.setItem('sembrado', '1'); localStorage.setItem(k, v); } }, [KEY, typeof guardado === 'string' ? guardado : JSON.stringify(guardado)]);
  await p.goto(BASE + hash); await p.waitForTimeout(200);
  return p;
}
const ver = p => p.evaluate(() => {
  const val = id => document.getElementById(id).value, txt = id => document.getElementById(id).textContent;
  return {
    veredicto: txt('v-big'), precio: val('precio'), tasa: val('tasa'), plazo: val('plazo'), pago: val('pago'),
    fin: document.querySelector('[data-fin][aria-pressed=true]').dataset.fin, modo: document.querySelector('[data-modo][aria-pressed=true]').dataset.modo,
    guardado: JSON.parse(localStorage.getItem('simHipoteca')), hash: location.hash, desborde: document.documentElement.scrollWidth - innerWidth,
    // cuánto le falta a cada tabla para caber en su caja (0 = cabe sin deslizar)
    tablas: [...document.querySelectorAll('.tablebox')].map(b => b.scrollWidth - b.clientWidth),
    filas: document.querySelectorAll('#tbody tr').length, msg: txt('share-msg'), boton: txt('share'),
  };
});
const escribir = async (p, id, valor) => { await p.fill('#' + id, String(valor)); await p.waitForTimeout(50); };

prueba('carga el ejemplo sin errores ni desborde (escritorio y celular)', async () => {
  for (const movil of [false, true]) {
    const p = await abrir({ movil }), v = await ver(p);
    assert.deepStrictEqual(p.errores, []);
    assert.strictEqual(v.desborde, 0, 'desborde horizontal de la página');
    assert.strictEqual(v.veredicto, '5 años y 7 meses'); assert.strictEqual(v.fin, 'banco'); assert.strictEqual(v.filas, 12);
    assert.strictEqual(v.guardado, null, 'no guarda nada hasta que cambias algo'); assert.strictEqual(v.hash, '');
    await p.context().close();
  }
});

prueba('las comparativas caben completas en cualquier ancho, también con Cofinavit y cifras grandes', async () => {
  for (const ancho of [1440, 1280, 1100, 1093, 1092, 1024, 900, 821, 820, 760, 732, 731, 600, 390, 340]) {
    for (const hash of ['', '#fin=cofinavit&precio=12500000&pago=150000&infMonto=2500000']) {
      const p = await abrir({ ancho, hash, movil: ancho < 600 }), v = await ver(p);
      assert.strictEqual(v.desborde, 0, `página a ${ancho}px ${hash}`);
      assert.deepStrictEqual(v.tablas.slice(0, 2), [0, 0], `comparativas a ${ancho}px ${hash}`);
      await p.context().close();
    }
  }
});

prueba('en celular las comparativas son tarjetas con el nombre de cada dato', async () => {
  const p = await abrir({ movil: true });
  const t = await p.evaluate(() => {
    const fila = document.querySelector('#cmp-fin tr'), celdas = [...fila.children];
    return { display: getComputedStyle(fila).display, etiquetas: celdas.map(td => getComputedStyle(td, '::before').content), ancho: fila.getBoundingClientRect().width, caja: fila.closest('.tablebox').clientWidth };
  });
  assert.strictEqual(t.display, 'block');
  assert.deepStrictEqual(t.etiquetas.slice(0, 3), ['none', '"Mensualidad inicial"', '"Se paga sola en"']);
  assert.strictEqual(t.etiquetas.length, 7); assert.ok(t.etiquetas.slice(1).every(e => e.length > 4));
  assert.ok(t.ancho <= t.caja, 'la tarjeta cabe');
  // tocar una tarjeta la elige
  await p.locator('#cmp-fin tr').nth(1).click(); await p.waitForTimeout(50);
  assert.strictEqual((await ver(p)).fin, 'apoyo');
  await p.context().close();
});

prueba('año por año en celular: se desliza, avisa con sombra y el año se queda fijo', async () => {
  const p = await abrir({ movil: true, hash: '#fin=cofinavit' });
  const t = await p.evaluate(async () => {
    const caja = document.querySelector('#tbody').closest('.tablebox'), celda = document.querySelector('#tbody td');
    const falta = caja.scrollWidth - caja.clientWidth, antes = celda.getBoundingClientRect().left;
    caja.scrollLeft = falta; await new Promise(r => requestAnimationFrame(r));
    return { falta, antes, despues: celda.getBoundingClientRect().left, fondo: getComputedStyle(caja).backgroundImage, pagina: document.documentElement.scrollWidth - innerWidth };
  });
  assert.ok(t.falta > 0, 'con Cofinavit la tabla es más ancha que el celular');
  assert.ok(Math.abs(t.antes - t.despues) < 1, 'la columna del año no se mueve');
  assert.match(t.fondo, /radial-gradient/); assert.strictEqual(t.pagina, 0);
  await p.context().close();
});

prueba('un enlace compartido abre ese escenario y manda sobre lo guardado', async () => {
  const guardado = { precio: 3000000, fin: 'apoyo' };
  let p = await abrir({ guardado }), v = await ver(p);
  assert.strictEqual(v.precio, '3000000'); assert.strictEqual(v.fin, 'apoyo');
  await p.context().close();

  p = await abrir({ guardado, hash: '#precio=2500000&tasa=9.75&fin=cofinavit&modo=plazo' }); v = await ver(p);
  assert.deepStrictEqual(p.errores, []);
  assert.deepStrictEqual([v.precio, v.tasa, v.fin, v.modo, v.pago], ['2500000', '9.75', 'cofinavit', 'plazo', '20000']);
  assert.strictEqual(v.guardado.precio, 3000000, 'abrir un enlace no pisa lo guardado');
  assert.strictEqual(v.hash, '#precio=2500000&tasa=9.75&fin=cofinavit&modo=plazo');

  // al cambiar algo, el escenario pasa a ser el tuyo: se guarda y el enlace se quita de la barra
  await escribir(p, 'pago', 25000); v = await ver(p);
  assert.strictEqual(v.hash, ''); assert.strictEqual(v.guardado.pago, 25000); assert.strictEqual(v.guardado.precio, 2500000); assert.strictEqual(v.guardado.fin, 'cofinavit');
  await p.reload(); await p.waitForTimeout(200); v = await ver(p);
  assert.deepStrictEqual([v.precio, v.pago, v.fin], ['2500000', '25000', 'cofinavit'], 'tras recargar sigue igual');
  await p.context().close();
});

prueba('"Copiar enlace" copia un enlace que reproduce lo que se ve', async () => {
  const p = await abrir();
  assert.strictEqual((await ver(p)).boton, 'Copiar enlace');
  await escribir(p, 'precio', 2400000); await escribir(p, 'tasa', 9.5);
  await p.click('#fin-apoyo'); await p.click('#modo-hib'); await p.click('#renta-si'); await p.click('#meta-bruta'); await p.click('#aport-plazo');
  const antes = await ver(p);
  await p.click('#share'); await p.waitForTimeout(100);
  const copiado = await p.evaluate(() => navigator.clipboard.readText());
  assert.strictEqual(copiado, BASE + '#precio=2400000&tasa=9.5&fin=apoyo&modo=hibrido&meta=bruta&conRenta=si&aportModo=plazo');
  assert.strictEqual((await ver(p)).msg, 'Enlace copiado');

  const otro = await abrir({ hash: copiado.slice(BASE.length) }), v = await ver(otro);
  assert.deepStrictEqual(otro.errores, []);
  assert.strictEqual(v.veredicto, antes.veredicto);
  assert.deepStrictEqual([v.precio, v.tasa, v.fin, v.modo], ['2400000', '9.5', 'apoyo', 'hibrido']);
  assert.strictEqual(await otro.evaluate(() => document.querySelector('#k-int').textContent), await p.evaluate(() => document.querySelector('#k-int').textContent));
  await p.context().close(); await otro.context().close();
});

prueba('el ejemplo sin cambios también se puede compartir', async () => {
  const p = await abrir({ guardado: { precio: 3000000 } });
  await p.click('#reset'); await p.click('#share'); await p.waitForTimeout(100);
  const copiado = await p.evaluate(() => navigator.clipboard.readText());
  assert.strictEqual(copiado, BASE + '#precio=1800000');
  const otro = await abrir({ guardado: { precio: 3000000 }, hash: '#precio=1800000' });
  assert.strictEqual((await ver(otro)).veredicto, '5 años y 7 meses');
  await p.context().close(); await otro.context().close();
});

prueba('pegar otro enlace en la misma pestaña cambia el escenario sin recargar', async () => {
  const p = await abrir();
  await p.evaluate(() => { location.hash = '#precio=2200000&fin=cofinavit'; }); await p.waitForTimeout(100);
  const v = await ver(p);
  assert.deepStrictEqual([v.precio, v.fin], ['2200000', 'cofinavit']); assert.strictEqual(v.guardado, null);
  await p.context().close();
});

prueba('un enlace dañado o un ancla no rompen la página', async () => {
  let p = await abrir({ hash: '#precio=abc&plazo=999999999&fin=xx&pago=0&__proto__=1' }), v = await ver(p);
  assert.deepStrictEqual(p.errores, []);
  assert.strictEqual(v.precio, '1800000'); assert.strictEqual(v.fin, 'banco'); assert.strictEqual(v.filas, 100, 'el plazo se topa en 100 años');
  await p.context().close();

  p = await abrir({ hash: '#guia-t', guardado: '{"precio":"x","fin":5,"pago":22000}' }); v = await ver(p);
  assert.deepStrictEqual(p.errores, []);
  assert.deepStrictEqual([v.precio, v.fin, v.pago], ['1800000', 'banco', '22000'], 'lo guardado que no sirve vuelve al ejemplo');
  await escribir(p, 'pago', 21000);
  assert.strictEqual((await ver(p)).hash, '#guia-t', 'un ancla normal no se quita');
  await p.context().close();
});

prueba('"Más gastos": cerrado en el ejemplo; al llenarlo cambia la renta neta y viaja en el enlace', async () => {
  const p = await abrir();
  const mas = () => p.evaluate(() => ({ abierto: document.getElementById('mas-gastos').open, neta: document.getElementById('net-hint').textContent }));
  let m = await mas();
  assert.strictEqual(m.abierto, false); assert.strictEqual(m.neta, 'De $9,900 de renta te quedan $8,425 al mes, ya con meses vacíos y gastos.');
  await p.click('#mas-gastos summary');
  await escribir(p, 'predial', 6000); await escribir(p, 'seguros', 300); await escribir(p, 'repar', 5); await escribir(p, 'isr', 2);
  m = await mas(); const v = await ver(p);
  assert.strictEqual(m.neta, 'De $9,900 de renta te quedan $6,990 al mes, ya con meses vacíos y gastos.');
  assert.strictEqual(v.veredicto, '6 años y 7 meses'); assert.deepStrictEqual([v.guardado.predial, v.guardado.isr], [6000, 2]);
  await p.click('#share'); await p.waitForTimeout(100);
  const copiado = await p.evaluate(() => navigator.clipboard.readText());
  assert.strictEqual(copiado, BASE + '#predial=6000&seguros=300&repar=5&isr=2');

  const otro = await abrir({ hash: '#predial=6000&seguros=300&repar=5&isr=2', movil: true }), w = await ver(otro);
  assert.deepStrictEqual(otro.errores, []);
  assert.strictEqual(await otro.evaluate(() => document.getElementById('mas-gastos').open), true, 'con gastos puestos se abre solo');
  assert.strictEqual(w.veredicto, '6 años y 7 meses'); assert.strictEqual(w.desborde, 0);
  assert.strictEqual(await otro.evaluate(() => document.getElementById('isr').value), '2');
  await p.context().close(); await otro.context().close();
});

prueba('en celular, un resumen fijo muestra el resultado mientras llenas el formulario', async () => {
  const p = await abrir({ movil: true });
  const barra = () => p.evaluate(() => { const b = document.getElementById('sticky'), r = b.getBoundingClientRect(); return { visible: !b.hidden && r.height > 0, texto: b.innerText.replace(/\s+/g, ' ').trim(), top: r.top, no: b.classList.contains('no') }; });
  assert.strictEqual((await barra()).visible, false, 'arriba de la página no estorba');
  await p.evaluate(() => document.getElementById('renta').scrollIntoView({ block: 'center' })); await p.waitForTimeout(200);
  let b = await barra();
  assert.strictEqual(b.visible, true); assert.strictEqual(b.top, 0);
  assert.strictEqual(b.texto, 'Se paga sola en 5 años y 7 meses Mensualidad inicial $14,819');
  await escribir(p, 'renta', 12000); b = await barra();
  assert.strictEqual(b.texto, 'Se paga sola en ' + (await ver(p)).veredicto + ' Mensualidad inicial $14,819', 'se actualiza al escribir');
  assert.notStrictEqual((await ver(p)).veredicto, '5 años y 7 meses');
  await escribir(p, 'renta', 100); await escribir(p, 'pago', 0); b = await barra();
  assert.match(b.texto, /No llega en el plazo/); assert.strictEqual(b.no, true);
  // tocarlo lleva al resultado y, ya con el resultado a la vista, se quita
  await p.click('#sticky'); await p.waitForTimeout(900);
  assert.strictEqual((await barra()).visible, false);
  assert.ok(await p.evaluate(() => { const r = document.getElementById('verdict').getBoundingClientRect(); return r.top >= -1 && r.top < innerHeight / 2; }), 'el resultado quedó arriba');
  assert.strictEqual((await ver(p)).desborde, 0);
  await p.context().close();

  const d = await abrir();
  await d.evaluate(() => scrollTo(0, 500)); await d.waitForTimeout(200);
  assert.strictEqual(await d.evaluate(() => getComputedStyle(document.getElementById('sticky')).display), 'none', 'en computadora no hace falta');
  await d.context().close();
});

prueba('la marca "Se paga sola" aparece en la página, el título y el manifiesto', async () => {
  const p = await abrir();
  const t = await p.evaluate(() => ({ titulo: document.title, marca: document.querySelector('.brand').textContent.trim(), sitio: document.querySelector('meta[property="og:site_name"]').content, h1: document.querySelector('h1').textContent }));
  assert.match(t.titulo, /^Simulador de crédito hipotecario.* \| Se paga sola$/); assert.strictEqual(t.marca, 'Se paga sola'); assert.strictEqual(t.sitio, 'Se paga sola');
  assert.match(t.h1, /Simulador de crédito hipotecario/);
  const m = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.webmanifest'), 'utf8'));
  assert.strictEqual(m.short_name, 'Se paga sola');
  for (const f of ['privacidad.html', 'aviso-legal.html', '404.html']) assert.match(fs.readFileSync(path.join(RAIZ, f), 'utf8'), /<title>[^<]* \| Se paga sola<\/title>/, f);
  await p.context().close();
});

(async () => {
  await servir(); browser = await chromium.launch();
  for (const [nombre, fn] of pruebas) {
    try { await fn(); console.log('ok   ' + nombre); }
    catch (e) { fallas++; console.log('FALLA ' + nombre + '\n      ' + String(e.message).replace(/\n/g, '\n      ')); }
  }
  await browser.close(); servidor.close();
  console.log(`\n${pruebas.length - fallas} de ${pruebas.length} pruebas pasaron`);
  process.exit(fallas ? 1 : 0);
})();
