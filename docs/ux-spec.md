# Especificación UX final · 29N (29n.jorgemasta.com)

**Base:** la propuesta de juego y retención (18,5/30), que es la más equilibrada entre las tres personas. Sobre ella se injertan cinco piezas: la revelación y el gancho de compartir de la propuesta de viralidad, la capa de transparencia de la propuesta de confianza, la base de accesibilidad de la propuesta de lectura fácil y las fricciones que señalaron los jueces. Nomenclatura: en la interfaz no aparecen nunca "cata" ni "sin siglas". La acción se llama "elegir a ciegas", la unidad es el "tema" y la marca es solo "29N".

---

## 1. Principios de diseño

1. **Meta visible de 5 temas.** El resto se presenta como "temas extra" y nunca se muestra "de 18" como deber.
2. **Una decisión por pantalla y un toque por decisión.** Sin swipe, sin temporizadores y sin avances automáticos.
3. **Neutralidad antes de elegir y emoción después.** La fase a ciegas es gris y uniforme. Los colores y logos de partido solo aparecen en la revelación.
4. **Cada fuente posible de sesgo tiene una prueba a un toque**: orden, reescritura, viabilidad, inclusión de partidos y criterio de "no propone nada". Nunca se impone la prueba en el flujo principal.
5. **Nunca se juzga al usuario ni se recomienda voto.** Ningún texto valora la elección, ni para bien ni para mal.
6. **Por defecto se comparte la sorpresa, no la ideología.** Todo ocurre en el móvil del usuario.

---

## 2. Flujo pantalla a pantalla (móvil)

### 0. Reglas comunes
- **Tipografía:** en `rem`, de modo que respeta el tamaño de letra del sistema. Base de 18px y botón **"Aa"** en la cabecera para pasar a grande (22px). La preferencia se guarda en local. Con zoom al 200 % nada se corta.
- **Tamaños táctiles:** botón principal a todo el ancho y de 56px como mínimo. Secundarios de 48px como mínimo con borde visible. 12px entre zonas táctiles.
- **Barra inferior fija:** `Temas · Preguntar · Mi resultado`, con icono y texto. Cabecera: `← Volver` (con texto) · `Aa` · provincia (`📍 Las Palmas`).
- **Accesibilidad:** contraste AA. La información nunca depende solo del color. Con `prefers-reduced-motion` todas las animaciones pasan a fundido. Al cambiar de pantalla, el foco va al titular.
- **Paleta:** gris piedra, tinta y un único acento azul petróleo, que no corresponde a ningún partido.
- **Lenguaje:** frases de 20 palabras como máximo. Cada sigla lleva su explicación llana la primera vez que aparece ("IRPF, el impuesto sobre tu sueldo").
- **IA:** siempre se indica con la etiqueta de texto **"IA"**. No se usan los emojis 🤖 ni ✨.
- **Ejemplos:** solo `[Partido]` en mocks. Nunca un partido real como ejemplo.

### 1. Vista previa del enlace (WhatsApp/X/Telegram)
- **Propósito:** ganar el primer toque en el grupo familiar.
- **og:title:** "29N: lee lo que proponen los partidos sin saber de quién es"
- **og:description:** "Cada pregunta, 3 propuestas sin firma. Elige la que más te convence y descubre qué partidos la defienden. Gratis, sin registrarte, sin datos personales."
- **og:image (1200×630):** tres propuestas sin firma con las letras A, B y C (la B elegida), más el texto "Elecciones generales · 29 de noviembre". Identidad v2 (crema, tinta, petróleo, tarjetas blancas planas), sin colores de partido. Texto alternativo: "Tres propuestas sin firma, A, B y C, y una de ellas elegida. Elecciones generales · 29 de noviembre."
- Con `?r=reto` cambia el og:title: "Te reto: ¿con cuántos partidos coincides a ciegas?"

### 2. Portada (primera visita)
- **Propósito:** explicar la mecánica en 5 segundos, desactivar el miedo a la estafa y al partidismo, y llevar a vivienda en un toque.
- **Layout de arriba abajo:**
  1. "29N · Elecciones generales · 29 de noviembre"
  2. Titular
  3. Subtítulo
  4. Animación en bucle de 3 s: tres tarjetas A, B y C, una se ilumina y se gira mostrando un logo genérico. Con reduced motion, imagen estática.
  5. Tres pasos en línea con icono
  6. Botón fijo abajo
  7. Bloque de confianza (3 líneas)
  8. Pie
