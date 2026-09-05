import { test, expect, describe } from 'vitest';
import {
  SPEC_AUTHOR_SYSTEM,
  SPEC_BOOKKEEPER_SYSTEM,
  wrapSpecPrompt,
} from '../skill-run';

describe('wrapSpecPrompt', () => {
  test('names the spec and carries the scope verbatim', () => {
    const prompt = wrapSpecPrompt('auth-rework', 'Add OAuth login.');
    expect(prompt.split('\n', 1)[0]).toBe('Spec to author: auth-rework');
    expect(prompt).toContain('<<<SCOPE\nAdd OAuth login.\nSCOPE>>>');
    expect(prompt).toContain('Grill first');
  });

  test('appends extra guidance only when non-blank', () => {
    expect(wrapSpecPrompt('x', 'scope', '  ')).not.toContain('EXTRA GUIDANCE');
    const prompt = wrapSpecPrompt('x', 'scope', 'Prefer phase A small.');
    expect(prompt).toContain('EXTRA GUIDANCE FROM THE USER:');
    expect(prompt).toContain('Prefer phase A small.');
  });
});

describe('spec system prompts', () => {
  test('author stamps pending and never flips statuses', () => {
    expect(SPEC_AUTHOR_SYSTEM).toContain('ALWAYS stamp pending');
    expect(SPEC_AUTHOR_SYSTEM).toContain('NEVER change an existing');
    expect(SPEC_AUTHOR_SYSTEM).toContain('phases/<L>/tasks/<NNN>-<kebab-name>/task.md');
  });

  test('bookkeeper only rewrites the status line and replies OK', () => {
    expect(SPEC_BOOKKEEPER_SYSTEM).toContain('ONLY job');
    expect(SPEC_BOOKKEEPER_SYSTEM).toContain('reply must be exactly: OK');
  });
});
