import { test, expect, describe } from 'vitest';
import { isAwaitingAnswer, PRESET_AUTHOR_SYSTEM, wrapPresetPrompt } from '../skill-run';

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

describe('wrapPresetPrompt', () => {
  test('targets a new preset when no name is given', () => {
    const prompt = wrapPresetPrompt('A security-focused setup with two reviewers.');
    expect(prompt).toContain('Create a new preset');
    expect(prompt).toContain('A security-focused setup with two reviewers.');
  });

  test('targets the existing file for modify runs', () => {
    const prompt = wrapPresetPrompt('Add a quality reviewer.', 'security-audit');
    expect(prompt).toContain("Modify the existing preset 'security-audit'");
    expect(prompt).toContain('.agents/@montflow/review-presets/security-audit.json');
    expect(prompt).toContain('Add a quality reviewer.');
  });

  test('empty preset names fall back to create mode', () => {
    expect(wrapPresetPrompt('x', '  ')).toContain('Create a new preset');
  });

  test('the authoring system prompt pins the schema essentials', () => {
    expect(PRESET_AUTHOR_SYSTEM).toContain('"version": 1');
    expect(PRESET_AUTHOR_SYSTEM).toContain('reviewers');
    expect(PRESET_AUTHOR_SYSTEM).toContain('builtin');
    expect(PRESET_AUTHOR_SYSTEM).toContain('flipThreshold');
    expect(PRESET_AUTHOR_SYSTEM.toLowerCase()).toContain('only write inside .agents/@montflow/review-presets/');
  });
});
