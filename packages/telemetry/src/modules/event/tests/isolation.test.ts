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

const INGEST = [
  'server.ts',
  'modules/config/',
  'modules/event/',
  'modules/plugin/',
  'modules/store/',
];

const ingest = sources.filter((source) => INGEST.some((prefix) => source.file.startsWith(prefix)));

const FORBIDDEN = [
  { label: 'SQLite driver', pattern: /(?:bun|node):sqlite|new Database|DatabaseSync/u },
  { label: 'network module', pattern: /node:(?:http|https|net|tls|dgram|dns)/u },
  { label: 'network call', pattern: /\bfetch\s*\(|new WebSocket|XMLHttpRequest|Bun\.serve/u },
  { label: 'listener', pattern: /\.listen\s*\(|createServer\s*\(/u },
  { label: 'child process', pattern: /child_process|Bun\.spawn|(?:^|[^.\w])spawn\s*\(/u },
];

Vitest.describe('Event isolation runtime', () => {
  Vitest.it('finds both the ingest path and the viewer sources', () => {
    Vitest.expect(ingest.length).toBeGreaterThan(5);
    Vitest.expect(sources.some((source) => source.file.startsWith('modules/viewer/'))).toBe(true);
  });

  for (const forbidden of FORBIDDEN) {
    Vitest.it(`the ingest path imports no ${forbidden.label}`, () => {
      const offenders = ingest
        .filter((source) => forbidden.pattern.test(source.text))
        .map((source) => source.file);
      Vitest.expect(offenders).toStrictEqual([]);
    });
  }

  Vitest.it('confines every SQLite driver reference to the adapter module', () => {
    const offenders = sources
      .filter((source) => /(?:bun|node):sqlite/u.test(source.text))
      .map((source) => source.file);
    Vitest.expect(offenders).toStrictEqual(['modules/sqlite/sqlite.module.ts']);
  });

  Vitest.it('keeps the data layer free of surface imports', () => {
    const offenders = sources
      .filter((source) =>
        ['modules/tail/', 'modules/fold/', 'modules/sqlite/'].some((prefix) =>
          source.file.startsWith(prefix),
        ),
      )
      .filter((source) => /modules\/viewer|apps\/viewer/u.test(source.text))
      .map((source) => source.file);
    Vitest.expect(offenders).toStrictEqual([]);
  });

  Vitest.it('never appends NDJSON outside the collector writer', () => {
    const offenders = sources
      .filter((source) => /appendFileSync|openSync\([\s\S]{0,200}?['"]a\+?['"]/u.test(source.text))
      .map((source) => source.file);
    Vitest.expect(offenders).toStrictEqual(['modules/store/store.module.ts']);
  });
});
