// Generates public/og.png, the 1200×630 link-preview image (ux-spec screen 1): three face-down cards
// A, B and C plus "Elecciones generales · 29 de noviembre", cream background, no party colours.
// Run: npm run og (uses sharp, which ships with Astro, to rasterise an SVG).
import sharp from 'sharp';
import { OG } from '../src/share';

const { width, height } = OG.image;
const CREAM = '#f6f1e6';
const INK = '#141414';
const ACCENT = '#0f5c66';
const source = "font-family=\"DejaVu Sans, Helvetica, Arial, sans-serif\"";

const card = (letter: string, x: number, rotation: number) => `
  <g transform="translate(${x} 330) rotate(${rotation})">
    <rect x="-95" y="-130" width="190" height="260" rx="24" fill="#fff" stroke="${INK}" stroke-width="7"/>
    <rect x="-75" y="-110" width="150" height="220" rx="14" fill="none" stroke="${ACCENT}" stroke-width="3" stroke-dasharray="10 8"/>
    <text x="0" y="40" text-anchor="middle" ${source} font-weight="bold" font-size="120" fill="${INK}">${letter}</text>
  </g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${CREAM}"/>
  <text x="600" y="96" text-anchor="middle" ${source} font-weight="bold" font-size="64" fill="${ACCENT}">29N</text>
  ${card('A', 360, -6)}${card('B', 600, 0)}${card('C', 840, 6)}
  <text x="600" y="565" text-anchor="middle" ${source} font-weight="bold" font-size="46" fill="${INK}">Elecciones generales · 29 de noviembre</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile('public/og.png');
console.log(`public/og.png ${width}×${height}`);
