# Prueba de punta a punta (humo)

`npm run e2e` compila el sitio (`dist/`, build de vista previa) y, en un Chrome real con
[agent-browser](https://www.npmjs.com/package/agent-browser) (dependencia de desarrollo), hace el recorrido
v2 completo **en móvil (390×844) y en escritorio (1280×800)**: portada → provincia → elegir 2 temáticas →
3 preguntas con la hoja → resumen → destapar → «Seguir con» la siguiente → Mi resultado (desde el menú) →
seguir con otra temática → Preguntar → Tus datos → páginas de información. En la hoja pulsa «No lo sé,
siguiente» si está la apuesta (#26) y, si no, «Confirmar y seguir».

Antes comprueba el modo producción: `PRODUCTION=1 astro build` con el dataset simulado debe **fallar**, y la vista
previa lleva `Disallow: /` en `robots.txt` y `noindex` en las páginas.

En cada pantalla comprueba también: contraste AA y ninguna violación grave o crítica con axe (claro y oscuro),
foco en el titular al cambiar de pantalla (y en el título de la hoja), zonas táctiles de 48 px o más, que no hay
emojis ni flechas o símbolos de la fuente del sistema (los iconos son SVG), que nada se corta a 320 px (zoom
al 200 %) ni con la letra grande, el botón 'Aa' (guardado, 22 px), los arreglos de móvil (sin destello al tocar,
`touch-action`, sin selección en controles, campos de 16 px, `viewport-fit=cover`), que `theme-color` coincide
con la cabecera en claro y oscuro, que el aviso de provincia se va solo, 'Escuchar las tres' (con una voz falsa),
la hoja sin deslizamiento con `prefers-reduced-motion`, la etiqueta «IA» enlazada a `/privacidad/#ia` (a ciegas, al revelar y en Preguntar), que
ninguna petición sale a otro dominio, la página de privacidad y el pie (autoría, MIT, CC BY 4.0, Privacidad) en
todas las páginas. No forma parte de `npm test`.

Código: `tests/e2e/smoke.e2e.ts`. Si falla, deja una captura en `dist-e2e-failure.png`.

## Preparación (una vez)

```sh
npx agent-browser install          # descarga Chrome for Testing en ~/.agent-browser
```

En Linux, Chrome necesita librerías del sistema (`npx agent-browser install --with-deps`, pide root).
Sin root (RHEL/Fedora), se pueden descargar y desempaquetar en tu usuario; la prueba añade
`~/.agent-browser/libs/root/usr/lib64` a `LD_LIBRARY_PATH` si existe:

```sh
mkdir -p ~/.agent-browser/libs/rpms ~/.agent-browser/libs/root
cd ~/.agent-browser/libs/rpms
dnf download --resolve --alldeps nspr nss nss-util atk at-spi2-atk at-spi2-core cups-libs libxcb \
  libxkbcommon alsa-lib mesa-libgbm libX11 libXext cairo pango libXcomposite libXdamage libXfixes libXrandr
cd ../root
for f in ../rpms/*.rpm; do case $(basename $f) in glibc*|libgcc*|libstdc++*|systemd*) continue;; esac
  rpm2cpio $f | cpio -idm --quiet; done
```
