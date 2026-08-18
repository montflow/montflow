import { test, expect, describe } from 'vitest';
import {
  isAwaitingAnswer,
  PROFILE_AUTHOR_SYSTEM,
  wrapProfilePrompt,
  wrapSkillPrompt,
} from '../skill-run';

describe('isAwaitingAnswer', () => {
  test('marks text ending with a question mark as awaiting', () => {
    expect(isAwaitingAnswer('Which name do you prefer?')).toBe(true);
    expect(isAwaitingAnswer('Shall I include a changelog?')).toBe(true);
  });

  test('ignores trailing whitespace', () => {
    expect(isAwaitingAnswer('  Should I proceed?  ')).toBe(true);
  });

  test('does not mark plain summaries as awaiting', () => {
    expect(isAwaitingAnswer('Created **greet-users** — a tiny greeting skill.')).toBe(false);
    expect(isAwaitingAnswer('')).toBe(false);
  });
});

describe('wrapSkillPrompt', () => {
  test('targets a new skill when no name is given', () => {
    const prompt = wrapSkillPrompt('Audits TypeScript for Result-over-throws.');
    expect(prompt).toContain('Create a new skill');
    expect(prompt).toContain('Audits TypeScript for Result-over-throws.');
  });

  test('targets the existing file for modify runs', () => {
    const prompt = wrapSkillPrompt('Add a checklist section.', undefined, 'cooking-pasta');
    expect(prompt).toContain("Modify the existing skill 'cooking-pasta'");
    expect(prompt).toContain('.agents/skills/cooking-pasta/SKILL.md');
    expect(prompt).toContain('Add a checklist section.');
  });

  test('empty skill names fall back to create mode', () => {
    expect(wrapSkillPrompt('x', undefined, '  ')).toContain('Create a new skill');
  });

  test('appends the authoring skill when provided', () => {
    const prompt = wrapSkillPrompt('x', 'Follow the workspace conventions.', 'cooking-pasta');
    expect(prompt).toContain('authoring skill you MUST follow');
    expect(prompt).toContain('Follow the workspace conventions.');
  });
});

describe('wrapProfilePrompt', () => {
  test('targets a new profile when no name is given', () => {
    const prompt = wrapProfilePrompt('A rigorous code-reviewer agent.');
    expect(prompt).toContain('Create a new agent profile');
    expect(prompt).toContain('A rigorous code-reviewer agent.');
    expect(prompt).toContain('.agents/@montflow/profiles/');
  });

  test('targets the existing file for modify runs', () => {
    const prompt = wrapProfilePrompt('Add a security checklist.', 'security-auditor');
    expect(prompt).toContain("Modify the existing profile 'security-auditor'");
    expect(prompt).toContain('.agents/@montflow/profiles/security-auditor/PROFILE.md');
    expect(prompt).toContain('Add a security checklist.');
  });

  test('empty profile names fall back to create mode', () => {
    expect(wrapProfilePrompt('x', '  ')).toContain('Create a new agent profile');
  });

  test('injects the chosen skills into the create prompt', () => {
    const prompt = wrapProfilePrompt('A code reviewer.', undefined, [
      'security-audit',
      'typescript-conventions',
    ]);
    expect(prompt).toContain('  - security-audit');
    expect(prompt).toContain('  - typescript-conventions');
    expect(prompt).toContain('MUST load exactly these skills');
    expect(prompt).toContain('security-audit, typescript-conventions');
  });

  test('injects the chosen skills into modify runs', () => {
    const prompt = wrapProfilePrompt('Add a security checklist.', 'security-auditor', [
      'security-audit',
    ]);
    expect(prompt).toContain("Modify the existing profile 'security-auditor'");
    expect(prompt).toContain('  - security-audit');
  });

  test('the create prompt mirrors the bundled TEMPLATE.md (comment lines included)', () => {
    const prompt = wrapProfilePrompt('A rigorous code-reviewer agent.');
    expect(prompt).toContain('# Preferred model: provider/model-id, e.g. anthropic/claude-sonnet-4-5 (optional)');
    expect(prompt).toContain('# Skills this profile must load (names from SKILL.md frontmatter)');
    expect(prompt).toContain('## Instructions');
    expect(prompt).toContain('## Review Checklist');
  });

  test('the profile authoring system prompt pins the template shape', () => {
    expect(PROFILE_AUTHOR_SYSTEM).toContain('# Preferred model: provider/model-id');
    expect(PROFILE_AUTHOR_SYSTEM).toContain('# Skills this profile must load');
    expect(PROFILE_AUTHOR_SYSTEM).toContain('## Review Checklist');
    expect(PROFILE_AUTHOR_SYSTEM.toLowerCase()).toContain(
      'do not touch anything outside .agents/@montflow/profiles/',
    );
  });
});
