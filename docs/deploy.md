# Despliegue (paso humano)

La web es estática: Cloudflare sirve `dist/` como *static assets* de un Worker (`wrangler.jsonc`). El Worker
(`src/worker/index.ts`) solo atiende `/api/ask` (pregunta libre), `/api/feedback` (avisos sin cuenta),
bloquea `/texts/*` y, en `/` con `?r=reto`, cambia el og:title de la vista previa del enlace; todo lo demás va
directo a los ficheros estáticos. La imagen og (`public/og.png`, 1200×630) se regenera con `npm run og`.
No hay credenciales de Cloudflare ni de Anthropic en el repo.

1. `npx wrangler login` (o `CLOUDFLARE_API_TOKEN` con permiso de Workers y DNS de `jorgemasta.com`).
2. `npm run deploy` → **build de producción** (`PRODUCTION=1 astro build`, ver «Modo producción») + `wrangler deploy`.
   El dominio `29n.jorgemasta.com` se crea como *custom domain* del Worker (la zona `jorgemasta.com` debe estar en
   la misma cuenta). Con el dataset simulado **falla a propósito**: no se puede publicar nada de prueba.
   - `npm run deploy:private` construye el **prototipo privado** (`SITE_MODE=private`): además de los programas
     oficiales del 29N incluye las fuentes provisionales (programas de 2023, documentos del partido y
     declaraciones), marcadas «solo privado» al revelar. Se despliega en **otro Worker** (`29n-privado`, en
     `*.workers.dev`, entorno `private` de `wrangler.jsonc`), nunca en el dominio público, sin indexar.
3. Comprobar `https://29n.jorgemasta.com/`, `https://29n.jorgemasta.com/privacidad/` y que `robots.txt` devuelve
   `Allow: /` (solo el build de producción es indexable; cualquier otro build lleva `Disallow: /` y `noindex`).

## Modo producción

`src/launch/index.ts` (pruebas en `tests/launch.test.ts`; integración de Astro en
`src/launch/integration.ts`) decide qué puede publicar un build:

| Build | Comando | Datos de prueba | Fuentes provisionales | Indexable |
|---|---|---|---|---|
| Vista previa | `npm run build` (y `npm run e2e`) | sí, con aviso amarillo y avisos en la consola | excluidas (salen «⏳ pendiente») | no |
| Producción | `npm run build:production` / `npm run deploy` / watcher | **el build falla** | excluidas, con un aviso por partido | sí |
| Privado | `npm run build:private` / `deploy:private` | sí | incluidas, marcadas «solo privado» | no |

El build de producción falla si: el dataset no es `origin: "real"`; hay un partido ficticio (`test`) o fuera del
registro (`src/registry/parties.ts`); un programa publicado no viene de un dominio oficial del partido (V7,
`src/registry/domains.ts`); el dataset no valida (V9); o se combina con `SITE_MODE=private`. Además borra de `dist/` los
PDF de `programas/` (los programas reales se enlazan en la web del partido) y los textos `texts/<party>.json` de
partidos sin programa oficial publicado, y lo dice en la consola.

### Pasar de los datos simulados a los reales

0. Tomar el pulso y congelar la lista (`npm run pulse -- --sources <fuentes.json>` → `data/pulse.json`, commit). Sin
   ella, `npm run process` y el watcher solo procesan las preguntas ya publicadas.
1. Procesar cada programa oficial del 29N cuando se publique: `npm run process -- --party <id> --pdf <pdf> --url
   <URL oficial>` (o dejar que lo haga el watcher). El **primer** programa real sustituye todo el dataset simulado
   (`origin: "real"`, los partidos `prueba-*` desaparecen y el resto del registro queda como «pendiente»). Cada programa
   saca una postura en **cada** pregunta del pulso y el dataset toma las temáticas del pulso, pero aún sin preguntas
   publicadas: hasta el paso siguiente no hay nada que jugar.
1b. **Asentar los enfoques** cuando estén los programas que se esperan: `npm run settle -- --dry-run` (qué preguntas y
   cuántas llamadas a la IA, sin coste) y luego `npm run settle`. Agrupa en 3 enfoques cada pregunta del pulso aún no
   publicada con las posturas de todos los partidos, publica las que pasan y deja el informe de todas en
   `approachReports` (las que no, salen en la metodología con su motivo). Commit de `data/dataset.json` y
   `data/cache/ai/`. Las preguntas publicadas quedan congeladas: los programas que lleguen después los clasifica el
   watcher en esos enfoques (#28); para publicar una que no salió, volver a ejecutar `npm run settle` (solo toca las no
   publicadas, o `--question <id>`).
2. Borrar los ficheros simulados: `git rm public/programas/prueba-*.pdf public/texts/prueba-*.json` (el build de
   producción ya los excluye, pero así no avisa).
