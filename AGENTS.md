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

- `npm test`: Vitest. Test point A `tests/pipeline.test.ts`, test point B `tests/juego.test.ts`.
- `npm run build`: static Astro build into `dist/`. `npx tsc --noEmit -p .` typechecks.
- `npm run e2e`: builds, then the end-to-end smoke test in a real Chrome via agent-browser (`tests/e2e/humo.e2e.ts`; setup in `docs/e2e.md`). Not part of `npm test`.
- `npm run schema`: regenerates `data/dataset.schema.json` from `src/dataset/esquema.ts`.
- `npx tsx scripts/generar-simulado.ts`: rebuilds the simulated (fictional) `data/dataset.json`.
- `npm run municipios`: rebuilds `data/municipios.json` from the INE's official municipality list.
- `npm run procesar`: processes a real programme with Claude. Deploy: `docs/deploy.md`.
- `npx tsx scripts/vigilar.ts [--partido id] [--forzar] [--sin-publicar]`: programme watcher (cron in `.github/workflows/vigilante.yml`). Tests: `tests/vigilante.test.ts`.
