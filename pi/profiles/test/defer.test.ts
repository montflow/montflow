import { test, expect } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';

import { buildDeferPrompt, writeDeferPromptToTemp } from '../defer';
import type { DeferContext } from '../defer';
import type { ProfilesCommand } from '../options';

const context: DeferContext = {
  cwd: '/repo/root',
  profiles: ['code-reviewer', 'frontend-dev'],
  skills: ['adversarial-review', 'unit-testing', 'typescript-conventions'],
};

const newCommand = (overrides: Partial<Extract<ProfilesCommand, { readonly kind: 'new' }>['fields']> = {}): ProfilesCommand => ({
  kind: 'new',
  fields: {
    name: undefined,
    description: undefined,
    model: undefined,
    skills: [],
    purpose: undefined,
    instructions: undefined,
    instructionsFile: undefined,
    checklist: [],
    ...overrides,
  },
  force: false,
});

// ─── per-operation prompts ───────────────────────────────────────────

test('new prompt instructs the other agent on CLI usage', () => {
  const prompt = buildDeferPrompt(newCommand(), context);
  expect(prompt).toContain('create a new agent profile');
  expect(prompt).toContain('--new');
  expect(prompt).toContain('--name <lowercase-hyphen-slug>');
  expect(prompt).toContain('--description');
  expect(prompt).toContain('node '); // CLI path
  expect(prompt).toContain('/repo/root');
  expect(prompt).toContain('code-reviewer, frontend-dev');
  expect(prompt).toContain('adversarial-review');
  expect(prompt).toContain('bash tool');
});

test('new prompt carries hints from prefilled flags', () => {
  const prompt = buildDeferPrompt(
    newCommand({ name: 'security-auditor', description: 'Audit auth flows.', model: 'anthropic/claude-sonnet-4-5' }),
    context,
  );
  expect(prompt).toContain('Requested name: security-auditor');
  expect(prompt).toContain('Requested description: Audit auth flows.');
  expect(prompt).toContain('Requested model: anthropic/claude-sonnet-4-5');
});

test('modify prompt points at the file to edit directly', () => {
  const prompt = buildDeferPrompt({ kind: 'edit', name: 'code-reviewer' }, context);
  expect(prompt).toContain('modify the profile `code-reviewer`');
  expect(prompt).toContain('.agents/profiles/code-reviewer/PROFILE.md');
  expect(prompt).toContain('Keep `name:` matching the directory name');
  expect(prompt).toContain('--show code-reviewer');
});

test('delete prompt includes the force flag', () => {
  const prompt = buildDeferPrompt({ kind: 'delete', name: 'code-reviewer', force: true }, context);
  expect(prompt).toContain('delete the profile `code-reviewer`');
  expect(prompt).toContain('--delete code-reviewer --force');
});

test('list prompt runs --list and --show', () => {
  const prompt = buildDeferPrompt({ kind: 'list' }, context);
  expect(prompt).toContain('list the agent profiles');
  expect(prompt).toContain('--list');
  expect(prompt).toContain('--show <name>');
});

test('undefined target produces the operation picker', () => {
  const prompt = buildDeferPrompt(undefined, context);
  expect(prompt).toContain('manage agent profiles');
  expect(prompt).toContain('--new');
  expect(prompt).toContain('--list');
  expect(prompt).toContain('--delete <name> --force');
});

// ─── context edge cases ──────────────────────────────────────────────

test('empty profiles and skills render as "none"', () => {
  const prompt = buildDeferPrompt(newCommand(), { cwd: '/x', profiles: [], skills: [] });
  expect(prompt).toContain('Existing profiles: none');
  expect(prompt).toContain('Available skills (valid values for --skills): none');
});

test('prompt says the extension never executes anything', () => {
  const prompt = buildDeferPrompt(newCommand(), context);
  expect(prompt).toContain('never executes anything');
});

// ─── temp file fallback ──────────────────────────────────────────────

test('writeDeferPromptToTemp writes the prompt to a copyable file', async () => {
  const prompt = buildDeferPrompt(newCommand(), context);
  const file = await writeDeferPromptToTemp(prompt);
  try {
    expect(readFileSync(file, 'utf8')).toBe(prompt);
    expect(file).toMatch(/profiles-defer-/);
  } finally {
    rmSync(file, { force: true });
  }
});
