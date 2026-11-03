import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { type FieldValue, parseMarkdown } from '../../frontmatter/index.js';
import { SPLIT, SPLIT_FIELDS, TIERS, TIER_CONTRACT, type Tier, isTier } from '../index.js';

/**
 * The tier drift test: the enum, the three shipped files, and the authoring
 * skill must state one contract. It reads package files only — never the
 * installed `.agents/@montflow/tiers/` copies, which are `doctor`'s job.
 */

const PACKAGE_ROOT = NodePath.resolve(import.meta.dirname, '..', '..', '..', '..');
const REPO_ROOT = NodePath.resolve(PACKAGE_ROOT, '..', '..');
const TIERS_DIR = NodePath.join(PACKAGE_ROOT, 'tiers');
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

const tierFile = (tier: Tier) => {
  const path = NodePath.join(TIERS_DIR, `${tier}.md`);
  const parsed = parseMarkdown(read(path));
  if (parsed === null) throw new Error(`${tier}.md has no frontmatter`);
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

Vitest.describe('tier drift', () => {
  Vitest.it('enum ↔ file set: the directory holds exactly one file per tier', () => {
    const entries = Fs.readdirSync(TIERS_DIR).toSorted();
    const nonMarkdown = entries.filter((file) => !file.endsWith('.md'));
    assertEqual(
      nonMarkdown,
      [],
      `tiers extra: ${nonMarkdown.join(', ')} (only <tier>.md files may ship)`,
    );
    const stems = entries.map((file) => file.slice(0, -'.md'.length)).toSorted();
    const expected: ReadonlyArray<string> = [...TIERS].toSorted();
    const missing = expected.filter((tier) => !stems.includes(tier));
    const extra = stems.filter((stem) => !expected.includes(stem));
    assertEqual(missing, [], `tiers missing: ${missing.join(', ')}`);
    assertEqual(extra, [], `tiers extra: ${extra.join(', ')}`);
    assertEqual(stems, expected, 'tier directory holds a non-tier file');
    for (const tier of TIERS) {
      assertEqual(
        scalar(tierFile(tier).fields, 'tier'),
        tier,
        `tier file name mismatch: ${tier}.md says ${scalar(tierFile(tier).fields, 'tier')}`,
      );
    }
  });

  Vitest.it('enum ↔ file contract: every frontmatter field matches the code', () => {
    for (const tier of TIERS) {
      const contract = TIER_CONTRACT[tier];
      const fields = tierFile(tier).fields;
      const pairs: ReadonlyArray<readonly [string, DriftValue, DriftValue]> = [
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
        ['grilling', scalar(fields, 'grilling'), contract.grilling],
      ];
      for (const [key, actual, expected] of pairs) {
        assertEqual(
          actual,
          expected,
          `tier drift ${tier}.${key}: file ${String(actual)}, code ${String(expected)}`,
        );
      }
      assertEqual(
        list(fields, 'artifacts'),
        [...contract.artifacts],
        `tier drift ${tier}.artifacts: file ${list(fields, 'artifacts').join(', ')}, code ${contract.artifacts.join(', ')}`,
      );
      assertEqual(
        list(fields, 'conditional-artifacts'),
        [...contract.conditionalArtifacts],
        `tier drift ${tier}.conditional-artifacts: file ${list(fields, 'conditional-artifacts').join(', ')}, code ${contract.conditionalArtifacts.join(', ')}`,
      );
    }
  });

  Vitest.it('enum ↔ file prose: each file states the same question budget', () => {
    for (const tier of TIERS) {
      const interaction = TIER_CONTRACT[tier].interaction;
      const match = /This run may ask at most (\d+) questions?\./.exec(tierFile(tier).body);
      assertEqual(match !== null, true, `tier prose drift ${tier}: no question budget sentence`);
      const stated = Number(match?.[1]);
      assertEqual(
        stated,
        interaction,
        `tier prose drift ${tier}: file says ${stated} questions, code says ${interaction}`,
      );
    }
  });

  Vitest.it('enum ↔ authoring skill: the tier table has one row per tier', () => {
    const lines = read(SKILL_FILE).split(/\r?\n/);
    const header = lines.findIndex((line) => {
      const cells = cellsOf(line);
      return (
        cells.length === 6 &&
        cells[0] === 'Tier' &&
        cells[1] === 'Phases' &&
        cells[2] === 'Exploration' &&
        cells[3] === 'Tasks' &&
        cells[4] === 'Review' &&
        cells[5] === 'Questions'
      );
    });
    Vitest.expect(
      header,
      'skill drift: no tier table with columns Tier, Phases, Exploration, Tasks, Review, Questions',
    ).toBeGreaterThanOrEqual(0);

    const rows: Array<ReadonlyArray<string>> = [];
    for (let index = header + 1; index < lines.length; index++) {
      const line = lines[index] ?? '';
      if (!line.trim().startsWith('|')) break;
      if (isSeparator(line)) continue;
      rows.push(cellsOf(line));
    }

    const tierRows = rows.filter((row) => isTier(row[0] ?? ''));
    const named = new Set(tierRows.map((row) => row[0]));
    for (const tier of TIERS) {
      assertEqual(named.has(tier), true, `skill drift: no row for ${tier}`);
    }
    assertEqual(
      tierRows.length,
      TIERS.length,
      `skill drift: the tier table has ${tierRows.length} tier rows, expected ${TIERS.length}`,
    );

    for (const tier of TIERS) {
      const contract = TIER_CONTRACT[tier];
      const row = tierRows.find((candidate) => candidate[0] === tier);
      if (row === undefined) throw new Error(`skill drift: no row for ${tier}`);
      const range = phaseRange(row[1] ?? '');
      assertEqual(
        [range.min, range.max],
        [contract.minPhases, contract.maxPhases],
        `skill drift: ${tier} phases ${row[1]}, code ${contract.minPhases}–${contract.maxPhases}`,
      );
      assertEqual(
        row[2],
        contract.exploration,
        `skill drift: ${tier} exploration ${row[2]}, code ${contract.exploration}`,
      );
      assertEqual(
        Number(row[3]),
        contract.maxTasks,
        `skill drift: ${tier} tasks ${row[3]}, code ${contract.maxTasks}`,
      );
      assertEqual(
        row[4],
        contract.review,
        `skill drift: ${tier} review ${row[4]}, code ${contract.review}`,
      );
      assertEqual(
        Number(row[5]),
        contract.interaction,
        `skill drift: ${tier} questions ${row[5]}, code ${contract.interaction}`,
      );
    }
  });

  Vitest.it('enum ↔ appraiser and prompt: every split field and tier token resolves', () => {
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
      for (const tier of TIERS) {
        assertEqual(
          new RegExp(`\\b${tier}\\b`).test(text),
          true,
          `tier drift: value '${tier}' missing from ${name}`,
        );
      }
      assertEqual(
        text.includes('mf-specs tier'),
        true,
        `tier drift: load verb 'mf-specs tier' missing from ${name}`,
      );
      const matrixRows = text
        .split(/\r?\n/)
        .filter((line) => line.trim().startsWith('|'))
        .map(cellsOf)
        .filter((cells) => isTier(cells[0] ?? ''));
      assertEqual(
        matrixRows.length,
        0,
        `tier matrix drift: ${name} enumerates a tier matrix; the matrix belongs in the tier files`,
      );
    }
  });

  Vitest.it('non-restatement: no size, config, or model vocabulary in a tier file', () => {
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
    for (const tier of TIERS) {
      const text = read(tierFile(tier).path);
      for (const [pattern, label] of banned) {
        assertEqual(
          pattern.test(text),
          false,
          `tier file ${tier} names ${label}: ${pattern.source}`,
        );
      }
    }

    const skill = read(SKILL_FILE);
    const sizeStart = skill.search(/^## .*Size Every Task/m);
    Vitest.expect(sizeStart, 'skill drift: no sizing section').toBeGreaterThanOrEqual(0);
    const after = skill.slice(sizeStart);
    const nextHeading = after.slice(1).search(/^## /m);
    const sizeSection = nextHeading === -1 ? after : after.slice(0, nextHeading + 1);
    for (const tier of TIERS) {
      assertEqual(
        new RegExp(`\\b${tier}\\b`, 'i').test(sizeSection),
        false,
        `skill drift: tier '${tier}' appears in the sizing section`,
      );
    }

    assertEqual(isTier(SPLIT), false, "tier drift: 'split' must not be a tier");
    // SAFETY: widening the readonly tuple to strings only reads membership; no value changes.
    assertEqual(
      (TIERS as ReadonlyArray<string>).includes(SPLIT),
      false,
      "tier drift: 'split' must not be in TIERS",
    );
  });
});
