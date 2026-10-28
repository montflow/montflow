/** Open the viewer URL with the platform's default browser. */
export const open = (url: string): void => {
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
      stdin: 'ignore',
    }).unref();
  } catch {
    // No opener is fine: the URL is printed for the user to click.
  }
};
