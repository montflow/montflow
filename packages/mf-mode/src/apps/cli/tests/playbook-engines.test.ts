import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import { NodeFileSystem, NodePath as PlatformPath } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { PlaybookEngines as Engines, PlaybookRenderers as Renderers } from '../index.js';

const TestLive = Layer.provide(
  Engines.Live,
  Layer.mergeAll(NodeFileSystem.layer, PlatformPath.layer),
);

const freshRoot = (): string =>
  Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-mode-playbooks-cli-'));

const SHIPPED = ['.agents', '@montflow', 'playbooks'];
const EXTENSIONS = ['.agents', '@montflow', 'mf-mode', 'extensions'];

const put = (root: string, parts: ReadonlyArray<string>, file: string, text: string): void => {
  const dir = NodePath.join(root, ...parts);
  Fs.mkdirSync(dir, { recursive: true });
  Fs.writeFileSync(NodePath.join(dir, file), text);
};

const write = (root: string, name: string, text: string): void =>
  put(root, [...SHIPPED, name], 'PLAYBOOK.md', text);

const extend = (root: string, name: string, text: string): void =>
  put(root, [...EXTENSIONS, 'playbooks', name], 'PLAYBOOK.md', text);

const GOOD = (name: string): string =>
  `---\nname: ${name}\ndescription: Run ${name}.\n---\n\n# T\n\n1. Step.\n`;

const HUMAN: Renderers.RenderOptions = { human: true, verbose: false };
const VERBOSE: Renderers.RenderOptions = { human: false, verbose: true };

