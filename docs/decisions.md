# 29N: decisiones de diseño

Cerradas en la sesión de *grilling* del 8-nov-2026. El detalle de la UX está en [ux-spec.md](ux-spec.md).

## Producto
- **Elección**: generales de España, 29-nov-2026. La campaña va del 13 al 27-nov y el último día para publicar sondeos es el 23-nov.
- **Núcleo: elegir a ciegas.** Para cada tema se muestran de 4 a 8 posturas anónimas (letras y orden aleatorio por usuario). El usuario elige una o "Ninguna me convence". Después se revela el partido de cada postura, con la cita literal, el enlace al PDF y la nota de viabilidad.
- **Afinidad**: conteo simple de elecciones, con la opción de marcar 3 temas prioritarios (que valen el doble). Se enseña el ranking completo con porcentajes y aparece a partir de 5 temas.
- **Apuesta opcional** ("¿de quién crees que es?"). Se mide la tasa de acierto agregada por tema; si pasa del 60 %, hay que reescribir la neutralización de ese tema. Solo cuenta a partir de 30 apuestas en el tema (`MIN_GUESSES`): con menos, unas pocas pruebas de amigos dispararían el aviso. Explicado en la metodología.
- **Pregunta libre**: pestaña aparte con preguntas sugeridas como chips. Responde solo desde los programas y siempre con cita; si no hay base, lo dice claramente.
  - 13-nov: solo 7 preguntas sugeridas, con la respuesta generada de antemano.
  - Hacia el 18-nov: se abre la caja de texto libre.
- **Neutralización**: la postura se reescribe con una plantilla común (qué propone, cómo y cifra) y una longitud similar. La cita literal solo aparece después de revelar.
- **Si un partido no propone nada**: se muestra la tarjeta "Este partido no propone nada sobre esto".
- **Temas con menos de 2 propuestas** entre los partidos de la zona: no se juegan (no hay nada que elegir a ciegas). Se listan aparte con la nota "Pocos partidos hablan de esto" y no cuentan para el resultado.
- **Pregunta sin respuestas verificadas**: si ningún programa responde pero alguno no se pudo verificar, no se dice "Ningún programa habla de esto", sino que no hemos podido verificar ninguna respuesta.

## Partidos y fuentes
- **Criterio de inclusión**: candidatura proclamada en la provincia del usuario y representación actual en el Congreso o en el parlamento autonómico.
- **Partidos que faltan**: un botón "Falta un partido".
- **Selección de provincia**: el usuario escribe su municipio o su isla. Los partidos regionales se filtran según la provincia.
- **Fuentes**:
  - En público, solo cuentan los programas oficiales del 29N. Mientras un partido no lo publique aparece como "⏳ programa pendiente", queda fuera de las catas y de la afinidad, y se añade automáticamente cuando lo publica.
  - En el prototipo privado se pueden usar el programa de 2023, documentos de partido y declaraciones públicas.

## Viabilidad
- **Niveles**: Viable / Viable con matices / Difícil / Muy difícil. Además, "Sin concreción suficiente" y "Evaluación sin consenso".
- **Rúbrica pública**:
  - quién tiene la competencia (Estado, CCAA o UE);
  - coste frente al presupuesto y cómo se financia;
  - encaje legal y constitucional;
  - evidencia o precedentes;
  - mayoría parlamentaria necesaria.
- **El "por qué"**: 2 o 3 frases con fuentes.
- **Proceso**: 100 % IA, sin revisión humana, y así se declara en la web. El evaluador no sabe de qué partido es la medida. Se hacen dos evaluaciones; si no coinciden, se marca "sin consenso".
- **Cuándo se ve**: solo después de elegir. Sin semáforo de colores.
- **Transparencia**: se publica el reparto de notas por partido desde el lanzamiento, con explicación.
- **Fuentes (V8)**: una evaluación cuyas fuentes no pasan (dominio institucional + HTTP 200) se repite hasta 2 veces. Si sigue sin fuentes, se publica igualmente, porque la valoración por criterios sigue siendo útil, pero la tarjeta lo dice («Sin fuentes verificables») y queda en el informe.

## Verificación automática
1. Cada cita literal debe aparecer en el PDF; la comprobación es un script, no IA. Si no aparece, la postura se descarta.
2. La viabilidad se evalúa a ciegas.
3. Doble evaluación independiente de la viabilidad.
4. Un agente intenta adivinar el partido a partir del texto neutralizado; si es fácil, se reescribe.
5. Botón "Reportar error", que abre un issue en GitHub.

