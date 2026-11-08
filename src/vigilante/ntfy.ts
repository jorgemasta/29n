// Phone notification through ntfy (https://ntfy.sh, or a self-hosted server): the maintainer
// subscribes to a secret topic in the ntfy app. Needs NTFY_TOPIC; NTFY_TOKEN only for protected
// topics/servers; NTFY_SERVER defaults to https://ntfy.sh.
import type { Aviso } from './index';

export function crearAvisoNtfy(config: {
  topic: string;
  token?: string;
  servidor?: string;
  fetch?: typeof fetch;
}): (aviso: Aviso) => Promise<void> {
  const f = config.fetch ?? fetch;
  const servidor = (config.servidor ?? 'https://ntfy.sh').replace(/\/$/, '');
  return async (aviso) => {
    // JSON publishing (POST to the server root): UTF-8 title/message without header encoding.
    const r = await f(servidor, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify({
        topic: config.topic,
        title: aviso.titulo,
        message: aviso.mensaje,
        priority: aviso.tipo === 'fallo' ? 4 : 3,
        tags: [aviso.tipo === 'fallo' ? 'warning' : 'white_check_mark'],
      }),
    });
    if (!r.ok) throw new Error(`ntfy respondió ${r.status}`);
  };
}
