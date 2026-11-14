import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';

/**
 * The lean-execution drift test: the canonical worker/orchestrator profiles, the
 * execution prompt, and the authoring skill must state the same contract, and
 * every installed copy must match its canonical bytes. Each marker asserts the
 * direction of its rule, and each marker has its own inverted-copy mutation, so
 * a future edit that keeps the phrase but flips the rule fails the suite. It
 * reads package files and the committed `.agents/` mirrors — it never writes
 * into them.
 */

const PACKAGE_ROOT = NodePath.resolve(import.meta.dirname, '..', '..', '..', '..');
const REPO_ROOT = NodePath.resolve(PACKAGE_ROOT, '..', '..');

const read = (path: string): string => Fs.readFileSync(NodePath.join(REPO_ROOT, path), 'utf-8');

/**
 * One contract rule, named so a failure says which rule disappeared. `pattern`
 * states the rule's direction and `mutate` writes a copy with that rule
 * negated, so the mutation test can prove the pattern rejects the inversion.
 */
interface Marker {
  readonly id: string;
  readonly pattern: RegExp;
  readonly mutate: (text: string) => string;
}

/** Replace every occurrence, including across a wrapped line. */
const negate =
  (pattern: RegExp, replacement: string) =>
  (text: string): string =>
    text.replace(pattern, replacement);

