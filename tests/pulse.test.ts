// Pulse (#23): the frozen list of themes and questions, exercised only through takePulse with test
// sources and the fake AI.
import { describe, expect, it } from 'vitest';
import { createFakeAI, type FakeResponses } from '../src/ai/fake';
import { Pulse, takePulse, type PulseOptions, type PulseResponse, type PulseSources } from '../src/pulse';

const sources: PulseSources = {
  cis: {
    barometer: 'Barómetro del CIS de octubre de 2026',
    url: 'https://www.cis.es/estudios/barometro-octubre-2026',
    items: [
      { id: 'vivienda', label: 'La vivienda', percent: 31.2 },
      { id: 'paro', label: 'El paro', percent: 22.5 },
    ],
  },
  manifestos: [
    { party: 'aaa', topics: ['alquiler', 'sanidad', 'listas de espera', 'puerto'] },
    { party: 'bbb', topics: ['alquiler', 'sanidad', 'listas de espera'] },
    { party: 'ccc', topics: ['alquiler', 'sanidad', 'atención primaria'] },
    { party: 'reg', topics: ['puerto'] },
  ],
  networks: [
    { id: 'r-okupas', source: 'reddit', label: 'Okupación', url: 'https://www.reddit.com/r/spain/comments/abc' },
    { id: 't-alquiler', source: 'google-trends', label: 'precio alquiler' },
  ],
};

const options: PulseOptions = {
  frozenAt: '2026-11-10',
  parties: [
    { id: 'aaa', scope: { type: 'national' } },
    { id: 'bbb', scope: { type: 'national' } },
    { id: 'ccc', scope: { type: 'national' } },
    // Regional party in Canarias (CODAUTO 05).
    { id: 'reg', scope: { type: 'provinces', provinces: ['35', '38'] } },
  ],
};

type ResponseQuestion = PulseResponse['themes'][number]['questions'][number];

/** A question backed by the 3 national manifestos ("sanidad"), unless overridden. */
const q = (id: string, followUp = false, o: Partial<ResponseQuestion> = {}): ResponseQuestion => ({
  id,
  text: `¿Qué harían con ${id.replace(/-/g, ' ')}?`,
  followUp,
  cis: null,
  manifestos: [
    { party: 'aaa', topic: 'sanidad' },
    { party: 'bbb', topic: 'sanidad' },
    { party: 'ccc', topic: 'sanidad' },
  ],
  networks: [],
  ...o,
});

/** A full national theme: 3 base questions and 2 follow-up questions. */
const healthTheme = (): PulseResponse['themes'][number] => ({
  id: 'sanidad',
  title: 'Sanidad',
  region: null,
  questions: [
    q('listas-espera'),
    q('atencion-primaria'),
    q('salud-mental'),
    q('farmacia', true),
    q('dentista', true),
  ],
});

const response = (...themes: PulseResponse['themes']): PulseResponse => ({ themes });

/** Fake AI whose two passes answer `first` and `second` (the same unless given). */
function pulseAI(first: PulseResponse, second: PulseResponse = first) {
  // The pulse only uses take-pulse: any other task throws (no canned answer).
  return createFakeAI({ 'take-pulse': (_input, attempt) => (attempt === 0 ? first : second) } as FakeResponses);
}