- **Microcopy:**
  - Titular: **"Lee lo que proponen sin saber de quién es."**
  - Subtítulo: "Elige la que más te convence. Después te enseñamos de qué partido era cada una."
  - Pasos: "1 · Lees" · "2 · Eliges" · "3 · Descubres"
  - Botón: **"Empezar por vivienda"**
  - Confianza:
    - "No pedimos nombre, teléfono ni dinero. Nunca."
    - "No te decimos a quién votar. Vota a quien quieras."
    - "Proyecto personal e independiente. Sin vínculo con ningún partido, medio ni institución."
  - Pie: "Cómo funciona" · "Partidos y programas" · "Código abierto"
  - Con `?r=reto`, encima del titular: "Alguien te reta: elige a ciegas y mira con cuántos partidos coincides."
- **Interacciones:** "Empezar" lleva a Provincia. Si ya hay provincia guardada, va directo al tema pendiente.
- **Errores:** sin almacenamiento disponible (modo privado), aparece una sola vez: "En este modo no podemos recordar tu progreso si cierras."

### 2b. Portada (visita de vuelta)
- **Layout:** saludo, papeleta mini, bloque de novedades si las hay, botón principal y secundario.
- **Microcopy:**
  - Saludo: "Hola de nuevo. Llevas 3 de 5 temas." Con 5 o más: "Llevas 7 temas."
  - Novedades: "[Partido] ha publicado su programa. Hay 4 temas con una propuesta nueva."
  - Botón principal: con novedades, "Ver las propuestas nuevas"; sin novedades, "Seguir: Pensiones".
  - Secundario: "Ver mi resultado" (activo desde 5 temas).
  - Enlace: "Empezar de cero". Pide confirmación: "Se borrarán tus elecciones de este móvil. ¿Seguro?" · "Borrar" / "Cancelar".

### 3. Provincia
- **Propósito:** decidir qué partidos regionales entran, con una sola decisión.
- **Layout:** titular, una línea de por qué, buscador grande con etiqueta visible y lista alfabética de las 52 provincias (incluidas Ceuta y Melilla, filas de 56px). Al final de la lista, nunca arriba: "Prefiero no decirlo". Debajo, nota de privacidad. **No se pide ubicación.**
- **Microcopy:**
  - Titular: "¿Dónde votas?"
  - Texto: "Así añadimos los partidos que se presentan en tu provincia."
  - Etiqueta del buscador: "Escribe tu provincia, tu pueblo o tu isla". Ejemplo: "Por ejemplo: Telde".
  - Si escribe un municipio o una isla: "Telde → Las Palmas".
  - Sin resultados: "No lo encontramos. Prueba con el nombre de tu provincia."
  - Última fila: "Prefiero no decirlo (solo partidos de toda España)"
  - Nota: "Se guarda solo en este móvil. Puedes cambiarla cuando quieras."
- **Interacciones:** la búsqueda ignora tildes y mayúsculas, acepta variantes (A Coruña / La Coruña / Coruña, Girona / Gerona), los ~8.100 municipios y las islas. Se resuelve con un JSON estático. Al tocar una fila, avanza sin botón de confirmar. La ronda siguiente muestra 2 s un aviso: "Las Palmas: 9 partidos, incluidos [Partido regional A] y [Partido regional B]. 1 con programa pendiente · Cambiar". Las provincias canarias añaden "Además, 2 temas solo de Canarias".

### 4. Elegir a ciegas (tema)
- **Propósito:** el núcleo. Leer y elegir sin sesgo de marca y sin muro de texto.
- **Primera vez (solo en el tema 1)**, una capa que se cierra con un toque: "Lee y toca la que más te convenza. No pone de quién es: lo verás después." Botón: "Entendido".
- **Layout de arriba abajo:**
  1. **Cabecera fija:** "Tema 1 de 5 · Vivienda y alquiler" y cinco puntos de progreso. Desde el sexto tema: "Tema extra · Defensa y OTAN".
  2. **Pregunta neutra del tema**, publicada y auditable en Metodología: "¿Qué harían con el precio de la vivienda y el alquiler?" Sin datos de contexto, porque elegir el dato ya enmarca la pregunta.
  3. **Explicación llana**, solo en los temas con jerga: "REF, ZEC y AIEM: las reglas fiscales especiales de Canarias."
  4. **Fila de utilidades:**
     - "🔊 Escuchar todas": lee las tarjetas en orden con la voz del navegador y resalta la que suena.
     - "Ver todo el detalle": interruptor que se recuerda.
     - "Orden al azar": abre una hoja de explicación.
  5. **Tarjetas** en una columna a todo el ancho, nunca en carrusel. Cada una lleva una letra en un círculo neutro, un **titular en negrita de 12 palabras como máximo** y un **detalle de 30 palabras como máximo**, plegado con "Más detalle" (o abierto si el interruptor está activo). Misma tipografía, mismo gris y mismo alto mínimo para todas.
  6. **"Ninguna me convence"** al final: tarjeta con borde discontinuo, mismo tamaño y mismo peso visual que las demás.
  7. **Línea gris:** "Hay 7 propuestas. 2 partidos no proponen nada sobre esto (los verás al final)."