3. **No** volver a ejecutar `scripts/generate-simulated.ts`: sobrescribe el dataset real.
4. `npm run build:production` en local: debe terminar sin errores; revisar los avisos («fuente provisional excluida»).
5. `npm test`, `npm run e2e` (sigue usando la vista previa) y `npm run deploy`.

## Lista de lanzamiento (pasos humanos, en orden)

Nada de esto lo hace el código ni un agente. Detalle de cada paso en las secciones de abajo.

1. **Cloudflare**: cuenta con la zona `jorgemasta.com`; `npx wrangler login` o un `CLOUDFLARE_API_TOKEN`
   (plantilla «Edit Cloudflare Workers» + DNS) y el `CLOUDFLARE_ACCOUNT_ID`.
2. **Avisos del vigilante**: nada que configurar; son issues de GitHub (etiqueta `vigilante`, la crea el job).
3. **Secretos de GitHub Actions** (Settings → Secrets and variables → Actions): `ANTHROPIC_API_KEY`,
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (opcional `AI_GATEWAY_URL`), y
   *Workflow permissions* «Read and write» (push a `main`).
4. **Etiquetas del repo**: crear `reporte` y `falta-partido` (avisos); `reneutralizar` la crea el job de apuestas (`guesses.yml`).
5. **Umami** (opcional): sitio `29n.jorgemasta.com` en la instancia propia `stats.padelful.com`; variable del repo
   `UMAMI_WEBSITE_ID` y secreto `UMAMI_API_KEY` (comprobación de apuestas).
6. **Fuentes del watcher**: revisar las URLs y `pattern` de `src/watcher/sources.ts` con la página real del
   programa de cada partido (ERC: esquerra.cat bloquea a los bots → URL directa del PDF o proceso a mano).
7. **PP, «Contrato con España»**: decidir el tipo de fuente. Si es su programa para el 29N, `--source manifesto-29n`
   (público); si no, `party-document` (solo privado: el PP sale como «pendiente» hasta que publique uno). Ojo: el
   watcher busca `programa|contrato` en pp.es y lo procesaría como programa oficial; si se decide
   `party-document`, poner `source: 'party-document'` en la entrada de `pp` de `src/watcher/sources.ts` (o
   quitar `contrato` del `pattern` y procesarlo a mano con `--source party-document`).
8. **PDF reales**: descargar a mano los programas que el watcher no alcance y procesarlos (`npm run process`);
   commit de `data/dataset.json`, `data/reports/`, `data/cache/ai/` y `public/texts/`.
