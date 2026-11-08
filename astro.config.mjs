// @ts-check
import { defineConfig } from 'astro/config';

// Static site; Cloudflare serves dist/ as Worker static assets (see wrangler.jsonc).
// The /api/* endpoints are a plain Worker (src/worker), no Astro adapter needed.
export default defineConfig({
  site: 'https://29n.jorgemasta.com',
  output: 'static',
});