- **Hoja "Orden al azar":**
  - "El orden y las letras se barajan para ti en cada tema."
  - "Todas las propuestas están reescritas con IA en el mismo estilo y largo parecido. El texto original lo verás después de elegir."
  - "Tu barajado: #4F2A · Ver el código que baraja ↗"
  - Botón: "Barajar otra vez" (solo antes de elegir).
- **Interacciones:**
  - Tocar una tarjeta la eleva (escala 1,02 y borde grueso), baja las demás al 60 % de opacidad y da una vibración corta si el móvil la admite. Tocar otra cambia la selección. Aparece la barra de confirmación (pantalla 5).
  - Las letras y el orden salen de una semilla guardada en local, así que son estables si el usuario vuelve.
  - **Las tarjetas "no propone nada" no aparecen en la fase a ciegas.**
  - Antes de elegir no se muestra ni viabilidad ni color.
- **Estado de carga:** tarjetas esqueleto con letras.
- **Error:** "No hemos podido cargar este tema. Reintentar." Los temas ya cargados funcionan sin red.

### 5. Confirmar + apuesta opcional (barra inferior, misma pantalla)
- **Propósito:** confirmar contra toques accidentales y, en ese mismo toque, permitir apostar. La apuesta no añade pasos.
- **Layout:** media hoja inferior con la frase de elección, la pregunta de apuesta, una rejilla de chips con los nombres de los partidos que tienen propuesta en ese tema (texto sin logo, varias líneas, sin scroll lateral) y un botón grande.
- **Microcopy:**
  - "Has elegido la C."
  - "¿De quién crees que es? (opcional, solo lo ves tú)"
  - Chips: `[Partido]` × n.
  - Botón: **"Descubrir sin apostar"**
  - Enlaces: "Cambiar" · "No preguntarme más"
- **Interacciones:** tocar un chip lanza la revelación con apuesta. El botón la lanza sin apuesta. "No preguntarme más" oculta los chips; se puede reactivar en Tus datos. Si eligió "Ninguna me convence", la hoja se reduce al botón **"Ver de quién era cada una"**.

### 6. Revelación ("¿De quién era?")
- **Propósito:** el momento cumbre. Sorpresa, prueba y algo que capturar.
- **Animación:**
  - "¿De quién era?" (0,6 s).
  - Tu tarjeta gira en 3D en 500 ms y muestra el **logo oficial del partido, a igual tamaño para todos**, una franja con su color y su nombre completo.
  - El resto gira en cascada cada 250 ms.
  - Se salta con un toque. Con reduced motion, fundido.
- **Layout de arriba abajo:**
  1. **Banner, solo uno, en este orden de prioridad:**
     - Con apuesta acertada: "Era de [Partido]. Lo pensabas."
     - Con apuesta fallada: "Era de [Partido]. Tu apuesta: [Apuesta]."
     - Sin apuesta: "La C era de [Partido]."
     - Ninguna: "No te convenció ninguna. Esto proponía cada uno:"
  2. **Etiqueta de recorrido**, factual y nunca valorativa:
     - En el tema 1: "Tu primera elección."
     - Si es un partido nuevo: "Primera vez que eliges a [Partido]."
     - Desde el tema 3, si procede: "3 temas, 3 partidos distintos."
  3. **Tu tarjeta destacada** ("Tu elección"), con:
     - El titular que leíste.
     - La cita literal, desplegada por defecto: «…» — Programa 2026, pág. 34 · **"Abrir PDF en la página ↗"**.
     - El chip de viabilidad: "Viable con matices · IA".
     - El enlace "¿Algo no cuadra?".
  4. **"Las demás"**: filas compactas con letra, logo, nombre y chip de viabilidad. Cada fila se despliega igual que la tuya.
  5. **Partidos sin propuesta:** filas grises "[Partido]: no propone nada sobre esto" · "Ver cómo lo buscamos".
  6. **Pendientes:** línea "⏳ Sin programa todavía: [Partido]".
  7. **Nota plegable**, una vez por sesión: "La viabilidad dice qué haría falta para aplicarla, no si es buena idea."
  8. **Botones fijos:** **"Siguiente: Pensiones"** · secundario "Elegir otro tema". En el tema 5 el principal cambia a **"Ver mi resultado"**. Enlace pequeño: "Guardar esta revelación" (imagen de tu tarjeta revelada, sin datos personales).
- **Interacciones:** la viabilidad se muestra en **todas** las tarjetas, no solo en la elegida. Ningún "¡Buena elección!". "Siguiente" sigue un orden fijo y publicado: vivienda primero y después las preocupaciones del barómetro del CIS de octubre de 2026.

