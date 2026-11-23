import { spawnSync } from 'node:child_process';
import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath as PlatformPath } from '@effect/platform-node';
import { Cause, Effect, Exit, Layer } from 'effect';
import { Host } from '../../../services/index.js';
import * as PrEngines from '../pr-engines.apps.module.js';
import * as ReportEngines from '../report-engines.apps.module.js';

const EXAMPLE = NodePath.resolve(
  import.meta.dirname,
  '../../../../skills/mf-mode-observe/references/example.trace.jsonl',
);

const fresh = (): string => Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-mode-report-'));

const Platform = Layer.mergeAll(NodeFileSystem.layer, PlatformPath.layer);

const failure = <A>(exit: Exit.Exit<A, string>): string =>
  Exit.isFailure(exit) ? String(Cause.squash(exit.cause)) : '';

const options = (dir: string, overrides: Partial<ReportEngines.ReportOptions> = {}) => ({
  root: dir,
  trace: EXAMPLE,
  out: dir,
  title: undefined,
  browser: 'fake-chrome',
  images: true,
  ...overrides,
});

/** A browser that answers the probe with a height and writes what it is asked to write. */
const fakeBrowser = (calls: Array<ReadonlyArray<string>>) =>
  Host.fake({
    exec: (_binary, args) => {
      calls.push(args);
      const write = args.find(
        (arg) => arg.startsWith('--screenshot=') || arg.startsWith('--print-to-pdf='),
      );
      if (write !== undefined) Fs.writeFileSync(write.slice(write.indexOf('=') + 1), 'bytes');
      const dump = args.includes('--dump-dom');
      return { code: 0, stdout: dump ? '<title>mf-mode-height:777</title>' : '', stderr: '' };
    },
  });

Vitest.describe('report engine', () => {
  Vitest.it.effect('writes the HTML, the summary PNG and the PDF', () => {
    const dir = fresh();
    const calls: Array<ReadonlyArray<string>> = [];
    return Effect.gen(function* () {
      const result = yield* ReportEngines.report(options(dir));
      Vitest.expect(result.html).toBe(NodePath.join(dir, 'example.trace.report.html'));
      Vitest.expect(result.png).toBe(NodePath.join(dir, 'example.trace.report.png'));
      Vitest.expect(result.pdf).toBe(NodePath.join(dir, 'example.trace.report.pdf'));
      Vitest.expect(result.skipped).toBeUndefined();
      Vitest.expect(result.events).toBe(72);
      Vitest.expect(Fs.readFileSync(result.html, 'utf8')).toContain('<h2>Timeline</h2>');
      Vitest.expect(Fs.readdirSync(dir).toSorted()).toEqual([
        'example.trace.report.html',
        'example.trace.report.pdf',
        'example.trace.report.png',
      ]);
      const shot = calls.find((args) => args.some((arg) => arg.startsWith('--screenshot=')));
      Vitest.expect(shot).toContain('--window-size=1200,777');
      Vitest.expect(shot?.at(-1)).toMatch(/report\.html#card$/);
      Vitest.expect(calls.every((args) => args.includes('--headless'))).toBe(true);
    }).pipe(Effect.provide(Layer.mergeAll(Platform, fakeBrowser(calls))));
  });

  Vitest.it.effect('still writes the HTML when the browser fails, and says why', () => {
    const dir = fresh();
    return Effect.gen(function* () {
      const result = yield* ReportEngines.report(options(dir));
      Vitest.expect(result.png).toBeUndefined();
      Vitest.expect(result.skipped).toContain('fake-chrome exited 1: no display');
      Vitest.expect(Fs.existsSync(result.html)).toBe(true);
      Vitest.expect(Fs.readdirSync(dir)).toEqual(['example.trace.report.html']);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Platform,
          Host.fake({ exec: () => ({ code: 1, stdout: '', stderr: 'no display' }) }),
        ),
      ),
    );
  });

  Vitest.it.effect(
    'resolves a relative trace and out against --dir, not the process directory',
    () => {
      const root = fresh();
      Fs.mkdirSync(NodePath.join(root, 'scratch'));
      Fs.copyFileSync(EXAMPLE, NodePath.join(root, 'scratch/run.jsonl'));
      Fs.writeFileSync(NodePath.join(root, 'body.md'), '## Summary\nx\n');
      return Effect.gen(function* () {
        const result = yield* ReportEngines.report({
          ...options(root),
          trace: 'scratch/run.jsonl',
          out: 'reports',
          images: false,
        });
        Vitest.expect(result.html).toBe(NodePath.join(root, 'reports/run.report.html'));
        Vitest.expect(Fs.existsSync(result.html)).toBe(true);
        const checked = yield* PrEngines.check({ root, bodyFile: 'body.md', title: undefined });
        Vitest.expect(checked.errors).toBeGreaterThan(0);
      }).pipe(Effect.provide(Layer.mergeAll(Platform, Host.fake({}))));
    },
  );

  Vitest.it.effect('refuses a missing trace and an empty trace', () => {
    const dir = fresh();
    const empty = NodePath.join(dir, 'empty.jsonl');
    Fs.writeFileSync(empty, 'not json\n');
    return Effect.gen(function* () {
      const run = (overrides: Partial<ReportEngines.ReportOptions>) =>
        Effect.exit(ReportEngines.report(options(dir, overrides)));
      Vitest.expect(failure(yield* run({ trace: NodePath.join(dir, 'missing.jsonl') }))).toContain(
        'Cannot read',
      );
      Vitest.expect(failure(yield* run({ trace: empty }))).toContain('No valid events');
    }).pipe(Effect.provide(Layer.mergeAll(Platform, Host.fake({}))));
  });

  Vitest.it.effect(
    'finds a browser: flag, then MF_MODE_BROWSER, then PATH, then a Playwright shell',
    () => {
      const home = fresh();
      const shell = NodePath.join(
        home,
        '.cache/ms-playwright/chromium_headless_shell-1228/chrome-linux',
      );
      Fs.mkdirSync(shell, { recursive: true });
      Fs.writeFileSync(NodePath.join(shell, 'chrome-headless-shell'), '');
      const find = (host: Parameters<typeof Host.fake>[0], flag?: string) =>
        ReportEngines.findBrowser(flag).pipe(
          Effect.provide(Layer.mergeAll(Platform, Host.fake(host))),
        );
      return Effect.gen(function* () {
        const all = {
          env: { MF_MODE_BROWSER: '/opt/env-chrome', HOME: home },
          installed: ['chromium'],
        };
        Vitest.expect(yield* find(all, '/opt/flag-chrome')).toBe('/opt/flag-chrome');
        Vitest.expect(yield* find(all)).toBe('/opt/env-chrome');
        Vitest.expect(yield* find({ env: { HOME: home }, installed: ['chromium'] })).toBe(
          'chromium',
        );
        Vitest.expect(yield* find({ env: { HOME: home } })).toBe(
          NodePath.join(shell, 'chrome-headless-shell'),
        );
      });
    },
  );
});

