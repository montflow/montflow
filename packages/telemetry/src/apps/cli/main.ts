#!/usr/bin/env bun
import { resolve } from '../../modules/config/index.js';
import * as Fold from '../../modules/fold/index.js';
import { file } from '../../modules/path/index.js';
import { homedir } from '../../modules/platform/index.js';
import { start } from '../../modules/viewer/index.js';
import { open } from '../viewer/index.js';

const argOf = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`mf-telemetry [--directory <dir>] [--session <id>] [--no-open]

Open the local session trace viewer. Without --session the newest folded
session is used. --no-open only prints the URL.`);
} else {
  const xdg = Bun.env['XDG_DATA_HOME'];
  const environment =
    xdg === undefined ? { HOME: homedir() } : { HOME: homedir(), XDG_DATA_HOME: xdg };
  const settings = resolve({ directory: argOf('--directory') }, environment);
  const database = file(settings.directory, 'telemetry.db');
  try {
    await Fold.run({ directory: settings.directory, database });
  } catch {
    // An unreadable derived DB is a viewer concern; the CLI still opens the empty state.
  }
  const requested = argOf('--session');
  const sessions = requested === undefined ? await Fold.sessions(database) : [];
  const sessionID = requested ?? sessions[0]?.sessionID;
  if (sessionID === undefined) {
    console.error(`mf-telemetry: no sessions in ${settings.directory}`);
    process.exitCode = 1;
  } else {
    const viewer = await start({ directory: settings.directory, sessionID });
    const url = `${viewer.url}?session=${encodeURIComponent(sessionID)}`;
    console.log(url);
    if (!process.argv.includes('--no-open')) open(url);
    const close = (): void => {
      void viewer.stop();
    };
    process.on('SIGINT', close);
    process.on('SIGTERM', close);
    await viewer.done;
  }
}
