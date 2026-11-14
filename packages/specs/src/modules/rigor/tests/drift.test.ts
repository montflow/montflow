import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { type FieldValue, parseMarkdown } from '../../frontmatter/index.js';
import { SPLIT, SPLIT_FIELDS, RIGORS, RIGOR_CONTRACT, type Rigor, isRigor } from '../index.js';

/**
 * The rigor drift test: the enum, the five shipped files, the payload manifest,
 * the authoring skill, the appraiser, and the create prompt must state one
 * contract. It reads package files only — never the installed
 * `.agents/@montflow/rigors/` copies, which are `doctor`'s job.
 */

const PACKAGE_ROOT = NodePath.resolve(import.meta.dirname, '..', '..', '..', '..');
const REPO_ROOT = NodePath.resolve(PACKAGE_ROOT, '..', '..');
const RIGORS_DIR = NodePath.join(PACKAGE_ROOT, 'rigors');
const SKILL_FILE = NodePath.join(PACKAGE_ROOT, 'skills', 'montflow-create-specs', 'SKILL.md');
const APPRAISER_FILE = NodePath.join(
  REPO_ROOT,
  'packages',
  'profiles',
  'profiles',
  'spec-appraiser',
  'PROFILE.md',
);
const CREATE_PROMPT_FILE = NodePath.join(PACKAGE_ROOT, 'prompts', 'spec-create.json');
const CREATION_PROFILE_FILE = NodePath.join(
  REPO_ROOT,
  'packages',
  'profiles',
  'profiles',
  'spec-creation-orchestrator',
  'PROFILE.md',
);
const PAYLOAD_FILE = NodePath.join(PACKAGE_ROOT, 'payload.json');

const CONTRACT_FIELDS = [
  'artifacts',
  'conditional-artifacts',
  'exploration',
  'gate',
  'interaction',
  'phases-max',
  'phases-min',
  'review',
  'rigor',
  'tasks-max',
  'tasks-per-phase-max',
  'waiver',
].toSorted();

const read = (path: string): string => Fs.readFileSync(path, 'utf-8');

const scalar = (fields: Record<string, FieldValue>, key: string): string | undefined => {
  const value = fields[key];
  return Array.isArray(value) ? undefined : value;
};

const list = (fields: Record<string, FieldValue>, key: string): ReadonlyArray<string> => {
  const value = fields[key];
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  return value === '' || value === '[]' ? [] : [value];
};

const rigorFile = (rigor: Rigor) => {
  const path = NodePath.join(RIGORS_DIR, `${rigor}.md`);
  const parsed = parseMarkdown(read(path));
  if (parsed === null) throw new Error(`${rigor}.md has no frontmatter`);
  return { path, fields: parsed.fields, body: parsed.body };
};

type DriftValue = string | number | boolean | undefined | ReadonlyArray<string | number>;

const assertEqual = (actual: DriftValue, expected: DriftValue, message: string): void => {
  Vitest.expect(actual, message).toStrictEqual(expected);
};

const cellsOf = (line: string): ReadonlyArray<string> =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim().replace(/^`|`$/g, ''));

const isSeparator = (line: string): boolean =>
  line.trim().startsWith('|') && cellsOf(line).every((cell) => /^:?-+:?$/.test(cell));

const phaseRange = (cell: string) => {
  const match = /^(\d+)(?:[–-](\d+))?$/.exec(cell.trim());
  if (match === null) throw new Error(`not a phase range: '${cell}'`);
  const min = Number(match[1]);
  const max = match[2] === undefined ? min : Number(match[2]);
  return { min, max };
};

/** One row of the skill's authoring-question table. */
interface QuestionRow {
  readonly name: string;
  readonly type: string;
  readonly options: ReadonlyArray<string>;
  readonly required: boolean;
  readonly when: string;
}

/** One declared prompt variable, as the shipped JSON writes it. */
interface PromptVariable {
  readonly name: string;
  readonly type?: string;
  readonly options?: ReadonlyArray<string>;
  readonly required?: boolean;
  readonly default?: string;
  readonly when?: {
    readonly controller: string;
    readonly equals?: string;
    readonly truthy?: boolean;
  };
}

