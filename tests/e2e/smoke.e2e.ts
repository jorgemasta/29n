// End-to-end smoke test, v2 flow (#31): home → province → pick themes → 3 questions each, confirmed
// in the sheet → summary → reveal → the next theme → result → go on with another theme; then ask,
// your data and the information pages. Runs on a phone (390×844) and a desktop (1280×800), with
// accessibility checks on every screen: axe (no contrast failures, nothing serious or critical) in
// light and dark, focus on the headline after each screen change, touch targets ≥ 48 px, no emoji or
// font-dependent glyphs, nothing cut at 320 px (200 % zoom) with the large text, reduced motion, the
// mobile CSS (tap highlight, touch-action, 16 px inputs) and theme-color matching the header. Drives
// a real Chrome through agent-browser against the static build in dist/. Run with `npm run e2e`
// (builds first). Not part of `npm test`.
//
// Setup once: `npx agent-browser install`. On Linux without root, Chrome's shared libraries can be
// unpacked to ~/.agent-browser/libs/root (see docs/e2e.md); this script adds that dir to
// LD_LIBRARY_PATH when it exists.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const DIST = resolve('dist');
const SESSION = `smoke-${process.pid}`;
const BIN = resolve('node_modules/.bin/agent-browser');
const LIBS = join(homedir(), '.agent-browser/libs/root/usr/lib64');
const env = { ...process.env };
if (existsSync(LIBS)) env.LD_LIBRARY_PATH = [LIBS, env.LD_LIBRARY_PATH].filter(Boolean).join(':');

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/ is missing. Run `npm run build` (or `npm run e2e`).');
  process.exit(1);
}

// Minimal static server for dist/ (directories → index.html), in a child process: the agent-browser
// calls below are synchronous and would otherwise block it.
const SERVER = `
const { createServer } = require('node:http');
const { existsSync, readFileSync, statSync } = require('node:fs');
const { extname, join } = require('node:path');
const DIST = process.argv[1];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf', '.txt': 'text/plain' };
const s = createServer((req, res) => {
  let file = join(DIST, decodeURIComponent(new URL(req.url || '/', 'http://x').pathname));
  if (!file.startsWith(DIST)) return res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) return res.writeHead(404).end('404');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
});
s.listen(0, '127.0.0.1', () => console.log(s.address().port));
`;
const server = spawn(process.execPath, ['-e', SERVER, DIST], { stdio: ['ignore', 'pipe', 'inherit'] });
const port = await new Promise<number>((ok, ko) => {
  server.stdout.once('data', (d) => ok(Number(String(d).trim())));
  server.once('exit', () => ko(new Error('The static server did not start')));
});
const BASE = `http://127.0.0.1:${port}/`;

function ab<T = unknown>(...args: string[]): T {
  let output: string;
  try {
    output = execFileSync(BIN, ['--session', SESSION, '--json', ...args], { env, encoding: 'utf8', timeout: 120_000 });
  } catch (e) {
    const { stdout, stderr } = e as { stdout?: string; stderr?: string };
    throw new Error(`agent-browser ${args.join(' ')}: ${(stdout || stderr || String(e)).trim().slice(0, 500)}`);
  }
  const r = JSON.parse(output.trim().split('\n').at(-1)!) as { success: boolean; data: any; error: string | null };
  if (!r.success) throw new Error(`agent-browser ${args.join(' ')}: ${r.error}`);
  return r.data as T;
}
/** Runs an expression in the page and returns its (JSON) value. */
const js = <T = unknown>(expr: string): T => ab<{ result: T }>('eval', expr).result;
const wait = (ms: number) => ab('wait', String(ms));
function waitFor(expr: string, what: string, ms = 5000): void {
  for (let t = 0; t < ms; t += 100) {
    if (js<boolean>(`!!(${expr})`)) return;
    wait(100);
  }
  throw new Error(`Timed out waiting for: ${what}`);
}
const path = () => js<string>('location.hash');
const focusText = () => js<string>('document.activeElement?.tagName + ":" + (document.activeElement?.textContent ?? "").trim()');

