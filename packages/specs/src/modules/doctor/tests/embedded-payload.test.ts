import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { EMBEDDED_PROMPT_PAYLOAD, EMBEDDED_SKILL_PAYLOAD } from '../embedded-payload.generated.js';
import { SPEC_PROMPT_NAMES, SPEC_SKILL_NAMES } from '../index.js';

/**
 * The embedded payload exists so a `--compile`d `mf-specs` can install and
 * verify both payload kinds with no package checkout next to the executable.
 * These tests are the guard that makes the embed trustworthy: a stale copy
 * fails the suite instead of shipping a binary whose doctor reports a payload
 * the package no longer contains.
 */

const PACKAGE_ROOT = NodePath.resolve(import.meta.dirname, '..', '..', '..', '..');
const SKILLS_DIR = NodePath.join(PACKAGE_ROOT, 'skills');
const PROMPTS_DIR = NodePath.join(PACKAGE_ROOT, 'prompts');

/** Every non-dot file in a packaged skill directory, keyed by name. */
const packageSkill = (name: string) => {
  const dir = NodePath.join(SKILLS_DIR, name);
  return Object.fromEntries(
    Fs.readdirSync(dir)
      .filter((file) => !file.startsWith('.'))
      .toSorted()
      .map((entry) => [entry, Fs.readFileSync(NodePath.join(dir, entry), 'utf-8')]),
  );
};

Vitest.describe('embedded payload', () => {
  Vitest.it.each(SPEC_SKILL_NAMES)('%s: the embed matches the packaged files', (name) => {
    Vitest.expect(EMBEDDED_SKILL_PAYLOAD[name]).toStrictEqual(packageSkill(name));
  });

  Vitest.it.each(SPEC_PROMPT_NAMES)('%s.json: the embed matches the packed prompt', (name) => {
    Vitest.expect(EMBEDDED_PROMPT_PAYLOAD[name]).toBe(
      Fs.readFileSync(NodePath.join(PROMPTS_DIR, `${name}.json`), 'utf-8'),
    );
  });

  Vitest.it('embeds every payload name the doctor installs', () => {
    Vitest.expect(Object.keys(EMBEDDED_SKILL_PAYLOAD).toSorted()).toStrictEqual(
      [...SPEC_SKILL_NAMES].toSorted(),
    );
    Vitest.expect(Object.keys(EMBEDDED_PROMPT_PAYLOAD).toSorted()).toStrictEqual(
      [...SPEC_PROMPT_NAMES].toSorted(),
    );
  });

  Vitest.it('states the task-specific gate rule and its replacement marker', () => {
    const skill = packageSkill('montflow-create-specs')['SKILL.md'] ?? '';
    Vitest.expect(skill).toContain("A Gate Names the Task's Own Commands");
    Vitest.expect(skill).toContain("REPLACE with this task's own verification commands");
    Vitest.expect(skill).toContain('task.completion-unchecked');
    Vitest.expect(skill).toContain('gate.unchecked');
  });
});
