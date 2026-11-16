# Se paga sola: simulador de crédito hipotecario para México

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

## Cómo está armada la página

Arriba van el resultado y la gráfica; debajo, los cinco controles con deslizador (`RANGES`) y el tipo de financiamiento. Lo demás está en "Ajustes avanzados", que avisa cuántos valores difieren del ejemplo (lista `ADV`) y se abre solo si ya hay cambios. Los montos en pesos se escriben con separador de miles (lista `MONEY`). Un campo nuevo va en esas listas según le toque.

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
- **Analítica:** Cloudflare Web Analytics, activada en el panel de Cloudflare (*Automatic setup*): Cloudflare inserta el script al servir la página, por eso no aparece en el código. No usa cookies y no recibe lo que va después del `#`. Está descrita en `privacidad.html`.
- **Publicidad u otra medición:** antes de activarlas, actualiza `privacidad.html`.
- **Textos legales:** son una base y no los ha revisado un abogado.