### 7. Hoja de detalle y viabilidad
- **Propósito:** hacer auditable cada tarjeta sin cargar la revelación.
- **Layout:** hoja inferior al 85 % de alto.
  1. Cabecera: logo, partido y "era la C".
  2. **Comparador** con dos bloques apilados: "Lo que leíste (versión reescrita)" y "Lo que dice su programa (literal)", con página y PDF.
  3. **Viabilidad:** escala de 4 escalones en **un solo tono**, nunca semáforo. "Sin concreción" y "Sin consenso" van fuera de la escala, con icono propio.
  4. "Por qué", en 2–3 frases.
  5. Rúbrica de 5 filas.
  6. Fuentes.
  7. Caja de método.
  8. "¿Algo no cuadra?".
- **Niveles**, con texto llano y sin adjetivos morales:
  - "Viable: encaja con las competencias, el presupuesto y la ley actuales."
  - "Viable con matices: se puede aplicar, con condiciones que la propuesta no resuelve del todo."
  - "Difícil: necesita cambios importantes de ley, de presupuesto o de mayorías."
  - "Muy difícil: choca a la vez con varias condiciones (competencia, ley, coste o mayorías)."
  - "Sin concreción suficiente para evaluar: no da cifras, plazos ni instrumento."
  - "Evaluación sin consenso: dos evaluaciones de la IA no coincidieron (una: Viable; otra: Difícil). Preferimos enseñártelo a elegir una."
- **Rúbrica:** "Quién puede hacerlo (Estado / comunidades / UE)" · "Coste y cómo se paga" · "Encaje legal y constitucional" · "Precedentes" · "Votos necesarios en el Congreso". Cada fila lleva una frase. Toda cifra va con su fuente enlazada; si no hay fuente, no hay cifra.
- **Método:** "Evaluación hecha por IA, sin revisión humana, dos veces y sin saber de qué partido era. Puede equivocarse. Cómo se hace →"

### 8. ¿Algo no cuadra?
- **Layout:** hoja corta con 5 opciones de radio, campo opcional de 300 caracteres como máximo, nota de privacidad y botón de envío.
- **Microcopy:**
  - Opciones: "La versión reescrita cambia el sentido" · "La cita o la página no es correcta" · "La viabilidad me parece equivocada" · "Sí hay propuesta de este partido" · "Otra cosa"
  - Privacidad: "Solo enviamos el tema, la tarjeta y lo que escribas. No enviamos qué elegiste ni tu provincia."
  - Botón: "Enviar aviso"
  - Confirmación: "Gracias. Los avisos son públicos y las correcciones salen en el Registro de correcciones."
- **Interacciones:** un Worker crea una incidencia pública en GitHub, sin cuenta y sin cookies. El Registro de correcciones se genera automáticamente desde el historial del repositorio de datos.
- **Error:** "No se ha podido enviar. Reintentar."

### 9. Temas (pestaña)
- **Layout:**
  - Arriba, la **papeleta**: cinco casillas grandes que se marcan con una X; "Ninguna" se marca con una raya.
  - Debajo, "Temas extra": una lista de una columna con filas de 56px, icono, nombre llano y estado ("Sin empezar" / "✓ Hecho" / "Nuevo: 1 propuesta" / "⏳ Faltan 2 programas").
  - Orden: primero los 5 sugeridos y después los demás en orden alfabético. Etiqueta "Solo Canarias" donde corresponda.
- **Microcopy:**
  - Antes de 5: "Tu papeleta · 3 de 5". "Te faltan 2 temas para ver tu resultado."
  - Después de 5: "5 hechos · Haz más para afinar tu resultado."
- **Interacciones:** tocar un tema pendiente abre la ronda. Tocar uno hecho abre su revelación con "Volver a elegir" (se rebaraja). Al volver de una ronda, la casilla se dibuja con un trazo de 400 ms.