const git = (cwd: string, ...args: ReadonlyArray<string>): string => {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + result.stderr);
  return result.stdout.trim();
};

/** A work repo on branch feat/x whose origin is a local bare repo. */
const repos = () => {
  const base = fresh();
  const remote = NodePath.join(base, 'remote.git');
  const work = NodePath.join(base, 'work');
  git(base, 'init', '--quiet', '--bare', remote);
  git(base, 'init', '--quiet', '-b', 'feat/x', work);
  for (const [key, value] of [
    ['user.name', 'Test'],
    ['user.email', 'test@example.com'],
    ['commit.gpgsign', 'false'],
  ] as const) {
    git(work, 'config', key, value);
  }
  git(work, 'remote', 'add', 'origin', remote);
  Fs.writeFileSync(NodePath.join(work, 'code.ts'), 'export {};\n');
  git(work, 'add', '.');
  git(work, 'commit', '--quiet', '-m', 'code');
  for (const name of ['card.png', 'report.pdf', 'later.png']) {
    Fs.writeFileSync(NodePath.join(work, name), name);
  }
  return { remote, work };
};

/** Real git; `gh` and `curl` answered by `answer`, so no test touches the network. */
const offline = (
  answer: (binary: string, args: ReadonlyArray<string>, stdin: string | undefined) => Host.Captured,
  seen: Array<{
    readonly binary: string;
    readonly args: ReadonlyArray<string>;
    readonly stdin: string | undefined;
  }> = [],
) =>
  Layer.effect(
    Host.Host,
    Effect.gen(function* () {
      const real = yield* Host.Host;
      return {
        ...real,
        exec: (binary: string, args: ReadonlyArray<string>, execOptions: Host.ExecOptions = {}) => {
          if (binary === 'git') return real.exec(binary, args, execOptions);
          seen.push({ binary, args, stdin: execOptions.stdin });
          return Effect.succeed(answer(binary, args, execOptions.stdin));
        },
      };
    }),
  ).pipe(Layer.provide(Host.Default));

const github = (binary: string, args: ReadonlyArray<string>): Host.Captured => {
  if (binary === 'gh' && args[0] === 'auth') return { code: 0, stdout: 'gho_secret\n', stderr: '' };
  if (binary === 'gh') return { code: 0, stdout: '4242\n', stderr: '' };
  const name = /name=([^&]+)/.exec(args.at(-1) ?? '')?.[1] ?? 'x';
  return {
    code: 0,
    stdout: '{"url":"https://github.com/user-attachments/assets/' + name + '"}',
    stderr: '',
  };
};

