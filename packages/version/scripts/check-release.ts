#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Release guard: the five `mf-*` CLIs must share one version, stay in one
 * changesets fixed group, and keep their release-versus-checkout note.
 *
 * Run from the repo root (`mf:check:release`) or with `--root <dir>`. Exits 1
 * with one line per drift so the failure names the file to fix.
 */

import { CHANGELOG_MARKER, CLIS } from '../src/modules/release-guard/index.js';

const rootArg = process.argv.find((arg) => arg === '--root' || arg.startsWith('--root='));
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};
const rootValue = (() => {
  if (rootArg === undefined) return process.cwd();
  if (rootArg.startsWith('--root=')) {
    const value = rootArg.slice('--root='.length);
    return value === '' ? fail('--root= needs a directory') : value;
  }
  const value = process.argv[process.argv.indexOf('--root') + 1];
  if (value === undefined || value.startsWith('-')) {
    return fail('--root needs a directory');
  }
  return value;
})();
const root = resolve(rootValue);

const failures: string[] = [];

const manifestPath = (name: string): string =>
  join(root, 'packages', name.replace('@montflow/', ''), 'package.json');

const readJson = (file: string): Record<string, unknown> => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch (cause) {
    failures.push(`cannot read ${file}: ${String(cause)}`);
    return {};
  }
};

const versions = new Map<string, string>();
for (const name of CLIS) {
  const manifest = readJson(manifestPath(name));
  if (manifest.name !== name) {
    failures.push(`${name}: package.json name is '${String(manifest.name)}'`);
  }
  const version = manifest.version;
  if (typeof version !== 'string') {
    failures.push(`${name}: package.json has no version string`);
    continue;
  }
  if (manifest.private !== true) {
    failures.push(`${name}: package.json must keep "private": true (never publish to npm)`);
  }
  versions.set(name, version);
}

const distinct = new Set(versions.values());
if (distinct.size > 1) {
  failures.push(
    `the five CLI versions disagree: ${[...versions.entries()]
      .map(([name, version]) => `${name}=${version}`)
      .join(', ')}`,
  );
}

const config = readJson(join(root, '.changeset', 'config.json'));
const fixedGroups = Array.isArray(config.fixed) ? config.fixed : [];
if (fixedGroups.length !== 1 || !Array.isArray(fixedGroups[0])) {
  failures.push('.changeset/config.json: expected exactly one fixed group');
}
const fixed = Array.isArray(fixedGroups[0]) ? fixedGroups[0] : [];
if (fixed.length !== CLIS.length) {
  failures.push('.changeset/config.json: the fixed group must hold exactly the five CLIs');
}
for (const name of CLIS) {
  if (!fixed.includes(name)) failures.push(`.changeset/config.json: fixed group is missing ${name}`);
  const ignored = Array.isArray(config.ignore) ? config.ignore : [];
  if (ignored.includes(name)) failures.push(`.changeset/config.json: ignore still lists ${name}`);
}
const privatePackages = config.privatePackages;
if (
  typeof privatePackages !== 'object' ||
  privatePackages === null ||
  (privatePackages as Record<string, unknown>).version !== true ||
  (privatePackages as Record<string, unknown>).tag !== true
) {
  failures.push('.changeset/config.json: privatePackages must be { version: true, tag: true }');
}
if (fixed.includes('@montflow/core')) {
  failures.push('.changeset/config.json: @montflow/core must not join the CLI fixed group');
}

for (const name of CLIS) {
  const changelog = join(root, 'packages', name.replace('@montflow/', ''), 'CHANGELOG.md');
  if (!existsSync(changelog)) {
    failures.push(`${name}: CHANGELOG.md is missing`);
    continue;
  }
  if (!readFileSync(changelog, 'utf8').includes(CHANGELOG_MARKER)) {
    failures.push(`${name}: CHANGELOG.md does not state the release-versus-checkout model`);
  }
}

if (failures.length > 0) {
  console.error(`release guard failed (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `release guard: ${CLIS.length} CLIs at ${[...distinct][0] ?? 'unknown'}, one fixed group, tags on`,
  );
}