/** Every rule the worker, the orchestrator, and the execution prompt share. */
const AGENT_MARKERS: ReadonlyArray<Marker> = [
  {
    id: 'execution-brief',
    pattern: /## Execution Brief/,
    mutate: negate(/##\s+Execution Brief/g, '## Execution Summary'),
  },
  {
    id: 'broad-grep-ban',
    pattern: /no broad[- ]grep/,
    mutate: negate(/no broad[- ]grep/gi, 'a broad grep'),
  },
  {
    id: 'lockfile-ban',
    pattern: /never [^.]*lockfiles?/,
    mutate: negate(/never\s+(?:read\s+)?lockfiles?/gi, 'read lockfiles'),
  },
  {
    id: 'one-gate-per-task',
    pattern: /worker runs no official gate[^.]*orchestrator runs the task gate once per task/,
    mutate: negate(/once\s+per\s+task/gi, 'once per stage'),
  },
  {
    id: 'one-repo-gate-per-phase',
    pattern: /repo-wide gate once per phase boundary/,
    mutate: negate(/once\s+per\s+phase\s+boundary/gi, 'once per task boundary'),
  },
  {
    id: 'memory-80-lines',
    pattern: /at or under 80 lines|80 lines or fewer/,
    mutate: negate(/(?:at\s+or\s+under\s+80|80\s+lines\s+or\s+fewer)/gi, 'well over 80'),
  },
  {
    id: 'one-fixer-attempt',
    pattern: /one fixer attempt/,
    mutate: negate(/one\s+fixer\s+attempt/gi, 'one fixer per finding'),
  },
  {
    id: 'one-re-review',
    pattern: /one re-review/,
    mutate: negate(/one\s+re-review/gi, 'no re-review'),
  },
  {
    id: 'review-decide',
    pattern: /review decide/,
    mutate: negate(/review\s+decide/gi, 'review skip'),
  },
];

/** Every rule the authoring skill adds on top of the agent contract. */
const SKILL_MARKERS: ReadonlyArray<Marker> = [
  {
    id: 'execution-brief',
    pattern: /## Execution Brief/,
    mutate: negate(/##\s+Execution Brief/g, '## Execution Summary'),
  },
  {
    id: 'missing-code',
    pattern: /phase\.execution-brief-missing/,
    mutate: negate(/phase\.execution-brief-missing/gi, 'phase.execution-brief-absent'),
  },
  {
    id: 'memory-80-lines',
    pattern: /at or under 80 lines|80 lines or fewer/,
    mutate: negate(/(?:at\s+or\s+under\s+80|80\s+lines\s+or\s+fewer)/gi, 'well over 80'),
  },
  {
    id: 'one-fixer-attempt',
    pattern: /one fixer attempt/,
    mutate: negate(/one\s+fixer\s+attempt/gi, 'one fixer per finding'),
  },
  {
    id: 'one-re-review',
    pattern: /one re-review/,
    mutate: negate(/one\s+re-review/gi, 'no re-review'),
  },
  {
    id: 'review-decide',
    pattern: /review decide/,
    mutate: negate(/review\s+decide/gi, 'review skip'),
  },
  {
    id: 'gate-owns-commands',
    pattern: /command appears exactly once/,
    mutate: negate(/command\s+appears\s+exactly\s+once/gi, 'command may appear anywhere'),
  },
];

/** The parallel-authoring rules the creation skill and prompt must share. */
const AUTHORING_MARKERS: ReadonlyArray<Marker> = [
  {
    id: 'parallel-ready-set',
    pattern: /ready set, not a queue/,
    mutate: negate(/ready set, not a queue/gi, 'serial queue'),
  },
  {
    id: 'declared-write-scope',
    pattern: /every unfinished task declares `write-scope:` or `none`/,
    mutate: negate(
      /every\s+unfinished task declares `write-scope:` or `none`/gi,
      'write scope is optional',
    ),
  },
  {
    id: 'real-dependency',
    pattern: /only (?:for )?a \*{0,2}real\*{0,2} data or ordering dependency/,
    mutate: negate(
      /only (?:for )?a \*{0,2}real\*{0,2} data or ordering dependency/gi,
      'for a shared area',
    ),
  },
  {
    id: 'serial-reason',
    pattern: /A serial chain is a \*{0,2}stated decision/,
    mutate: negate(/A serial chain is a \*{0,2}stated decision/gi, 'A serial chain is a default'),
  },
  {
    id: 'phase-shared-gate',
    pattern: /A phase-shared or repo-wide check is named once, in the phase `GATES\.md`/,
    mutate: negate(
      /A phase-shared or\s+repo-wide check is named once, in the phase `GATES\.md`, never copied into a task\s+gate/gi,
      'A phase-shared or repo-wide check may be copied into a task gate',
    ),
  },
  {
    id: 'shared-check-code',
    pattern: /reports `gate\.shared-check-in-task` when a task stage's scope is not contained/,
    mutate: negate(
      /reports `gate\.shared-check-in-task` when a task stage's scope is not\s+contained/gi,
      "reports `gate.shared-check-in-task` when a task stage's scope is contained",
    ),
  },
];

/** The execution prompt's concurrency, channel, and scheduler rules. */
const EXECUTE_MARKERS: ReadonlyArray<Marker> = [
  {
    id: 'full-ready-set',
    pattern: /full ready set/,
    mutate: negate(/full ready set/gi, 'one task at a time'),
  },
  {
    id: 'board-broadcast',
    pattern: /BOARD\.md` is the phase broadcast/,
    mutate: negate(/BOARD\.md` is the phase broadcast/gi, 'board log is a summary'),
  },
  {
    id: 'mailbox-targeted',
    pattern: /MAILBOX\.md` is a targeted/,
    mutate: negate(/MAILBOX\.md` is a targeted/gi, 'mailbox is a shared log'),
  },
  {
    id: 'mailbox-read-points',
    pattern: /read the board and mailbox at the start of the session and again before a receipt/i,
    mutate: negate(
      /read the board and mailbox at the start of the session and again before a receipt/gi,
      'read the board once when convenient',
    ),
  },
  {
    id: 'shared-verification-once',
    pattern: /phase-shared verification runs once through the scheduler/i,
    mutate: negate(
      /phase-shared verification runs once through the scheduler/gi,
      'each worker reruns the shared suite',
    ),
  },
];

/** The execution orchestrator's full-ready-set dispatch and scheduler rules. */
const ORCHESTRATOR_MARKERS: ReadonlyArray<Marker> = [
  {
    id: 'dispatch-full-ready-set',
    pattern: /full ready set/,
    mutate: negate(/full ready set/gi, 'one task at a time'),
  },
  {
    id: 'board-broadcast',
    pattern: /BOARD\.md` is broadcast/,
    mutate: negate(/BOARD\.md` is broadcast/gi, 'board log is a summary'),
  },
  {
    id: 'mailbox-targeted',
    pattern: /MAILBOX\.md` is targeted/,
    mutate: negate(/MAILBOX\.md`\s+is\s+targeted/gi, 'mailbox is a shared log'),
  },
  {
    id: 'mailbox-read-points',
    pattern: /BOARD\.md` and each task `MAILBOX\.md` at the start of the session and again before/i,
    mutate: negate(
      /BOARD\.md`\s+and each task\s+`MAILBOX\.md`\s+at the start of the session and again before/gi,
      'board once when convenient',
    ),
  },
  {
    id: 'shared-verification-once',
    pattern: /phase-shared verification runs once through the scheduler/i,
    mutate: negate(
      /phase-shared verification runs once through the scheduler/gi,
      'each worker reruns the shared suite',
    ),
  },
  {
    id: 'worker-heavy-check-ban',
    pattern: /never launches a heavy shared check/,
    mutate: negate(/never launches a heavy shared\s+check/gi, 'may launch a heavy shared check'),
  },
];