let steps = 0;
let prefix = '';
function step(name: string, f: () => void) {
  f();
  steps++;
  console.log(`  ✓ ${prefix}${name}`);
}

/** Phone and desktop: the full journey runs at both sizes. */
const VIEWS = [
  { name: 'phone', width: '390', height: '844' },
  { name: 'desktop', width: '1280', height: '800' },
];

/** axe (bundled with agent-browser): no contrast failures and no serious/critical violations. */
function noViolations(where: string) {
  // Mid-animation text is semi-transparent and axe skips it: settle everything first.
  js(`document.getAnimations().forEach((a) => { try { a.finish(); } catch { a.cancel(); } }); true`);
  const r = ab<{ violations: { id: string; impact: string; nodes: { target: string[]; failureSummary?: string }[] }[] }>('a11y');
  const serious = r.violations.filter((v) => v.id === 'color-contrast' || v.impact === 'serious' || v.impact === 'critical');
  assert.deepEqual(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.failureSummary ?? ''}`).join(' | ')}`),
    [],
    `axe on ${where}`,
  );
}

/** Buttons, rows, header chips and other controls (inline links inside text are exempt) are ≥ 48 px tall. */
function touchTargets(where: string) {
  const small = js<string[]>(`[...document.querySelectorAll('main button, main summary, main .province-chip, main .topic-row, main .pick-row, main .summary-row, main .link-button, .header-chip, dialog[open] button')]
    .filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 47.5; })
    .map((e) => e.outerHTML.slice(0, 80) + ' ' + Math.round(e.getBoundingClientRect().height) + 'px')`);
  assert.deepEqual(small, [], `touch targets < 48px on ${where}`);
}

/** Nothing is cut: no horizontal scroll. */
function noOverflow(where: string) {
  const width = js<{ doc: number; view: number }>('({ doc: document.documentElement.scrollWidth, view: innerWidth })');
  const offenders = width.doc > width.view
    ? js<string[]>(`[...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
        .map((e) => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)).slice(0, 5)`)
    : [];
  assert.ok(width.doc <= width.view, `overflows on ${where}: ${width.doc} > ${width.view} (${offenders.join(', ')})`);
}

/** 200 % zoom on a 640 px phone ≈ 320 CSS px, and with the large text ('Aa') on top. */
function reflow(where: string, v: { width: string; height: string }) {
  ab('set', 'viewport', '320', '640');
  noOverflow(`${where}, 320 px`);
  js(`document.documentElement.dataset.textSize = 'large'; true`);
  noOverflow(`${where}, 320 px, large text`);
  js(`delete document.documentElement.dataset.textSize; true`);
  ab('set', 'viewport', v.width, v.height);
}

/** No emoji and no arrows, ticks or clocks drawn with the system font: icons are inline SVG. */
function noGlyphs(where: string) {
  const found = js<string[]>(`(document.body.innerText.match(/[\\u2190-\\u21FF\\u2300-\\u23FF\\u2600-\\u27BF\\u2B00-\\u2BFF\\u{1F000}-\\u{1FAFF}]/gu) ?? [])`);
  assert.deepEqual(found, [], `glyphs on ${where}`);
}

/** The status bar (theme-color) matches the header, in light and in dark. */
function themeColorMatchesHeader(where: string) {
  for (const scheme of ['light', 'dark']) {
    ab('set', 'media', scheme);
    const c = js<{ meta: string; header: string }>(`(() => {
      const meta = [...document.querySelectorAll('meta[name="theme-color"]')].find((m) => !m.media || matchMedia(m.media).matches);
      const probe = document.createElement('i');
      probe.style.color = meta?.content ?? '';
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return { meta: color, header: getComputedStyle(document.querySelector('.site-header')).backgroundColor };
    })()`);
    assert.equal(c.meta, c.header, `theme-color on ${where} (${scheme})`);
  }
  ab('set', 'media', 'light');
}

