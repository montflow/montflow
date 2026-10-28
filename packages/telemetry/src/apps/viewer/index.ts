/** Open the viewer URL with the platform's default browser. */
export const open = (url: string): void => {
  let command = 'xdg-open';
  let args: string[] = [url];
  if (process.platform === 'darwin') {
    command = 'open';
  } else if (process.platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  }
  try {
    Bun.spawn({
      cmd: [command, ...args],
      stdout: 'ignore',
      stderr: 'ignore',
      stdin: 'ignore',
    }).unref();
  } catch {
    // No opener is fine: the URL is printed for the user to click.
  }
};