/** The worker's board/mailbox read points and heavy-check ban. */
const WORKER_MARKERS: ReadonlyArray<Marker> = [
  {
    id: 'board-mailbox-read-points',
    pattern: /read the phase `BOARD\.md` and your `MAILBOX\.md` at the start/i,
    mutate: negate(
      /read the phase `BOARD\.md`\s+and your `MAILBOX\.md`\s+at the start/gi,
      'read only the task record at the start',
    ),
  },
  {
    id: 'mailbox-before-receipt',
    pattern: /`MAILBOX\.md` again before returning/i,
    mutate: negate(/`MAILBOX\.md` again before returning/gi, 'MEMORY.md before returning'),
  },
  {
    id: 'worker-heavy-check-ban',
    pattern: /never launch a heavy shared check/i,
    mutate: negate(/never launch a heavy shared check/gi, 'may launch a heavy shared check'),
  },
];

/** The appraiser's independent-task, shared-check, and serial-reason verdict. */
const APPRAISER_MARKERS: ReadonlyArray<Marker> = [
  {
    id: 'named-independent-tasks',
    pattern: /independent tasks/,
    mutate: negate(/independent tasks/gi, 'task list'),
  },
  {
    id: 'named-shared-checks',
    pattern: /shared checks/,
    mutate: negate(/shared checks/gi, 'commands'),
  },
  {
    id: 'serial-why',
    pattern: /why a phase is serial/,
    mutate: negate(/why a phase is serial/gi, 'that a phase is serial'),
  },
];

/** The creation orchestrator's ready-set plan and two gate layers. */
const CREATION_MARKERS: ReadonlyArray<Marker> = [
  {
    id: 'named-independent-tasks',
    pattern: /independent tasks/,
    mutate: negate(/independent tasks/gi, 'task list'),
  },
  {
    id: 'named-shared-checks',
    pattern: /shared checks/,
    mutate: negate(/shared checks/gi, 'commands'),
  },
  {
    id: 'declared-write-scope',
    pattern: /Declare every task's `write-scope:`/,
    mutate: negate(/Declare every task's `write-scope:`/gi, 'Leave every write scope open'),
  },
  {
    id: 'serial-reason',
    pattern: /write `serial-reason: <one line>` in its `PHASE\.md`/,
    mutate: negate(
      /write `serial-reason: <one line>` in its\s+`PHASE\.md`/gi,
      'write no reason for a serial phase',
    ),
  },
];

/** The execution entry skill's channels and scheduler summary. */
const FIND_MARKERS: ReadonlyArray<Marker> = [
  {
    id: 'board-broadcast',
    pattern: /BOARD\.md` is broadcast/,
    mutate: negate(/BOARD\.md` is broadcast/gi, 'board log is a summary'),
  },
  {
    id: 'run-key',
    pattern: /gate-v1:/,
    mutate: negate(/gate-v1:/gi, 'gate-key:'),
  },
  {
    id: 'heavy-lane',
    pattern: /heavy lane/,
    mutate: negate(/heavy lane/gi, 'single lane'),
  },
  {
    id: 'pass-reuse',
    pattern: /reused/,
    mutate: negate(/reused/gi, 'rerun'),
  },
  {
    id: 'declared-write-scope',
    pattern: /every task declares `write-scope:`/,
    mutate: negate(/every task declares `write-scope:`/gi, 'write scopes are optional'),
  },
];

interface Source {
  readonly name: string;
  readonly canonical: string;
  readonly installed: string;
  readonly markers: ReadonlyArray<Marker>;
  /** Prompt sources ship as JSON; the contract lives in `template`. */
  readonly json: boolean;
}