### 10. Mi resultado (pestaña; se llega en el tema 5)
- **Estado vacío (menos de 5 temas):** "Haz 5 temas para ver con quién coincides. Llevas 2." y la papeleta.
- **Layout:** página vertical con 3 bloques a pantalla completa (scroll-snap), cada uno capturable. Botón visible "Siguiente ↓", sin gestos ocultos.
  1. **Bloque 1, el número:**
     - "En 5 temas has elegido a **4 partidos distintos**."
     - Subtexto según el número de partidos: 1, "Lo tienes claro."; 2–3, "Con matices."; 4 o más, "Vas por libre."
  2. **Bloque 2, tus apuestas** (solo con 3 apuestas o más):
     - "En **3 de 5** temas, tu elegida no era de quien pensabas."
     - Desglose factual: "Elegiste propuestas de [Partido] en Vivienda y Energía."
  3. **Bloque 3, el ranking completo:**
     - Titular: "Con quién has coincidido, tema a tema."
     - Barras en un solo tono, con el logo pequeño de cada partido.
     - Fila: "[Partido] · 40 % · 2 de 5 temas". Todos los partidos aparecen, incluidos los de 0 %. Empates con el mismo puesto, orden alfabético y la palabra "empate".
     - Contexto: "Con 5 temas es una foto parcial."
     - Ninguna: "En 1 tema no te convenció ninguna."
     - Pendientes: "⏳ Falta [Partido]: aún no ha publicado su programa. Tu resultado puede cambiar."
     - Sin provincia: "Solo partidos nacionales. Elige provincia para incluir los de tu zona."
     - Cálculo: "Cada elección suma 1 punto (2 en tus temas importantes). «Ninguna» no suma. Nada más."
     - **Bloque inline** (después del ranking, nunca antes): "¿Algún tema te importa más? Marca hasta 3 y contarán doble." Los chips son los temas hechos y el resultado se recalcula en vivo. Al intentar marcar un cuarto: "Ya tienes 3. Quita uno."
     - Aviso: "Esto no es una recomendación de voto. Es un resumen de lo que elegiste."
     - Botones: **"Compartir"** · "Seguir con más temas" · "Ver tema a tema" (abre cada revelación).
- **Caso todo "Ninguna":** "No te ha convencido ninguna propuesta todavía. Eso también es una respuesta." Sin ranking y con el botón "Seguir con más temas".

### 11. Compartir
- **Layout:**
  1. Vista previa grande.
  2. Selector de 2 opciones: **"Sin partidos"** (por defecto) / "Con mi ranking".
  3. Selector de formato: "Historia (vertical)" / "Cuadrada (mensajes)".
  4. Botones: **"Enviar por WhatsApp"** · "Compartir en otras apps" (menú del sistema) · "Guardar imagen".
  5. Pie: "La imagen se crea en tu móvil. No subimos nada."
- **Microcopy:**
  - Al activar el ranking: "Tu afinidad política es un dato personal. Compártela solo si quieres."
  - Enlace secundario: "Guardar el enlace para seguir luego". Abre WhatsApp con el enlace limpio y el texto "Para seguir en este mismo navegador".
- **Interacciones:** usa la Web Share API con la imagen. Si no está disponible, descarga la imagen y copia el texto, y avisa "Texto copiado. Pégalo donde quieras." El enlace es siempre `29n.jorgemasta.com/?r=reto`, sin ningún dato del usuario.

### 12. Preguntar (pestaña)
- **Layout:** titular, explicación, 7 sugerencias como **botones de fila** (no chips pequeños), caja de texto debajo con etiqueta visible y botón "Preguntar", contador y aviso de IA.
- **Microcopy:**
  - Titular: "Pregunta a los programas"
  - Explicación: "Respondemos solo con lo que está escrito en los programas, siempre con cita. Si no lo dicen, te lo decimos."
  - Sugerencias: "¿Quién propone bajar el IVA de la luz?" · "¿Qué dicen del alquiler turístico?" · "¿Alguien propone la semana de 4 días?" · "¿Qué pasa con la edad de jubilación?" · "¿Qué proponen para cuidar a personas mayores?" · "¿Qué dicen sobre el servicio militar?" · "¿Alguien quiere cambiar la ley electoral?"
  - Caja: "O escribe tu pregunta"
  - Contador: "Te quedan 8 preguntas en esta sesión"
  - Aviso: "Respuestas escritas por IA a partir de los programas. Comprueba la cita."
  - Cargando: "Buscando en 9 programas…" (con esqueletos de tarjeta).
- **Respuesta:**
  - Tarjetas a ciegas A, B, C…, con titular, detalle y "Cita disponible al descubrir".
  - Al final: "Esto no cuenta para tu resultado."
  - Botón: **"Ver de quién es cada una"**.
  - La revelación es igual que la de la pantalla 6, con cita y PDF, más "[Partido]: su programa no lo menciona". No lleva viabilidad.
- **Errores:**
  - Fuera de ámbito: "Solo podemos responder sobre lo que proponen los programas, no opinar ni predecir."
  - Red: "No hemos podido responder. Reintentar." No consume cupo.

### 13. Partidos y programas
- **Layout:** provincia y "Cambiar", luego "Con programa (8)" (nombre completo, ámbito, fecha, "PDF ↗") y "⏳ Pendientes (1)". Pie con la última comprobación y el criterio de inclusión.
- **Microcopy:**
  - Fila pendiente: "Aún no ha publicado su programa. Se añadirá solo en cuanto lo haga."
  - "Mientras falte, no aparece en los temas ni en tu resultado."
  - Pie: "Última comprobación: 14 nov, 09:30"
  - Criterio: "[criterio público, ver decisión 2]" · botón "Falta un partido".
  - Al cambiar de provincia: "Tu resultado se recalculará con los partidos de la nueva provincia."