## Proceso de datos
- Un cron cada 2 o 3 horas busca programas nuevos en las webs de los partidos y en agregadores.
- Proceso completo: extraer, neutralizar, verificar, evaluar la viabilidad y publicar automáticamente si todas las comprobaciones pasan.
- Aviso en cada publicación y en cada fallo, como issue de GitHub (etiqueta `vigilante`).
- El dataset es JSON versionado en el repo.
- **Comparación entre partidos (V5 y V11)**: cada programa se compara con todas las posturas ya publicadas del tema.
  - V11: el adivinador recibe la postura nueva junto con todas las publicadas del tema y la lista de partidos registrados (también si es el primero en publicar). Se ejecuta 3 veces con órdenes distintos (barajados independientes, distintos entre sí mientras haya permutaciones suficientes).
  - V5: la mediana del tema incluye el texto nuevo. Al primer partido solo se le aplica el rango de 25–70 palabras.
  - Solo se reescribe la postura del partido que se está procesando. Si en la misma pasada otra postura ya publicada resulta reconocible (V11) o queda fuera de la nueva mediana (V5), su texto y su nota no cambian: se anota un **aviso en el informe de ese partido** (con el partido que lo provocó, y se sustituye cada vez que ese partido vuelve a publicar). Se corrige cuando se vuelve a procesar su programa (`watch --force`).
- **Reproducibilidad**: relanzar un PDF sin cambios contra el mismo dataset da un resultado idéntico (caché de IA por PDF, versión del prompt y entrada). La publicación de otro partido nunca cambia el texto ni la nota de uno ya publicado. La nota de viabilidad (V13) y la comprobación de sus fuentes (V8) se guardan en caché por texto neutral y citas, no por PDF: si un PDF nuevo deja el texto igual, la nota no cambia. Reprocesar un programa contra un dataset distinto sí puede reescribir su texto por V5 o V11, y queda en su informe.

## Técnica
- **Web**: Astro en Cloudflare, en 29n.jorgemasta.com (provisional). Mobile-first y solo en castellano.
- **IA**:
  - Claude (Sonnet y Opus) para preparar los datos.
  - Claude Haiku, a través de Cloudflare AI Gateway, para la pregunta libre: con caché, límite de uso y sin logs.
  - Tope de 150 €/mes. Al alcanzarlo, la pregunta libre solo muestra preguntas frecuentes ya respondidas.
  - Retención de la API de Anthropic (comprobado el 8-nov-2026 en fuentes oficiales): borrado en 30 días por defecto
    (hasta 2 años si se marca por la política de uso), sin entrenamiento con los datos de la API. La retención cero existe,
    pero se pide a ventas y la aprueba Anthropic: el proyecto no la tiene. Fuentes y texto en la página de privacidad (`/privacidad/#pregunta`).
  - Límite por sesión: 8 preguntas respondidas por IA (las de la caché no cuentan). Sesión = id aleatorio en
    `sessionStorage`, guardado solo como hash con caducidad de 24 h. Sin IP.
  - El tope se aplica con un coste estimado por llamada. Antes de responder, cada pregunta reserva su peor caso (todos los partidos con páginas candidatas, con sus 2 reescrituras y la V10 en cada intento) y al terminar se ajusta a lo gastado de verdad: así una pregunta nunca empieza si podría pasarse del tope.
  - KV no tiene incrementos atómicos: dos preguntas que lleguen en los mismos milisegundos pueden leer el mismo total. La reserva reduce esa ventana a una lectura y una escritura (no a toda la llamada a la IA) y el tope duro es el límite de gasto del *workspace* de Anthropic. No se usa un Durable Object para esto: no compensa su complejidad para un margen de céntimos.
  - La V10 de la pregunta libre la hace Sonnet 5.5 (esfuerzo bajo): toda barrera con IA usa un modelo distinto del que genera.
- **Privacidad**: todo se procesa en el navegador. Sin cuentas, sin guardar elecciones y sin estadísticas agregadas de afinidad. La tarjeta para compartir se genera en el cliente.
  Página propia `/privacidad/` (incluye Umami, avisos, pregunta libre y retención de Anthropic) y aviso de contenido generado por IA (`/privacidad/#ia`); cada etiqueta «IA» de la app enlaza ahí (la de viabilidad, a la metodología). Una prueba (`tests/launch.test.ts`) impide que nada fuera del cliente calcule el resultado de afinidad.
- **Lanzamiento (#16)**: solo el build de producción (`PRODUCTION=1`, `npm run deploy`) es indexable y falla con datos de prueba, partidos fuera del registro o fuentes no oficiales; las fuentes provisionales se excluyen con aviso. El prototipo privado va a otro Worker (`29n-privado`, workers.dev), nunca al dominio público. Licencias: código MIT (`LICENSE`), datos CC BY 4.0 (`data/LICENSE.md`; las citas literales son de cada partido).
- **Analítica**: Umami Cloud (región UE), con eventos de embudo y la tasa de acierto de la apuesta. Nunca qué partido elige cada usuario.

## Proyecto
- Proyecto personal firmado con nombre y con declaración de no afiliación.
- Repo público desde el primer commit. Código bajo MIT y dataset bajo CC BY 4.0.
- Contenido generado por IA etiquetado como tal (Reglamento europeo de IA).

## Calendario
- **9-nov**: prototipo privado jugable, con 5 o 6 temas y fuentes provisionales.
- **13-nov**: lanzamiento público con los programas publicados hasta ese día y el resto como pendientes.
- **~18-nov**: se abre la pregunta libre.
- **23-nov**: último día de difusión antes de la veda de sondeos. Nunca se publican agregados.
