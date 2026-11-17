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

/* Abre la página. hash: enlace compartido; guardado: lo que hay en localStorage antes de cargar.
   Por defecto con movimiento reducido, para leer los resultados sin esperar a las animaciones; animar: true las deja correr. */
async function abrir({ hash = '', guardado, movil = false, ancho, animar = false, oscuro = false } = {}) {
  const viewport = ancho ? { width: ancho, height: 900 } : movil ? PHONE : DESK;
  const ctx = await browser.newContext({ viewport, isMobile: movil, hasTouch: movil, permissions: ['clipboard-read', 'clipboard-write'], reducedMotion: animar ? 'no-preference' : 'reduce', colorScheme: oscuro ? 'dark' : 'light' });
  const p = await ctx.newPage(); p.errores = [];
  p.on('pageerror', e => p.errores.push(e.message)); p.on('console', m => m.type() === 'error' && p.errores.push(m.text()));
  if (guardado !== undefined) await p.addInitScript(([k, v]) => { if (!sessionStorage.getItem('sembrado')) { sessionStorage.setItem('sembrado', '1'); localStorage.setItem(k, v); } }, [KEY, typeof guardado === 'string' ? guardado : JSON.stringify(guardado)]);
  await p.goto(BASE + hash); await p.waitForTimeout(200);
  return p;
}
const ver = p => p.evaluate(() => {
  const val = id => document.getElementById(id).value.replace(/,/g, ''), txt = id => document.getElementById(id).textContent;
  return {
    veredicto: txt('v-big'), precio: val('precio'), tasa: val('tasa'), plazo: val('plazo'), pago: val('pago'),
    fin: document.querySelector('[data-fin][aria-pressed=true]').dataset.fin, modo: document.querySelector('[data-modo][aria-pressed=true]').dataset.modo,
    guardado: JSON.parse(localStorage.getItem('simHipoteca')), hash: location.hash, desborde: document.documentElement.scrollWidth - innerWidth,
    filas: document.querySelectorAll('#tbody tr').length, msg: txt('share-msg'), boton: txt('share'),
    avanzados: document.getElementById('adv').open, cambios: document.getElementById('adv-badge').hidden ? '' : txt('adv-badge'), neta: txt('net-hint'),
  };
});
const escribir = async (p, id, valor) => { await p.fill('#' + id, String(valor)); await p.waitForTimeout(50); };
// Abre una pestaña y dice cuánto le falta a su tabla para caber en su caja (0 = cabe sin deslizar)
const pestana = async (p, id) => { await p.click('#tab-' + id); return p.evaluate(id => { const b = document.querySelector('#panel-' + id + ' .tablebox'); return { falta: b.scrollWidth - b.clientWidth, ancho: b.clientWidth, oculto: document.getElementById('panel-' + id).hidden }; }, id); };
const barra = p => p.evaluate(() => { const b = document.getElementById('sticky'), r = b.getBoundingClientRect(); return { visible: !b.hidden && r.height > 0, texto: b.innerText.replace(/\s+/g, ' ').trim(), top: r.top, no: b.classList.contains('no') }; });

prueba('carga el ejemplo sin errores ni desborde: resultado y gráfica arriba', async () => {
  for (const movil of [false, true]) {
    const p = await abrir({ movil }), v = await ver(p);
    assert.deepStrictEqual(p.errores, []);
    assert.strictEqual(v.desborde, 0, 'desborde horizontal de la página');
    assert.strictEqual(v.veredicto, '5 años y 7 meses'); assert.strictEqual(v.fin, 'banco'); assert.strictEqual(v.filas, 12);
    assert.strictEqual(v.guardado, null, 'no guarda nada hasta que cambias algo'); assert.strictEqual(v.hash, '');
    assert.strictEqual(v.avanzados, false); assert.strictEqual(v.cambios, '');
    const t = await p.evaluate(() => { const y = s => document.querySelector(s).getBoundingClientRect(); return { veredicto: y('#verdict').top, grafica: y('#chart').bottom, control: y('#precio').top, lineas: document.querySelectorAll('#chart path').length, precio: document.getElementById('precio').value }; });
    assert.ok(t.veredicto < t.control && t.grafica < t.control, 'el resultado y la gráfica van antes que los controles');
    assert.ok(t.lineas >= 3, 'la gráfica se dibuja'); assert.strictEqual(t.precio, '1,800,000', 'montos con separador de miles');
    if (!movil) assert.ok(t.control < 900, 'en computadora los controles se ven sin bajar');
    await p.context().close();
  }
});