Vitest.describe('engines and renderers', () => {
  Vitest.it.effect('list renders one index line per playbook', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      write(root, 'beta', GOOD('beta'));
      write(root, 'alpha', GOOD('alpha'));
      const rows = yield* Engines.list(root);
      Vitest.expect(Renderers.list(rows)).toBe('alpha: Run alpha.\nbeta: Run beta.');
      Vitest.expect(Renderers.list(rows, VERBOSE)).toContain(
        'path=.agents/@montflow/playbooks/alpha/PLAYBOOK.md',
      );
      Vitest.expect(Renderers.list(rows, HUMAN)).toMatch(/^NAME {2,}DESCRIPTION {2,}SOURCE\n/);
      Vitest.expect(Renderers.list(rows, HUMAN)).toMatch(/^alpha {2,}Run alpha\. {2,}shipped$/m);
      Vitest.expect(Renderers.list([])).toBe('No playbooks.');
      Fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(TestLive)),
  );

  Vitest.it.effect('show prints the source line, then exact bytes; refuses an unknown name', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      write(root, 'alpha', GOOD('alpha'));
      Vitest.expect(yield* Engines.show(root, 'alpha', 'mf-mode playbooks')).toBe(
        `source=shipped\n${GOOD('alpha')}`,
      );
      const refusal = yield* Engines.show(root, 'nope', 'mf-mode playbooks').pipe(Effect.flip);
      Vitest.expect(refusal).toBe(
        "Unknown playbook 'nope'. Run `mf-mode playbooks list` to see the store.",
      );
      Fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(TestLive)),
  );

  Vitest.it.effect('verify covers the store, one name, or refuses both', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      write(root, 'alpha', GOOD('alpha'));
      write(
        root,
        'broken',
        '---\nname: broken\ndescription: Broken.\nprinciples:\n  - ghost\n---\n\n# B\n\n1. Step.\n',
      );
      const all = yield* Engines.verify(root, { invocation: 'mf-mode playbooks' });
      Vitest.expect(all.entries.map((entry) => entry.name)).toStrictEqual(['alpha', 'broken']);
      Vitest.expect(all.issueCount).toBe(1);
      Vitest.expect(Renderers.verify(all)).toBe(
        `error broken [principles] Principle 'ghost' does not exist at ${root}/.agents/@montflow/principles/ghost/PRINCIPLE.md.\nsummary entries=2 issues=1 warnings=0`,
      );
      Vitest.expect(Renderers.verify(all, { human: true, verbose: true })).toBe(
        `✓ alpha\n✗ broken [principles] Principle 'ghost' does not exist at ${root}/.agents/@montflow/principles/ghost/PRINCIPLE.md.\nentries 2 · errors 1 · warnings 0`,
      );
      // The same root's principles store resolves the reference once it holds the entry.
      const principle = NodePath.join(root, '.agents', '@montflow', 'principles', 'ghost');
      Fs.mkdirSync(principle, { recursive: true });
      Fs.writeFileSync(NodePath.join(principle, 'PRINCIPLE.md'), 'x');
      const resolved = yield* Engines.verify(root, {
        name: 'broken',
        invocation: 'mf-mode playbooks',
      });
      Vitest.expect(resolved.issueCount).toBe(0);
      const one = yield* Engines.verify(root, { name: 'alpha', invocation: 'mf-mode playbooks' });
      Vitest.expect(one.issueCount).toBe(0);
      const missing = yield* Engines.verify(root, {
        name: 'nope',
        invocation: 'mf-mode playbooks',
      });
      Vitest.expect(missing.issueCount).toBe(1);
      const both = yield* Engines.verify(root, {
        name: 'alpha',
        all: true,
        invocation: 'mf-mode playbooks',
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
      write(root, 'kept', GOOD('kept'));
      extend(
        root,
        'alpha',
        '---\nname: alpha\nextends: alpha\nprinciples:\n  - local-rule\n---\n\n- Also check.\n',
      );
      extend(root, 'beta', GOOD('beta').replace('Run beta.', 'Ours.'));
      extend(root, 'gamma', GOOD('gamma'));
      // A principle that only exists as an extension still resolves a reference.
      put(root, [...EXTENSIONS, 'principles', 'local-rule'], 'PRINCIPLE.md', 'x');

      const rows = yield* Engines.list(root);
      Vitest.expect(Renderers.list(rows)).toBe(
        [
          'alpha: Run alpha. source=extension extends=alpha',
          'beta: Ours. source=extension replaces=beta',
          'gamma: Run gamma. source=extension',
          'kept: Run kept.',
        ].join('\n'),
      );
      Vitest.expect(Renderers.list(rows, VERBOSE)).toContain(
        'gamma: Run gamma. source=extension path=.agents/@montflow/mf-mode/extensions/playbooks/gamma/PLAYBOOK.md',
      );
      Vitest.expect(Renderers.list(rows, HUMAN)).toMatch(
        /^beta {2,}Ours\. {2,}extension replaces=beta$/m,
      );

      Vitest.expect(yield* Engines.show(root, 'alpha', 'mf-mode playbooks')).toBe(
        'source=extension extends=alpha\n---\nname: alpha\ndescription: "Run alpha."\nprinciples:\n  - local-rule\n---\n\n# T\n\n1. Step.\n\n## Local additions\n\n- Also check.\n',
      );
      Vitest.expect(yield* Engines.show(root, 'beta', 'mf-mode playbooks')).toBe(
        `source=extension replaces=beta\n${GOOD('beta').replace('Run beta.', 'Ours.')}`,
      );

      const clean = yield* Engines.verify(root, { invocation: 'mf-mode playbooks' });
      Vitest.expect(clean.entries.map((entry) => entry.name)).toStrictEqual([
        'alpha',
        'beta',
        'kept',
        'extension/alpha',
        'extension/beta',
        'extension/gamma',
      ]);
      Vitest.expect(clean.issueCount).toBe(0);

      extend(root, 'alpha', '---\nname: alpha\nextends: alpha\n---\n\n# Second\n\n- x\n');
      extend(root, 'delta', '---\nname: delta\nextends: ghost\n---\n');
      const broken = yield* Engines.verify(root, { invocation: 'mf-mode playbooks' });
      Vitest.expect(Renderers.verify(broken)).toBe(
        [
          'error extension/alpha [body] Expected one `# Title` heading, found 2.',
          "error extension/delta [extends] Must name a shipped playbook; 'ghost' is not one.",
          'summary entries=7 issues=2 warnings=0',
        ].join('\n'),
      );
      const one = yield* Engines.verify(root, { name: 'alpha', invocation: 'mf-mode playbooks' });
      Vitest.expect(one.entries.map((entry) => entry.name)).toStrictEqual([
        'alpha',
        'extension/alpha',
      ]);
      const refusal = yield* Engines.show(root, 'delta', 'mf-mode playbooks').pipe(Effect.flip);
      Vitest.expect(refusal).toContain("Unknown playbook 'delta'.");
      Fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(TestLive)),
  );
});