/** Waits for a new screen and checks the focus moved to its headline. */
function screen(selector: string, what: string, headline?: RegExp) {
  waitFor(`document.querySelector(${JSON.stringify(selector)})`, what);
  waitFor(`document.activeElement?.tagName === 'H1'`, `focus on the headline of ${what}`);
  if (headline) assert.match(focusText(), headline, `headline of ${what}`);
}

/** Every check that applies to a whole screen. */
function checkScreen(where: string, v: { width: string; height: string }, options: { dark?: boolean; reflow?: boolean } = {}) {
  noViolations(where);
  if (options.dark !== false) {
    ab('set', 'media', 'dark');
    noViolations(`${where} (dark)`);
    ab('set', 'media', 'light');
  }
  touchTargets(where);
  noOverflow(where);
  noGlyphs(where);
  if (options.reflow !== false) reflow(where, v);
}

const click = (selector: string) => js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' }); document.querySelector(${JSON.stringify(selector)}).click(); true`);
const clickText = (selector: string, text: RegExp) =>
  js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => ${text}.test(e.textContent.trim())); if (!b) throw new Error('no ' + ${JSON.stringify(String(text))}); b.click(); return true; })()`);

/**
 * Answers every question of the current theme until the summary: tap an approach, the sheet opens
 * with focus on its title, then "No lo sé, siguiente" when the guess (#26) is there, else "Confirmar".
 */
function playTheme(where: string, v: { width: string; height: string }, checks: boolean) {
  for (let n = 0; n < 10; n++) {
    waitFor(`document.querySelector('.summary h1, .question h1')`, 'a question or the summary');
    if (js<boolean>(`!!document.querySelector('.summary')`)) return;
    // The first question may already be on screen (focus back on an approach after "Cambiar"); every
    // later one is a new screen with focus on its headline.
    if (n > 0) screen('.question h1', `question ${n + 1}`);
    const question = js<string>(`document.querySelector('.question h1').textContent`);
    assert.equal(js<number>(`document.querySelectorAll('.question .option[data-value]').length`), 3, '3 approaches');
    assert.equal(js<string>(`document.querySelector('.ai-note a.ai-label')?.getAttribute('href')`), '/privacidad/#ia', 'AI label while blind');
    if (checks && n === 0) checkScreen(`${where}: question`, v);
    click('.question .option[data-value]');
    waitFor(`document.querySelector('dialog.sheet[open].open')`, 'the sheet');
    assert.match(focusText(), /^H2:Te quedas con la [A-C]/, 'focus on the sheet title');
    if (checks && n === 0) {
      wait(600);
      noViolations(`${where}: sheet`);
      touchTargets(`${where}: sheet`);
      noOverflow(`${where}: sheet`);
      noGlyphs(`${where}: sheet`);
    }
    const skip = js<boolean>(`[...document.querySelectorAll('dialog.sheet button')].some((b) => /^No lo sé/.test(b.textContent.trim()))`);
    clickText('dialog.sheet button', skip ? /^No lo sé/ : /^Confirmar/);
    waitFor(`!document.querySelector('dialog.sheet') && document.querySelector('h1')?.textContent !== ${JSON.stringify(question)}`, 'the next screen');
    waitFor(`document.activeElement?.tagName === 'H1'`, `focus on the headline after question ${n + 1}`);
  }
  throw new Error('Too many questions in one theme');
}

/** The whole journey, from a first visit, at one viewport size. */
function journey(v: { name: string; width: string; height: string }) {
  prefix = `[${v.name}] `;
  ab('set', 'viewport', v.width, v.height);
  ab('set', 'media', 'light');
  ab('open', BASE);
  js('localStorage.clear()');
  ab('open', BASE);

  step('first-visit home: focus, axe light and dark, theme-color, mobile CSS', () => {
    screen('.home h1', 'home', /^H1:Lee lo que proponen sin saber de quién es\./);
    assert.equal(path(), '#portada');
    assert.equal(js<boolean>(`document.getElementById('themes-chip').hidden`), true, 'no theme chip during onboarding');
    checkScreen('home', v);
    themeColorMatchesHeader('home');
    const css = js<{ tap: string; touch: string; select: string; viewport: string }>(`({
      tap: getComputedStyle(document.documentElement).webkitTapHighlightColor,
      touch: getComputedStyle(document.querySelector('.action-bar button')).touchAction,
      select: getComputedStyle(document.querySelector('.action-bar button')).userSelect,
      viewport: document.querySelector('meta[name=viewport]').content })`);
    assert.equal(css.tap, 'rgba(0, 0, 0, 0)', 'no tap highlight');
    assert.equal(css.touch, 'manipulation', 'touch-action on controls');
    assert.equal(css.select, 'none', 'no text selection on controls');
    assert.match(css.viewport, /viewport-fit=cover/);
  });

  step('home with ?r=reto: the challenge line sits above the headline', () => {
    ab('open', BASE + '?r=reto');
    waitFor(`document.querySelector('.home h1')`, 'home with challenge');
    assert.equal(js<string>(`document.querySelector('.home h1').previousElementSibling?.className`), 'challenge-notice');
    ab('open', BASE);
    waitFor(`document.querySelector('.home h1')`, 'home');
  });

  step('home animation: flips, and static with reduced motion', () => {
    assert.notEqual(js<string>(`getComputedStyle(document.querySelector('.mock-cards .flip')).animationName`), 'none');
    ab('set', 'media', 'light', 'reduced-motion');
    assert.equal(js<string>(`getComputedStyle(document.querySelector('.mock-cards .flip')).animationName`), 'none');
    ab('set', 'media', 'light');
  });

  step("'Aa' button: large text is saved", () => {
    assert.equal(js<string>(`getComputedStyle(document.documentElement).fontSize`), '18px');
    ab('click', '#aa');
    assert.equal(js<string>(`getComputedStyle(document.documentElement).fontSize`), '22px');
    assert.equal(js<string>(`document.querySelector('#aa').getAttribute('aria-pressed')`), 'true');
    ab('reload');
    waitFor(`document.querySelector('h1')`, 'reload');
    assert.equal(js<string>(`getComputedStyle(document.documentElement).fontSize`), '22px');
    ab('click', '#aa');
    assert.equal(js<string>(`getComputedStyle(document.documentElement).fontSize`), '18px');
  });

  step('province: search by municipality, input ≥ 16 px', () => {
    clickText('.action-bar button', /^Empezar$/);
    screen('#place-search', 'province', /^H1:¿Dónde votas\?/);
    assert.equal(path(), '#provincia');
    assert.ok(js<number>(`parseFloat(getComputedStyle(document.getElementById('place-search')).fontSize)`) >= 16, 'input ≥ 16px');
    checkScreen('province', v, { dark: false });
    ab('fill', '#place-search', 'Telde');
    waitFor(`[...document.querySelectorAll('#place-results button')].some((b) => b.textContent.includes('Telde, Las Palmas'))`, 'Telde, Las Palmas');
    noGlyphs('province results');
    js(`[...document.querySelectorAll('#place-results button')].find((b) => b.textContent.includes('Telde, Las Palmas')).click()`);
    // Once, on the next screen, for ~2 s: who is in play here.
    waitFor(`document.querySelector('.zone-notice')?.textContent.includes('Las Palmas')`, 'province notice');
  });

  step('pick themes: two of them, province notice goes away', () => {
    screen('.pick-themes h1', 'theme picker', /^H1:¿Qué temáticas quieres jugar\?/);
    assert.equal(path(), '#elegir');
    waitFor(`!document.querySelector('.zone-notice')`, 'the province notice to go away', 4000);
    assert.equal(js<boolean>(`document.querySelector('.action-bar .primary').disabled`), true, 'nothing picked yet');
    checkScreen('theme picker', v);
    click('.pick-row input[value="vivienda"]');
    click('.pick-row input[value="sanidad-cuidados"]');
    assert.equal(js<string>(`document.querySelector('.action-bar .primary').textContent`), 'Empezar con 2 temáticas');
    click('.action-bar .primary');
    waitFor(`location.hash.startsWith('#tematica/vivienda')`, 'first theme');
    assert.equal(js<string>(`document.getElementById('themes-chip').textContent`), 'Temáticas · 0/2');
  });

  step("'Escuchar las tres' reads in order and highlights the approach being read", () => {
    screen('.question h1', 'first question');
    // Fake voice: records what is said; each utterance ends when we tell it to.
    js(`(() => {
      const f = { spoken: [], queue: [], speaking: false,
        speak(u) { f.queue.push(u); if (f.queue.length === 1) f.next(); },
        next() { const u = f.queue[0]; if (!u) return; f.spoken.push(u.text); u.onstart?.(); },
        finish() { const u = f.queue.shift(); u?.onend?.(); f.next(); },
        cancel() { const c = f.queue; f.queue = []; c.forEach((u) => u.onend?.()); }, getVoices: () => [] };
      Object.defineProperty(window, 'speechSynthesis', { value: f, configurable: true });
      window.SpeechSynthesisUtterance ??= function (t) { this.text = t; };
      return true; })()`);
    // The button is created at render time: render again so it sees the fake voice.
    js(`dispatchEvent(new HashChangeEvent('hashchange')); true`);
    screen('.question h1', 'first question again');
    clickText('.question button.listen', /Escuchar las tres/);
    const first = js<string>(`document.querySelector('.option.playing')?.dataset.value`);
    assert.equal(first, js<string>(`document.querySelector('.option[data-value]').dataset.value`));
    assert.match(js<string>(`speechSynthesis.spoken[0]`), new RegExp(`^Propuesta ${first}\\.`));
    js('speechSynthesis.finish()');
    assert.equal(js<string>(`document.querySelector('.option.playing')?.dataset.value`), js<string>(`document.querySelectorAll('.option[data-value]')[1].dataset.value`));
    clickText('.question button.listen', /Parar/);
    assert.equal(js<number>(`document.querySelectorAll('.option.playing').length`), 0);
  });

  step('the sheet: "Cambiar mi elección" closes it, it fades with reduced motion', () => {
    click('.question .option[data-value]');
    waitFor(`document.querySelector('dialog.sheet[open].open')`, 'the sheet');
    assert.equal(js<string>(`document.querySelector('.question .option[aria-pressed="true"]')?.dataset.value`), js<string>(`document.querySelector('.question .option[data-value]').dataset.value`));
    clickText('dialog.sheet button', /^Cambiar mi elección/);
    waitFor(`!document.querySelector('dialog.sheet')`, 'the sheet to close');
    assert.match(focusText(), /^BUTTON:/, 'focus back on the approach');
    assert.equal(js<number>(`document.querySelectorAll('.question .option[aria-pressed="true"]').length`), 0);
    ab('set', 'media', 'light', 'reduced-motion');
    click('.question .option[data-value]');
    waitFor(`document.querySelector('dialog.sheet[open]')`, 'the sheet');
    assert.equal(js<string>(`getComputedStyle(document.querySelector('dialog.sheet')).transform`), 'none', 'no slide with reduced motion');
    js(`document.querySelector('dialog.sheet').dispatchEvent(new Event('cancel', { cancelable: true })); true`);
    waitFor(`!document.querySelector('dialog.sheet')`, 'the sheet to close with Escape');
    ab('set', 'media', 'light');
  });

  step('theme 1: three questions through the sheet, then the summary', () => {
    playTheme('theme 1', v, true);
    screen('.summary h1', 'summary', /^H1:Esto es lo que has elegido/);
    assert.ok(js<number>(`document.querySelectorAll('.summary-row').length`) >= 3, 'every question on the summary');
    checkScreen('summary', v);
  });

  step('reveal: who defends each approach, linked AI labels, focus on the headline', () => {
    clickText('.action-bar button', /^Destapar/);
    screen('.reveal h1', 'reveal', /^H1:Quién defiende cada propuesta/);
    assert.ok(js<number>(`document.querySelectorAll('.reveal .revealed-question').length`) >= 3);
    assert.ok(js<boolean>(`!!document.querySelector('.reveal .option.chosen .tag svg')`), 'the chosen approach is tagged with an SVG tick');
    const labels = js<string[]>(`[...document.querySelectorAll('.reveal a.ai-label')].map((a) => a.getAttribute('href'))`);
    assert.ok(labels.length > 0 && labels.every((l) => l.startsWith('/')), `AI labels at the reveal: ${labels}`);
    assert.equal(js<string>(`document.getElementById('themes-chip').textContent`), 'Temáticas · 1/2');
    checkScreen('reveal', v);
  });

  step('theme 2 from the reveal: "Seguir con…", then its reveal', () => {
    clickText('.action-bar button', /^Seguir con Sanidad/);
    waitFor(`location.hash.startsWith('#tematica/sanidad-cuidados')`, 'second theme');
    playTheme('theme 2', v, false);
    screen('.summary h1', 'summary 2');
    clickText('.action-bar button', /^Destapar/);
    screen('.reveal h1', 'reveal 2');
    assert.equal(js<string>(`document.querySelector('.action-bar a.primary')?.getAttribute('href')`), '#elegir', 'no picked theme left: choose another');
    assert.equal(js<string>(`document.getElementById('themes-chip').textContent`), 'Temáticas · 2/2');
  });

  step('Mi resultado from the menu: by theme and overall (2 themes)', () => {
    click('.site-header button[popovertarget="menu"]');
    waitFor(`document.getElementById('menu').matches(':popover-open')`, 'the menu');
    noViolations('menu');
    clickText('#menu a', /^Mi resultado$/);
    screen('.result h1', 'result', /^H1:Mi resultado/);
    assert.equal(js<boolean>(`document.getElementById('menu').matches(':popover-open')`), false, 'the menu closes');
    assert.ok(js<boolean>(`!!document.querySelector('#r-overall') && document.querySelectorAll('.result .ranking-row').length > 0`), 'overall ranking');
    assert.equal(js<number>(`document.querySelectorAll('.result [id^="r-theme-"]').length`), 2, 'one block per revealed theme');
    checkScreen('result', v);
  });

  step('go on with another theme', () => {
    clickText('.result button', /^Seguir con otra temática/);
    screen('.themes h1', 'theme list', /^H1:Temáticas/);
    checkScreen('theme list', v, { reflow: false });
    click('a.topic-row:not(.done)');
    screen('.question h1', 'a question of a third theme');
    assert.equal(js<number>(`document.querySelectorAll('.question .option[data-value]').length`), 3);
  });

  step('Preguntar: AI label and the answer to a suggested question', () => {
    js(`location.hash = '#preguntar'; true`);
    screen('.ask h1', 'ask');
    waitFor(`document.querySelector('a.question-row')`, 'suggested questions');
    assert.equal(js<string>(`document.querySelector('.ask a.ai-label')?.getAttribute('href')`), '/privacidad/#ia');
    checkScreen('ask', v, { reflow: false });
    click('a.question-row');
    screen('.answer h1', 'answer');
    noViolations('answer');
    noOverflow('answer');
    noGlyphs('answer');
  });

  step('Tus datos, and nothing has left the browser', () => {
    js(`location.hash = '#datos'; true`);
    screen('.data h1', 'your data', /^H1:Tus datos/);
    checkScreen('your data', v, { reflow: false });
    const outside = js<string[]>(`performance.getEntriesByType('resource').map((e) => e.name).filter((u) => new URL(u).origin !== location.origin)`);
    assert.deepEqual(outside, [], 'requests to other domains');
  });

  step('privacy page, and the footer with licences on every page', () => {
    for (const page of ['', 'privacidad/', 'metodologia/', 'partidos/', 'rubrica/']) {
      ab('open', BASE + page);
      waitFor(`document.querySelector('footer.footer')`, `footer of /${page}`);
      const footer = js<{ text: string; links: string[] }>(`({ text: document.querySelector('footer.footer').textContent,
        links: [...document.querySelectorAll('footer.footer a')].map((a) => a.getAttribute('href')) })`);
      assert.match(footer.text, /licencia MIT/, `MIT on /${page}`);
      assert.match(footer.text, /CC BY 4\.0/, `CC BY on /${page}`);
      assert.match(footer.text, /Jorge Masta, sin afiliación/, `authorship on /${page}`);
      assert.ok(footer.links.includes('/privacidad/'), `privacy link on /${page}`);
    }
    ab('open', BASE + 'privacidad/');
    waitFor(`document.querySelector('h1')`, 'privacy');
    const text = js<string>('document.querySelector("main").textContent');
    for (const t of ['nunca salen del navegador', 'Umami', 'Anthropic', '30 días', 'retención cero', 'art. 69 de la LOREG'])
      assert.ok(text.includes(t), `the privacy page mentions «${t}»`);
    assert.ok(js<boolean>(`!!document.getElementById('ia')`), '#ia anchor');
  });

  step("information pages: axe light and dark, no glyphs, reflow, theme-color, 'Aa'", () => {
    for (const page of ['metodologia/', 'partidos/', 'rubrica/', 'privacidad/']) {
      ab('open', BASE + page);
      waitFor(`document.querySelector('h1')`, page);
      noViolations(page);
      ab('set', 'media', 'dark');
      noViolations(`${page} (dark)`);
      ab('set', 'media', 'light');
      noGlyphs(page);
      reflow(page, v);
    }
    ab('open', BASE + 'metodologia/');
    waitFor(`document.querySelector('h1')`, 'metodologia/');
    themeColorMatchesHeader('metodologia/');
    ab('click', '#aa');
    assert.equal(js<string>(`getComputedStyle(document.documentElement).fontSize`), '22px');
    ab('click', '#aa');
  });
}

try {
  console.log(`Smoke test on ${BASE}`);

  step('the production build refuses to publish test data', () => {
    const output = mkdtempSync(join(tmpdir(), '29n-prod-'));
    let failure = '';
    try {
      execFileSync(resolve('node_modules/.bin/astro'), ['build', '--outDir', output], {
        env: { ...process.env, PRODUCTION: '1' }, encoding: 'utf8', stdio: 'pipe', timeout: 300_000,
      });
    } catch (e) {
      const { stdout, stderr } = e as { stdout?: string; stderr?: string };
      failure = `${stdout ?? ''}${stderr ?? ''}`;
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
    assert.match(failure, /Build de producción bloqueado/, 'PRODUCTION=1 with the simulated dataset must fail');
    assert.match(failure, /simulated/);
  });

  step('preview: not indexable (robots.txt and meta robots)', () => {
    assert.match(readFileSync(join(DIST, 'robots.txt'), 'utf8'), /Disallow: \//);
    for (const f of ['index.html', 'privacidad/index.html', 'metodologia/index.html'])
      assert.match(readFileSync(join(DIST, f), 'utf8'), /<meta name="robots" content="noindex, nofollow"/, f);
  });

  for (const v of VIEWS) journey(v);
  console.log(`Smoke test: ${steps} steps passed.`);
} catch (e) {
  console.error(`✗ Failed after ${steps} steps:`, e instanceof Error ? e.message : e);
  try {
    ab('screenshot', resolve('dist-e2e-failure.png'));
    console.error('Screenshot: dist-e2e-failure.png');
  } catch {}
  process.exitCode = 1;
} finally {
  try {
    ab('close');
  } catch {}
  server.kill();
}
