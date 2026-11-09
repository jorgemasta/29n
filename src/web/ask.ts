// "Preguntar" tab (docs/ux-spec.md §12): 7 suggested questions as row buttons, anonymous answers
// with "Ver de quién es cada una", then the reveal with quote and PDF (no feasibility note).
// The free text box (#15) is live only when built with PUBLIC_FREE_QUESTION=1 (and the function's
// own flag is on); otherwise it is shown disabled ("Muy pronto"). Live answers are anonymised by the
// same engine calls (Game.question / revealSuggestedQuestion with the answers); this only renders.
import { FREE_QUESTION_OPEN, askLive, type FreeQuestionResponse, type Offline } from '../client/api';
import type { Game, SuggestedQuestionSummary, SuggestedQuestionReveal, SuggestedQuestionView } from '../game';
import type { SuggestedAnswer } from '../dataset/schema';
import { SESSION_LIMIT, MAX_CHARS, MIN_CHARS } from '../questions/limits';
import { provinceChip } from './province';
import { aiLabel } from './ai';
import { button, h, type Child } from './dom';
import { greyCard, revealedCard } from './card';

/** Questions left this session, from the last answer of the function (null = not asked yet). */
let remaining: number | null = null;


const AI_NOTICE = () =>
  h('p', { class: 'note' }, aiLabel(), ' Respuestas escritas por IA a partir de los programas. Comprueba la cita.');

const header = (game: Game, back: { href: string; text: string }) =>
  h('header', { class: 'header' },
    h('div', { class: 'header-row' }, h('a', { href: back.href, class: 'back-link' }, back.text), provinceChip(game.province)));

/** List of suggested questions plus the (disabled) free text box. */
export function questionsView(game: Game): HTMLElement {
  const questions = game.suggestedQuestions();
  return h('section', { class: 'ask' },
    header(game, { href: '#tematicas', text: '← Temáticas' }),
    h('h1', { tabindex: '-1' }, 'Pregunta a los programas'),
    h('p', {}, 'Respondemos solo con lo que está escrito en los programas, siempre con cita. Si no lo dicen, te lo decimos.'),
    questions.length
      ? h('ul', { class: 'rows', role: 'list' },
          ...questions.map((p) => h('li', {}, h('a', { href: `#preguntar/${encodeURIComponent(p.id)}`, class: 'topic-row question-row' },
            h('span', { class: 'name' }, p.text), h('span', { class: 'state', 'aria-hidden': 'true' }, '→')))))
      : h('p', { class: 'grey' }, 'Todavía no hay preguntas respondidas.'),
    FREE_QUESTION_OPEN ? freeForm(game) : closedForm(),
    AI_NOTICE(),
  );
}

function closedForm(): HTMLElement {
  return h('form', { class: 'free-question', 'aria-describedby': 'coming-soon' },
    h('label', { for: 'question-text', class: 'finder-label' }, 'O escribe tu pregunta'),
    h('textarea', { id: 'question-text', class: 'finder', rows: '2', disabled: '', 'aria-disabled': 'true' }),
    h('p', { id: 'coming-soon', class: 'zone-notice', role: 'note' }, h('strong', {}, 'Muy pronto. '), 'De momento, elige una de las preguntas de arriba.'),
    h('button', { type: 'submit', class: 'secondary', disabled: '' }, 'Preguntar'),
  );
}

/** Live free question: text box, counter, loading state and every non-answer outcome. */
function freeForm(game: Game): HTMLElement {
  const manifestos = game.parties().withManifesto.length;
  const text = h('textarea', {
    id: 'question-text', class: 'finder', rows: '2', minlength: String(MIN_CHARS), maxlength: String(MAX_CHARS), required: '',
    'aria-describedby': 'contador-preguntas privacidad-pregunta',
  }) as HTMLTextAreaElement;
  const send = h('button', { type: 'submit', class: 'primary' }, 'Preguntar') as HTMLButtonElement;
  const state = h('div', { class: 'question-state', role: 'status', 'aria-live': 'polite' });
  const counter = h('p', { id: 'question-counter', class: 'grey' },
    remaining === null ? `Hasta ${SESSION_LIMIT} preguntas por sesión.` : remaining === 1 ? 'Te queda 1 pregunta.' : `Te quedan ${remaining} preguntas.`);
  const form = h('form', { class: 'free-question' },
    h('label', { for: 'question-text', class: 'finder-label' }, 'O escribe tu pregunta'),
    text,
    counter,
    send,
    h('p', { id: 'question-privacy', class: 'note' },
      'Tu pregunta se envía a Anthropic (Claude) sin datos tuyos para buscar la respuesta en los programas. No guardamos registros. ',
      h('a', { href: '/privacidad/#pregunta' }, 'Más detalles')),
    state,
  ) as HTMLFormElement;

  const ask = async (question: string) => {
    send.disabled = true;
    text.disabled = true;
    state.replaceChildren(
      h('p', {}, `Buscando en ${manifestos} ${manifestos === 1 ? 'programa' : 'programas'}…`),
      ...[1, 2, 3].map(() => h('div', { class: 'card skeleton', 'aria-hidden': 'true' })),
    );
    const r = await askLive(question);
    send.disabled = false;
    text.disabled = false;
    if (r.state === 'ok') {
      remaining = r.remaining;
      form.closest('section')?.replaceWith(answerView(game, r.question, { answers: r.answers, onBack: (s) => s.replaceWith(questionsView(game)) }));
      return;
    }
    state.replaceChildren(...noAnswerMessage(r, ask).filter((x): x is Node | string => !!x));
    if (r.state === 'limit') {
      remaining = 0;
      counter.textContent = 'Te quedan 0 preguntas.';
    }
  };
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = text.value.trim();
    if (q.length < MIN_CHARS) {
      state.replaceChildren(h('p', { class: 'zone-notice' }, `Escribe una pregunta un poco más larga (al menos ${MIN_CHARS} caracteres).`));
      return;
    }
    void ask(q);
  });
  return form;
}

