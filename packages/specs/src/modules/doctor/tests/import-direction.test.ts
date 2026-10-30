import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import * as Vitest from 'vitest';

const MODULES_ROOT = NodePath.resolve(import.meta.dirname, '..', '..');

const collectFiles = (dir: string): Array<string> => {
  const files: Array<string> = [];
  for (const entry of Fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = NodePath.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(full));
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) files.push(full);
  }
  return files;
};

const importSpecs = (source: string): Array<string> => {
  const specs: Array<string> = [];
  for (const regex of [
    /from\s+['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s+['"]([^'"]+)['"]/g,
  ]) {
    for (const match of source.matchAll(regex)) {
      if (match[1] !== undefined) specs.push(match[1]);
    }
  }
  return specs;
};

Vitest.describe('module import direction', () => {
  Vitest.it('no module under src/modules imports src/apps', () => {
    const violations: Array<string> = [];
    for (const file of collectFiles(MODULES_ROOT)) {
      const source = Fs.readFileSync(file, 'utf-8');
      for (const spec of importSpecs(source)) {
        if (/(^|[\\/])apps([\\/]|$)/.test(spec)) {
          violations.push(`${NodePath.relative(MODULES_ROOT, file)}: ${spec}`);
        }
      }
    }
    Vitest.expect(violations).toStrictEqual([]);
  });
});
