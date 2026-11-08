// Generates public/og.png, the 1200×630 link-preview image (ux-spec screen 1): three face-down cards
// A, B and C plus "Elecciones generales · 29 de noviembre", cream background, no party colours.
// Run: npm run og (uses sharp, which ships with Astro, to rasterise an SVG).
import sharp from 'sharp';
import { OG } from '../src/compartir';

const { ancho, alto } = OG.imagen;
const CREMA = '#f6f1e6';
const TINTA = '#141414';
const ACENTO = '#0f5c66';
const fuente = "font-family=\"DejaVu Sans, Helvetica, Arial, sans-serif\"";

const tarjeta = (letra: string, x: number, giro: number) => `
  <g transform="translate(${x} 330) rotate(${giro})">
    <rect x="-95" y="-130" width="190" height="260" rx="24" fill="#fff" stroke="${TINTA}" stroke-width="7"/>
    <rect x="-75" y="-110" width="150" height="220" rx="14" fill="none" stroke="${ACENTO}" stroke-width="3" stroke-dasharray="10 8"/>
    <text x="0" y="40" text-anchor="middle" ${fuente} font-weight="bold" font-size="120" fill="${TINTA}">${letra}</text>
  </g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">
  <rect width="${ancho}" height="${alto}" fill="${CREMA}"/>
  <text x="600" y="96" text-anchor="middle" ${fuente} font-weight="bold" font-size="64" fill="${ACENTO}">29N</text>
  ${tarjeta('A', 360, -6)}${tarjeta('B', 600, 0)}${tarjeta('C', 840, 6)}
  <text x="600" y="565" text-anchor="middle" ${fuente} font-weight="bold" font-size="46" fill="${TINTA}">Elecciones generales · 29 de noviembre</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile('public/og.png');
console.log(`public/og.png ${ancho}×${alto}`);
