import { spawnSync } from 'node:child_process';
import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { runDoctor } from '../index.js';

/**
 * The extension store belongs to the consumer repo: doctor never writes,
 * repairs, or deletes there, and git never ignores it. The shipped copies stay
 * doctor's, so an edit to one is drift even when an extension of the same name
 * exists.
 */

const REPO = NodePath.resolve(import.meta.dirname, '../../../../../..');
const EXTENSIONS = ['.agents', '@montflow', 'mf-mode', 'extensions'];

const freshRoot = (): string =>
  Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-mode-extensions-doctor-'));

const put = (root: string, parts: ReadonlyArray<string>, text: string): string => {
  const file = NodePath.join(root, ...parts);
  Fs.mkdirSync(NodePath.dirname(file), { recursive: true });
  Fs.writeFileSync(file, text);
  return file;
};

/** Every file under a directory with its bytes, sorted by path. */
const snapshot = (dir: string): ReadonlyArray<readonly [string, string]> =>
  Fs.readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((entry) => Fs.statSync(NodePath.join(dir, entry)).isFile())
    .toSorted()
    .map((entry) => [entry, Fs.readFileSync(NodePath.join(dir, entry), 'utf8')] as const);

const cleanup = (root: string): void => Fs.rmSync(root, { recursive: true, force: true });

Vitest.describe('extension store and doctor', () => {
  Vitest.it.effect('doctor never creates the extension store', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      Vitest.expect((yield* runDoctor(root)).healthy).toBe(true);
      Vitest.expect(Fs.existsSync(NodePath.join(root, ...EXTENSIONS))).toBe(false);
      cleanup(root);
    }),
  );

  Vitest.it.effect('doctor and doctor --check never write, repair, or delete there', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      // Same names as shipped entries, a new name, a malformed file, and a stray file.
      put(root, [...EXTENSIONS, 'playbooks', 'feature', 'PLAYBOOK.md'], 'mine\n');
      put(root, [...EXTENSIONS, 'playbooks', 'mine', 'PLAYBOOK.md'], '# no frontmatter\n');
      put(root, [...EXTENSIONS, 'principles', 'laziness-protocol', 'PRINCIPLE.md'], 'mine\n');
      put(root, [...EXTENSIONS, 'principles', 'house-rule', 'notes.txt'], 'stray\n');
      const dir = NodePath.join(root, ...EXTENSIONS);
      const before = snapshot(dir);
      Vitest.expect((yield* runDoctor(root, { check: true })).healthy).toBe(false);
      Vitest.expect((yield* runDoctor(root)).healthy).toBe(true);
      Vitest.expect((yield* runDoctor(root, { check: true })).healthy).toBe(true);
      Vitest.expect(snapshot(dir)).toStrictEqual(before);
      cleanup(root);
    }),
  );

  Vitest.it.effect(
    'an edited shipped copy is drift even when an extension of its name exists',
    () =>
      Effect.gen(function* () {
        const root = freshRoot();
        yield* runDoctor(root);
        const extension = put(
          root,
          [...EXTENSIONS, 'playbooks', 'feature', 'PLAYBOOK.md'],
          '---\nname: feature\nextends: feature\n---\n\n- Ours.\n',
        );
        const shipped = NodePath.join(
          root,
          '.agents',
          '@montflow',
          'playbooks',
          'feature',
          'PLAYBOOK.md',
        );
        const good = Fs.readFileSync(shipped, 'utf8');
        Fs.writeFileSync(shipped, `${good}\nhand edited\n`);
        const checked = yield* runDoctor(root, { check: true });
        Vitest.expect(checked.healthy).toBe(false);
        Vitest.expect(
          checked.installs.find((entry) => entry.kind === 'playbook' && entry.name === 'feature')
            ?.status,
        ).toBe('stale');
        Vitest.expect((yield* runDoctor(root)).healthy).toBe(true);
        Vitest.expect(Fs.readFileSync(shipped, 'utf8')).toBe(good);
        Vitest.expect(Fs.readFileSync(extension, 'utf8')).toBe(
          '---\nname: feature\nextends: feature\n---\n\n- Ours.\n',
        );
        cleanup(root);
      }),
  );

  Vitest.it('the generated .gitignore block never ignores the extension store', () => {
    for (const file of [
      [...EXTENSIONS, 'playbooks', 'x', 'PLAYBOOK.md'],
      [...EXTENSIONS, 'principles', 'x', 'PRINCIPLE.md'],
    ]) {
      const path = file.join('/');
      // `git check-ignore` exits 1 when no rule ignores the path.
      const result = spawnSync('git', ['check-ignore', '-q', path], { cwd: REPO });
      Vitest.expect(result.status, path).toBe(1);
    }
    const gitignore = Fs.readFileSync(NodePath.join(REPO, '.gitignore'), 'utf8');
    const begin = gitignore.indexOf('# >>> payload copies');
    const end = gitignore.indexOf('# <<< payload copies');
    Vitest.expect(begin).toBeGreaterThan(-1);
    Vitest.expect(end).toBeGreaterThan(begin);
    const block = gitignore.slice(begin, end).split('\n');
    Vitest.expect(block.length).toBeGreaterThan(2);
    Vitest.expect(block.filter((line) => line.includes('mf-mode/extensions'))).toStrictEqual([]);
  });
});
