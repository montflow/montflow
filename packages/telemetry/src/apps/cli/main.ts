#!/usr/bin/env bun
/* oxlint-disable montflow/no-node-platform-imports -- the CLI composition root owns terminal confirmation and boots no Effect runtime. */
import { createInterface } from 'node:readline/promises';
/* oxlint-enable montflow/no-node-platform-imports */
import { DEFAULT_RETENTION_DAYS, resolve, retentionFromFile } from '../../modules/config/index.js';
import * as Fold from '../../modules/fold/index.js';
import { file } from '../../modules/path/index.js';
import { homedir } from '../../modules/platform/index.js';
import {
  all,
  olderThan,
  parseDuration,
  session as purgeSession,
} from '../../modules/purge/index.js';
import { start } from '../../modules/viewer/index.js';
import { open } from '../viewer/index.js';

const USAGE = `mf-telemetry [open] [--directory <dir>] [--session <id>] [--no-open]
mf-telemetry delete --all [--yes]
mf-telemetry delete --session <id> [--yes]
mf-telemetry delete --older-than <30d> [--yes]
mf-telemetry cleanup [--older-than <30d>] [--yes]

Open the local session trace viewer. Without --session the newest folded
session is used. Deletion needs --yes when stdin is not a terminal; cleanup
uses config.json retentionDays, then ${DEFAULT_RETENTION_DAYS} days.`;

const args = process.argv.slice(2);
const action =
  args[0] === 'delete' || args[0] === 'cleanup' || args[0] === 'open' ? args[0] : 'open';
const rest = action === 'open' ? args : args.slice(1);

const valueOf = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const has = (name: string): boolean => args.includes(name);
const xdg = Bun.env['XDG_DATA_HOME'];
const environment =
  xdg === undefined ? { HOME: homedir() } : { HOME: homedir(), XDG_DATA_HOME: xdg };
const settings = resolve({ directory: valueOf('--directory') }, environment);
const database = file(settings.directory, 'telemetry.db');
const store = { directory: settings.directory, database };
const clock = (): number => performance.timeOrigin + performance.now();

const confirm = async (question: string): Promise<boolean> => {
  if (has('--yes')) return true;
  if (process.stdin.isTTY !== true) {
    console.error('mf-telemetry: refusing to delete without --yes on a non-interactive stdin');
    return false;
  }
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/iu.test((await reader.question(`${question} [y/N] `)).trim());
  } finally {
    reader.close();
  }
};

const report = (result: {
  files: number;
  lines: number;
  bytes: number;
  database: boolean;
}): void => {
  console.log(
    `removed ${result.files} files, ${result.lines} lines, ${result.bytes} bytes${result.database ? ', database' : ''}`,
  );
};

const durationOf = async (): Promise<number | undefined> => {
  const text = valueOf('--older-than');
  if (text !== undefined) return parseDuration(text);
  const days = retentionFromFile(settings.directory) ?? settings.retentionDays;
  return days * 86_400_000;
};

if (has('--help') || has('-h')) {
  console.log(USAGE);
} else if (action === 'delete' || action === 'cleanup') {
  const allFlag = has('--all');
  const target = valueOf('--session');
  const window = valueOf('--older-than');
  const selectors = [allFlag, target !== undefined, window !== undefined].filter(Boolean).length;
  if ((action === 'delete' && selectors !== 1) || (action === 'cleanup' && allFlag)) {
    console.error(USAGE);
    process.exitCode = 1;
  } else if (action === 'cleanup' && target !== undefined) {
    console.error(USAGE);
    process.exitCode = 1;
  } else if (
    await confirm(
      allFlag
        ? `delete every telemetry file in ${settings.directory}`
        : target !== undefined
          ? `delete session ${target}`
          : `delete telemetry older than ${window ?? 'the configured window'}`,
    )
  ) {
    const result = allFlag
      ? all(store)
      : target !== undefined
        ? purgeSession(store, target)
        : await (async () => {
            const duration = await durationOf();
            if (duration === undefined) {
              console.error(
                `mf-telemetry: invalid window ${String(window)}; use 30d, 12h, 45m, or 10s`,
              );
              process.exitCode = 1;
              return { files: 0, lines: 0, bytes: 0, database: false };
            }
            return olderThan(store, clock() - duration);
          })();
    report(result);
  } else {
    process.exitCode = 1;
  }
} else {
  const requested = valueOf('--session');
  try {
    await Fold.run({ directory: settings.directory, database });
  } catch {
    // An unreadable derived DB is a viewer concern; the CLI still opens the empty state.
  }
  const sessions = requested === undefined ? await Fold.sessions(database) : [];
  const sessionID = requested ?? sessions[0]?.sessionID;
  if (sessionID === undefined) {
    console.error(`mf-telemetry: no sessions in ${settings.directory}`);
    process.exitCode = 1;
  } else {
    const viewer = await start({ directory: settings.directory, sessionID });
    const url = `${viewer.url}?session=${encodeURIComponent(sessionID)}`;
    console.log(url);
    if (!rest.includes('--no-open')) open(url);
    const close = (): void => {
      void viewer.stop();
    };
    process.on('SIGINT', close);
    process.on('SIGTERM', close);
    await viewer.done;
  }
}
