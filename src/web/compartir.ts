// Screen 11 "Compartir": preview, variant/format selectors, native share, WhatsApp and download.
// The card's texts come from src/compartir (pure, tested); this file only draws them on a canvas.
// The image is made on the phone and never uploaded; the link is always the clean ?r=reto.
import type { Partida } from '../juego';
import {
  FORMATOS,
  TEXTO_COMPARTIR,
  contenidoTarjeta,
  textoAlternativo,
  varianteDisponible,
  type ContenidoTarjeta,
  type Estilo,
  type Formato,
  type Variante,
} from '../compartir';
import { boton } from './resultado';

type Hijo = Node | string | null | undefined | false;
function h(tag: string, attrs: Record<string, string> = {}, ...hijos: Hijo[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of hijos) if (c) el.append(c);
  return el;
}

// Card colours: cream background, black ink, the app's petrol accent. Never a party colour.
const CREMA = '#f6f1e6';
const TINTA = '#141414';
const GRIS = '#4a4a4a'; // AA on cream
const ACENTO = '#0f5c66';
const FUENTE = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const TAMANO: Record<Estilo, { px: number; peso: number; color: string; antes: number }> = {
  cabecera: { px: 40, peso: 700, color: ACENTO, antes: 0 },
  enorme: { px: 170, peso: 800, color: TINTA, antes: 40 },
  normal: { px: 50, peso: 400, color: TINTA, antes: 24 },
  etiqueta: { px: 66, peso: 800, color: TINTA, antes: 40 },
  destacado: { px: 50, peso: 700, color: TINTA, antes: 48 },
  cierre: { px: 46, peso: 400, color: TINTA, antes: 0 },
  web: { px: 54, peso: 800, color: ACENTO, antes: 16 },
  pie: { px: 30, peso: 400, color: GRIS, antes: 28 },
  aviso: { px: 46, peso: 700, color: TINTA, antes: 0 },
};

function partir(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const filas: string[] = [];
  let fila = '';
  for (const palabra of texto.split(' ')) {
    const prueba = fila ? `${fila} ${palabra}` : palabra;
    if (fila && ctx.measureText(prueba).width > ancho) {
      filas.push(fila);
      fila = palabra;
    } else fila = prueba;
  }
  if (fila) filas.push(fila);
  return filas;
}

