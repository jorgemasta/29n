// Tiny Worker in front of the static assets, only for "/" (wrangler.jsonc run_worker_first):
// a shared link /?r=reto gets the challenge og:title, so the WhatsApp/X/Telegram preview changes.
// Nothing about the user is in the link; everything else is served untouched from dist/.
// #15 (Cloudflare adapter) must keep this behaviour when it replaces `main`.
import { aplicarReto, esReto } from '../src/compartir';

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const res = await env.ASSETS.fetch(req);
    if (!esReto(new URL(req.url).search) || !res.headers.get('content-type')?.includes('text/html')) return res;
    return new Response(aplicarReto(await res.text()), res);
  },
};
