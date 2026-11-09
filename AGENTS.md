# 29N

Lee lo que proponen los partidos para las elecciones generales del 29-nov-2026 sin saber de quién es. Design decisions: `docs/decisions.md`. UX spec: `docs/ux-spec.md`. ADRs: `docs/adr/`.

## Language

All code is in English: identifiers, files and folders, endpoints and internal URL params, dataset/JSON keys, storage keys, CSS classes, analytics events, comments, test names and commit messages. Spanish only for what the voter sees (UI copy, published methodology and reports, the AI prompt text, since the manifestos are Spanish) and for product docs (`docs/`, issues). Existing public routes stay as they are: `/metodologia/`, `/privacidad/`, `?r=reto`. Domain terms map Spanish → English in `GLOSSARY.md`; use those names.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues at jorgemasta/29n (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Commands

- `npm test`: Vitest. Test point A `tests/pipeline.test.ts`, test point B `tests/game.test.ts`, test point C `tests/free-question.test.ts`, test point A' (settleApproaches) `tests/settle.test.ts`, dataset schema (V9) `tests/dataset.test.ts`.
- `npm run build`: static Astro preview build into `dist/` (never indexable). `npm run build:production` (used by `npm run deploy`) fails unless the dataset is real: launch rules in `src/launch/` (tests `tests/launch.test.ts`), checklist in `docs/deploy.md`. `npx tsc --noEmit -p .` typechecks.
- `npm run e2e`: builds, then the end-to-end journey on phone and desktop viewports in a real Chrome via agent-browser (`tests/e2e/smoke.e2e.ts`; setup in `docs/e2e.md`). Not part of `npm test`.
- `npm run schema`: regenerates `data/dataset.schema.json` from `src/dataset/schema.ts`.
- `npx tsx scripts/generate-simulated.ts`: rebuilds the simulated (fictional) `data/dataset.json`.
- `npm run municipalities`: rebuilds `data/municipalities.json` from the INE's official municipality list.
- `npm run og`: regenerates `public/og.png` (link preview). Share card texts: `src/share/` (tests `tests/share.test.ts`); `src/worker/index.ts` swaps og:title for `/?r=reto`.
- `npm run pulse -- --sources <file.json>`: takes the pulse (`takePulse`, `src/pulse/`; sources follow `PulseSources`: CIS, manifesto topics, open networks, never X) and freezes the theme/question list with its date in `data/pulse.json` (never overwritten without `--force`). `npm run pulse -- --dry-run`: fake AI over fictional example sources, no cost, writes nothing. Tests: `tests/pulse.test.ts`.
- `npm run process`: processes a real manifesto with Claude against every question of the frozen pulse (`data/pulse.json`; its themes go into the dataset). Deploy: `docs/deploy.md`.
- `npm run settle [-- --question <id>]`: settles every pulse question not published yet from all parties' positions (`settleAll`, `src/pipeline/settle-all.ts`: `settleApproaches` + `publishSettled`) and writes `data/dataset.json` if V9 passes; published questions are frozen and skipped. `npm run settle -- --dry-run`: what would be settled and the estimated AI calls, no cost, writes nothing. Tests: `tests/watcher.test.ts`.
- `npx tsx scripts/watch.ts [--party id] [--force] [--no-publish]`: manifesto watcher (cron in `.github/workflows/watcher.yml`). Tests: `tests/watcher.test.ts`.
- `npx tsx scripts/guesses.ts [--no-publish]`: bet hit-rate check (cron `.github/workflows/guesses.yml`, needs Umami vars; off when unset). Analytics events: `src/analytics/events.ts`, tests `tests/analytics.test.ts`.
