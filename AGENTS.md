# 29N

Lee lo que proponen los partidos para las elecciones generales del 29-nov-2026 sin saber de quién es. Design decisions: `docs/decisions.md`. UX spec: `docs/ux-spec.md`.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues at jorgemasta/29n (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Commands

- `npm test`: Vitest. Test point A `tests/pipeline.test.ts`, test point B `tests/juego.test.ts`, test point C `tests/pregunta-libre.test.ts`.
- `npm run build`: static Astro preview build into `dist/` (never indexable). `npm run build:produccion` (used by `npm run deploy`) fails unless the dataset is real: launch rules in `src/lanzamiento/` (tests `tests/lanzamiento.test.ts`), checklist in `docs/deploy.md`. `npx tsc --noEmit -p .` typechecks.
- `npm run e2e`: builds, then the end-to-end journey on phone and desktop viewports in a real Chrome via agent-browser (`tests/e2e/humo.e2e.ts`; setup in `docs/e2e.md`). Not part of `npm test`.
- `npm run schema`: regenerates `data/dataset.schema.json` from `src/dataset/esquema.ts`.
- `npx tsx scripts/generar-simulado.ts`: rebuilds the simulated (fictional) `data/dataset.json`.
- `npm run municipios`: rebuilds `data/municipios.json` from the INE's official municipality list.
- `npm run og`: regenerates `public/og.png` (link preview). Share card texts: `src/compartir/` (tests `tests/compartir.test.ts`); `src/worker/index.ts` swaps og:title for `/?r=reto`.
- `npm run procesar`: processes a real programme with Claude. Deploy: `docs/deploy.md`.
- `npx tsx scripts/vigilar.ts [--partido id] [--forzar] [--sin-publicar]`: programme watcher (cron in `.github/workflows/vigilante.yml`). Tests: `tests/vigilante.test.ts`.
- `npx tsx scripts/apuestas.ts [--sin-publicar]`: bet hit-rate check (cron `.github/workflows/apuestas.yml`, needs Umami vars; off when unset). Analytics events: `src/analitica/eventos.ts`, tests `tests/analitica.test.ts`.