prueba('las tablas de las pestañas caben en cualquier ancho, también con Cofinavit y cifras grandes', async () => {
  for (const ancho of [1440, 1280, 1100, 1024, 900, 821, 820, 760, 732, 731, 600, 390, 340]) {
    for (const hash of ['', '#fin=cofinavit&precio=12500000&pago=150000&infMonto=2500000']) {
      const p = await abrir({ ancho, hash, movil: ancho < 600 });
      for (const id of ['fin', 'modo']) { const t = await pestana(p, id); assert.ok(t.ancho > 0 && !t.oculto, id); assert.strictEqual(t.falta, 0, `comparativa "${id}" a ${ancho}px ${hash}`); }
      if (ancho >= 900) assert.strictEqual((await pestana(p, 'year')).falta, 0, `año por año a ${ancho}px ${hash}`);
      assert.strictEqual((await ver(p)).desborde, 0, `página a ${ancho}px ${hash}`);
      await p.context().close();
    }
  }
});

prueba('pestañas: una a la vez, con clic o con las flechas', async () => {
  const p = await abrir();
  const estado = () => p.evaluate(() => ['fin', 'modo', 'year'].map(id => [document.getElementById('tab-' + id).getAttribute('aria-selected'), !document.getElementById('panel-' + id).hidden].join()));
  assert.deepStrictEqual(await estado(), ['true,true', 'false,false', 'false,false']);
  await p.click('#tab-year'); assert.deepStrictEqual(await estado(), ['false,false', 'false,false', 'true,true']);
  await p.keyboard.press('ArrowRight'); assert.deepStrictEqual(await estado(), ['true,true', 'false,false', 'false,false']);
  await p.keyboard.press('ArrowRight'); assert.deepStrictEqual(await estado(), ['false,false', 'true,true', 'false,false']);
  assert.strictEqual(await p.evaluate(() => document.activeElement.id), 'tab-modo');
  // elegir un camino en la comparativa lo usa en el cálculo y cuenta como ajuste avanzado
  await p.locator('#cmp tr').nth(2).click(); await p.waitForTimeout(50);
  const v = await ver(p); assert.strictEqual(v.modo, 'plazo'); assert.strictEqual(v.cambios, '1 cambio'); assert.strictEqual(v.veredicto, '11 años y 9 meses');
  await p.context().close();
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
  assert.strictEqual(await p.evaluate(() => { const t = document.querySelector('.tabs'); return t.scrollWidth - t.clientWidth; }), 0, 'las tres pestañas caben');
  await p.locator('#cmp-fin tr').nth(1).click(); await p.waitForTimeout(50);
  assert.strictEqual((await ver(p)).fin, 'apoyo');
  await p.context().close();
});

