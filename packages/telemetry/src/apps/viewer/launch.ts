// oxlint-disable-next-line montflow/no-node-platform-imports -- the launcher is the viewer's composition root: it starts the on-demand child process and opens the user's browser.
import { fileURLToPath } from 'node:url';

/** What `/telemetry` needs to start the viewer. */
export interface LaunchOptions {
  readonly directory: string;
  readonly sessionID?: string;
}

const openInBrowser = (url: string): void => {
  const [command, ...args] =
    process.platform === 'darwin'
      ? ['open', url]
      : process.platform === 'win32'
        ? ['cmd', '/c', 'start', '', url]
        : ['xdg-open', url];
  try {
    Bun.spawn({
      cmd: [command ?? 'xdg-open', ...args],
      stdout: 'ignore',
      stderr: 'ignore',
    }).unref();
  } catch {
    // No opener is fine: the URL is printed for the user to click.
  }
};

/**
 * Start one viewer process on a random loopback port, wait for the URL it
 * prints, then hand that URL to the platform opener. A failure here must never
 * surface into the session; `/telemetry` simply does nothing.
 */
export const launch = async (options: LaunchOptions): Promise<void> => {
  try {
    const main = fileURLToPath(new URL('./main.ts', import.meta.url));
    const runtime = Bun.which('bun') ?? 'bun';
    const child = Bun.spawn({
      cmd: [
        runtime,
        main,
        '--directory',
        options.directory,
        ...(options.sessionID === undefined ? [] : ['--session', options.sessionID]),
      ],
      stdout: 'pipe',
      stderr: 'ignore',
      stdin: 'ignore',
    });
    const stdout = child.stdout;
    if (stdout === undefined) return;
    const reader = stdout.getReader();
    const first = await reader.read();
    reader.releaseLock();
    const url = new TextDecoder().decode(first.value).split('\n')[0]?.trim();
    if (url !== undefined && url.startsWith('http://127.0.0.1:')) openInBrowser(url);
  } catch {
    // Best effort by design.
  }
};
