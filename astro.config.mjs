// @ts-check
import { defineConfig } from 'astro/config';
import { launch } from './src/launch/integration.ts';

// Static site; Cloudflare serves dist/ as Worker static assets (see wrangler.jsonc).
// The /api/* endpoints are a plain Worker (src/worker), no Astro adapter needed.
// `launch`: production (PRODUCTION=1) refuses test data and strips non-public files (docs/deploy.md).
export default defineConfig({
  site: 'https://29n.jorgemasta.com',
  output: 'static',
  integrations: [launch()],
});
