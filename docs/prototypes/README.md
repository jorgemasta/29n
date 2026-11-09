# Prototipos de interfaz

Prototipos desechables (HTML suelto, sin build) con los que se decidió cómo se elige a ciegas. Son de la
**v1**: un tema con una tarjeta por partido (4–8 opciones), datos inventados. La v2 (#18) pasa a **3 enfoques
por pregunta**, pero conserva el patrón y la identidad que salieron de aquí.

Abrir el `index.html` en el navegador (doble clic o `file://`). Arriba hay un selector de variante; también
`?v=N` en la URL, ← → para cambiar y `R` para reiniciar.

| Carpeta | Variantes (`?v=`) | Pregunta que respondía |
|---|---|---|
| `choose-pattern/` | 1 Pasos · 2 Hoja · 3 Carrusel | ¿Cómo se elige una tarjeta dentro de un tema? |
| `choose-pattern-round-2/` | 1 Hoja (pulida) · 2 Mazo · 3 Feed · 4 Duelo | ¿Algo más simple, tipo Tinder / TikTok? |

## Qué se decidió

- **Hoja** (ganadora): las opciones en una columna; al tocar una sube una hoja con la confirmación, la apuesta
  opcional («¿De qué partido crees que es?»), «No lo sé, siguiente» y «Cambiar mi elección». Es el patrón de la
  pregunta en la v2.
- **Duelo**: gustó elegir entre pocas opciones. De ahí sale «siempre 3 enfoques» de la v2.
- **Pasos**, **Carrusel**, **Mazo** y **Feed**: descartados frente a la Hoja.
- **Identidad**: crema #F7F3ED, tinta #04313E, petróleo #0E5167, tarjetas blancas planas, Quicksand; sin barra
  inferior estilo app. Es la que fija la spec v2.

Pendiente de prototipo: la tarjeta para compartir (#30).
