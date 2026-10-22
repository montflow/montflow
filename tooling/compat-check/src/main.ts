import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkDrift, readHostCatalog, readResolvedVersions } from './modules/drift/index.js';
import {
  checkArtifacts,
  checkBoundary,
  packPlugin,
  pluginPackages,
  type Problem,
} from './modules/index.js';
import { readWorkspace } from './modules/workspace/index.js';

/** Repository root, resolved from this file (tooling/compat-check/src/main.ts). */
const ROOT = path.resolve(import.meta.dir, '../../..');

const fail = (label: string, problems: readonly Problem[]): boolean => {
  for (const problem of problems)
    process.stderr.write(`${label}: ${problem.where} — ${problem.problem}\n`);
  return problems.length === 0;
};

/** Assert declared and resolved pins against the installed host catalog. */
const checkDependencies = (): boolean => {
  const workspace = readWorkspace(ROOT);
  const host = readHostCatalog(workspace);
  const resolved = readResolvedVersions(workspace.lockfile);
  const drift = checkDrift(workspace, host, resolved);
  const ok = fail(
    'drift',
    drift.map((entry) => ({
      where: `${entry.where} ${entry.dependency}`,
      problem: `expected ${entry.expected}, actual ${entry.actual}`,
    })),
  );
  process.stdout.write(
    `compat: host @opencode/plugin ${host.plugin}, effect ${host.effect}, ` +
      `opentui >=${host.peers['@opentui/core'].replace(/^>=\s*/u, '')}, ` +
      `solid-js ${host.peers['solid-js']} — ${workspace.packages.length} packages, ` +
      `${resolved.length} resolved pins, ${drift.length} drift\n`,
  );
  return ok;
};

/** Assert the publish boundary and the Git/local install surface. */
const checkDistribution = async (): Promise<boolean> => {
  const workspace = readWorkspace(ROOT);
  const boundary = checkBoundary(workspace);
  const outRoot = mkdtempSync(path.join(tmpdir(), 'montflow-compat-'));
  try {
    const artifacts = await checkArtifacts(workspace, outRoot);
    const problems = [...boundary, ...artifacts];
    const ok = fail('distribution', problems);
    process.stdout.write(
      `distribution: ${pluginPackages(workspace).length} plugin packages packed, ` +
        `${problems.length} problems\n`,
    );
    return ok;
  } finally {
    rmSync(outRoot, { recursive: true, force: true });
  }
};

/** Emit the published-shape artifacts a Git subpath install reads. */
const pack = async (): Promise<boolean> => {
  const workspace = readWorkspace(ROOT);
  const boundary = checkBoundary(workspace);
  if (!fail('distribution', boundary)) return false;
  const outRoot = path.join(ROOT, 'dist', 'pack');
  mkdirSync(outRoot, { recursive: true });
  const artifacts = await Promise.all(
    pluginPackages(workspace).map((entry) => packPlugin(workspace, entry, outRoot)),
  );
  for (const artifact of artifacts) {
    process.stdout.write(
      `${artifact.package.manifest.name}\n` +
        `  local: ${path.join(ROOT, artifact.package.dir)}\n` +
        `  artifact: ${artifact.dir}\n`,
    );
  }
  process.stdout.write(
    'Commit dist/pack/** on a release ref, then install with ' +
      'git+https://github.com/montflow/montflow.git#<sha>::path:dist/pack/<name>\n',
  );
  return true;
};

const command = Bun.argv[2] ?? 'all';
const run = async (): Promise<boolean> => {
  if (command === 'deps') return checkDependencies();
  if (command === 'distribution') return checkDistribution();
  if (command === 'pack') return pack();
  if (command === 'all') {
    const dependencies = checkDependencies();
    const distribution = await checkDistribution();
    return dependencies && distribution;
  }
  process.stderr.write(`compat-check: unknown command ${command} (deps|distribution|pack|all)\n`);
  return false;
};

process.exitCode = (await run()) ? 0 : 1;
