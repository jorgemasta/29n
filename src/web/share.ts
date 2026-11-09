// "Compartir" (#compartir, from Mi resultado): preview, variant/format selectors, native share,
// WhatsApp and download. The card's texts come from src/share (pure, tested) over Game.affinity();
// this file only draws them on a canvas. Default card: no parties; the ranking only if picked.
// The image is made on the phone and never uploaded; the link is always the clean ?r=reto.
import type { Game } from '../game';
import {
  FORMATS,
  SHARE_TEXT,
  cardContent,
  altText,
  variantAvailable,
  type CardContent,
  type Style,
  type Format,
  type Variant,
} from '../share';
import { trackShare } from './analytics';
import { button, h } from './dom';


// Card colours: the v2 identity (cream, ink, petrol). Never a party colour.
const CREAM = '#f7f3ed';
const INK = '#04313e';
const GREY = '#4c595d'; // AA on cream
const ACCENT = '#0e5167';
const TRACK = '#d7e5ea';
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const SIZE: Record<Style, { px: number; weight: number; color: string; before: number }> = {
  header: { px: 40, weight: 700, color: ACCENT, before: 0 },
  huge: { px: 170, weight: 800, color: INK, before: 40 },
  lead: { px: 84, weight: 800, color: INK, before: 40 },
  normal: { px: 50, weight: 400, color: INK, before: 24 },
  label: { px: 66, weight: 800, color: INK, before: 40 },
  highlight: { px: 50, weight: 700, color: INK, before: 48 },
  closing: { px: 46, weight: 400, color: INK, before: 0 },
  web: { px: 54, weight: 800, color: ACCENT, before: 16 },
  footer: { px: 30, weight: 400, color: GREY, before: 28 },
  warning: { px: 46, weight: 700, color: INK, before: 0 },
};

function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const rows: string[] = [];
  let row = '';
  for (const word of text.split(' ')) {
    const test = row ? `${row} ${word}` : word;
    if (row && ctx.measureText(test).width > width) {
      rows.push(row);
      row = word;
    } else row = test;
  }
  if (row) rows.push(row);
  return rows;
}

