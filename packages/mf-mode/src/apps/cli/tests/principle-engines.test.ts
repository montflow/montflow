import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import { NodeFileSystem, NodePath as PlatformPath } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { PrincipleEngines as Engines, PrincipleRenderers as Renderers } from '../index.js';

const TestLive = Layer.provide(
  Engines.Live,
  Layer.mergeAll(NodeFileSystem.layer, PlatformPath.layer),
);

const freshRoot = (): string =>
  Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-mode-principles-cli-'));

const put = (root: string, parts: ReadonlyArray<string>, text: string): void => {
  const dir = NodePath.join(root, ...parts);
  Fs.mkdirSync(dir, { recursive: true });
  Fs.writeFileSync(NodePath.join(dir, 'PRINCIPLE.md'), text);
};

const write = (root: string, name: string, text: string): void =>
  put(root, ['.agents', '@montflow', 'principles', name], text);

const extend = (root: string, name: string, text: string): void =>
  put(root, ['.agents', '@montflow', 'mf-mode', 'extensions', 'principles', name], text);

const GOOD = (name: string): string =>
  `---\nname: ${name}\ndescription: Apply when ${name}. Do it.\n---\n\n# T\n\nBody.\n`;

const HUMAN: Renderers.RenderOptions = { human: true, verbose: false };
const VERBOSE: Renderers.RenderOptions = { human: false, verbose: true };

Vitest.describe('engines and renderers', () => {
  Vitest.it.effect('list renders one index line per principle', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      write(root, 'beta', GOOD('beta'));
      write(root, 'alpha', GOOD('alpha'));
      const rows = yield* Engines.list(root);
      Vitest.expect(Renderers.list(rows)).toBe(
        'alpha: Apply when alpha. Do it.\nbeta: Apply when beta. Do it.',
      );
      Vitest.expect(Renderers.list(rows, VERBOSE)).toContain(
        'path=.agents/@montflow/principles/alpha/PRINCIPLE.md',
      );
      Vitest.expect(Renderers.list(rows, HUMAN)).toMatch(/^NAME {2,}DESCRIPTION {2,}SOURCE\n/);
      Vitest.expect(Renderers.list([])).toBe('No principles.');
      Fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(TestLive)),
  );

  Vitest.it.effect('show prints the source line, then exact bytes; refuses an unknown name', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      write(root, 'alpha', GOOD('alpha'));
      Vitest.expect(yield* Engines.show(root, 'alpha', 'mf-mode principles')).toBe(
        `source=shipped\n${GOOD('alpha')}`,
      );
      const refusal = yield* Engines.show(root, 'nope', 'mf-mode principles').pipe(Effect.flip);
      Vitest.expect(refusal).toBe(
        "Unknown principle 'nope'. Run `mf-mode principles list` to see the store.",
      );
      Fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(TestLive)),
  );

  Vitest.it.effect('verify covers the store, one name, or refuses both', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      write(root, 'alpha', GOOD('alpha'));
      write(root, 'broken', '---\nname: broken\ndescription: Fix it.\n---\n\n# B\n\nBody.\n');
      const all = yield* Engines.verify(root, { invocation: 'mf-mode principles' });
      Vitest.expect(all.entries.map((entry) => entry.name)).toStrictEqual(['alpha', 'broken']);
      Vitest.expect(all.issueCount).toBe(1);
      Vitest.expect(Renderers.verify(all)).toBe(
        "error broken [description] Must open with its trigger ('Apply when …', 'Apply before …').\nsummary entries=2 issues=1 warnings=0",
      );
      Vitest.expect(Renderers.verify(all, { human: true, verbose: true })).toBe(
        "✓ alpha\n✗ broken [description] Must open with its trigger ('Apply when …', 'Apply before …').\nentries 2 · errors 1 · warnings 0",
      );
      const one = yield* Engines.verify(root, { name: 'alpha', invocation: 'mf-mode principles' });
      Vitest.expect(one.issueCount).toBe(0);
      const missing = yield* Engines.verify(root, {
        name: 'nope',
        invocation: 'mf-mode principles',
      });
      Vitest.expect(missing.issueCount).toBe(1);
      const both = yield* Engines.verify(root, {
        name: 'alpha',
        all: true,
        invocation: 'mf-mode principles',
      }).pipe(Effect.flip);
      Vitest.expect(both).toContain('not both');
      Fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(TestLive)),
  );
  Vitest.it.effect('extensions extend, replace, and add; list, show, and verify read them', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      write(root, 'alpha', GOOD('alpha'));
      write(root, 'beta', GOOD('beta'));
      extend(root, 'alpha', '---\nname: alpha\nextends: alpha\n---\n\n- Our rule.\n');
      extend(root, 'beta', GOOD('beta').replace('Apply when beta.', 'Apply when ours.'));
      extend(root, 'mine', GOOD('mine'));

      const rows = yield* Engines.list(root);
      Vitest.expect(Renderers.list(rows)).toBe(
        [
          'alpha: Apply when alpha. Do it. source=extension extends=alpha',
          'beta: Apply when ours. Do it. source=extension replaces=beta',
          'mine: Apply when mine. Do it. source=extension',
        ].join('\n'),
      );
      Vitest.expect(yield* Engines.show(root, 'alpha', 'mf-mode principles')).toBe(
        'source=extension extends=alpha\n---\nname: alpha\ndescription: "Apply when alpha. Do it."\n---\n\n# T\n\nBody.\n\n## Local additions\n\n- Our rule.\n',
      );
      Vitest.expect(yield* Engines.show(root, 'mine', 'mf-mode principles')).toBe(
        `source=extension\n${GOOD('mine')}`,
      );
      const clean = yield* Engines.verify(root, { invocation: 'mf-mode principles' });
      Vitest.expect(clean.issueCount).toBe(0);
      Vitest.expect(clean.entries.map((entry) => entry.name)).toStrictEqual([
        'alpha',
        'beta',
        'extension/alpha',
        'extension/beta',
        'extension/mine',
      ]);

      extend(root, 'beta', '---\nname: wrong\ndescription: Fix it.\n---\n\n# B\n\nBody.\n');
      const broken = yield* Engines.verify(root, {
        name: 'beta',
        invocation: 'mf-mode principles',
      });
      Vitest.expect(Renderers.verify(broken)).toBe(
        [
          "error extension/beta [name] Must match the directory name 'beta'.",
          "error extension/beta [description] Must open with its trigger ('Apply when …', 'Apply before …').",
          'summary entries=2 issues=2 warnings=0',
        ].join('\n'),
      );
      Fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(TestLive)),
  );
});
