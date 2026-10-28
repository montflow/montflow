import * as Vitest from '@effect/vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('../../../', import.meta.url));

const walk = (directory: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'tests' || entry.name === 'node_modules') continue;
      files.push(...walk(entryPath));
      continue;
    }
    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) files.push(entryPath);
  }
  return files;
};

const sources = walk(sourceRoot).map((file) => ({
  file: file.slice(sourceRoot.length),
  text: readFileSync(file, 'utf8'),
}));

const FORBIDDEN = [
  { label: 'SQLite driver', pattern: /(?:bun|node):sqlite/u },
  { label: 'network module', pattern: /node:(?:http|https|net|tls|dgram|dns)/u },
  { label: 'network call', pattern: /\bfetch\s*\(|new WebSocket|XMLHttpRequest|Bun\.serve/u },
  { label: 'listener', pattern: /\.listen\s*\(|createServer\s*\(/u },
  { label: 'child process', pattern: /child_process|Bun\.spawn|(?:^|[^.\w])spawn\s*\(/u },
];

Vitest.describe('Event isolation runtime', () => {
  Vitest.it('finds the production source tree', () => {
    Vitest.expect(sources.length).toBeGreaterThan(5);
  });

  for (const forbidden of FORBIDDEN) {
    Vitest.it(`the ingest path imports no ${forbidden.label}`, () => {
      const offenders = sources
        .filter((source) => forbidden.pattern.test(source.text))
        .map((source) => source.file);
      Vitest.expect(offenders).toStrictEqual([]);
    });
  }
});