describe('takePulse', () => {
  it('returns themes with 3 base and 2 follow-up questions, each with its origin, and the freeze date', async () => {
    const pulse = await takePulse(sources, pulseAI(response(healthTheme())), options);

    expect(pulse.frozenAt).toBe('2026-11-10');
    expect(pulse.themes).toEqual([{ id: 'sanidad', title: 'Sanidad', order: 1 }]);
    const questions = pulse.questions.filter((x) => x.theme === 'sanidad');
    expect(questions.filter((x) => !x.followUp).map((x) => x.id)).toEqual(['listas-espera', 'atencion-primaria', 'salud-mental']);
    expect(questions.filter((x) => x.followUp).map((x) => x.id)).toEqual(['farmacia', 'dentista']);
    expect(questions.map((x) => x.order)).toEqual([1, 2, 3, 4, 5]);
    expect(questions[0]).toMatchObject({
      text: '¿Qué harían con listas espera?',
      origin: { cis: null, manifestos: 3 },
    });
    expect(pulse.rejected).toEqual([]);
    // The frozen list validates as written to data/pulse.json.
    expect(Pulse.parse(pulse)).toEqual(pulse);
  });

  describe('entry rule: in the CIS or in at least 3 manifestos', () => {
    /** The health theme with its first base question replaced by `x`, plus a spare base one. */
    const withCandidate = (x: ResponseQuestion) => {
      const t = healthTheme();
      return response({ ...t, questions: [x, ...t.questions.slice(1), q('urgencias')] });
    };
    const ids = (p: { questions: { id: string }[] }) => p.questions.map((x) => x.id);

    it('a question backed by the CIS enters with its datum as origin, even without manifestos', async () => {
      const pulse = await takePulse(sources, pulseAI(withCandidate(q('alquiler', false, { cis: 'vivienda', manifestos: [] }))), options);
      expect(pulse.questions.find((x) => x.id === 'alquiler')?.origin).toEqual({
        cis: 'La vivienda: 31,2 % (Barómetro del CIS de octubre de 2026)',
        manifestos: 0,
      });
    });

    it('a candidate that only comes from networks does not enter, and the report says why', async () => {
      const okupas = q('okupacion', false, { cis: null, manifestos: [], networks: ['r-okupas'] });
      const pulse = await takePulse(sources, pulseAI(withCandidate(okupas)), options);
      expect(ids(pulse)).not.toContain('okupacion');
      expect(pulse.rejected).toContainEqual(expect.objectContaining({ id: 'okupacion', theme: 'sanidad', reason: 'networksOnly' }));
    });

    it('2 manifestos without a CIS datum are not enough', async () => {
      const two = q('puerto', false, { manifestos: [{ party: 'aaa', topic: 'puerto' }, { party: 'reg', topic: 'puerto' }], networks: ['t-alquiler'] });
      const pulse = await takePulse(sources, pulseAI(withCandidate(two)), options);
      expect(ids(pulse)).not.toContain('puerto');
      expect(pulse.rejected).toContainEqual(expect.objectContaining({ id: 'puerto', reason: 'notEnoughSources' }));
    });

    it('backing the sources do not contain is not counted', async () => {
      const claimed = q('copago', false, {
        cis: 'no-existe',
        manifestos: [
          { party: 'aaa', topic: 'sanidad' },
          { party: 'aaa', topic: 'listas de espera' },
          { party: 'bbb', topic: 'copago' },
          { party: 'zzz', topic: 'sanidad' },
        ],
      });
      const pulse = await takePulse(sources, pulseAI(withCandidate(claimed)), options);
      expect(ids(pulse)).not.toContain('copago');
      expect(pulse.rejected).toContainEqual(expect.objectContaining({ id: 'copago', reason: 'notEnoughSources' }));
    });
  });

  describe('two independent passes that must agree', () => {
    it('asks the AI twice, marking each pass, and keeps what both propose', async () => {
      const ai = pulseAI(response(healthTheme()));
      await takePulse(sources, ai, options);
      expect(ai.calls.map((c) => (c.input as { pass: number }).pass)).toEqual([1, 2]);
    });

    it('a question only one pass proposes is not published and goes to the report', async () => {
      const t = healthTheme();
      const first = response({ ...t, questions: [...t.questions.slice(0, 3), q('copago'), ...t.questions.slice(3)] });
      const pulse = await takePulse(sources, pulseAI(first, response(t)), options);
      expect(pulse.questions.map((x) => x.id)).not.toContain('copago');
      expect(pulse.rejected).toEqual([expect.objectContaining({ id: 'copago', theme: 'sanidad', reason: 'passesDisagree' })]);
    });

    it('a question the passes put in a different theme or role does not match', async () => {
      const t = healthTheme();
      const second = response({ ...t, questions: t.questions.map((x) => (x.id === 'dentista' ? { ...x, followUp: false } : x)) });
      const pulse = await takePulse(sources, pulseAI(response(t), second), options);
      expect(pulse.questions.map((x) => x.id)).not.toContain('dentista');
      expect(pulse.rejected).toContainEqual(expect.objectContaining({ id: 'dentista', reason: 'passesDisagree' }));
    });
  });

  describe('size: 3 base and 2 follow-up questions per national theme', () => {
    it('keeps the first 3 base and 2 follow-up questions in the pulse order; the rest go to the report', async () => {
      const t = healthTheme();
      const more = response({ ...t, questions: [...t.questions, q('urgencias'), q('vacunas', true)] });
      const pulse = await takePulse(sources, pulseAI(more), options);
      expect(pulse.questions.map((x) => x.id)).toEqual(['listas-espera', 'atencion-primaria', 'salud-mental', 'farmacia', 'dentista']);
      expect(pulse.rejected.map((x) => [x.id, x.reason])).toEqual([
        ['urgencias', 'surplus'],
        ['vacunas', 'surplus'],
      ]);
    });

    it('a theme left with fewer than 3 base questions is not published, nor are its questions', async () => {
      const t = healthTheme();
      const weak = { ...t, id: 'empleo', title: 'Empleo', questions: t.questions.map((x, i) => (i === 0 ? { ...x, manifestos: [] } : x)) };
      const pulse = await takePulse(sources, pulseAI(response(weak, t)), options);
      expect(pulse.themes).toEqual([{ id: 'sanidad', title: 'Sanidad', order: 1 }]);
      expect(pulse.questions.every((x) => x.theme === 'sanidad')).toBe(true);
      expect(pulse.rejected.filter((x) => x.theme === 'empleo').map((x) => [x.id, x.reason])).toEqual([
        ['listas-espera', 'notEnoughSources'],
        ['atencion-primaria', 'themeIncomplete'],
        ['salud-mental', 'themeIncomplete'],
        ['farmacia', 'themeIncomplete'],
        ['dentista', 'themeIncomplete'],
      ]);
    });

    it('fewer than 2 follow-up questions does not block the theme (they are the first to go)', async () => {
      const t = healthTheme();
      const pulse = await takePulse(sources, pulseAI(response({ ...t, questions: t.questions.slice(0, 4) })), options);
      expect(pulse.themes).toHaveLength(1);
      expect(pulse.questions.filter((x) => x.followUp)).toHaveLength(1);
    });
  });

  it('a question that breaks the neutrality rules (open "¿Qué harían…?", no figures) does not enter', async () => {
    const t = healthTheme();
    const worded = (x: ResponseQuestion, text: string) => ({ ...x, text });
    const bad = response({
      ...t,
      questions: [
        worded(q('cerrado'), '¿Está a favor del copago?'),
        worded(q('con-dato'), '¿Qué harían con las listas de espera, que superan los 120 días?'),
        worded(q('sin-cierre'), '¿Qué harían con las urgencias'),
        ...t.questions,
      ],
    });
    const pulse = await takePulse(sources, pulseAI(bad), options);
    expect(pulse.questions.map((x) => x.id)).toEqual(t.questions.map((x) => x.id));
    expect(pulse.rejected.map((x) => [x.id, x.reason])).toEqual([
      ['cerrado', 'notNeutral'],
      ['con-dato', 'notNeutral'],
      ['sin-cierre', 'notNeutral'],
    ]);
  });

  describe('"Tu comunidad" only in communities with regional parties', () => {
    const regional = (id: string, region: string): PulseResponse['themes'][number] => ({
      id,
      title: 'Tu comunidad',
      region,
      questions: [q(`${id}-puertos`), q(`${id}-agua`), q(`${id}-turismo`)],
    });

    it('tells the AI which communities have regional parties', async () => {
      const ai = pulseAI(response(healthTheme()));
      await takePulse(sources, ai, options);
      expect((ai.calls[0]!.input as { regions: unknown }).regions).toEqual([{ region: '05', name: 'Canarias', parties: ['reg'] }]);
    });

    it('publishes the regional theme of a community with a regional party, with its region and 2–4 questions', async () => {
      const pulse = await takePulse(sources, pulseAI(response(healthTheme(), regional('canarias', '05'))), options);
      expect(pulse.themes).toContainEqual({ id: 'canarias', title: 'Tu comunidad', order: 2, region: '05' });
      expect(pulse.questions.filter((x) => x.theme === 'canarias').map((x) => [x.id, x.followUp, x.order])).toEqual([
        ['canarias-puertos', false, 1],
        ['canarias-agua', false, 2],
        ['canarias-turismo', false, 3],
      ]);
    });

    it('a regional theme for a community without regional parties is not published', async () => {
      const pulse = await takePulse(sources, pulseAI(response(healthTheme(), regional('cataluna', '09'))), options);
      expect(pulse.themes.map((t) => t.id)).toEqual(['sanidad']);
      expect(pulse.rejected.filter((x) => x.theme === 'cataluna').map((x) => x.reason)).toEqual([
        'noRegionalParties',
        'noRegionalParties',
        'noRegionalParties',
      ]);
    });

    it('a regional theme needs 2 questions and keeps at most 4', async () => {
      const t = regional('canarias', '05');
      const five = { ...t, questions: [...t.questions, q('canarias-campo'), q('canarias-luz')] };
      const pulse = await takePulse(sources, pulseAI(response(healthTheme(), five)), options);
      expect(pulse.questions.filter((x) => x.theme === 'canarias')).toHaveLength(4);
      expect(pulse.rejected).toEqual([expect.objectContaining({ id: 'canarias-luz', reason: 'surplus' })]);

      const one = { ...t, questions: t.questions.slice(0, 1) };
      const thin = await takePulse(sources, pulseAI(response(healthTheme(), one)), options);
      expect(thin.themes.map((x) => x.id)).toEqual(['sanidad']);
    });
  });

  it('refuses X as a network source, by name or by link', async () => {
    const ai = pulseAI(response(healthTheme()));
    const withNetwork = (n: object) => ({ ...sources, networks: [...sources.networks, n] }) as PulseSources;
    await expect(takePulse(withNetwork({ id: 'x1', source: 'x', label: 'algo' }), ai, options)).rejects.toThrow();
    await expect(
      takePulse(withNetwork({ id: 'x2', source: 'web', label: 'algo', url: 'https://twitter.com/alguien/status/1' }), ai, options),
    ).rejects.toThrow(/X/);
    expect(ai.calls).toEqual([]);
  });

  it('keeps the sources it used, so the methodology can publish them', async () => {
    const pulse = await takePulse(sources, pulseAI(response(healthTheme())), options);
    expect(pulse.sources).toEqual(sources);
  });
});
