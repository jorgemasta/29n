# Despliegue (paso humano)

La web es estática: Cloudflare sirve `dist/` como *static assets* de un Worker (`wrangler.jsonc`). El Worker
(`src/worker/index.ts`) solo atiende `/api/preguntar` (pregunta libre), `/api/avisar` (avisos sin cuenta),
bloquea `/textos/*` y, en `/` con `?r=reto`, cambia el og:title de la vista previa del enlace; todo lo demás va
directo a los ficheros estáticos. La imagen og (`public/og.png`, 1200×630) se regenera con `npm run og`.
No hay credenciales de Cloudflare ni de Anthropic en el repo.

1. `npx wrangler login` (o `CLOUDFLARE_API_TOKEN` con permiso de Workers y DNS de `jorgemasta.com`).
2. `npm run deploy` → `astro build` + `wrangler deploy`. El dominio `29n.jorgemasta.com` se crea como
   *custom domain* del Worker (la zona `jorgemasta.com` debe estar en la misma cuenta).
   - `npm run deploy:privado` construye el **prototipo privado** (`MODO=privado`): además de los programas
     oficiales del 29N incluye las fuentes provisionales (programas de 2023, documentos del partido y
     declaraciones), marcadas «solo privado» al revelar. `npm run deploy` (modo público, por defecto) las
     excluye del todo: esos partidos salen como «⏳ programa pendiente» y sus datos no se publican.
3. Comprobar `https://29n.jorgemasta.com/` y que `robots.txt` devuelve `Disallow: /` (prototipo privado, sin enlazar).

## Pregunta libre y avisos sin cuenta (Cloudflare function)

Por defecto, **la pregunta libre está cerrada** (`PREGUNTA_LIBRE = "0"` en `wrangler.jsonc`) y la caja de texto
sale desactivada («Muy pronto»). Sin `GITHUB_TOKEN`, «Reportar error» y «Falta un partido» enlazan al aviso
prerrellenado de GitHub (como antes). Nada de esto rompe el despliegue si falta.

**Pasos humanos para abrir la pregunta libre (~18-nov):**

1. **KV** (contadores por sesión, gasto del mes y caché de frecuentes):
   `npx wrangler kv namespace create PREGUNTAS` y descomentar `kv_namespaces` en `wrangler.jsonc` con el id.
2. **AI Gateway** (Cloudflare → AI → AI Gateway → crear un gateway): en *Settings* desactivar **Logs**
   (además, cada petición manda `cf-aig-collect-log: false`). Si se activa *Authenticated Gateway*, guardar su token
   como `CF_AIG_TOKEN`. La URL es `https://gateway.ai.cloudflare.com/v1/<cuenta>/<gateway>/anthropic`.
3. **Anthropic**: crear una API key en un *workspace* propio con un **límite de gasto mensual** (≈ 150 €) en la
   Console. Es el tope duro; el de la función (`TOPE_MENSUAL`) es una estimación por llamada (`COSTE_ESTIMADO` en
   `src/pregunta/libre.ts`) que deja de aceptar preguntas nuevas al llegar y sigue sirviendo las frecuentes.
4. Secretos del Worker (no van en el repo):
   | Secreto / variable | Uso |
   |---|---|
   | `npx wrangler secret put ANTHROPIC_API_KEY` | Claude (Haiku 5.5 responde, Sonnet 5.5 hace la V10). |
   | `npx wrangler secret put AI_GATEWAY_URL` (o `vars`) | URL del gateway del paso 2. Sin ella llama a la API directamente. |
   | `npx wrangler secret put CF_AIG_TOKEN` | Opcional: gateway autenticado. |
   | `npx wrangler secret put GITHUB_TOKEN` | Avisos sin cuenta: *fine-grained token* solo de `jorgemasta/29n` con **Issues: read and write**. Crear antes las etiquetas `reporte` y `falta-partido`. |
   | `vars.PREGUNTA_LIBRE` | `"1"` abre la pregunta libre. |
   | `vars.TOPE_MENSUAL` | Tope en euros (150). |
