// Phone notification through ntfy (https://ntfy.sh, or a self-hosted server): the maintainer
// subscribes to a secret topic in the ntfy app. Needs NTFY_TOPIC; NTFY_TOKEN only for protected
// topics/servers; NTFY_SERVER defaults to https://ntfy.sh.
import type { Alert } from './index';

export function createNtfyAlert(config: {
  topic: string;
  token?: string;
  server?: string;
  fetch?: typeof fetch;
}): (alert: Alert) => Promise<void> {
  const f = config.fetch ?? fetch;
  const server = (config.server ?? 'https://ntfy.sh').replace(/\/$/, '');
  return async (alert) => {
    // JSON publishing (POST to the server root): UTF-8 title/message without header encoding.
    const r = await f(server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify({
        topic: config.topic,
        title: alert.title,
        message: alert.message,
        priority: alert.type === 'failure' ? 4 : 3,
        tags: [alert.type === 'failure' ? 'warning' : 'white_check_mark'],
      }),
    });
    if (!r.ok) throw new Error(`ntfy respondió ${r.status}`);
  };
}
