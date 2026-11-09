# Glossary

The product speaks Spanish (UI copy, public page URLs); the code speaks English. Each domain term has
one Spanish word for the voter and one English name in code. Use these names for identifiers, files,
modules, endpoints, data fields, storage keys and analytics events.

| UI (es) | Code (en) | Meaning |
|---|---|---|
| partido | `party` | A party running in the 29-N general election. |
| siglas | `acronym` | The party's short name. |
| programa (electoral) | `manifesto` | A party's official programme PDF. "Pendiente" = `pending`, "publicado" = `published`. |
| fuente | `source` | Where a manifesto or quote comes from (`sourceType`: official 2026 manifesto, 2023 manifesto, party document, statements). |
| tema | `topic` | A policy area the voter plays (vivienda, sanidad…). Ordered; the first 5 are the goal. |
| tema extra | `extraTopic` | Any topic after the first 5. |
| ámbito | `scope` | Where a topic or party applies: `national` or a region (e.g. `canarias`). |
| postura | `position` | What one party says about one topic, extracted from its manifesto. States: `proposes`, `noProposal`, `unverified`. |
| propuesta | `proposal` | A `position` that proposes something; shown anonymised as a card. |
| texto neutral (qué / cómo / cifra) | `neutralText` (`what` / `how` / `figure`) | The rewritten, anonymised wording of a proposal. |
| cita | `quote` | Literal text from the manifesto, with its `page`. |
| barrera | `check` | An automatic quality gate in the pipeline. Ids stay `V1`…`V13`. |
| neutralizar | `neutralize` | Rewrite a proposal into the common template without party marks. |
| reconocibilidad | `recognizability` | Whether an AI can guess the party from the anonymous text (V11). |
| viabilidad | `feasibility` | The blind AI assessment of a proposal (levels: `viable`, `viableWithCaveats`, `difficult`, `veryDifficult`, `notConcrete`, `noConsensus`). |
| rúbrica | `rubric` | The public feasibility criteria (competence, cost, legal, precedents, majority). |
| informe | `report` | Per-party processing report: what was extracted, discarded and why. |
| proceso de datos | `pipeline` | PDF + party + AI adapter → positions, report, publishable or not. |
| publicable | `publishable` | Whether a manifesto passes the publication rule. |
| vigilante | `watcher` | The cron that detects new manifestos and processes them. |
| partida | `game` | One voter's play-through, stored only in their browser. |
| elegir a ciegas | `chooseBlind` | Picking a card without knowing the party. |
| elección | `choice` | The card (or "Ninguna") a voter picked in a topic. |
| Ninguna me convence | `none` | Choosing no card. Adds to no party. |
| apuesta / adivinar | `guess` | Optional: which party the voter thinks a card is. Measures anonymity. |
| recorrido | `journey` | The voter's path so far: topics done, parties chosen. |
| novedades | `news` | What changed since the last visit (e.g. a party published its manifesto). |
| revelación / destapar | `reveal` | Showing which party each card was, with quote and PDF link. |
| afinidad | `affinity` | The voter's ranking of parties by choices. Computed only in the browser. |
| semilla / barajar | `seed` / `shuffle` | Per-voter stable random order of cards and letters. |
| provincia / municipio | `province` / `municipality` | Where the voter votes; decides regional parties. |
| registro | `registry` | Static lists: parties, topics, provinces, rubric, domains. |
| pregunta sugerida | `suggestedQuestion` | Precomputed question with answers from every manifesto. |
| pregunta libre | `freeQuestion` | Voter-typed question answered live from manifestos, always with quotes. Endpoint `/api/ask`. |
| aviso (reportar error / falta un partido) | `feedback` | A voter notice that becomes a public GitHub issue. Endpoint `/api/feedback`. |
| compartir / reto | `share` / `challenge` | The share card and the `?r=reto` invite link (the URL param stays Spanish: it is user-facing). |
| transparencia | `transparency` | Methodology, feasibility distribution and reports pages. |
| lanzamiento | `launch` | Production-build rules: only real, official data. |

## Coming with spec v2 (#18)

| UI (es) | Code (en) | Meaning |
|---|---|---|
| temática | `theme` | A group of questions the voter picks at the start (Vivienda, Sanidad…). |
| Tu comunidad | `regionalTheme` | The theme with a region's own questions, shown only there. |
| pregunta | `question` | One blind choice inside a theme, always with 3 approaches. |
| pregunta para afinar | `followUpQuestion` | Optional extra question offered after a theme's base questions. |
| enfoque | `approach` | One of the 3 options of a question; groups several parties. |
| enfoque inventado | `filler` (flag on `approach`) | An approach no party defends, added to reach 3. Counts as `none`. |
| de lleno / en parte / no | `stance: 'full' \| 'partial' \| 'none'` | How a party fits an approach (1 / 0.5 / 0), each non-`none` with a quote. |
| propone otra cosa | `otherProposal` | A party that fits no approach: out of the blind choice, shown at reveal. |
| pulso | `pulse` | The AI survey (CIS, manifestos, Reddit/web) that produces the frozen theme/question list. |

Test seams named in #18: `createGame`, `processManifesto`, `settleApproaches`, `takePulse`.