9. **Pasar a datos reales** («Pasar de los datos simulados a los reales», arriba): pulso congelado, programas procesados,
   `npm run settle` (#32) y `npm run build:production` sin errores.
10. **Candidaturas**: las listas de `src/registry/parties.ts` son estimaciones provisionales. Cuando el BOE publique
    las candidaturas proclamadas, corregir las provincias de cada partido, añadir los que entren por representación
    autonómica y poner `state: 'proclaimed'` con la fuente.
11. **Desplegar**: `UMAMI_WEBSITE_ID=<id> npm run deploy`; comprobar la web, `/privacidad/`, `robots.txt` (`Allow`) y
    la vista previa del enlace (`/?r=reto`). Reactivar el vigilante (desactivado hasta tener datos reales):
    `gh workflow enable "Manifesto watcher"`, ejecutarlo a mano y ver llegar el issue `vigilante`.
12. **Pregunta libre (~18-nov)**: KV, AI Gateway y secretos del Worker ya están (`scripts/setup-wizard.sh`). Falta
    `FREE_QUESTION = "1"` y variable del repo
    `PUBLIC_FREE_QUESTION=1` (para que los despliegues del watcher no cierren la caja); desplegar con
    `PUBLIC_FREE_QUESTION=1 npm run deploy`. Opcional: pedir retención cero a Anthropic y, si se concede, actualizar
    `src/pages/privacidad.astro`.
13. **Publicar el enlace** (redes, etc.). A partir del 24-nov no publicar ninguna cifra agregada (art. 69 LOREG): el
    proyecto no las calcula.

## Pregunta libre y avisos sin cuenta (Cloudflare function)

Por defecto, **la pregunta libre está cerrada** (`FREE_QUESTION = "0"` en `wrangler.jsonc`) y la caja de texto
sale desactivada («Muy pronto»). Sin `GITHUB_TOKEN`, «Reportar error» y «Falta un partido» enlazan al aviso
prerrellenado de GitHub (como antes). Nada de esto rompe el despliegue si falta.

**Pasos humanos para abrir la pregunta libre (~18-nov):**

1. **KV** (contadores por sesión, gasto del mes y caché de frecuentes):
   `npx wrangler kv namespace create QUESTIONS` y descomentar `kv_namespaces` en `wrangler.jsonc` con el id.
2. **AI Gateway** (Cloudflare → AI → AI Gateway → crear un gateway): en *Settings* desactivar **Logs**
   (además, cada petición manda `cf-aig-collect-log: false`). Si se activa *Authenticated Gateway*, guardar su token
   como `CF_AIG_TOKEN`. La URL es `https://gateway.ai.cloudflare.com/v1/<cuenta>/<gateway>/anthropic`.
3. **Anthropic**: crear una API key en un *workspace* propio con un **límite de gasto mensual** (≈ 150 €) en la
   Console. Es el tope duro; el de la función (`MONTHLY_CAP`) es una estimación por llamada (`ESTIMATED_COST` en
   `src/questions/free.ts`) que deja de aceptar preguntas nuevas al llegar y sigue sirviendo las frecuentes.
4. Secretos del Worker (no van en el repo):
   | Secreto / variable | Uso |
   |---|---|
   | `npx wrangler secret put ANTHROPIC_API_KEY` | Claude (Haiku 5.5 responde, Sonnet 5.5 hace la V10). |
   | `npx wrangler secret put AI_GATEWAY_URL` (o `vars`) | URL del gateway del paso 2. Sin ella llama a la API directamente. |
   | `npx wrangler secret put CF_AIG_TOKEN` | Opcional: gateway autenticado. |
   | `npx wrangler secret put GITHUB_TOKEN` | Avisos sin cuenta: *fine-grained token* solo de `jorgemasta/29n` con **Issues: read and write**. Crear antes las etiquetas `reporte` y `falta-partido`. |
   | `vars.FREE_QUESTION` | `"1"` abre la pregunta libre. |
   | `vars.MONTHLY_CAP` | Tope en euros (150). |
5. Construir la web con la caja activa y desplegar: `PUBLIC_FREE_QUESTION=1 npm run deploy` (con
   `FREE_QUESTION = "1"` en `wrangler.jsonc`). Las dos banderas deben ir juntas.
6. **Privacidad**: Workers Logs y trazas están desactivados (`observability.enabled = false`); no activar
   *Logpush* ni *Tail* para este Worker. La función no lee la IP ni escribe en consola.
7. **Retención de Anthropic**: 30 días por defecto (sin retención cero). Para pedir **retención cero** hay que
   contactar con ventas (https://claude.com/contact-sales); Anthropic decide si la concede. Si se consigue, actualizar
   la página de privacidad `src/pages/privacidad.astro`.

Los textos de los programas (`public/texts/<party>.json`) los escriben `npm run process`, el watcher y
`generate-simulated`; la función los lee por el binding `ASSETS` y comprueba que su `hashPdf` coincide con el dataset.
Para un programa procesado antes de #15, relanzarlo (con la caché de IA, gratis) para generar su texto: sin él, ese
partido sale como «No pudimos verificar su respuesta» en la pregunta libre.

Comprobar sin desplegar: `npx wrangler deploy --dry-run` (empaqueta el Worker).

## Procesar un programa real (necesita `ANTHROPIC_API_KEY`)

```bash
npm run process -- --party erc --pdf ./erc-2026.pdf --url https://<web oficial>/programa.pdf
```

- Sustituye el dataset simulado por datos reales (`origin: "real"`) solo si el programa es publicable y pasa V9.
- Las respuestas de la IA **y la comprobación HTTP 200 de las fuentes de viabilidad (V8)** se guardan en
  `data/cache/ia/`: haz commit para que relanzar sea gratis e idéntico (también sin red).
- Un programa bloqueado no toca el dataset ni `data/reports/<party>.json`: su informe va a
  `data/reports/blocked/<party>.json`.
- `--source manifesto-2023|party-document|statements` marca el documento como fuente provisional
  (solo modo privado). Por defecto `manifesto-29n` (programa oficial). P. ej. el «Contrato con España» del PP:
  `--party pp --source <tipo> --title "Contrato con España"`.
- Opcional: `AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/<cuenta>/<gateway>/anthropic`.
- ERC es un partido de ámbito catalán: para verlo en la web sin el selector de provincia (#7), abre `/?provincia=08`.

## Vigilante de programas (cron, GitHub Actions)

`.github/workflows/watcher.yml` ejecuta `scripts/watch.ts` cada 2 horas (minuto 17). Para cada partido
de `src/watcher/sources.ts` (webs oficiales primero, luego agregadores) busca el PDF del programa en un
dominio oficial (`src/registry/domains.ts`), compara su hash con `data/watcher.json` y, si es nuevo o ha
cambiado, ejecuta el proceso de datos. Si es publicable: commit de `data/dataset.json`, del informe y del
estado, `npm run deploy` y push a `main`. Si se bloquea: commit solo del informe bloqueado y del estado
(el dataset y la web quedan como estaban, y no se reintenta hasta que cambie el PDF). Si algo falla (IA,
PDF, despliegue): no se publica nada y se reintenta en la siguiente ejecución. Cada publicación y cada
fallo (con el motivo) abre un issue con la etiqueta `vigilante`, asignado al dueño del repo para que GitHub
le notifique. Los de publicación se cierran al momento (quedan como registro); los de fallo quedan abiertos
hasta que alguien los revise, y un fallo que se repite no abre otro issue mientras el anterior siga abierto.

**Pasos humanos (no hay secretos en el repo ni en la máquina de desarrollo):**

1. Nada para los avisos: son issues asignados al dueño del repo y la etiqueta `vigilante` la crea el job.
2. En GitHub → Settings → Secrets and variables → Actions, crear:
   | Secreto | Uso |
   |---|---|
   | `ANTHROPIC_API_KEY` | Proceso de datos (Claude). |
   | `CLOUDFLARE_API_TOKEN` | `wrangler deploy` (plantilla «Edit Cloudflare Workers» + DNS de `jorgemasta.com`). |
   | `CLOUDFLARE_ACCOUNT_ID` | Cuenta de Cloudflare. |
   | `AI_GATEWAY_URL` | Opcional: Cloudflare AI Gateway. |
3. Settings → Actions → General → *Workflow permissions*: «Read and write» (el job hace push a `main`).
   Si `main` está protegida, permitir el push de GitHub Actions.
4. Revisar las URLs de `src/watcher/sources.ts` cuando cada partido publique su programa (y `pattern`
   si la página enlaza varios PDF). `esquerra.cat` responde 403 a clientes que no son navegadores: si
   persiste, poner la URL directa del PDF o procesarlo a mano (`npm run process`).
5. Probar: Actions → «Vigilante de programas» → *Run workflow* (y comprobar que llega el aviso).

**Relanzar a mano** un partido: *Run workflow* con `party` (y `force` si el PDF no ha cambiado; con la
caché de IA el resultado es idéntico y gratis). En local: `npx tsx scripts/watch.ts --party erc
--force --no-publish` (sin git, sin despliegue, avisos por consola; sí descarga y llama a Claude).

Node: Astro está fijado a 7.4.1 porque esta máquina tiene Node 22.23.2 (Astro ≥ 7.4.2 exige 22.23.4).

## Analítica (Umami en `stats.padelful.com`) — opcional, desactivada por defecto

Eventos (lista cerrada en `src/analytics/events.ts`, validados antes de enviarse; `src/web/analytics.ts`
es el único módulo del cliente que habla con Umami, vía `window.umami.track`): `started`,
`topic-completed {topic}`, `five-topics`, `saw-result`, `shared {variant}`,
`guess-hit {question}`, `guess-miss {question}` (solo si se acertó, nunca el partido). Nunca el partido elegido o apostado, la provincia ni el
ranking. El script no registra la query (`?provincia=`, `?r=`) ni el hash, y respeta Do Not Track.

**Sin `UMAMI_WEBSITE_ID` en el build no se carga el script de Umami y no se envía nada.** Pasos humanos:

1. En la instancia propia `https://stats.padelful.com` (sin cookies por defecto): añadir el sitio
   `29n.jorgemasta.com` y copiar su *website id*.
2. Build/deploy a mano con `UMAMI_WEBSITE_ID=<website id> npm run deploy`. El watcher (`watcher.yml`)
   lo lee de la **variable del repo** `UMAMI_WEBSITE_ID` (paso 3): sin ella, sus despliegues quitan la analítica.
   Opcionales: `UMAMI_SCRIPT_URL` (por defecto `https://stats.padelful.com/script.js`) y `UMAMI_DOMAINS` (por defecto
   `29n.jorgemasta.com`: los builds en otros dominios no envían nada).
3. Comprobación periódica de apuestas (`.github/workflows/guesses.yml`, lunes 06:41 UTC):
   - Variable del repo (Settings → Secrets and variables → Actions → *Variables*): `UMAMI_WEBSITE_ID`;
     opcional `UMAMI_API_URL` (por defecto `https://stats.padelful.com/api`).
   - Secreto: `UMAMI_API_KEY` (stats.padelful.com → Settings → API keys).
   - El job usa `github.token` (permiso `issues: write`) y crea la etiqueta `reneutralizar` si no existe.
   - Abre un issue por cada pregunta cuyo acierto supere claramente su azar (test binomial unilateral, z > 2,33) con al
     menos 30 apuestas en los últimos 30 días, salvo que ya haya uno abierto para esa pregunta. El azar de cada pregunta
     sale de `data/dataset.json`: partidos que defienden el enfoque más defendido entre los que se ofrecen, en la provincia
     más generosa. Sin las dos variables, el job termina sin hacer nada.
   - En local: `UMAMI_API_KEY=… UMAMI_WEBSITE_ID=… npx tsx scripts/guesses.ts --no-publish`.