/** Three face-down cards A, B, C; B is flipped (tilted, accent border). */
function illustration(ctx: CanvasRenderingContext2D, cx: number, y: number, s: number): number {
  const w = 170 * s, height = 236 * s, gap = 36 * s;
  ['A', 'B', 'C'].forEach((letter, i) => {
    const x = cx + (i - 1) * (w + gap);
    ctx.save();
    ctx.translate(x, y + height / 2);
    if (i === 1) ctx.rotate(-0.14);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = i === 1 ? ACCENT : INK;
    ctx.lineWidth = (i === 1 ? 10 : 6) * s;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -height / 2, w, height, 22 * s);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = i === 1 ? ACCENT : INK;
    ctx.font = `800 ${110 * s}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 0, 6 * s);
    ctx.restore();
  });
  return height + 40 * s;
}

/** Draws the card. Lines up to the closing block flow from the top; the closing block sits at the bottom. */
export function drawCard(canvas: HTMLCanvasElement, c: CardContent, format: Format): void {
  const { width, height } = FORMATS[format];
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const margin = 90;
  const usable = width - 2 * margin;
  const cut = c.lines.findIndex((l) => l.style === 'closing' || l.style === 'warning');
  const above = c.lines.slice(0, cut < 0 ? c.lines.length : cut);
  const below = cut < 0 ? [] : c.lines.slice(cut);
  const withIllustration = format === 'story' || c.bars.length === 0;

  // Measure-only pass returns the height; shrink until both blocks fit (the square format is tight).
  const render = (s: number, draw: boolean): number => {
    if (draw) {
      ctx.fillStyle = CREAM;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const layoutBlock = (lines: typeof above, y0: number, draw: boolean, extras = false): number => {
      let y = y0;
      lines.forEach((l, i) => {
        const t = SIZE[l.style];
        ctx.font = `${t.weight} ${t.px * s}px ${FONT}`;
        if (i > 0) y += t.before * s;
        for (const row of wrapText(ctx, l.text, usable)) {
          if (draw) {
            ctx.fillStyle = t.color;
            ctx.fillText(row, margin, y);
          }
          y += t.px * s * 1.2;
        }
        if (extras && i === 0) {
          // After the header: the A/B/C illustration and, in the ranking variant, the top-3 bars.
          y += 50 * s;
          if (withIllustration) {
            const illustrationHeight = 236 * s + 40 * s;
            if (draw) illustration(ctx, width / 2, y, format === 'story' ? s : s * 0.7);
            y += format === 'story' ? illustrationHeight : illustrationHeight * 0.7;
          }
          for (const b of c.bars) {
            ctx.font = `700 ${46 * s}px ${FONT}`;
            if (draw) {
              ctx.fillStyle = INK;
              ctx.fillText(b.text, margin, y);
            }
            y += 46 * s * 1.3;
            if (draw) {
              ctx.fillStyle = TRACK;
              ctx.fillRect(margin, y, usable, 30 * s);
              ctx.fillStyle = ACCENT;
              ctx.fillRect(margin, y, (usable * Math.max(0, Math.min(100, b.percent))) / 100, 30 * s);
            }
            y += 30 * s + 34 * s;
          }
        }
      });
      return y - y0;
    };
    const heightAbove = layoutBlock(above, margin, draw, true);
    const heightBelow = layoutBlock(below, 0, false);
    if (draw) layoutBlock(below, height - margin - heightBelow, true);
    return heightAbove + heightBelow + 60 * s;
  };
  let s = 1;
  while (s > 0.5 && render(s, false) > height - 2 * margin) s *= 0.93;
  render(s, true);
}

const canvasToBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name }) as HTMLAnchorElement;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface ShareActions {
  /** Extra hook after a share actually happened (analytics is sent here already). Never receives the card's content. */
  shared?(medium: 'native' | 'whatsapp' | 'download'): void;
}

export function shareView(game: Game, actions: ShareActions = {}): HTMLElement {
  const r = game.affinity();
  const title = h('h1', { tabindex: '-1' }, 'Compartir');
  if (!variantAvailable(r, 'no-parties'))
    return h('section', { class: 'share' }, title, h('p', {}, 'Termina y destapa una temática para tener algo que compartir.'),
      h('a', { href: '#tematicas', class: 'primary link-button' }, 'Ver las temáticas'));

  let variant: Variant = 'no-parties';
  let format: Format = 'story';
  const canvas = h('canvas', { class: 'share-card', role: 'img' }) as HTMLCanvasElement;
  const warning = h('p', { class: 'note', role: 'status' });
  const state = h('p', { class: 'grey', role: 'status' });
  const name = () => `29n-${variant}-${format}.png`;
  // A share or download actually happened: analytics gets the card type only (#13), never its content.
  const shared = (medium: 'native' | 'whatsapp' | 'download') => {
    trackShare(variant === 'ranking' ? 'ranking' : 'neutral');
    actions.shared?.(medium);
  };
  const repaint = () => {
    const c = cardContent(r, variant);
    drawCard(canvas, c, format);
    canvas.setAttribute('aria-label', altText(c));
    canvas.dataset.format = format;
    warning.textContent = variant === 'ranking' ? 'Tu afinidad política es un dato personal. Compártela solo si quieres.' : '';
  };

  const group = <T extends string>(legend: string, groupName: string, options: [T, string][], initial: T, onChange: (v: T) => void) =>
    h('fieldset', { class: 'selector' },
      h('legend', {}, legend),
      ...options.map(([value, text]) => {
        const id = `${groupName}-${value}`;
        const input = h('input', { type: 'radio', name: groupName, id, value: value }) as HTMLInputElement;
        input.checked = value === initial;
        input.addEventListener('change', () => {
          onChange(value);
          repaint();
        });
        return h('label', { for: id, class: 'option' }, input, ` ${text}`);
      }));

  const variants: [Variant, string][] = [['no-parties', 'Sin partidos']];
  if (variantAvailable(r, 'ranking')) variants.push(['ranking', 'Con mi ranking']);

  const nativeShare = async () => {
    state.textContent = '';
    const blob = await canvasToBlob(canvas);
    const file = blob ? new File([blob], name(), { type: 'image/png' }) : null;
    const data: ShareData = { text: SHARE_TEXT, ...(file ? { files: [file] } : {}) };
    if (file && navigator.canShare?.(data)) {
      try {
        await navigator.share(data);
        shared('native');
      } catch {
        /* cancelled by the user */
      }
      return;
    }
    // No Web Share with files: download the image and copy the text.
    if (blob) download(blob, name());
    const copied = await copyText(SHARE_TEXT);
    state.textContent = copied ? 'Texto copiado. Pégalo donde quieras.' : `Imagen guardada. Texto para pegar: ${SHARE_TEXT}`;
    shared('download');
  };
  const saveImage = async () => {
    const blob = await canvasToBlob(canvas);
    if (blob) {
      download(blob, name());
      state.textContent = 'Imagen guardada.';
      shared('download');
    }
  };
  const whatsapp = (text: string, count: boolean) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    if (count) shared('whatsapp');
  };

  const view = h('section', { class: 'share' },
    title,
    h('div', { class: 'preview' }, canvas),
    group('¿Qué quieres compartir?', 'variant', variants, variant, (v) => (variant = v)),
    warning,
    group('Formato', 'formato', [['story', FORMATS.story.name], ['square', FORMATS.square.name]], format, (f) => (format = f)),
    h('div', { class: 'actions' },
      button('Enviar por WhatsApp', 'primary', () => whatsapp(SHARE_TEXT, true)),
      button('Compartir en otras apps', 'secondary', () => void nativeShare()),
      button('Guardar imagen', 'secondary', () => void saveImage()),
    ),
    state,
    h('p', { class: 'grey' }, 'La imagen se crea en tu móvil. No subimos nada.'),
    h('p', {}, h('a', { href: '#resultado' }, 'Volver a mi resultado')),
    button('Guardar el enlace para seguir luego', 'text-link', () => whatsapp(`Para seguir en este mismo navegador: https://29n.jorgemasta.com`, false)),
  );
  repaint();
  return view;
}

/** "Alguien te reta: …", shown above the first screen's headline when opened from a shared link. */
export function challengeNotice(text: string): HTMLElement {
  return h('p', { class: 'challenge-notice', role: 'note' }, text);
}
