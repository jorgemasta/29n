# 29N: decisiones de diseño

Cerradas en la sesión de *grilling* del 8-nov-2026. El detalle de la UX está en [ux-spec.md](ux-spec.md).

## Producto
- **Elección**: generales de España, 29-nov-2026. La campaña va del 13 al 27-nov y el último día para publicar sondeos es el 23-nov.
- **Núcleo: elegir a ciegas.** Para cada tema se muestran de 4 a 8 posturas anónimas (letras y orden aleatorio por usuario). El usuario elige una o "Ninguna me convence". Después se revela el partido de cada postura, con la cita literal, el enlace al PDF y la nota de viabilidad.
- **Afinidad**: conteo simple de elecciones, con la opción de marcar 3 temas prioritarios (que valen el doble). Se enseña el ranking completo con porcentajes y aparece a partir de 5 temas.
- **Apuesta opcional** ("¿de quién crees que es?"). Se mide la tasa de acierto agregada por tema; si pasa del 60 %, hay que reescribir la neutralización de ese tema.
- **Pregunta libre**: pestaña aparte con preguntas sugeridas como chips. Responde solo desde los programas y siempre con cita; si no hay base, lo dice claramente.
  - 13-nov: solo 7 preguntas sugeridas, con la respuesta generada de antemano.
  - Hacia el 18-nov: se abre la caja de texto libre.
- **Neutralización**: la postura se reescribe con una plantilla común (qué propone, cómo y cifra) y una longitud similar. La cita literal solo aparece después de revelar.
- **Si un partido no propone nada**: se muestra la tarjeta "Este partido no propone nada sobre esto".

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

## Verificación automática
1. Cada cita literal debe aparecer en el PDF; la comprobación es un script, no IA. Si no aparece, la postura se descarta.
2. La viabilidad se evalúa a ciegas.
3. Doble evaluación independiente de la viabilidad.
4. Un agente intenta adivinar el partido a partir del texto neutralizado; si es fácil, se reescribe.
5. Botón "Reportar error", que abre un issue en GitHub.

## Proceso de datos
- Un cron cada 2 o 3 horas busca programas nuevos en las webs de los partidos y en agregadores.
- Proceso completo: extraer, neutralizar, verificar, evaluar la viabilidad y publicar automáticamente si todas las comprobaciones pasan.
- Aviso al móvil en cada publicación y en cada fallo.
- El dataset es JSON versionado en el repo.

## Técnica
- **Web**: Astro en Cloudflare, en 29n.jorgemasta.com (provisional). Mobile-first y solo en castellano.
- **IA**:
  - Claude (Sonnet y Opus) para preparar los datos.
  - Claude Haiku, a través de Cloudflare AI Gateway, para la pregunta libre: con caché, límite de uso y sin logs.
  - Tope de 150 €/mes. Al alcanzarlo, la pregunta libre solo muestra preguntas frecuentes ya respondidas.
  - Pendiente: confirmar la política de retención de datos de la API de Anthropic.
- **Privacidad**: todo se procesa en el navegador. Sin cuentas, sin guardar elecciones y sin estadísticas agregadas de afinidad. La tarjeta para compartir se genera en el cliente.
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
