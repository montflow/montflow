import { start } from '../../modules/viewer/index.js';

const argOf = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
};

const directory = argOf('--directory');
if (directory === undefined) {
  console.error('viewer: --directory is required');
  process.exitCode = 2;
} else {
  interface ViewerArgs {
    directory: string;
    sessionID?: string;
    idleMs?: number;
  }
  const options: ViewerArgs = { directory };
  const sessionID = argOf('--session');
  if (sessionID !== undefined) options.sessionID = sessionID;
  const idleMsRaw = argOf('--idle-ms');
  if (idleMsRaw !== undefined) options.idleMs = Number(idleMsRaw);
  const viewer = await start(options);
  console.log(viewer.url);
  const close = (): void => {
    void viewer.stop();
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
  await viewer.done;
}
