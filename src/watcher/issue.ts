// Maintainer notice as a GitHub issue (label 'vigilante'), through `gh`. Assigned to the maintainer
// so GitHub notifies them (app / e-mail). Failures stay open until someone looks; publications are
// opened and closed at once, so they notify and leave a log without cluttering the open list.
// The watcher retries crashes every 2 h: a failure whose title already has an open issue is not repeated.
import type { Alert } from './index';

export const WATCHER_LABEL = 'vigilante';

/** `run(args)` runs `gh <args>` and returns stdout. */
export function createIssueAlert(config: { run: (args: string[]) => string; assignee?: string }): (alert: Alert) => Promise<void> {
  const { run, assignee } = config;
  let labelReady = false;
  return async (alert) => {
    if (!labelReady) {
      // `gh issue create --label` fails if the label does not exist; --force makes this idempotent.
      run(['label', 'create', WATCHER_LABEL, '--color', '5319E7', '--description', 'Aviso del vigilante de programas', '--force']);
      labelReady = true;
    }
    if (alert.type === 'failure') {
      const open = JSON.parse(run(['issue', 'list', '--label', WATCHER_LABEL, '--state', 'open', '--limit', '200', '--json', 'title'])) as { title: string }[];
      if (open.some((i) => i.title === alert.title)) return;
    }
    const url = run([
      'issue', 'create',
      '--title', alert.title,
      '--body', `${alert.message}\n\nAbierto automáticamente por \`.github/workflows/watcher.yml\`.`,
      '--label', WATCHER_LABEL,
      ...(assignee ? ['--assignee', assignee] : []),
    ]).trim();
    if (alert.type === 'published') run(['issue', 'close', url, '--reason', 'completed']);
  };
}
