// @ts-check
import { defineConfig } from 'astro/config';

// Static site; Cloudflare serves dist/ as Worker static assets (see wrangler.jsonc).
// The free-question endpoint (#15) will add the Cloudflare adapter.
export default defineConfig({
  site: 'https://29n.jorgemasta.com',
  output: 'static',
});