const promptVariables = (): ReadonlyArray<PromptVariable> => {
  // SAFETY: the package ships this prompt as JSON with the documented shape.
  const parsed = JSON.parse(read(CREATE_PROMPT_FILE)) as {
    readonly variables: ReadonlyArray<PromptVariable>;
  };
  return parsed.variables;
};

const unquote = (cell: string): string => cell.trim().replace(/^`|`$/g, '');

const cellOptions = (cell: string): ReadonlyArray<string> =>
  unquote(cell)
    .split(',')
    .map((option) => unquote(option))
    .filter((option) => option !== '' && option !== '—');

const whenOf = (variable: PromptVariable): string => {
  const when = variable.when;
  if (when === undefined) return 'always';
  if (when.equals !== undefined) return `${when.controller}=${when.equals}`;
  return `${when.controller}:truthy`;
};

/** The skill's authoring-question table, in declared order. */
const questionRows = (): ReadonlyArray<QuestionRow> => {
  const lines = read(SKILL_FILE).split(/\r?\n/);
  const header = lines.findIndex((line) => {
    const cells = cellsOf(line);
    return (
      cells.length === 6 &&
      cells[0] === '#' &&
      cells[1] === 'Name' &&
      cells[2] === 'Type' &&
      cells[3] === 'Options' &&
      cells[4] === 'Required' &&
      cells[5] === 'When'
    );
  });
  Vitest.expect(
    header,
    'skill drift: no authoring-question table with columns #, Name, Type, Options, Required, When',
  ).toBeGreaterThanOrEqual(0);
  const rows: Array<QuestionRow> = [];
  for (let index = header + 1; index < lines.length; index++) {
    const line = lines[index] ?? '';
    if (!line.trim().startsWith('|')) break;
    if (isSeparator(line)) continue;
    const cells = cellsOf(line);
    rows.push({
      name: unquote(cells[1] ?? ''),
      type: cells[2] ?? '',
      options: cellOptions(cells[3] ?? ''),
      required: (cells[4] ?? '') === 'yes',
      when: cells[5] ?? '',
    });
  }
  return rows;
};

