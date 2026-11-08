// @ts-check
import { defineConfig } from 'astro/config';
import { lanzamiento } from './src/lanzamiento/integracion.ts';

// Static site; Cloudflare serves dist/ as Worker static assets (see wrangler.jsonc).
// The /api/* endpoints are a plain Worker (src/worker), no Astro adapter needed.
// `lanzamiento`: production (PRODUCCION=1) refuses test data and strips non-public files (docs/deploy.md).
export default defineConfig({
  site: 'https://29n.jorgemasta.com',
  output: 'static',
  integrations: [lanzamiento()],
});