function noAnswerMessage(r: Exclude<FreeQuestionResponse, { state: 'ok' }> | Offline, ask: (q: string) => void): Child[] {
  const frequent = 'frequent' in r && r.frequent.length
    ? h('div', {},
        h('p', {}, 'Preguntas frecuentes, ya respondidas:'),
        h('ul', { class: 'rows', role: 'list' },
          ...r.frequent.map((q) => {
            const b = h('button', { type: 'button', class: 'topic-row question-row' }, h('span', { class: 'name' }, q), h('span', { class: 'state', 'aria-hidden': 'true' }, '→'));
            b.addEventListener('click', () => ask(q));
            return h('li', {}, b);
          })))
    : null;
  return [h('p', { class: 'zone-notice' }, r.message), frequent];
}

interface AnswerOptions {
  /** Live answers (free question); absent = the dataset's precomputed ones. */
  answers?: SuggestedAnswer[];
  /** "Otra pregunta" for an in-memory answer (default: back to #preguntar). */
  onBack?: (section: HTMLElement) => void;
}

/** One question: anonymous answers first; "Ver de quién es cada una" reveals them in place. */
export function answerView(game: Game, questionId: string | SuggestedQuestionSummary, options: AnswerOptions = {}): HTMLElement {
  const section = h('section', { class: 'answer' });
  const { answers } = options;
  const render = (revealed: boolean) => {
    const view = game.suggestedQuestion(questionId, answers);
    const children: Child[] = [
      header(game, { href: '#preguntar', text: '← Preguntas' }),
      h('p', { class: 'kicker' }, 'Pregunta a los programas'),
      h('h1', { tabindex: '-1' }, view.question.text),
      ...(revealed || view.cards.length === 0 ? reveal(game.revealSuggestedQuestion(questionId, answers)) : blindPhase(view)),
      h('p', { class: 'note' }, 'Esto no cuenta para tu resultado.'),
      AI_NOTICE(),
      h('div', { class: 'sticky-bar' },
        revealed || view.cards.length === 0 ? null : button('Ver de quién es cada una', 'primary', () => render(true)),
        button('Otra pregunta', 'secondary', () => {
          if (options.onBack) options.onBack(section);
          else location.hash = 'preguntar';
        }),
      ),
    ];
    section.replaceChildren(...children.filter((x): x is Node | string => !!x));
    section.querySelector<HTMLElement>('h1')?.focus();
  };
  render(false);
  return section;
}

function blindPhase(v: SuggestedQuestionView): Child[] {
  const notMentioned = v.notMentioned
    ? ` ${v.notMentioned} ${v.notMentioned === 1 ? 'programa no lo menciona' : 'programas no lo mencionan'} (los verás al descubrir).`
    : '';
  return [
    h('p', { class: 'help' }, 'No pone de quién es cada respuesta: lo verás después.'),
    h('ol', { class: 'cards', role: 'list' },
      ...v.cards.map((t) => h('li', {}, h('div', { class: 'card answer-card' },
        h('span', { class: 'letter', 'aria-hidden': 'true' }, t.letter),
        h('span', { class: 'text' },
          h('span', { class: 'visually-hidden' }, `Respuesta ${t.letter}: `),
          h('strong', { class: 'headline' }, t.headline),
          h('span', { class: 'detail' }, t.detail),
          h('span', { class: 'grey' }, 'Cita disponible al descubrir'),
        ))))),
    h('p', { class: 'grey' }, `${v.cards.length === 1 ? 'Hay 1 respuesta' : `Hay ${v.cards.length} respuestas`}.${notMentioned}`),
  ];
}

function reveal(r: SuggestedQuestionReveal): Child[] {
  const warning = (text: string) => h('p', { class: 'zone-notice', role: 'status' }, h('strong', {}, text));
  return [
    r.noneAtAll ? warning('Ningún programa habla de esto.') : null,
    // Not the same as "nobody talks about it": some programme may, but its answer did not pass the checks.
    !r.noneAtAll && r.cards.length === 0 && r.unverified.length
      ? warning(r.notMentioned.length ? 'No hay ninguna respuesta que hayamos podido verificar.' : 'No hemos podido verificar ninguna respuesta.')
      : null,
    ...r.cards.map((t) => revealedCard(t, { open: true, title: `La ${t.letter} es de ${t.party.name}` })),
    ...r.notMentioned.map((p) => greyCard(p, `El programa de ${p.name} no lo menciona`)),
    ...r.unverified.map((p) => greyCard(p, 'No pudimos verificar su respuesta')),
    r.pending.length ? h('p', { class: 'grey-row' }, `⏳ Sin programa todavía: ${r.pending.map((p) => p.name).join(', ')}`) : null,
  ];
}