prueba('año por año en celular: se desliza, avisa con sombra y el año se queda fijo', async () => {
  const p = await abrir({ movil: true, hash: '#fin=cofinavit' });
  await p.click('#tab-year');
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

prueba('montos con separador de miles mientras escribes, sin que el cursor brinque', async () => {
  const p = await abrir();
  await p.click('#precio'); await p.keyboard.press('Control+A'); await p.keyboard.type('2450000', { delay: 5 });
  let t = await p.evaluate(() => ({ v: document.getElementById('precio').value, guardado: JSON.parse(localStorage.getItem('simHipoteca')).precio }));
  assert.deepStrictEqual(t, { v: '2,450,000', guardado: 2450000 });
  // insertar un dígito a la mitad: el cursor se queda donde iba
  await p.evaluate(() => document.getElementById('precio').setSelectionRange(3, 3)); await p.keyboard.type('9');
  t = await p.evaluate(() => { const e = document.getElementById('precio'); return { v: e.value, cursor: e.selectionStart }; });
  assert.deepStrictEqual(t, { v: '24,950,000', cursor: 4 });
  // letras y signos se ignoran; vacío cuenta como cero y no rompe
  await escribir(p, 'precio', 'abc-1x2,5'); assert.strictEqual(await p.inputValue('#precio'), '125');
  await escribir(p, 'precio', ''); assert.deepStrictEqual(p.errores, []);
  assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('simHipoteca')).precio), 0);
  await p.context().close();
});

