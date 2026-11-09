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
| postura (v1) | `topicPosition` | v1: one party's neutralised card on a topic (dataset key `topicPositions`, legacy until #24/#29). v2's `position` is per question. |
| texto neutral (qué / cómo / cifra) | `neutralText` (`what` / `how` / `figure`) | The rewritten, anonymised wording of a proposal. |
| cita | `quote` | Literal text from the manifesto, with its `page`. |
| barrera | `check` | An automatic quality gate in the pipeline. Ids stay `V1`…`V13`. |
| neutralizar | `neutralize` | v1: rewrite a proposal into the common template without party marks. v2 neutralises nothing per party: approaches are written by `settleApproaches`. |
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
| pregunta sugerida | `suggestedQuestion` | Precomputed question of the Preguntar tab with answers from every manifesto. Type `SuggestedQuestion`, its answers `SuggestedAnswer`, dataset key `suggestedQuestions` (answers stay under `answers`), `ReportEntry.suggestedQuestion`, `Game.suggestedQuestions()` / `suggestedQuestion()` / `revealSuggestedQuestion()`. Never just `question`: that word is the v2 one. |
| pregunta libre | `freeQuestion` | Voter-typed question answered live from manifestos, always with quotes. Endpoint `/api/ask`. |
| aviso (reportar error / falta un partido) | `feedback` | A voter notice that becomes a public GitHub issue. Endpoint `/api/feedback`. |
| compartir / reto | `share` / `challenge` | The share card and the `?r=reto` invite link (the URL param stays Spanish: it is user-facing). |
| transparencia | `transparency` | Methodology, feasibility distribution and reports pages. |
| lanzamiento | `launch` | Production-build rules: only real, official data. |

## v2: three approaches per question (#18)

v2 replaces "one card per party" with "3 approaches per question" (`docs/adr/0001-three-approaches-per-question.md`).
`topic` (v1) gives way to `theme` + `question`. **`question` always means the v2 question**; the
Preguntar tab's one is `suggestedQuestion` and the voter-typed one `freeQuestion`.

| UI (es) | Code (en) | Meaning |
|---|---|---|
| temática | `theme` | A group of questions the voter picks at the start (Vivienda, Sanidad…). Type `Theme`, dataset key `themes`. |
| Tu comunidad | `regionalTheme` | A `theme` with `region` = INE autonomous-community code (CODAUTO), shown only to voters there. |
| pregunta | `question` | One blind choice inside a theme, always with exactly 3 approaches. Type `Question`, dataset key `questions`. |
| pregunta para afinar | `followUpQuestion` | Optional extra question offered after a theme's base questions; flag `followUp` on `question`. |
| origen | `origin` | Why the pulse picked a question: CIS datum (`cis`) and how many manifestos address it (`manifestos`). |
| enfoque | `approach` | One of the 3 options of a question (`what` / `how` / `figure`, figures rounded); defended by one or more parties. |
| enfoque inventado | `filler` (flag on `approach`) | An approach no party defends, added to reach 3. Adds to no party. |
| de lleno / en parte / no | `stance: 'full' \| 'partial' \| 'none'` | How a party fits an approach (1 / 0.5 / 0). Stored as `PartyStance` in `approach.stances`; every non-`none` one carries its `quote`. |
| clasificación | `classification` | Every party's stances on the approaches of a question, plus its `otherProposals`. What `settleApproaches` produces. |
| propone otra cosa | `otherProposal` | A party that fits no approach (`question.otherProposals`, with its quote): out of the blind choice, shown at reveal. |
| postura (en una pregunta) | `position` | What one party says about one question (`proposes` / `noProposal` / `unverified`), from `processManifesto`; the input of `settleApproaches`. A `proposes` one carries its `proposal`, `quotes` and `feasibility`. Dataset key `positions`. |
| propuesta concreta | `proposal` | The party's own what / how / figure on a question, exact figures, not neutralised: shown only at the reveal. |
| palabras clave | `keywords` | A question's public V12 search terms (`question.keywords`, from the pulse). |
| pulso | `pulse` | The AI survey (CIS, manifestos, Reddit/web) that produces the frozen theme/question list. |
| fecha de congelación | `frozenAt` | The date the pulse list was frozen (`Pulse.frozenAt`, `data/pulse.json`); published in the methodology. |
| pregunta descartada | `RejectedQuestion` | A pulse candidate that did not enter, with its `reason` (`passesDisagree`, `networksOnly`, `notEnoughSources`, `notNeutral`, `noRegionalParties`, `themeIncomplete`, `surplus`) and a Spanish `detail`. |
| elección | `questionChoices` | `GameState.questionChoices`: approach id (or `none`) per question id. |
| destapar (temática) | `revealTheme` / `themeReveal` | Reveal every answered question of a theme at once (`GameState.revealedThemes`); after it only follow-up questions can still be answered. |
| elegir temáticas / "Todas" | `selectThemes` / `selectedThemes` | `GameState.selectedThemes`: theme ids or `all` (also the themes of a later province). Playing a theme not picked adds it. Route `#elegir`. |
| repetir (temática) | `repeatTheme` | Forget every choice of a theme (follow-up ones too) and make it blind again. |
| propuesta a ciegas | `BlindApproach` | What the voter sees before the reveal: letter, what, how, figure. No id, party or stance. |
| apuesta | `guess` | Optional: which party the voter thinks defends the chosen approach. Right if that party is `full` or `partial` there (#26). |
| afinidad | `affinity` | Sum of the stances (1 / 0.5) of the approaches the voter chose; `none`, `filler` and out-of-province approaches add nothing (#25). |

Test seams named in #18: `createGame`, `processManifesto`, `settleApproaches`, `takePulse`.