const SOURCES: ReadonlyArray<Source> = [
  {
    name: 'spec-worker',
    canonical: 'packages/profiles/profiles/spec-worker/PROFILE.md',
    installed: '.agents/@montflow/profiles/spec-worker/PROFILE.md',
    markers: [...AGENT_MARKERS, ...WORKER_MARKERS],
    json: false,
  },
  {
    name: 'spec-execution-orchestrator',
    canonical: 'packages/profiles/profiles/spec-execution-orchestrator/PROFILE.md',
    installed: '.agents/@montflow/profiles/spec-execution-orchestrator/PROFILE.md',
    markers: [...AGENT_MARKERS, ...ORCHESTRATOR_MARKERS],
    json: false,
  },
  {
    name: 'spec-create',
    canonical: 'packages/specs/prompts/spec-create.json',
    installed: '.agents/@montflow/prompts/spec-create.json',
    markers: AUTHORING_MARKERS,
    json: true,
  },
  {
    name: 'spec-execute',
    canonical: 'packages/specs/prompts/spec-execute.json',
    installed: '.agents/@montflow/prompts/spec-execute.json',
    markers: [...AGENT_MARKERS, ...EXECUTE_MARKERS],
    json: true,
  },
  {
    name: 'montflow-create-specs',
    canonical: 'packages/specs/skills/montflow-create-specs/SKILL.md',
    installed: '.agents/skills/montflow-create-specs/SKILL.md',
    markers: [...SKILL_MARKERS, ...AUTHORING_MARKERS],
    json: false,
  },
  {
    name: 'montflow-find-specs',
    canonical: 'packages/specs/skills/montflow-find-specs/SKILL.md',
    installed: '.agents/skills/montflow-find-specs/SKILL.md',
    markers: FIND_MARKERS,
    json: false,
  },
  {
    name: 'spec-appraiser',
    canonical: 'packages/profiles/profiles/spec-appraiser/PROFILE.md',
    installed: '.agents/@montflow/profiles/spec-appraiser/PROFILE.md',
    markers: APPRAISER_MARKERS,
    json: false,
  },
  {
    name: 'spec-creation-orchestrator',
    canonical: 'packages/profiles/profiles/spec-creation-orchestrator/PROFILE.md',
    installed: '.agents/@montflow/profiles/spec-creation-orchestrator/PROFILE.md',
    markers: CREATION_MARKERS,
    json: false,
  },
];

/** The text the contract lives in: a prompt's template, or the whole file. */
const contractText = (source: Source, raw: string): string =>
  // SAFETY: the package ships this prompt file as JSON with a string `template`.
  source.json ? (JSON.parse(raw) as { readonly template: string }).template : raw;

/** Contract rules missing from one text, flattened so wrapping cannot hide them. */
const problemsIn = (markers: ReadonlyArray<Marker>, text: string): ReadonlyArray<string> => {
  const flat = text.replace(/\s+/g, ' ');
  return markers
    .filter((marker) => !marker.pattern.test(flat))
    .map((marker) => `missing lean-contract marker '${marker.id}'`);
};

const canonicalText = (source: Source): string => contractText(source, read(source.canonical));

Vitest.describe('lean execution contract drift', () => {
  Vitest.it('every canonical source states every marker', () => {
    for (const source of SOURCES) {
      Vitest.expect(problemsIn(source.markers, canonicalText(source)), source.name).toStrictEqual(
        [],
      );
    }
  });

  for (const source of SOURCES) {
    Vitest.it(`installed ${source.name} matches its canonical bytes`, () => {
      Vitest.expect(read(source.installed), source.installed).toBe(read(source.canonical));
    });
  }

  for (const source of SOURCES) {
    for (const marker of source.markers) {
      Vitest.it(`${source.name}: inverting '${marker.id}' fails the check`, () => {
        const directory = Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'lean-contract-'));
        try {
          const raw = read(source.canonical);
          const copy = NodePath.join(directory, source.name);
          Fs.writeFileSync(copy, raw);

          const intact = contractText(source, Fs.readFileSync(copy, 'utf-8'));
          Vitest.expect(problemsIn(source.markers, intact), 'temp copy starts clean').toStrictEqual(
            [],
          );

          const mutated = marker.mutate(intact);
          const copyContent = source.json ? JSON.stringify({ template: mutated }) : mutated;
          Fs.writeFileSync(copy, copyContent);
          const broken = contractText(source, Fs.readFileSync(copy, 'utf-8'));
          Vitest.expect(problemsIn(source.markers, broken)).toContain(
            `missing lean-contract marker '${marker.id}'`,
          );
        } finally {
          Fs.rmSync(directory, { recursive: true, force: true });
        }
      });
    }
  }
});

// The repo root is asserted so a moved package fails loudly instead of silently
// skipping the mirrors.
Vitest.it('runs from the repository checkout', () => {
  Vitest.expect(Fs.existsSync(NodePath.join(REPO_ROOT, '.agents', '@montflow'))).toBe(true);
});