prueba('deslizadores: mueven el número y el resultado, y se estiran si escribes más', async () => {
  const p = await abrir();
  const mover = (id, v) => p.evaluate(([id, v]) => { const r = document.getElementById(id + '-r'); r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
  const rango = id => p.evaluate(id => { const r = document.getElementById(id + '-r'); return [r.min, r.max, r.step, r.value].map(Number); }, 'precio' === id ? id : id);
  assert.deepStrictEqual(await rango('precio'), [300000, 10000000, 50000, 1800000]);
  assert.deepStrictEqual(await rango('tasa'), [5, 18, 0.1, 10.5]);
  await mover('pago', 30000);
  let v = await ver(p);
  assert.strictEqual(v.pago, '30000'); assert.strictEqual(await p.inputValue('#pago'), '30,000'); assert.strictEqual(v.guardado.pago, 30000);
  assert.notStrictEqual(v.veredicto, '5 años y 7 meses');
  await mover('eng', 20);
  assert.strictEqual(await p.evaluate(() => document.getElementById('eng-hint').textContent), '$360,000');
  await escribir(p, 'precio', 14000000);
  assert.deepStrictEqual((await rango('precio')).slice(1), [14000000, 50000, 14000000], 'el máximo se estira');
  await escribir(p, 'tasa', 9.5); assert.strictEqual((await rango('tasa'))[3], 9.5);
  await p.click('#reset'); v = await ver(p);
  assert.strictEqual(v.veredicto, '5 años y 7 meses'); assert.deepStrictEqual(await rango('precio'), [300000, 10000000, 50000, 1800000]);
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
  assert.strictEqual(v.avanzados, true, 'trae un ajuste avanzado: se abre solo'); assert.strictEqual(v.cambios, '1 cambio');

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
  await p.click('#fin-apoyo'); await p.click('#adv > summary'); await p.click('#modo-hib'); await p.click('#renta-si'); await p.click('#meta-bruta'); await p.click('#aport-plazo');
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
  assert.strictEqual(await p.evaluate(() => Number(document.getElementById('precio-r').value)), 2200000, 'el deslizador sigue al enlace');
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

prueba('ajustes avanzados: cerrados en el ejemplo; los gastos cambian la renta neta y viajan en el enlace', async () => {
  const p = await abrir();
  let v = await ver(p);
  assert.strictEqual(v.avanzados, false); assert.strictEqual(v.neta, 'Te quedan $8,425 al mes tras meses vacíos y gastos');
  await p.click('#adv > summary');
  await escribir(p, 'predial', 6000); await escribir(p, 'seguros', 300); await escribir(p, 'repar', 5); await escribir(p, 'isr', 2);
  v = await ver(p);
  assert.strictEqual(v.neta, 'Te quedan $6,990 al mes tras meses vacíos y gastos'); assert.strictEqual(v.cambios, '4 cambios');
  assert.strictEqual(v.veredicto, '6 años y 7 meses'); assert.deepStrictEqual([v.guardado.predial, v.guardado.isr], [6000, 2]);
  await p.click('#share'); await p.waitForTimeout(100);
  assert.strictEqual(await p.evaluate(() => navigator.clipboard.readText()), BASE + '#predial=6000&seguros=300&repar=5&isr=2');

  const otro = await abrir({ hash: '#predial=6000&seguros=300&repar=5&isr=2', movil: true }), w = await ver(otro);
  assert.deepStrictEqual(otro.errores, []);
  assert.strictEqual(w.avanzados, true, 'con ajustes puestos se abre solo'); assert.strictEqual(w.cambios, '4 cambios');
  assert.strictEqual(w.veredicto, '6 años y 7 meses'); assert.strictEqual(w.desborde, 0);
  assert.strictEqual(await otro.inputValue('#isr'), '2'); assert.strictEqual(await otro.inputValue('#predial'), '6,000');
  await otro.click('#reset'); assert.strictEqual((await ver(otro)).cambios, '');
  await p.context().close(); await otro.context().close();
});

prueba('"Más cifras" y "Cómo se calcula" están plegados y se abren', async () => {
  const p = await abrir();
  const visibles = () => p.evaluate(() => ['k-pay', 'k-start', 'k-cash', 'k-end', 'k-loan', 'k-int', 'k-pocket', 'k-pocket-all', 'k-yield'].filter(id => document.getElementById(id).checkVisibility()));
  assert.deepStrictEqual(await visibles(), ['k-pay', 'k-start', 'k-cash', 'k-end']);
  await p.click('#morekpi > summary');
  assert.strictEqual((await visibles()).length, 9);
  assert.strictEqual(await p.evaluate(() => document.getElementById('k-int').textContent), '$1,211,935');
  assert.strictEqual(await p.evaluate(() => document.querySelector('.notes p').checkVisibility()), false);
  await p.click('.notes > summary');
  assert.strictEqual(await p.evaluate(() => document.querySelector('.notes p').checkVisibility()), true);
  await p.context().close();
});

prueba('un resumen fijo muestra el resultado cuando ya no se ve, en celular y computadora', async () => {
  const p = await abrir({ movil: true });
  assert.strictEqual((await barra(p)).visible, false, 'con el resultado a la vista no estorba');
  await p.evaluate(() => document.getElementById('pago').scrollIntoView({ block: 'center' })); await p.waitForTimeout(200);
  let b = await barra(p);
  assert.strictEqual(b.visible, true); assert.strictEqual(b.top, 0);
  assert.strictEqual(b.texto, 'Se paga sola en 5 años y 7 meses Mensualidad inicial $14,819');
  await escribir(p, 'renta', 12000); b = await barra(p);
  assert.strictEqual(b.texto, 'Se paga sola en ' + (await ver(p)).veredicto + ' Mensualidad inicial $14,819', 'se actualiza al escribir');
  assert.notStrictEqual((await ver(p)).veredicto, '5 años y 7 meses');
  await escribir(p, 'renta', 100); await escribir(p, 'pago', 0); b = await barra(p);
  assert.match(b.texto, /No llega en el plazo/); assert.strictEqual(b.no, true);
  // tocarlo regresa al resultado y, ya con el resultado a la vista, se quita
  await p.click('#sticky'); await p.waitForTimeout(900);
  assert.strictEqual((await barra(p)).visible, false);
  assert.ok(await p.evaluate(() => { const r = document.getElementById('verdict').getBoundingClientRect(); return r.top >= -1 && r.top < innerHeight / 2; }), 'el resultado quedó arriba');
  assert.strictEqual((await ver(p)).desborde, 0);
  await p.context().close();

  const d = await abrir();
  assert.strictEqual((await barra(d)).visible, false);
  await d.click('#tab-year'); await d.evaluate(() => document.getElementById('panel-year').scrollIntoView({ block: 'center' })); await d.waitForTimeout(200);
  assert.strictEqual((await barra(d)).visible, true, 'al bajar a las tablas sigue a la vista');
  await d.setViewportSize({ width: 1280, height: 500 }); await d.evaluate(() => document.querySelector('footer').scrollIntoView({ block: 'end' })); await d.waitForTimeout(200);
  assert.strictEqual((await barra(d)).visible, false, 'fuera del simulador (preguntas frecuentes) se quita');
  await d.context().close();
});

prueba('al cargar, el número del resultado cuenta hasta su valor y la gráfica se dibuja; con movimiento reducido, nada se anima', async () => {
  const ctx = await browser.newContext({ viewport: DESK, reducedMotion: 'no-preference' });
  const p = await ctx.newPage(); const errores = []; p.on('pageerror', e => errores.push(e.message));
  // anota cada texto que toma el número y si la gráfica empezó con la animación
  await p.addInitScript(() => {
    window.__textos = []; window.__intro = false;
    new MutationObserver(() => { const b = document.getElementById('v-big'), c = document.getElementById('chart');
      if (b && window.__textos[window.__textos.length - 1] !== b.textContent) window.__textos.push(b.textContent);
      if (c && c.classList.contains('intro')) window.__intro = true; }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  await p.goto(BASE); await p.waitForTimeout(2000);
  const r = await p.evaluate(() => ({ textos: window.__textos.filter(t => t !== '—'), intro: window.__intro, ahora: document.getElementById('v-big').textContent, sigue: document.getElementById('chart').classList.contains('intro') }));
  assert.deepStrictEqual(errores, []);
  assert.ok(r.textos.length >= 5, 'pasa por varios valores: ' + r.textos.join(' | '));
  assert.strictEqual(r.textos[0], '0 meses'); assert.strictEqual(r.ahora, '5 años y 7 meses');
  const meses = t => { const a = /(\d+) años?/.exec(t), m = /(\d+) mes/.exec(t); return (a ? +a[1] * 12 : 0) + (m ? +m[1] : 0); };
  assert.ok(r.textos.every((t, i) => i === 0 || meses(t) >= meses(r.textos[i - 1])), 'solo sube');
  assert.strictEqual(r.intro, true); assert.strictEqual(r.sigue, false, 'la animación de la gráfica termina');
  // después de cargar, los cambios se ven directo
  await p.fill('#pago', '30000'); await p.waitForTimeout(60);
  assert.notStrictEqual(await p.textContent('#v-big'), '5 años y 7 meses');
  assert.ok(!/^0 meses$/.test(await p.textContent('#v-big')));
  await ctx.close();

  const q = await abrir();
  assert.strictEqual(await q.textContent('#v-big'), '5 años y 7 meses', 'con movimiento reducido el valor está desde el inicio');
  assert.strictEqual(await q.evaluate(() => document.getElementById('chart').classList.contains('intro')), false);
  await q.context().close();
});

prueba('gráfica: etiquetas en las líneas, cruce marcado y leyenda', async () => {
  for (const [hash, movil] of [['', false], ['', true], ['#fin=cofinavit', false], ['#fin=cofinavit', true]]) {
    const p = await abrir({ hash, movil });
    const g = await p.evaluate(() => {
      const svg = document.getElementById('chart'), caja = svg.getBoundingClientRect();
      const etiquetas = [...svg.querySelectorAll('.lbl')].map(t => { const r = t.getBoundingClientRect(); return { t: t.textContent, r: { l: r.left, r: r.right, t: r.top, b: r.bottom } }; });
      const pill = svg.querySelector('.pill rect').getBoundingClientRect(), txt = svg.querySelector('.pill text').getBoundingClientRect();
      const choca = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      return {
        etiquetas: etiquetas.map(e => e.t), adentro: [...etiquetas.map(e => e.r), { l: pill.left, r: pill.right, t: pill.top, b: pill.bottom }].every(r => r.l >= caja.left - 1 && r.r <= caja.right + 1 && r.t >= caja.top - 1 && r.b <= caja.bottom + 1),
        choques: etiquetas.some((a, i) => etiquetas.some((b, j) => i < j && choca(a.r, b.r))) || etiquetas.some(e => choca(e.r, { l: pill.left, r: pill.right, t: pill.top, b: pill.bottom })),
        pillCabe: txt.left >= pill.left && txt.right <= pill.right, leyenda: [...document.querySelectorAll('.legend > span')].filter(e => e.checkVisibility()).map(e => e.textContent),
        degradado: !!svg.querySelector('linearGradient#g-pay'), cruce: svg.querySelectorAll('.pop circle').length, lineas: svg.querySelectorAll('path.ln').length,
      };
    });
    const cofi = hash.includes('cofinavit');
    assert.deepStrictEqual(p.errores, []);
    assert.deepStrictEqual(g.etiquetas, cofi ? ['Renta neta', 'Mensualidad', 'Infonavit'] : ['Renta neta', 'Mensualidad'], `${hash} ${movil}`);
    assert.strictEqual(g.adentro, true, 'las etiquetas no se salen de la gráfica'); assert.strictEqual(g.choques, false, 'las etiquetas no se enciman');
    assert.strictEqual(g.pillCabe, true, '"Se paga sola" cabe en su etiqueta');
    assert.deepStrictEqual(g.leyenda, cofi ? ['Mensualidad total', 'Parte Infonavit', 'Renta neta'] : ['Mensualidad total', 'Renta neta'], 'la leyenda sigue');
    assert.strictEqual(g.degradado, true); assert.strictEqual(g.cruce, 2); assert.strictEqual(g.lineas, cofi ? 3 : 2);
    await p.context().close();
  }
  // con la meta en renta completa, la etiqueta lo dice; si no llega, no hay cruce
  const p = await abrir({ hash: '#meta=bruta' });
  assert.deepStrictEqual(await p.evaluate(() => [...document.querySelectorAll('#chart .lbl')].map(t => t.textContent)), ['Renta', 'Mensualidad']);
  await escribir(p, 'pago', 0); await escribir(p, 'renta', 100);
  assert.strictEqual(await p.evaluate(() => document.querySelectorAll('#chart .pill').length), 0);
  assert.strictEqual((await ver(p)).veredicto, 'No llega en el plazo');
  assert.strictEqual(await p.evaluate(() => document.getElementById('verdict').classList.contains('no')), true);
  await p.context().close();
});

prueba('deslizadores: la parte llena sigue al valor', async () => {
  const p = await abrir();
  const lleno = id => p.evaluate(id => document.getElementById(id + '-r').style.getPropertyValue('--p'), id);
  // precio: (1,800,000 − 300,000) / (10,000,000 − 300,000)
  assert.strictEqual(parseFloat(await lleno('precio')).toFixed(2), (1500000 / 9700000 * 100).toFixed(2));
  await p.evaluate(() => { const r = document.getElementById('eng-r'); r.value = 60; r.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.strictEqual(await lleno('eng'), '100%');
  await escribir(p, 'tasa', 5); assert.strictEqual(await lleno('tasa'), '0%');
  await escribir(p, 'precio', 20000000); assert.strictEqual(await lleno('precio'), '100%', 'si el máximo se estira, queda lleno');
  await p.context().close();
});

prueba('modo oscuro: sin errores, sin desborde y con sus propios colores', async () => {
  for (const movil of [false, true]) {
    const p = await abrir({ oscuro: true, movil, hash: '#fin=cofinavit' }), v = await ver(p);
    assert.deepStrictEqual(p.errores, []); assert.strictEqual(v.desborde, 0);
    const c = await p.evaluate(() => { const cs = getComputedStyle(document.documentElement); return { fondo: getComputedStyle(document.body).backgroundColor, pay: cs.getPropertyValue('--s-pay').trim(), track: cs.getPropertyValue('--track').trim(), panel: cs.getPropertyValue('--panel').trim() }; });
    assert.strictEqual(c.fondo, 'rgb(12, 18, 16)'); assert.strictEqual(c.pay, '#2a9d6c'); assert.notStrictEqual(c.track, c.panel, 'el riel se distingue de la tarjeta');
    await p.context().close();
  }
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
