import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Option, Result } from 'effect';
import { verifySkill, extractVersion, majorGte } from '../verify-skill';
import { SKILLS_ROOT } from '../skill-paths';
import { runEffect, runResult } from './helpers';

interface SetupOptions {
  readonly omitReviewer?: boolean;
  readonly omitFixer?: boolean;
}

/**
 * Creates a temp skills root with skill directories and frontmatter content.
 * @param {string} skillsRoot The temp skills root
 * @param {string | null} skillVersion Reviewer skill version (null = no frontmatter)
 * @param {string | null} fixerVersion Fixer skill version (null = no frontmatter)
 * @param {SetupOptions} [options] Which skills to omit
 * @returns Nothing
 */
const setupSkills = (
  skillsRoot: string,
  skillVersion: string | null,
  fixerVersion: string | null,
  options: SetupOptions = {},
): void => {
  if (!options.omitReviewer) {
    const skillDir = path.join(skillsRoot, 'adversarial-review');
    fs.mkdirSync(skillDir, { recursive: true });
    if (skillVersion != null) {
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---\nversion: ${skillVersion}\n---\n\nAdversarial review skill content.`,
      );
    } else {
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'No frontmatter here.');
    }
  }

  if (!options.omitFixer) {
    const fixerDir = path.join(skillsRoot, 'addressing-adversarial-review');
    fs.mkdirSync(fixerDir, { recursive: true });
    if (fixerVersion != null) {
      fs.writeFileSync(
        path.join(fixerDir, 'SKILL.md'),
        `---\nversion: ${fixerVersion}\n---\n\nAddressing review skill content.`,
      );
    } else {
      fs.writeFileSync(path.join(fixerDir, 'SKILL.md'), 'No frontmatter here either.');
    }
  }
};

/**
 * Creates a temp skills root, runs the async callback, then cleans up.
 * @param {(skillsRoot: string) => Promise<void>} callback The test body
 * @returns A promise completing after cleanup
 */
const withSkillsRoot = async (callback: (skillsRoot: string) => Promise<void>): Promise<void> => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-'));
  try {
    await callback(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

test('extractVersion: extracts version from YAML frontmatter', () => {
  expect(Option.getOrNull(extractVersion('---\nversion: 3.1.0\n---\nbody'))).toBe('3.1.0');
});

test('extractVersion: returns none when no frontmatter', () => {
  expect(Option.isNone(extractVersion('just plain text'))).toBe(true);
});

test('extractVersion: returns none when frontmatter has no version field', () => {
  expect(Option.isNone(extractVersion('---\ndescription: hello\n---\nbody'))).toBe(true);
});

test('majorGte: returns true when a >= b by major version', () => {
  expect(majorGte('3.0.0', '3.0.0')).toBe(true);
  expect(majorGte('4.0.0', '3.0.0')).toBe(true);
  expect(majorGte('3.2.1', '3.0.0')).toBe(true);
});

test('majorGte: returns false when a < b by major version', () => {
  expect(majorGte('2.9.9', '3.0.0')).toBe(false);
  expect(majorGte('1.0.0', '2.0.0')).toBe(false);
});

test('verifySkill: packaged skills root succeeds', async () => {
  const result = await runResult(verifySkill(SKILLS_ROOT));
  expect(Result.isSuccess(result)).toBe(true);
});

test('verifySkill: both skills present with compatible versions succeeds', () =>
  withSkillsRoot(async (tmp) => {
    setupSkills(tmp, '3.2.0', '1.1.0');
    const result = await runResult(verifySkill(tmp));
    expect(Result.isSuccess(result)).toBe(true);
  }));

test('verifySkill: missing adversarial-review skill fails', () =>
  withSkillsRoot(async (tmp) => {
    setupSkills(tmp, '3.2.0', '1.1.0', { omitReviewer: true });
    const result = await runResult(verifySkill(tmp));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isSuccess(result)) return;
    expect(result.failure.message).toContain('adversarial-review');
  }));

test('verifySkill: missing addressing-adversarial-review skill fails', () =>
  withSkillsRoot(async (tmp) => {
    setupSkills(tmp, '3.2.0', '1.1.0', { omitFixer: true });
    const result = await runResult(verifySkill(tmp));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isSuccess(result)) return;
    expect(result.failure.message).toContain('addressing-adversarial-review');
  }));

test('verifySkill: incompatible adversarial-review version fails with specific message', () =>
  withSkillsRoot(async (tmp) => {
    setupSkills(tmp, '2.5.0', '1.1.0');
    const result = await runResult(verifySkill(tmp));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isSuccess(result)) return;
    expect(result.failure.message).toContain('adversarial-review skill version 2.5.0');
  }));

test('verifySkill: incompatible addressing-adversarial-review version fails with specific message', () =>
  withSkillsRoot(async (tmp) => {
    setupSkills(tmp, '3.2.0', '0.9.0');
    const result = await runResult(verifySkill(tmp));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isSuccess(result)) return;
    expect(result.failure.message).toContain(
      'addressing-adversarial-review skill version 0.9.0',
    );
  }));

test('verifySkill: both skills incompatible fails with combined message', () =>
  withSkillsRoot(async (tmp) => {
    setupSkills(tmp, '2.0.0', '0.5.0');
    const result = await runResult(verifySkill(tmp));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isSuccess(result)) return;
    expect(result.failure.message).toContain('adversarial-review skill version 2.0.0');
    expect(result.failure.message).toContain(
      'addressing-adversarial-review skill version 0.5.0',
    );
  }));

test('verifySkill: missing version frontmatter fails (cannot enforce floor)', () =>
  withSkillsRoot(async (tmp) => {
    setupSkills(tmp, null, null);
    const result = await runResult(verifySkill(tmp));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isSuccess(result)) return;
    expect(result.failure.message).toContain('adversarial-review skill is missing version frontmatter');
    expect(result.failure.message).toContain(
      'addressing-adversarial-review skill is missing version frontmatter',
    );
  }));

test('verifySkill: succeeds via the error-free channel', async () => {
  await expect(runEffect(verifySkill(SKILLS_ROOT))).resolves.toBeUndefined();
});