5. Construir la web con la caja activa y desplegar: `PUBLIC_PREGUNTA_LIBRE=1 npm run deploy` (con
   `PREGUNTA_LIBRE = "1"` en `wrangler.jsonc`). Las dos banderas deben ir juntas.
6. **Privacidad**: Workers Logs y trazas están desactivados (`observability.enabled = false`); no activar
   *Logpush* ni *Tail* para este Worker. La función no lee la IP ni escribe en consola.
7. **Retención de Anthropic**: 30 días por defecto (sin retención cero). Para pedir **retención cero** hay que
   contactar con ventas (https://claude.com/contact-sales); Anthropic decide si la concede. Si se consigue, actualizar
   el apartado de privacidad de `src/pages/metodologia.astro`.

Los textos de los programas (`public/textos/<partido>.json`) los escriben `npm run procesar`, el vigilante y
`generar-simulado`; la función los lee por el binding `ASSETS` y comprueba que su `hashPdf` coincide con el dataset.
Para un programa procesado antes de #15, relanzarlo (con la caché de IA, gratis) para generar su texto: sin él, ese
partido sale como «No pudimos verificar su respuesta» en la pregunta libre.

Comprobar sin desplegar: `npx wrangler deploy --dry-run` (empaqueta el Worker).

## Procesar un programa real (necesita `ANTHROPIC_API_KEY`)

```bash
npm run procesar -- --partido erc --pdf ./erc-2026.pdf --url https://<web oficial>/programa.pdf
```

- Sustituye el dataset simulado por datos reales (`origen: "real"`) solo si el programa es publicable y pasa V9.
- Las respuestas de la IA **y la comprobación HTTP 200 de las fuentes de viabilidad (V8)** se guardan en
  `data/cache/ia/`: haz commit para que relanzar sea gratis e idéntico (también sin red).
- Un programa bloqueado no toca el dataset ni `data/informes/<partido>.json`: su informe va a
  `data/informes/bloqueados/<partido>.json`.
- `--fuente programa-2023|documento-partido|declaraciones` marca el documento como fuente provisional
  (solo modo privado). Por defecto `programa-29n` (programa oficial). P. ej. el «Contrato con España» del PP:
  `--partido pp --fuente <tipo> --titulo "Contrato con España"`.
- Opcional: `AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/<cuenta>/<gateway>/anthropic`.
- ERC es un partido de ámbito catalán: para verlo en la web sin el selector de provincia (#7), abre `/?provincia=08`.

## Vigilante de programas (cron, GitHub Actions)

`.github/workflows/vigilante.yml` ejecuta `scripts/vigilar.ts` cada 2 horas (minuto 17). Para cada partido
de `src/vigilante/fuentes.ts` (webs oficiales primero, luego agregadores) busca el PDF del programa en un
dominio oficial (`src/registro/dominios.ts`), compara su hash con `data/vigilante.json` y, si es nuevo o ha
cambiado, ejecuta el proceso de datos. Si es publicable: commit de `data/dataset.json`, del informe y del
estado, `npm run deploy` y push a `main`. Si se bloquea: commit solo del informe bloqueado y del estado
(el dataset y la web quedan como estaban, y no se reintenta hasta que cambie el PDF). Si algo falla (IA,
PDF, despliegue): no se publica nada y se reintenta en la siguiente ejecución. Cada publicación y cada
fallo (con el motivo) llegan al móvil por ntfy.

**Pasos humanos (no hay secretos en el repo ni en la máquina de desarrollo):**

1. Instalar la app **ntfy** (Android/iOS) y suscribirse a un tema con un nombre largo y aleatorio
   (el nombre del tema es el secreto: quien lo conozca puede leer los avisos).
2. En GitHub → Settings → Secrets and variables → Actions, crear:
   | Secreto | Uso |
   |---|---|
   | `ANTHROPIC_API_KEY` | Proceso de datos (Claude). |
   | `CLOUDFLARE_API_TOKEN` | `wrangler deploy` (plantilla «Edit Cloudflare Workers» + DNS de `jorgemasta.com`). |
   | `CLOUDFLARE_ACCOUNT_ID` | Cuenta de Cloudflare. |
   | `NTFY_TOPIC` | Tema de ntfy del paso 1. |
   | `NTFY_TOKEN` | Opcional: solo si el tema/servidor ntfy está protegido. |
   | `AI_GATEWAY_URL` | Opcional: Cloudflare AI Gateway. |
3. Settings → Actions → General → *Workflow permissions*: «Read and write» (el job hace push a `main`).
   Si `main` está protegida, permitir el push de GitHub Actions.
4. Revisar las URLs de `src/vigilante/fuentes.ts` cuando cada partido publique su programa (y `patron`
   si la página enlaza varios PDF). `esquerra.cat` responde 403 a clientes que no son navegadores: si
   persiste, poner la URL directa del PDF o procesarlo a mano (`npm run procesar`).
5. Probar: Actions → «Vigilante de programas» → *Run workflow* (y comprobar que llega el aviso).

**Relanzar a mano** un partido: *Run workflow* con `partido` (y `forzar` si el PDF no ha cambiado; con la
caché de IA el resultado es idéntico y gratis). En local: `npx tsx scripts/vigilar.ts --partido erc
--forzar --sin-publicar` (sin git, sin despliegue, avisos por consola; sí descarga y llama a Claude).

Node: Astro está fijado a 7.4.1 porque esta máquina tiene Node 22.23.2 (Astro ≥ 7.4.2 exige 22.23.4).

## Analítica (Umami Cloud, región UE) — opcional, desactivada por defecto

Eventos (lista cerrada en `src/analitica/eventos.ts`, validados antes de enviarse; `src/web/analitica.ts`
es el único módulo del cliente que habla con Umami, vía `window.umami.track`): `empezo`,
`tema-completado {tema}`, `cinco-temas`, `vio-resultado`, `compartio {variante}`,
`apuesta-acierto {tema}`, `apuesta-fallo {tema}`. Nunca el partido elegido o apostado, la provincia ni el
ranking. El script no registra la query (`?provincia=`, `?r=`) ni el hash, y respeta Do Not Track.

**Sin `UMAMI_WEBSITE_ID` en el build no se carga el script de Umami y no se envía nada.** Pasos humanos:

1. Crear la cuenta en Umami Cloud eligiendo la **región UE** (sin cookies por defecto). Añadir el sitio
   `29n.jorgemasta.com` y copiar su *website id*.
2. Build/deploy a mano con `UMAMI_WEBSITE_ID=<website id> npm run deploy`. El vigilante (`vigilante.yml`)
   lo lee de la **variable del repo** `UMAMI_WEBSITE_ID` (paso 3): sin ella, sus despliegues quitan la analítica.
   Opcionales: `UMAMI_SCRIPT_URL` (por defecto `https://cloud.umami.is/script.js`; usar la URL del
   script que muestre Umami para la región UE si es distinta) y `UMAMI_DOMAINS` (por defecto
   `29n.jorgemasta.com`: los builds en otros dominios no envían nada).
3. Comprobación periódica de apuestas (`.github/workflows/apuestas.yml`, lunes 06:41 UTC):
   - Variable del repo (Settings → Secrets and variables → Actions → *Variables*): `UMAMI_WEBSITE_ID`;
     opcional `UMAMI_API_URL` (por defecto `https://api.umami.is/v1`, la API de Umami Cloud).
   - Secreto: `UMAMI_API_KEY` (Umami Cloud → Settings → API keys).
   - El job usa `github.token` (permiso `issues: write`) y crea la etiqueta `reneutralizar` si no existe.
   - Abre un issue por cada tema con más del 60 % de acierto y al menos 30 apuestas en los últimos 30 días,
     salvo que ya haya uno abierto para ese tema. Sin las dos variables, el job termina sin hacer nada.
   - En local: `UMAMI_API_KEY=… UMAMI_WEBSITE_ID=… npx tsx scripts/apuestas.ts --sin-publicar`.
