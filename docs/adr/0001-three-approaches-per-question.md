# 0001 · De «una tarjeta por partido» a «3 enfoques por pregunta»

- **Estado:** aceptada (spec #18, primera pieza en #19)
- **Fecha:** 2026-11-09

## Contexto

En la v1 (#1), cada tema enseñaba entre 4 y 8 tarjetas anónimas, una por partido, y se destapaba
tema a tema. Al probarlo vimos que:

- era pesado: comparar 6 u 8 textos a la vez cansa y la gente no sabe por dónde empezar;
- destapar tema a tema contamina: tras ver un par de temas ya intuyes el estilo de cada partido y
  eliges (y adivinas) influido;
- la lista de temas era corta y estaba puesta a mano, sin preguntas propias de cada comunidad;
- una elección por tema daba poca base al «con quién coincides».

## Decisión

Cada **pregunta** ofrece siempre **3 enfoques**. Un enfoque es una forma de abordar el problema y
lo pueden defender uno o varios partidos, **de lleno (1)** o **en parte (0,5)**, siempre con su
cita. Si los programas no dan para 3, se añade un **enfoque inventado** que no suma a nadie. Un
partido que no encaja en ninguno queda como **«propone otra cosa»** y se enseña al destapar.

Las preguntas se agrupan en **temáticas** (unas 8 nacionales y «Tu comunidad» donde hay partidos
regionales), salen de un **pulso** congelado antes del lanzamiento y se **destapan al terminar cada
temática**, todas a la vez.

En datos: el dataset pasa a la versión 2 con `themes` y `questions`; cada pregunta lleva sus 3
`approaches` y cada enfoque sus `stances` por partido (ver `GLOSSARY.md`). El motor (`createGame`)
baraja los 3 enfoques por semilla y no expone nada de partidos hasta `revealTheme`.

## Consecuencias

- **Más fácil de jugar:** 3 opciones de longitud parecida en vez de 4–8 textos.
- **Menos contaminación:** a ciegas solo se ven enfoques, que mezclan partidos; el texto de cada
  partido se ve solo al destapar.
- **Riesgo nuevo: sesgo al agrupar.** Agrupar propuestas en enfoques es una decisión editorial. Se
  mitiga con enfoques sacados de los programas y congelados, dos pasadas independientes de IA que
  tienen que coincidir, cita por cada nivel, la barrera V11 frente al azar, «propone otra cosa»
  visible y todo publicado en la metodología y los informes.
- **El proceso de datos cambia:** ya no se neutraliza el texto de cada partido; aparecen
  `settleApproaches` (fijar enfoques, #20) y `takePulse` (pulso, #23), y `processManifesto` pasa a
  trabajar por pregunta (#21).
- **Transición:** mientras llegan esos tickets, el dataset lleva a la vez los temas de la v1
  (`topics`, `positions`), que siguen alimentando el proceso de datos, la metodología y los
  informes, y las temáticas de la v2, que son lo único que se juega en la web.
- La «pregunta sugerida» de Preguntar se renombra a `suggestedQuestion` para que `question` sea
  solo la de la v2.