### 14. Cómo funciona (incluye Auditoría y Tus datos)
- **Layout:** índice de anclas y bloques plegables con preguntas como titulares, en lectura fácil. Cada sello "IA" de la app aterriza en el ancla que le corresponde.
- **Bloques:**
  - "¿De dónde salen las propuestas?"
  - "¿Por qué no pone el partido?"
  - "¿Quién reescribe los textos?"
  - "¿Cómo se valora si se puede hacer?" (rúbrica completa)
  - "¿Cómo se calcula mi resultado?"
  - "¿Cómo decidimos que un partido no propone nada?" (términos buscados por tema)
  - "Límites": "En algunos temas la propuesta delata al partido."
  - "Quién lo hace"
  - "Privacidad"
- **Auditoría:**
  - Tabla del reparto de notas de viabilidad **por partido y por tema**.
  - Prueba de reconocimiento previa al lanzamiento: "En Amnistía, 7 de 10 personas adivinaron el partido".
  - Las preguntas neutras de cada tema.
  - Prompts exactos, modelo y versión, y fecha de cada evaluación.
  - Dataset descargable, Registro de correcciones e incidencias abiertas.
- **Tus datos:**
  - "Lo que hay guardado (solo en este móvil): provincia, temas hechos, tus 3 temas, tamaño de letra."
  - "No preguntarme la apuesta: sí/no"
  - **"Borrar todo y empezar de cero"**, que pide confirmación.

---

## 3. Tarjeta para compartir

Se abre desde "Mi resultado" (`#compartir`) en cuanto hay una temática destapada. Se genera en el cliente con canvas, en dos tamaños: 1080×1920 y 1080×1080. Fondo crema, tinta y petróleo (identidad v2), contraste AA y la ilustración de tres tarjetas con las letras A, B y C, una de ellas girada. **No lleva colores ni logos de partido en la variante por defecto.**

**Variante "Sin partidos" (por defecto, no revela ideología):**
- Arriba, pequeño: "29N · Elegido a ciegas"
- Frase grande: **"He hecho Vivienda y Sanidad a ciegas: coincidí con 4 partidos distintos."** (hasta 3 temáticas por su nombre; con más, "He hecho 5 temáticas a ciegas…"; "coincidí con 1 partido" / "no coincidí con ningún partido"). Cuenta los partidos que defienden, de lleno o en parte, algún enfoque elegido en las temáticas destapadas.
- Debajo: "6 preguntas, sin saber qué partidos había detrás de cada propuesta."
- Abajo: "¿Y tú? Lee las propuestas sin saber de quién son." · **29n.jorgemasta.com**
- Pie: "Sin registro · Sin datos personales · Con citas de los programas"

**Variante "Con mi ranking"** (solo si la persona la elige, y solo con ranking global, es decir, desde 2 temáticas):
- Arriba: "29N · Con quién coincido a ciegas"
- Las 3 primeras barras en un tono, con logo pequeño: "[Partido] 38 %", más la línea "+5 partidos más"
- "En 2 temáticas, 6 preguntas · 1 vez ninguna me convenció"
- Si aplica: "Falta 1 programa."
- "No es una recomendación de voto." · 29n.jorgemasta.com

**Texto que acompaña (las dos variantes):** "He elegido entre propuestas de los partidos para el 29N sin saber de quién eran. ¿Con cuántos coincides tú? 29n.jorgemasta.com/?r=reto"

**Texto alternativo de la imagen:** se genera con el mismo contenido.

---

## 4. Casos límite

