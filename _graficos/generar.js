// Regenera og-image.png y los íconos PNG a partir de sus fuentes. Uso: node _graficos/generar.js
//   og-image.png                         ← _graficos/og-image.html (1200×630)
//   favicon-32.png, icon-192.png, icon-512.png  ← favicon.svg (esquinas redondeadas, fondo transparente)
//   apple-touch-icon.png, icon-maskable-512.png ← _graficos/icono-maskable.svg (cuadro completo; iOS y Android lo recortan)
// GitHub Pages no publica las carpetas que empiezan con "_", así que esta carpeta no sale en el sitio.
const path = require('path'), fs = require('fs'), http = require('http');
const TOOLS = process.env.TOOLS_DIR || '/workspace/.tools';
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(TOOLS, 'browser/pw-browsers');
  const arch = require('os').arch() === 'arm64' ? 'aarch64-linux-gnu' : 'x86_64-linux-gnu';
  process.env.LD_LIBRARY_PATH = ['libs/usr/lib/' + arch, 'libs/lib/' + arch].map(d => path.join(TOOLS, d)).filter(fs.existsSync).concat(process.env.LD_LIBRARY_PATH || []).join(':');
  ({ chromium } = require(path.join(TOOLS, 'browser/node_modules/playwright')));
}
const RAIZ = path.resolve(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

// Las fuentes tipográficas no cargan desde file://, así que se sirve la carpeta en un puerto local libre
const servidor = http.createServer((req, res) => {
  const archivo = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]));
  if (!archivo.startsWith(RAIZ + path.sep) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' }); res.end(fs.readFileSync(archivo));
});

(async () => {
  await new Promise(ok => servidor.listen(0, '127.0.0.1', ok));
  const BASE = 'http://localhost:' + servidor.address().port + '/';
  const browser = await chromium.launch();

  const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await og.goto(BASE + '_graficos/og-image.html'); await og.waitForSelector('body[data-listo]'); await og.evaluate(() => document.fonts.ready); await og.waitForTimeout(200);
  await og.screenshot({ path: path.join(RAIZ, 'og-image.png') });
  console.log('og-image.png');

  const icono = async (svg, tam, salida) => {
    const p = await browser.newPage({ viewport: { width: tam, height: tam } });
    await p.setContent(`<html><body style="margin:0;background:transparent"><img src="${BASE + svg}" width="${tam}" height="${tam}" style="display:block"></body></html>`);
    await p.waitForFunction(() => document.images[0].complete);
    await p.screenshot({ path: path.join(RAIZ, salida), omitBackground: true });
    await p.close(); console.log(salida);
  };
  await icono('favicon.svg', 32, 'favicon-32.png');
  await icono('favicon.svg', 192, 'icon-192.png');
  await icono('favicon.svg', 512, 'icon-512.png');
  await icono('_graficos/icono-maskable.svg', 180, 'apple-touch-icon.png');
  await icono('_graficos/icono-maskable.svg', 512, 'icon-maskable-512.png');

  await browser.close(); servidor.close();
})();
