import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { packPlugin } from './modules/pack/index.js';
import { pluginPackages, readWorkspace } from './modules/workspace/index.js';

/** Repository root, resolved from this file (tooling/pack/src/main.ts). */
const ROOT = path.resolve(import.meta.dir, '../../..');

/** Emit the published-shape artifacts a Git subpath install reads. */
const pack = async (): Promise<boolean> => {
  const workspace = readWorkspace(ROOT);
  const outRoot = path.join(ROOT, 'dist', 'pack');
  mkdirSync(outRoot, { recursive: true });
  try {
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
  } catch (error) {
    process.stderr.write(`pack: ${error instanceof Error ? error.message : String(error)}\n`);
    return false;
  }
};

const command = Bun.argv[2] ?? 'pack';
const run = async (): Promise<boolean> => {
  if (command === 'pack') return pack();
  process.stderr.write(`pack: unknown command ${command} (pack)\n`);
  return false;
};

process.exitCode = (await run()) ? 0 : 1;