Vitest.describe('pr attach engine', () => {
  Vitest.it.effect(
    'uploads images as attachments and pushes the rest to an orphan assets branch',
    () => {
      const { remote, work } = repos();
      const seen: Array<{
        readonly binary: string;
        readonly args: ReadonlyArray<string>;
        readonly stdin: string | undefined;
      }> = [];
      const attach = (files: ReadonlyArray<string>) =>
        PrEngines.attach({
          root: work,
          files,
          branch: undefined,
          remote: 'origin',
          repo: 'acme/widgets',
        });
      return Effect.gen(function* () {
        const first = yield* attach(['card.png', 'report.pdf']);
        Vitest.expect(first.branch).toBe('assets/feat/x');
        Vitest.expect(PrEngines.markdown(first)).toEqual([
          '![card.png](https://github.com/user-attachments/assets/card.png)',
          '[report.pdf](https://github.com/acme/widgets/blob/' + first.commit + '/report.pdf)',
        ]);
        Vitest.expect(git(remote, 'ls-tree', '--name-only', 'assets/feat/x')).toBe('report.pdf');
        const upload = seen.find((call) => call.binary === 'curl');
        Vitest.expect(upload?.args.at(-1)).toBe(
          'https://uploads.github.com/user-attachments/assets?name=card.png&content_type=image%2Fpng&repository_id=4242',
        );
        Vitest.expect(upload?.stdin).toBe('Authorization: Bearer gho_secret\n');
        Vitest.expect(
          seen.some((call) => call.args.some((arg) => arg.includes('gho_secret'))),
        ).toBe(false);

        Fs.writeFileSync(NodePath.join(work, 'notes.txt'), 'notes');
        const second = yield* attach(['notes.txt']);
        Vitest.expect(git(remote, 'ls-tree', '--name-only', 'assets/feat/x').split('\n')).toEqual([
          'notes.txt',
          'report.pdf',
        ]);
        Vitest.expect(git(remote, 'rev-parse', (second.commit ?? '') + '^')).toBe(first.commit);
        const shared = spawnSync('git', ['merge-base', 'feat/x', second.commit ?? ''], {
          cwd: work,
        });
        Vitest.expect(shared.status).not.toBe(0);
      }).pipe(Effect.provide(Layer.mergeAll(Platform, offline(github, seen))));
    },
    60_000,
  );

  Vitest.it.effect(
    'puts an image on the branch when the attachment upload fails, and says so',
    () => {
      const { remote, work } = repos();
      const refused = (binary: string, args: ReadonlyArray<string>): Host.Captured =>
        binary === 'curl' ? { code: 22, stdout: '', stderr: 'HTTP 422' } : github(binary, args);
      return Effect.gen(function* () {
        const result = yield* PrEngines.attach({
          root: work,
          files: ['card.png'],
          branch: undefined,
          remote: 'origin',
          repo: 'acme/widgets',
        });
        Vitest.expect(result.files).toEqual([
          {
            name: 'card.png',
            image: true,
            via: 'branch',
            url: 'https://github.com/acme/widgets/blob/' + result.commit + '/card.png?raw=true',
          },
        ]);
        Vitest.expect(result.notes.join()).toContain('card.png went to the branch: upload failed');
        Vitest.expect(git(remote, 'ls-tree', '--name-only', 'assets/feat/x')).toBe('card.png');
      }).pipe(Effect.provide(Layer.mergeAll(Platform, offline(refused))));
    },
    60_000,
  );

  Vitest.it.effect(
    'refuses a missing file, a duplicate name and a non-GitHub remote',
    () => {
      const { work } = repos();
      const attach = (files: ReadonlyArray<string>, repo?: string) =>
        Effect.exit(
          PrEngines.attach({ root: work, files, branch: undefined, remote: 'origin', repo }),
        );
      return Effect.gen(function* () {
        Vitest.expect(failure(yield* attach(['nope.png'], 'acme/widgets'))).toContain(
          'No such file',
        );
        Fs.mkdirSync(NodePath.join(work, 'sub'));
        Fs.writeFileSync(NodePath.join(work, 'sub/card.png'), 'x');
        Vitest.expect(
          failure(yield* attach(['card.png', 'sub/card.png'], 'acme/widgets')),
        ).toContain("Two files are named 'card.png'");
        Vitest.expect(failure(yield* attach(['card.png']))).toContain('is not on GitHub');
      }).pipe(Effect.provide(Layer.mergeAll(Platform, offline(github))));
    },
    60_000,
  );
});