| Caso | Tratamiento |
|---|---|
| Programa pendiente | Fuera de las rondas, de la apuesta y del ranking. Aparece como "⏳" en la revelación, en el resultado, en la tarjeta con ranking y en la pantalla 13. Cuando se publica, la portada de vuelta lo anuncia y los temas hechos llevan "Nuevo: 1 propuesta". Al abrirlos se hace un **repaso** ("Hay una propuesta nueva. ¿Sigues prefiriendo la misma?") con todo rebarajado. Botón "Mantener mis elecciones" para todos los temas a la vez. Mientras no se repase, el resultado conserva la elección anterior y avisa: "2 temas tienen propuestas que aún no has visto". |
| Sin propuesta en un tema | No aparece en la fase a ciegas. La línea de recuento es honesta ("2 partidos no proponen nada"). En la revelación sale como fila gris con "Ver cómo lo buscamos" (términos buscados). Si hay menos de 2 propuestas reales, el tema se oculta con la nota "Pocos partidos hablan de esto". |
| Sin consenso | Chip fuera de la escala. Se muestran los dos veredictos. Nunca media ni elección de uno. |
| Sin concreción | Chip fuera de la escala, con "no da cifras, plazos ni instrumento". Nunca se presenta como castigo. |
| "Ninguna me convence" | Cuenta como tema hecho (raya en la papeleta) y no suma a nadie. Revelación completa. En el resultado se cuenta aparte. Si todo es "Ninguna", no hay ranking y se muestra el mensaje de "también es una respuesta". |
| Abandono | Se guarda en local al confirmar cada tema. La semilla mantiene el orden. Una ronda sin confirmar no se guarda. La portada de vuelta ofrece "Seguir: [tema]". Sin almacenamiento, funciona en memoria con un único aviso. |
| Pregunta libre sin base | Global: "Ningún programa habla de esto. Prueba con otras palabras o con una de estas:" y 2 preguntas cercanas que sí tienen respuesta. Nunca se rellena con conocimiento general. Parcial: "[Partido]: su programa no lo menciona" después de revelar; antes, "La E no lo menciona". |
| Límite de preguntas | 8 por sesión con contador visible. Al agotarlo: "Has llegado al límite de preguntas por ahora. Mientras, puedes seguir con los temas." y botón "Ir a temas". Los errores de red no consumen cupo. |
| Sin provincia | Solo partidos nacionales, con aviso en el resultado. |
| Empates | Mismo puesto, orden alfabético y "empate". |

---

## 5. Fricciones de los jueces y cómo las resuelve el diseño final

| Juez | Fricción | Resolución |
|---|---|---|
| Carmen | "Tema 1 de 18" asusta | Meta de 5. El resto se presenta como "temas extra" (pantallas 4 y 9). |
| Carmen | Permiso de ubicación y búsqueda que no encuentra "Telde" | Sin geolocalización. Búsqueda por municipio e isla (pantalla 3). |
| Carmen | "Prefiero no decirlo" donde cae el dedo | Movido al final de la lista, y el resultado avisa si se omitió. |
| Carmen | No sabe de quién es la web | La portada dice que es personal, independiente y sin partido, y que no pide datos ni dinero. |
| Carmen | Le pueden sacar el voto con la apuesta inicial | El sobre inicial se elimina. La apuesta es por tema, opcional y con "Descubrir sin apostar" como botón grande. |
| Carmen | "No era tu apuesta" suena a pillada | Copy factual: "Era de [Partido]. Tu apuesta: [X]." |
| Carmen | Letra pequeña, mucho texto | Respeta la letra del sistema, botón Aa, titular de 12 palabras con detalle plegado, "Escuchar todas". |
| Carmen | Navegación de historia tipo Instagram | El resultado es scroll vertical con botón "Siguiente ↓". |
| Carmen | Cuadrícula de emojis incomprensible | Se elimina. Número grande y frase. |
| Carmen | Sin logo, la revelación pierde emoción | Logo y color a igual tamaño para todos, solo en la revelación. |
| Carmen | Jerga (REF/ZEC/AIEM) | Línea llana bajo la pregunta del tema. |
| Carmen | La vista previa en WhatsApp parece un timo | og:title, og:description y og:image diseñados (pantalla 1). |
| Carmen | .ics y PWA incomprensibles | Eliminados. Queda "Guardar el enlace para seguir luego" por WhatsApp. |
| Dani | Muro de texto | Titular en negrita y detalle plegado. Interruptor para ver todo. |
| Dani | Pantalla de presentación en cada tema | Integrada en la cabecera. Solo una capa la primera vez. |
| Dani | 12 botones por pantalla | Un único "Escuchar todas". Se elige tocando la tarjeta. |
| Dani | Sin recompensa hasta el tema 5 | Etiqueta de recorrido desde el tema 1 y "Guardar esta revelación". |
| Dani | Hoja de prioridades antes del premio | Movida después del ranking, inline y con recálculo en vivo. |
| Dani | El chip de apuesta no se ve y el "3 de 5" se queda vacío | La apuesta está en la misma hoja de confirmación, sin toque extra. La tarjeta por defecto usa "N partidos" y no depende de apostar. |
| Dani | La tarjeta sosa no le hace quedar bien | Número enorme, etiqueta "Vas por libre" y reto con `?r=reto`. |
| Dani | Tres opciones de privacidad hacen pensar | Dos opciones. |
| Javier | Aleatoriedad no verificable | Semilla visible, "Barajar otra vez" y enlace al código. |
| Javier | Captura "PartidoX · Muy difícil" sin contexto | Chip con "IA" siempre, escala de un tono, nota "no si es buena idea" y viabilidad en todas las tarjetas. |
| Javier | Etiquetas llanas con juicio ("casi imposible") | Textos de nivel reescritos como condiciones, sin adjetivos morales. |
| Javier | No hay reparto agregado de notas por partido | Auditoría pública con tabla por partido y tema, y dataset. |
| Javier | Prompts y modelo opacos | Publicados con versión y fecha. |
| Javier | La reescritura puede empeorar a su partido | Comparador reescrito/literal y reporte "cambia el sentido". |
| Javier | Buzón privado de quejas | Incidencias públicas y Registro de correcciones automático. |
| Javier | El dato de contexto enmarca la pregunta | Eliminado. Preguntas neutras publicadas. |
| Javier | "Tema más popular" y orden editorial | Orden fijo con criterio publicado (CIS). Resto alfabético. |
| Javier | Cifras de la IA sin fuente | Regla: sin fuente enlazada, no hay cifra. |
| Javier | "No propone nada" no comprobable | "Ver cómo lo buscamos" con los términos buscados. |
| Javier | Se puede deducir el partido por descarte o adivinarlo apostando | Se acepta y se declara. Prueba de reconocimiento publicada y "Límites" en Metodología. |
| Javier | 🤖, ✨ y casino | Sin emojis de IA. Animación ≤500 ms, sin confeti, saltable. |
| Javier | Ejemplo con un partido real (PSOE) | Solo placeholders. |
| Javier | Paso "Tu sorpresa: sin saber que era suya" suena a empujón | Desglose factual, sin narrativa de cambio de voto. |