/** Three face-down cards A, B, C; B is flipped (tilted, accent border). */
function ilustracion(ctx: CanvasRenderingContext2D, cx: number, y: number, s: number): number {
  const w = 170 * s, alto = 236 * s, hueco = 36 * s;
  ['A', 'B', 'C'].forEach((letra, i) => {
    const x = cx + (i - 1) * (w + hueco);
    ctx.save();
    ctx.translate(x, y + alto / 2);
    if (i === 1) ctx.rotate(-0.14);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = i === 1 ? ACENTO : TINTA;
    ctx.lineWidth = (i === 1 ? 10 : 6) * s;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -alto / 2, w, alto, 22 * s);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = i === 1 ? ACENTO : TINTA;
    ctx.font = `800 ${110 * s}px ${FUENTE}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letra, 0, 6 * s);
    ctx.restore();
  });
  return alto + 40 * s;
}

/** Draws the card. Lines up to the closing block flow from the top; the closing block sits at the bottom. */
export function dibujarTarjeta(canvas: HTMLCanvasElement, c: ContenidoTarjeta, formato: Formato): void {
  const { ancho, alto } = FORMATOS[formato];
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const margen = 90;
  const util = ancho - 2 * margen;
  const corte = c.lineas.findIndex((l) => l.estilo === 'cierre' || l.estilo === 'aviso');
  const arriba = c.lineas.slice(0, corte < 0 ? c.lineas.length : corte);
  const abajo = corte < 0 ? [] : c.lineas.slice(corte);
  const conIlustracion = formato === 'historia' || c.barras.length === 0;

  // Measure-only pass returns the height; shrink until both blocks fit (the square format is tight).
  const pintar = (s: number, dibujar: boolean): number => {
    if (dibujar) {
      ctx.fillStyle = CREMA;
      ctx.fillRect(0, 0, ancho, alto);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const bloque = (lineas: typeof arriba, y0: number, dibujar: boolean, extras = false): number => {
      let y = y0;
      lineas.forEach((l, i) => {
        const t = TAMANO[l.estilo];
        ctx.font = `${t.peso} ${t.px * s}px ${FUENTE}`;
        if (i > 0) y += t.antes * s;
        for (const fila of partir(ctx, l.texto, util)) {
          if (dibujar) {
            ctx.fillStyle = t.color;
            ctx.fillText(fila, margen, y);
          }
          y += t.px * s * 1.2;
        }
        if (extras && i === 0) {
          // After the header: the A/B/C illustration and, in the ranking variant, the top-3 bars.
          y += 50 * s;
          if (conIlustracion) {
            const altoIl = 236 * s + 40 * s;
            if (dibujar) ilustracion(ctx, ancho / 2, y, formato === 'historia' ? s : s * 0.7);
            y += formato === 'historia' ? altoIl : altoIl * 0.7;
          }
          for (const b of c.barras) {
            ctx.font = `700 ${46 * s}px ${FUENTE}`;
            if (dibujar) {
              ctx.fillStyle = TINTA;
              ctx.fillText(b.texto, margen, y);
            }
            y += 46 * s * 1.3;
            if (dibujar) {
              ctx.fillStyle = '#ddd6c8';
              ctx.fillRect(margen, y, util, 30 * s);
              ctx.fillStyle = ACENTO;
              ctx.fillRect(margen, y, (util * Math.max(0, Math.min(100, b.porcentaje))) / 100, 30 * s);
            }
            y += 30 * s + 34 * s;
          }
        }
      });
      return y - y0;
    };
    const altoArriba = bloque(arriba, margen, dibujar, true);
    const altoAbajo = bloque(abajo, 0, false);
    if (dibujar) bloque(abajo, alto - margen - altoAbajo, true);
    return altoArriba + altoAbajo + 60 * s;
  };
  let s = 1;
  while (s > 0.5 && pintar(s, false) > alto - 2 * margen) s *= 0.93;
  pintar(s, true);
}

const aBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));

function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nombre }) as HTMLAnchorElement;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

export interface AccionesCompartir {
  /** Hook for analytics (#13): how it was shared. Never receives the card's content. */
  compartido?(medio: 'nativo' | 'whatsapp' | 'descarga'): void;
}

export function vistaCompartir(partida: Partida, acciones: AccionesCompartir = {}): HTMLElement {
  const r = partida.resultado();
  const titulo = h('h1', { tabindex: '-1' }, 'Compartir');
  if (!varianteDisponible(r, 'sin-partidos'))
    return h('section', { class: 'compartir' }, titulo, h('p', {}, 'Haz 5 temas para tener algo que compartir.'),
      h('a', { href: '#temas', class: 'principal boton-enlace' }, 'Ver los temas'));

  let variante: Variante = 'sin-partidos';
  let formato: Formato = 'historia';
  const canvas = h('canvas', { class: 'tarjeta-compartir', role: 'img' }) as HTMLCanvasElement;
  const aviso = h('p', { class: 'nota', role: 'status' });
  const estado = h('p', { class: 'gris', role: 'status' });
  const nombre = () => `29n-${variante}-${formato}.png`;
  const repintar = () => {
    const c = contenidoTarjeta(r, variante);
    dibujarTarjeta(canvas, c, formato);
    canvas.setAttribute('aria-label', textoAlternativo(c));
    canvas.dataset.formato = formato;
    aviso.textContent = variante === 'ranking' ? 'Tu afinidad política es un dato personal. Compártela solo si quieres.' : '';
  };

  const grupo = <T extends string>(leyenda: string, nombreGrupo: string, opciones: [T, string][], inicial: T, alCambiar: (v: T) => void) =>
    h('fieldset', { class: 'selector' },
      h('legend', {}, leyenda),
      ...opciones.map(([valor, texto]) => {
        const id = `${nombreGrupo}-${valor}`;
        const input = h('input', { type: 'radio', name: nombreGrupo, id, value: valor }) as HTMLInputElement;
        input.checked = valor === inicial;
        input.addEventListener('change', () => {
          alCambiar(valor);
          repintar();
        });
        return h('label', { for: id, class: 'opcion' }, input, ` ${texto}`);
      }));

  const variantes: [Variante, string][] = [['sin-partidos', 'Sin partidos']];
  if (varianteDisponible(r, 'ranking')) variantes.push(['ranking', 'Con mi ranking']);

  const compartirNativo = async () => {
    estado.textContent = '';
    const blob = await aBlob(canvas);
    const archivo = blob ? new File([blob], nombre(), { type: 'image/png' }) : null;
    const datos: ShareData = { text: TEXTO_COMPARTIR, ...(archivo ? { files: [archivo] } : {}) };
    if (archivo && navigator.canShare?.(datos)) {
      try {
        await navigator.share(datos);
        acciones.compartido?.('nativo');
      } catch {
        /* cancelled by the user */
      }
      return;
    }
    // No Web Share with files: download the image and copy the text.
    if (blob) descargar(blob, nombre());
    const copiado = await copiar(TEXTO_COMPARTIR);
    estado.textContent = copiado ? 'Texto copiado. Pégalo donde quieras.' : `Imagen guardada. Texto para pegar: ${TEXTO_COMPARTIR}`;
    acciones.compartido?.('descarga');
  };
  const guardarImagen = async () => {
    const blob = await aBlob(canvas);
    if (blob) {
      descargar(blob, nombre());
      estado.textContent = 'Imagen guardada.';
      acciones.compartido?.('descarga');
    }
  };
  const whatsapp = (texto: string, contar: boolean) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
    if (contar) acciones.compartido?.('whatsapp');
  };

  const vista = h('section', { class: 'compartir' },
    titulo,
    h('div', { class: 'vista-previa' }, canvas),
    grupo('¿Qué quieres compartir?', 'variante', variantes, variante, (v) => (variante = v)),
    aviso,
    grupo('Formato', 'formato', [['historia', FORMATOS.historia.nombre], ['cuadrada', FORMATOS.cuadrada.nombre]], formato, (f) => (formato = f)),
    h('div', { class: 'acciones' },
      boton('Enviar por WhatsApp', 'principal', () => whatsapp(TEXTO_COMPARTIR, true)),
      boton('Compartir en otras apps', 'secundario', () => void compartirNativo()),
      boton('Guardar imagen', 'secundario', () => void guardarImagen()),
    ),
    estado,
    h('p', { class: 'gris' }, 'La imagen se crea en tu móvil. No subimos nada.'),
    boton('Guardar el enlace para seguir luego', 'enlace', () => whatsapp(`Para seguir en este mismo navegador: https://29n.jorgemasta.com`, false)),
  );
  repintar();
  return vista;
}

/** "Alguien te reta: …", shown above the first screen's headline when opened from a shared link. */
export function avisoReto(texto: string): HTMLElement {
  return h('p', { class: 'aviso-reto', role: 'note' }, texto);
}
