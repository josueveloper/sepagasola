# Simulador de crédito hipotecario para México

Página estática que calcula la mensualidad de un crédito con banco, Apoyo Infonavit o Cofinavit, compara formas de aplicar abonos a capital y estima cuánto tarda la renta en cubrir la mensualidad. Los cálculos corren en el navegador; no hay servidor ni paso de compilación.

Sitio: <https://sepagasola.com/>

## Probarlo en local

```sh
python3 -m http.server 8000
```

Luego abre <http://localhost:8000/>. Usa un servidor: desde `file://` el navegador bloquea la precarga de las fuentes y `404.html` y las páginas legales no encuentran sus archivos.

## Pruebas

```sh
node tests/logica.test.js   # cálculo del crédito y enlaces para compartir (solo Node)
node tests/ui.test.js       # la página en Chromium, en escritorio y celular (Playwright)
```

El cálculo vive en el bloque `<script id="logica">` de `index.html`, separado del código que pinta la página; `tests/logica.test.js` lee ese bloque y lo ejecuta tal cual. Si cambias un cálculo a propósito, actualiza los valores de referencia de las pruebas. Corre las dos antes de publicar.

## Enlaces para compartir

"Copiar enlace" (en celular, "Compartir") arma una dirección como `https://sepagasola.com/#precio=2500000&fin=cofinavit`, que solo lleva los valores distintos al ejemplo. Van después del `#` para que no lleguen al servidor. Quien lo abre ve ese escenario sin perder el suyo guardado, hasta que cambie algo. Si agregas un campo al simulador, añádelo a `DEFAULTS` y a `NUM_KEYS` o `ENUMS` para que también viaje en el enlace.

## Publicar

GitHub Pages publica la rama `main`, así que cada push a `main` sale directo al sitio.

## Cambiar de dominio

Reemplaza `sepagasola.com` en:

- `CNAME`
- `index.html`: `canonical`, Open Graph, Twitter Card y JSON-LD
- `privacidad.html` y `aviso-legal.html`: `canonical`
- `robots.txt` y `sitemap.xml`
- `og-image.png`: el dominio forma parte de la imagen, hay que regenerarla

Después configura el dominio en GitHub Pages y da de alta el sitio nuevo en Google Search Console.

## Mantenimiento

- **Datos de Infonavit:** las tasas y reglas cambian. Revisa cada año las preguntas frecuentes de `index.html` y su copia en el JSON-LD.
- **Publicidad o analítica:** antes de activarlas, actualiza `privacidad.html`.
- **Textos legales:** son una base y no los ha revisado un abogado.
