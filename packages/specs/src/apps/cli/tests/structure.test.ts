import * as Vitest from '@effect/vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CLI_DIR = join(import.meta.dirname, '..');

const collect = (dir: string): Array<string> => {
  const found: Array<string> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...collect(full));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) found.push(full);
  }
  return found;
};

Vitest.describe('CLI structure', () => {
  Vitest.it('no CLI source file exceeds 1000 lines', () => {
    const files = readdirSync(CLI_DIR).filter(
      (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
    );
    for (const name of files) {
      const content = readFileSync(join(CLI_DIR, name), 'utf8');
      const lineCount = content.split('\n').length;
      if (lineCount > 1000) {
        throw new Error(`${name} has ${lineCount} lines (limit 1000)`);
      }
    }
  });

  Vitest.it('no module source file exceeds 1000 lines', () => {
    const modulesDir = join(CLI_DIR, '..', '..', 'modules');
    for (const file of collect(modulesDir)) {
      const content = readFileSync(file, 'utf8');
      const lineCount = content.split('\n').length;
      if (lineCount > 1000) {
        throw new Error(`${file} has ${lineCount} lines (limit 1000)`);
      }
    }
  });

  Vitest.it('command modules import siblings only through the barrel', () => {
    const files = readdirSync(CLI_DIR).filter((name) => name.endsWith('.module.ts'));
    for (const name of files) {
      if (name === 'cli.apps.module.ts') continue;
      const content = readFileSync(join(CLI_DIR, name), 'utf8');
      const imports = [...content.matchAll(/from '\.\/(cli\.[a-z-]+\.module\.js)';/g)].map(
        (match) => match[1],
      );
      for (const imported of imports) {
        if (imported !== 'cli.apps.module.js' && imported !== 'cli.shared.module.js') {
          throw new Error(`${name} imports sibling ${imported} directly`);
        }
      }
    }
  });
});
