# Despliegue (paso humano)

La web es estática: Cloudflare sirve `dist/` como *static assets* de un Worker (`wrangler.jsonc`).
No hay credenciales de Cloudflare ni de Anthropic en el repo.

1. `npx wrangler login` (o `CLOUDFLARE_API_TOKEN` con permiso de Workers y DNS de `jorgemasta.com`).
2. `npm run deploy` → `astro build` + `wrangler deploy`. El dominio `29n.jorgemasta.com` se crea como
   *custom domain* del Worker (la zona `jorgemasta.com` debe estar en la misma cuenta).
   - `npm run deploy:privado` construye el **prototipo privado** (`MODO=privado`): además de los programas
     oficiales del 29N incluye las fuentes provisionales (programas de 2023, documentos del partido y
     declaraciones), marcadas «solo privado» al revelar. `npm run deploy` (modo público, por defecto) las
     excluye del todo: esos partidos salen como «⏳ programa pendiente» y sus datos no se publican.
3. Comprobar `https://29n.jorgemasta.com/` y que `robots.txt` devuelve `Disallow: /` (prototipo privado, sin enlazar).

## Procesar un programa real (necesita `ANTHROPIC_API_KEY`)

```bash
npm run procesar -- --partido erc --pdf ./erc-2026.pdf --url https://<web oficial>/programa.pdf
```

- Sustituye el dataset simulado por datos reales (`origen: "real"`) solo si el programa es publicable y pasa V9.
- Las respuestas de la IA se guardan en `data/cache/ia/`: haz commit para que relanzar sea gratis e idéntico.
- `--fuente programa-2023|documento-partido|declaraciones` marca el documento como fuente provisional
  (solo modo privado). Por defecto `programa-29n` (programa oficial). P. ej. el «Contrato con España» del PP:
  `--partido pp --fuente <tipo> --titulo "Contrato con España"`.
- Opcional: `AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/<cuenta>/<gateway>/anthropic`.
- ERC es un partido de ámbito catalán: para verlo en la web sin el selector de provincia (#7), abre `/?provincia=08`.

Node: Astro está fijado a 7.4.1 porque esta máquina tiene Node 22.23.2 (Astro ≥ 7.4.2 exige 22.23.4).
