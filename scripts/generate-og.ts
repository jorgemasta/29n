// Generates public/og.png, the 1200×630 link-preview image: three anonymous approaches A, B and C
// (B chosen) plus "Elecciones generales · 29 de noviembre", in the v2 identity (cream, ink, petrol,
// flat white cards). No party colours. Alt text: OG.image.alt.
// Run: npm run og (uses sharp, which ships with Astro, to rasterise an SVG).
import sharp from 'sharp';
import { OG } from '../src/share';

const { width, height } = OG.image;
const CREAM = '#F7F3ED';
const INK = '#04313E';
const PETROL = '#0E5167';
const PETROL_DARK = '#083D4E';
const AQUA = '#D7E5EA';
const TRACK = '#EBEEEF';
const font = 'font-family="DejaVu Sans, Helvetica, Arial, sans-serif"';

/** One approach card: letter square and grey lines standing for its (unsigned) text. */
const approach = (letter: string, y: number, chosen: boolean) => `
  <g transform="translate(250 ${y})">
    <rect x="0" y="0" width="700" height="112" rx="12" fill="#fff" stroke="${chosen ? PETROL : '#fff'}" stroke-width="5"/>
    <rect x="28" y="28" width="56" height="56" rx="10" fill="${chosen ? PETROL : AQUA}"/>
    <text x="56" y="70" text-anchor="middle" ${font} font-weight="bold" font-size="34" fill="${chosen ? '#fff' : PETROL_DARK}">${letter}</text>
    <rect x="112" y="32" width="${chosen ? 420 : 470}" height="18" rx="9" fill="${INK}" opacity="0.85"/>
    <rect x="112" y="64" width="${chosen ? 520 : 380}" height="14" rx="7" fill="${TRACK}"/>
  </g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${CREAM}"/>
  <g transform="translate(600 92)">
    <circle cx="-78" cy="-20" r="24" fill="${AQUA}"/>
    <path d="M -78 -44 A 24 24 0 0 1 -78 4 Z" fill="${PETROL}"/>
    <text x="-40" y="0" ${font} font-weight="bold" font-size="60" fill="${INK}">29N</text>
  </g>
  ${approach('A', 140, false)}${approach('B', 268, true)}${approach('C', 396, false)}
  <text x="600" y="580" text-anchor="middle" ${font} font-weight="bold" font-size="42" fill="${INK}">Elecciones generales · 29 de noviembre</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile('public/og.png');
console.log(`public/og.png ${width}×${height}`);