Vitest.describe('rigor drift', () => {
  Vitest.it('enum ↔ file set: the directory holds exactly one file per rigor', () => {
    const entries = Fs.readdirSync(RIGORS_DIR).toSorted();
    const nonMarkdown = entries.filter((file) => !file.endsWith('.md'));
    assertEqual(
      nonMarkdown,
      [],
      `rigors extra: ${nonMarkdown.join(', ')} (only <rigor>.md files may ship)`,
    );
    const stems = entries.map((file) => file.slice(0, -'.md'.length)).toSorted();
    const expected: ReadonlyArray<string> = [...RIGORS].toSorted();
    const missing = expected.filter((rigor) => !stems.includes(rigor));
    const extra = stems.filter((stem) => !expected.includes(stem));
    assertEqual(missing, [], `rigors missing: ${missing.join(', ')}`);
    assertEqual(extra, [], `rigors extra: ${extra.join(', ')}`);
    assertEqual(stems, expected, 'rigor directory holds a non-rigor file');
    for (const rigor of RIGORS) {
      assertEqual(
        scalar(rigorFile(rigor).fields, 'rigor'),
        rigor,
        `rigor file name mismatch: ${rigor}.md says ${scalar(rigorFile(rigor).fields, 'rigor')}`,
      );
    }
  });

  Vitest.it('enum ↔ file contract: every frontmatter field matches the code', () => {
    for (const rigor of RIGORS) {
      const contract = RIGOR_CONTRACT[rigor];
      const fields = rigorFile(rigor).fields;
      assertEqual(
        Object.keys(fields).toSorted(),
        CONTRACT_FIELDS,
        `rigor drift ${rigor}: frontmatter fields ${Object.keys(fields).toSorted().join(', ')}`,
      );
      const pairs: ReadonlyArray<readonly [string, DriftValue, DriftValue]> = [
        ['rigor', scalar(fields, 'rigor'), rigor],
        ['phases-min', scalar(fields, 'phases-min'), String(contract.minPhases)],
        ['phases-max', scalar(fields, 'phases-max'), String(contract.maxPhases)],
        ['tasks-max', scalar(fields, 'tasks-max'), String(contract.maxTasks)],
        [
          'tasks-per-phase-max',
          scalar(fields, 'tasks-per-phase-max'),
          String(contract.maxTasksPerPhase),
        ],
        ['exploration', scalar(fields, 'exploration'), contract.exploration],
        ['gate', scalar(fields, 'gate'), contract.gate],
        ['review', scalar(fields, 'review'), contract.review],
        ['waiver', scalar(fields, 'waiver'), contract.waiver],
        ['interaction', scalar(fields, 'interaction'), String(contract.interaction)],
      ];
      for (const [key, actual, expected] of pairs) {
        assertEqual(
          actual,
          expected,
          `rigor drift ${rigor}.${key}: file ${String(actual)}, code ${String(expected)}`,
        );
      }
      assertEqual(
        list(fields, 'artifacts'),
        [...contract.artifacts],
        `rigor drift ${rigor}.artifacts: file ${list(fields, 'artifacts').join(', ')}, code ${contract.artifacts.join(', ')}`,
      );
      assertEqual(
        list(fields, 'conditional-artifacts'),
        [...contract.conditionalArtifacts],
        `rigor drift ${rigor}.conditional-artifacts: file ${list(fields, 'conditional-artifacts').join(', ')}, code ${contract.conditionalArtifacts.join(', ')}`,
      );
    }
  });

  Vitest.it('enum ↔ file prose: each file states the same question budget', () => {
    for (const rigor of RIGORS) {
      const interaction = RIGOR_CONTRACT[rigor].interaction;
      const match = /This run may ask at most (\d+) questions?\./.exec(rigorFile(rigor).body);
      assertEqual(match !== null, true, `rigor prose drift ${rigor}: no question budget sentence`);
      const stated = Number(match?.[1]);
      assertEqual(
        stated,
        interaction,
        `rigor prose drift ${rigor}: file says ${stated} questions, code says ${interaction}`,
      );
    }
  });

  Vitest.it('enum ↔ authoring skill: the rigor table has one row per rigor', () => {
    const lines = read(SKILL_FILE).split(/\r?\n/);
    const header = lines.findIndex((line) => {
      const cells = cellsOf(line);
      return (
        cells.length === 6 &&
        cells[0] === 'Rigor' &&
        cells[1] === 'Phases' &&
        cells[2] === 'Exploration' &&
        cells[3] === 'Tasks' &&
        cells[4] === 'Review' &&
        cells[5] === 'Questions'
      );
    });
    Vitest.expect(
      header,
      'skill drift: no rigor table with columns Rigor, Phases, Exploration, Tasks, Review, Questions',
    ).toBeGreaterThanOrEqual(0);

    const rows: Array<ReadonlyArray<string>> = [];
    for (let index = header + 1; index < lines.length; index++) {
      const line = lines[index] ?? '';
      if (!line.trim().startsWith('|')) break;
      if (isSeparator(line)) continue;
      rows.push(cellsOf(line));
    }

    const rigorRows = rows.filter((row) => isRigor(row[0] ?? ''));
    const named = new Set(rigorRows.map((row) => row[0]));
    for (const rigor of RIGORS) {
      assertEqual(named.has(rigor), true, `skill drift: no row for ${rigor}`);
    }
    assertEqual(
      rigorRows.length,
      RIGORS.length,
      `skill drift: the rigor table has ${rigorRows.length} rigor rows, expected ${RIGORS.length}`,
    );

    for (const rigor of RIGORS) {
      const contract = RIGOR_CONTRACT[rigor];
      const row = rigorRows.find((candidate) => candidate[0] === rigor);
      if (row === undefined) throw new Error(`skill drift: no row for ${rigor}`);
      const range = phaseRange(row[1] ?? '');
      assertEqual(
        [range.min, range.max],
        [contract.minPhases, contract.maxPhases],
        `skill drift: ${rigor} phases ${row[1]}, code ${contract.minPhases}–${contract.maxPhases}`,
      );
      assertEqual(
        row[2],
        contract.exploration,
        `skill drift: ${rigor} exploration ${row[2]}, code ${contract.exploration}`,
      );
      assertEqual(
        Number(row[3]),
        contract.maxTasks,
        `skill drift: ${rigor} tasks ${row[3]}, code ${contract.maxTasks}`,
      );
      assertEqual(
        row[4],
        contract.review,
        `skill drift: ${rigor} review ${row[4]}, code ${contract.review}`,
      );
      assertEqual(
        Number(row[5]),
        contract.interaction,
        `skill drift: ${rigor} questions ${row[5]}, code ${contract.interaction}`,
      );
    }
  });

  Vitest.it('enum ↔ appraiser and prompt: every split field and rigor token resolves', () => {
    const sources: ReadonlyArray<readonly [string, string]> = [
      ['spec-appraiser', read(APPRAISER_FILE)],
      [
        'spec-create',
        // SAFETY: the package ships this prompt as JSON with a string `template`.
        (JSON.parse(read(CREATE_PROMPT_FILE)) as { readonly template: string }).template,
      ],
    ];

    for (const [name, text] of sources) {
      for (const field of SPLIT_FIELDS) {
        assertEqual(
          new RegExp(`\\b${field}\\b`).test(text),
          true,
          `split verdict drift: field '${field}' missing from ${name}`,
        );
      }
      for (const rigor of RIGORS) {
        assertEqual(
          new RegExp(`\\b${rigor}\\b`).test(text),
          true,
          `rigor drift: value '${rigor}' missing from ${name}`,
        );
      }
      assertEqual(
        text.includes('mf-specs rigor'),
        true,
        `rigor drift: load verb 'mf-specs rigor' missing from ${name}`,
      );
      const matrixRows = text
        .split(/\r?\n/)
        .filter((line) => line.trim().startsWith('|'))
        .map(cellsOf)
        .filter((cells) => isRigor(cells[0] ?? ''));
      assertEqual(
        matrixRows.length,
        0,
        `rigor matrix drift: ${name} enumerates a rigor matrix; the matrix belongs in the rigor files`,
      );
    }
  });

  Vitest.it('question flow: the prompt and the skill ask the same questions in one order', () => {
    const variables = promptVariables();
    const rows = questionRows();
    assertEqual(
      variables.map((variable) => variable.name),
      rows.map((row) => row.name),
      'question flow drift: the prompt and the skill disagree on the question list or its order',
    );
    for (const [index, variable] of variables.entries()) {
      const row = rows[index];
      if (row === undefined) {
        throw new Error(`question flow drift: no skill row for '${variable.name}'`);
      }
      assertEqual(variable.type ?? 'text', row.type, `question flow drift: ${variable.name} type`);
      assertEqual(
        variable.required ?? true,
        row.required,
        `question flow drift: ${variable.name} required`,
      );
      assertEqual(
        [...(variable.options ?? [])],
        [...row.options],
        `question flow drift: ${variable.name} options`,
      );
      assertEqual(whenOf(variable), row.when, `question flow drift: ${variable.name} when`);
    }

    const rigor = variables.find((variable) => variable.name === 'rigor');
    assertEqual(rigor?.options, [...RIGORS], 'question flow drift: rigor options');
    assertEqual(rigor?.required ?? true, true, 'question flow drift: rigor must be required');
    assertEqual(rigor?.default ?? '', '', 'question flow drift: rigor must have no default');
    const isolated = variables.find((variable) => variable.name === 'isolated');
    assertEqual(isolated?.options, ['yes', 'no'], 'question flow drift: isolated options');
    assertEqual(isolated?.required ?? true, true, 'question flow drift: isolated must be required');
  });

  Vitest.it(
    'question flow: the creation profile names the same order and never owns the rigor',
    () => {
      const profile = read(CREATION_PROFILE_FILE).replace(/\s+/g, ' ');
      for (const rigor of RIGORS) {
        assertEqual(
          new RegExp(`\\b${rigor}\\b`).test(profile),
          true,
          `profile drift: no ${rigor} level`,
        );
      }
      assertEqual(profile.includes('mf-specs rigor'), true, 'profile drift: no rigor load verb');
      const match = /The authoring form asks, in order: ([^.]+)\./.exec(profile);
      Vitest.expect(match, 'profile drift: no authoring-question order sentence').not.toBeNull();
      const listed = (match?.[1] ?? '')
        .split(',')
        .map((name) => unquote(name))
        .filter((name) => name !== '');
      const asked = promptVariables()
        .map((variable) => variable.name)
        .filter((name) => name !== 'request' && name !== 'notes');
      assertEqual(listed, asked, 'profile drift: authoring-question order');
      assertEqual(
        /appraiser (?:decides|chooses|picks)/i.test(profile),
        false,
        'profile drift: the appraiser still owns the rigor',
      );
    },
  );

  Vitest.it(
    'payload manifest: every rigor file is declared once with the same name and path',
    () => {
      // SAFETY: the package ships this manifest as JSON with the documented shape.
      const manifest = JSON.parse(read(PAYLOAD_FILE)) as {
        readonly payloads: ReadonlyArray<{
          readonly kind: string;
          readonly name: string;
          readonly source: string;
          readonly target: string;
        }>;
      };
      const entries = manifest.payloads.filter((entry) => entry.kind === 'rigor');
      assertEqual(
        entries.map((entry) => entry.name),
        [...RIGORS],
        'payload drift: rigor entries do not match the enum',
      );
      for (const entry of entries) {
        assertEqual(
          entry.source,
          `rigors/${entry.name}.md`,
          `payload drift: ${entry.name} source ${entry.source}`,
        );
        assertEqual(
          entry.target,
          `.agents/@montflow/rigors/${entry.name}.md`,
          `payload drift: ${entry.name} target ${entry.target}`,
        );
        assertEqual(
          Fs.existsSync(NodePath.join(PACKAGE_ROOT, entry.source)),
          true,
          `payload drift: ${entry.name} names a missing source file`,
        );
      }
    },
  );

  Vitest.it('non-restatement: no size, config, or model vocabulary in a rigor file', () => {
    const banned: ReadonlyArray<readonly [RegExp, string]> = [
      [/\btiny\b/i, 'a size name'],
      [/\bsmall\b/i, 'a size name'],
      [/\bmedium\b/i, 'a size name'],
      [/\blarge\b/i, 'a size name'],
      [/size:/i, 'a size key'],
      [/sizing\.json/i, 'a sizing config'],
      [/\bmodel\b/i, 'a model'],
      [/\beffort\b/i, 'an effort'],
      [/review cycle/i, 'a review budget'],
    ];
    for (const rigor of RIGORS) {
      const text = read(rigorFile(rigor).path);
      for (const [pattern, label] of banned) {
        assertEqual(
          pattern.test(text),
          false,
          `rigor file ${rigor} names ${label}: ${pattern.source}`,
        );
      }
    }

    const skill = read(SKILL_FILE);
    const sizeStart = skill.search(/^## .*Size Every Task/m);
    Vitest.expect(sizeStart, 'skill drift: no sizing section').toBeGreaterThanOrEqual(0);
    const after = skill.slice(sizeStart);
    const nextHeading = after.slice(1).search(/^## /m);
    const sizeSection = nextHeading === -1 ? after : after.slice(0, nextHeading + 1);
    for (const rigor of RIGORS) {
      assertEqual(
        new RegExp(`\\b${rigor}\\b`, 'i').test(sizeSection),
        false,
        `skill drift: rigor '${rigor}' appears in the sizing section`,
      );
    }

    assertEqual(isRigor(SPLIT), false, "rigor drift: 'split' must not be a rigor");
    // SAFETY: widening the readonly tuple to strings only reads membership; no value changes.
    assertEqual(
      (RIGORS as ReadonlyArray<string>).includes(SPLIT),
      false,
      "rigor drift: 'split' must not be in RIGORS",
    );
  });
});