---

## 6. Decisiones abiertas (para el dueño del producto)

1. **Autor con nombre en "Quién lo hace"**: "Jorge Masta" frente a "proyecto personal" sin nombre. **Recomendación: con nombre y declaración de no afiliación.** Javier desconfía de lo anónimo y Carmen pregunta "¿esto de quién es?". El coste es la exposición personal a ataques.
2. **Criterio público de inclusión de partidos** (el `[criterio]` de la pantalla 13). **Recomendación: "candidatura proclamada en tu provincia y representación actual en el Congreso o en el parlamento autonómico".** Es objetivo y verificable en el BOE. El coste es que deja fuera a partidos pequeños, que protestarán; se mitiga con "Falta un partido".
3. **Publicar el reparto de viabilidad por partido en el lanzamiento.** **Recomendación: sí.** Si el reparto sale desequilibrado lo descubrirán igual, y mejor que lo explique la propia web. El coste es que la tabla puede convertirse en la captura viral contra el proyecto.
4. **Apuesta por tema.** **Recomendación: mantenerla como opcional en la hoja de confirmación y medirla en la primera semana.** Alimenta el "3 de 5". El coste es que puede empujar a adivinar en vez de leer y da munición para decir que la anonimización es teatro.
5. **Pregunta libre el 13-nov o más tarde.** **Recomendación: lanzar el 13-nov solo con las 7 sugeridas, con respuesta pregenerada y revisable, y abrir la caja de texto libre hacia el 18-nov.** Así se recortan el riesgo de alucinación y el coste del primer día. El coste es que el diferencial llega incompleto al lanzamiento.

---

## 7. Qué se descartó y por qué

- **Apuesta en sobre al inicio** (propuesta de viralidad): tres pantallas sin ver una propuesta, se percibe como una trampa para sacar el voto (Carmen) y se salta (Dani).
- **Cuadrícula de emojis de colores en la tarjeta:** nadie la entendió.
- **Resultado como historia de Instagram con toques laterales:** gesto oculto para Carmen. Se conservan los bloques capturables en scroll vertical.
- **Pantalla de presentación en cada tema** y **dato de contexto con fuente:** toque extra (Dani) y framing editorial (Javier).
- **Botones "Me convence esta" y "Escuchar" en cada tarjeta:** demasiado ruido. Se sustituyen por tocar la tarjeta y "Escuchar todas".
- **Revelación solo con texto o con iniciales, sin logo:** quitaba la emoción y el reconocimiento. El logo se mantiene a igual tamaño para todos.
- **Tres capas plegables por tarjeta en la revelación:** se reducen a cita y chip, con el resto en la hoja de detalle.
- **Hoja de prioridades antes del resultado:** pasa a ser inline después del ranking.
- **"Usar mi ubicación":** pide un permiso que asusta y no aporta nada frente a la búsqueda por municipio.
- **.ics de calendario y aviso de instalación PWA:** nadie los usaría.
- **Comparación con amigos codificando el resultado en el enlace:** expone un dato sensible y añade alcance a 5 días del lanzamiento. Se queda en `?r=reto` sin datos.
- **Etiquetas de viabilidad con lenguaje coloquial valorativo** ("casi imposible"): leídas como editorial.
- **Semáforo de colores en la viabilidad:** carga moral y colores asociables a partidos.
- **Emojis 🤖, ✨ y confeti:** trivializan temas sensibles.
- **"Elige propuestas, no partidos" como titular:** Carmen lo leyó como eslogan. Se sustituye por una frase descriptiva.