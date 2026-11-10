// The reveal of one question (#27): for each approach, who defends it (fully or in part) with the
// literal quote and a link to the manifesto page, each party's concrete proposal with its exact
// figures and feasibility; then who proposes something else, who proposes nothing, and one line for a
// filler approach or one defended only by parties running elsewhere. Everything AI-written carries
// the "IA" label linked to its explanation. Data comes from the engine (`themeReveal()`).
import { NONE, type OtherProposalReveal, type PartyProposal, type QuestionReveal, type RevealedApproach, type RevealedParty, type RevealedStance } from '../game';
import type { LinkedQuote } from '../game/party';
import { aiLabel } from './ai';
import { h } from './dom';
import { feasibilityChip, feasibilityNote } from './feasibility';
import { guessLine } from './guess';
import { icon } from './icons';

/** Where each kind of AI content is explained. */
export const AI_EXPLAINED = {
  /** Approaches: the neutral texts and how parties were grouped into them. */
  approaches: '/metodologia/#enfoques',
  /** A party's concrete proposal, rewritten with the common template. */
  proposal: '/metodologia/#proceso',
} as const;

const STANCE_LABEL = { full: 'De lleno', partial: 'En parte' } as const;

export function questionReveal(q: QuestionReveal): HTMLElement {
  return h('section', { class: 'revealed-question' },
    h('h2', {}, q.question.text),
    h('p', { class: 'your-choice' }, q.choice === NONE ? 'No te convenció ninguna.' : `Elegiste la ${q.choice}.`),
    guessLine(q.guess),
    h('ol', { class: 'options revealed-options', role: 'list' }, ...q.approaches.map((a) => h('li', {}, approachReveal(a)))),
    q.otherProposals.length ? otherProposals(q.otherProposals) : null,
    q.noProposal.length
      ? h('p', { class: 'silent' }, h('strong', {}, 'No proponen nada sobre esto: '), names(q.noProposal), '.')
      : null,
    q.unverified.length
      ? h('p', { class: 'silent' }, h('strong', {}, 'No pudimos verificar su propuesta: '), names(q.unverified), '.')
      : null,
  );
}

function approachReveal(a: RevealedApproach): HTMLElement {
  return h('article', { class: a.chosen ? 'option revealed chosen' : 'option revealed' },
    h('span', { class: 'letter', 'aria-hidden': 'true' }, a.letter),
    h('div', { class: 'text' },
      a.chosen ? h('span', { class: 'tag' }, icon('check'), 'Tu elección') : null,
      h('strong', { class: 'what' }, h('span', { class: 'visually-hidden' }, `Propuesta ${a.letter}: `), a.what, ' ', aiLabel(AI_EXPLAINED.approaches)),
      h('span', { class: 'how' }, a.how),
      a.figure ? h('span', { class: 'figure' }, a.figure) : null,
      defenders(a),
    ),
  );
}

function defenders(a: RevealedApproach): HTMLElement {
  if (a.filler) return h('p', { class: 'defenders-none' }, 'Ningún partido la defiende: la añadimos para que hubiera 3 opciones.');
  if (a.onlyElsewhere)
    return h('p', { class: 'defenders-none' }, 'Solo la defienden partidos que no se presentan en tu provincia: aquí no suma a nadie.');
  if (a.parties.length === 0) return h('p', { class: 'defenders-none' }, 'Ningún partido con programa publicado la defiende aquí.');
  return h('div', { class: 'defenders' },
    h('h3', {}, 'Quién la defiende ', aiLabel(AI_EXPLAINED.approaches)),
    h('ul', { role: 'list' }, ...a.parties.map((s) => h('li', {}, stanceReveal(s)))),
  );
}

function stanceReveal(s: RevealedStance): HTMLElement {
  return h('div', { class: 'party-stance' },
    h('p', { class: 'party-line' },
      partyName(s.party),
      h('span', { class: `stance stance-${s.stance}` }, STANCE_LABEL[s.stance]),
      feasibilityChip(s.proposal?.feasibility ?? null)),
    quote(s.party, s.quote),
    s.proposal ? proposalDetails(s.proposal) : null,
  );
}

function otherProposals(list: OtherProposalReveal[]): HTMLElement {
  return h('div', { class: 'other-proposals' },
    h('h3', {}, 'Proponen otra cosa'),
    h('ul', { role: 'list' },
      ...list.map((o) =>
        h('li', { class: 'party-stance' },
          h('p', { class: 'party-line' }, partyName(o.party), feasibilityChip(o.proposal?.feasibility ?? null)),
          o.proposal ? proposalText(o.proposal) : null,
          quote(o.party, o.quote),
          o.proposal?.feasibility ? feasibilityNote(o.proposal.feasibility, o.proposal.noSources) : null,
        ))),
  );
}

/** The party's own proposal (exact figures) and its feasibility, folded to keep the reveal light. */
function proposalDetails(p: PartyProposal): HTMLElement {
  return h('details', { class: 'proposal' },
    h('summary', {}, p.feasibility ? 'Su propuesta concreta y su viabilidad' : 'Su propuesta concreta'),
    proposalText(p),
    p.feasibility ? feasibilityNote(p.feasibility, p.noSources) : null,
  );
}

function proposalText(p: PartyProposal): HTMLElement {
  return h('div', { class: 'proposal-text' },
    h('p', {}, h('strong', {}, p.what), ' ', aiLabel(AI_EXPLAINED.proposal)),
    h('p', {}, p.how),
    p.figure ? h('p', { class: 'exact-figure' }, h('strong', {}, 'Cifra: '), p.figure) : null,
  );
}

/** Literal quote (never AI-written) with a link to its page in the manifesto PDF. */
function quote(party: RevealedParty, q: LinkedQuote): HTMLElement {
  return h('blockquote', {},
    h('p', {}, `«${q.text}»`),
    h('footer', {}, `— ${party.name}, pág. ${q.page} · `,
      h('a', { href: q.link, target: '_blank', rel: 'noopener' }, 'Abrir el PDF en la página', icon('external'))),
  );
}

function partyName(p: RevealedParty): HTMLElement {
  return h('strong', { class: 'party' }, p.name, p.test ? ' ' : null, p.test ? h('span', { class: 'label' }, 'PRUEBA') : null);
}

/** "Partido A, Partido B" with a PRUEBA label on test parties. */
function names(parties: RevealedParty[]): DocumentFragment {
  const f = document.createDocumentFragment();
  parties.forEach((p, i) => {
    if (i) f.append(', ');
    f.append(p.name);
    if (p.test) f.append(' ', h('span', { class: 'label' }, 'PRUEBA'));
  });
  return f;
}
