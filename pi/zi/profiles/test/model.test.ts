import { test, expect } from 'vitest';

import {
  parseProfile,
  serializeProfile,
  renderProfileFromTemplate,
  slugify,
  isValidProfileName,
  titleFromName,
  parseFrontmatter,
  parseBody,
  validateProfileFields,
} from '../model';

const sampleProfile = {
  name: 'code-reviewer',
  description: 'You are a senior code reviewer focused on security.',
  model: 'anthropic/claude-sonnet-4-5',
  skills: ['adversarial-review', 'unit-testing'],
  instructions: 'Review diffs aggressively. Assume the author made mistakes.',
  checklist: ['No security holes', 'Tests updated'],
};

// ─── slugify / names ─────────────────────────────────────────────────

test('slugifies names into lowercase hyphen slugs', () => {
  expect(slugify('Code Reviewer')).toBe('code-reviewer');
  expect(slugify('  My   Profile!! ')).toBe('my-profile');
  expect(slugify('a/b/c')).toBe('a-b-c');
});

test('validates slug names', () => {
  expect(isValidProfileName('code-reviewer')).toBe(true);
  expect(isValidProfileName('CodeReviewer')).toBe(false);
  expect(isValidProfileName('code_reviewer')).toBe(false);
  expect(isValidProfileName('')).toBe(false);
});

test('derives display titles from slugs', () => {
  expect(titleFromName('code-reviewer')).toBe('Code Reviewer');
  expect(titleFromName('frontend')).toBe('Frontend');
});

// ─── parse/serialize round-trip ──────────────────────────────────────

test('serialize then parse round-trips a full profile', () => {
  const markdown = serializeProfile(sampleProfile);
  const parsed = parseProfile(markdown, 'fallback');
  expect(parsed).toEqual(sampleProfile);
});

test('serialize then parse round-trips a minimal profile', () => {
  const minimal = {
    name: 'minimal',
    description: 'Bare profile.',
    model: '',
    skills: [] as string[],
    instructions: '',
    checklist: [] as string[],
  };
  const parsed = parseProfile(serializeProfile(minimal), 'fallback');
  expect(parsed).toEqual(minimal);
});

test('parseProfile falls back to the directory name when frontmatter lacks name', () => {
  const markdown = '---\ndescription: no name here\n---\n\n# Whatever\n';
  const parsed = parseProfile(markdown, 'dir-name');
  expect(parsed.name).toBe('dir-name');
  expect(parsed.description).toBe('no name here');
});

test('parseProfile tolerates quoted scalar values', () => {
  const markdown = '---\nname: "quoted"\ndescription: \'single quotes\'\n---\n';
  const parsed = parseProfile(markdown, 'fallback');
  expect(parsed.name).toBe('quoted');
  expect(parsed.description).toBe('single quotes');
});

test('parseProfile reads checklist items and body sections', () => {
  const markdown = [
    '---',
    'name: r',
    'description: d',
    'skills:',
    '  - one',
    '  - two',
    '---',
    '',
    '# Reviewer',
    '',
    '## Instructions',
    '',
    'Be strict.',
    '',
    '## Review Checklist',
    '',
    '- [ ] Check auth',
    '- [x] Check errors',
  ].join('\n');

  const parsed = parseProfile(markdown, 'fallback');
  expect(parsed.description).toBe('d');
  expect(parsed.instructions).toBe('Be strict.');
  expect(parsed.checklist).toEqual(['Check auth', 'Check errors']);
  expect(parsed.skills).toEqual(['one', 'two']);
  expect(parsed).not.toHaveProperty('purpose');
});

test('parseProfile folds a legacy ## Purpose section into the description when description is missing', () => {
  const markdown = [
    '---',
    'name: legacy',
    '---',
    '',
    '# Legacy',
    '',
    '## Purpose',
    '',
    'Find the bugs before they ship.',
    '',
    '## Instructions',
    '',
    'Be strict.',
  ].join('\n');

  const parsed = parseProfile(markdown, 'legacy');
  expect(parsed.description).toBe('Find the bugs before they ship.');
  expect(parsed.instructions).toBe('Be strict.');
});

// ─── frontmatter / body parsers ──────────────────────────────────────

test('parseFrontmatter returns null without delimiters', () => {
  expect(parseFrontmatter('no frontmatter here')).toBeNull();
  expect(parseFrontmatter('---\nunclosed')).toBeNull();
});

test('parseFrontmatter collects scalar and list fields', () => {
  const fm = parseFrontmatter('---\nname: x\nmodel: a/b\nskills:\n  - s1\n  - s2\n---\nbody');
  expect(fm?.fields['name']).toBe('x');
  expect(fm?.fields['model']).toBe('a/b');
  expect(fm?.fields['skills']).toEqual(['s1', 's2']);
  expect(fm?.body).toBe('body');
});

test('parseBody extracts sections even with loose content', () => {
  const body = '# T\nintro\n## Purpose\np1\np2\n## Review Checklist\n- [ ] a\n- b\n## Instructions\ni';
  const parsed = parseBody(body);
  expect(parsed.title).toBe('T');
  expect(parsed.purpose).toBe('p1\np2');
  expect(parsed.instructions).toBe('i');
  expect(parsed.checklist).toEqual(['a', 'b']);
});

// ─── template rendering ──────────────────────────────────────────────

const TEMPLATE = [
  '---',
  'name: <profile-name>',
  'description: <one-line description of the agent: its role and what it does>',
  'model: <provider>/<model-id>',
  'skills:',
  '  - <skill-name>',
  '---',
  '',
  '# <Profile Name>',
  '',
  '## Instructions',
  '',
  '<Custom system-prompt instructions. How the agent should behave, what to focus on, what to avoid.>',
  '',
  '## Review Checklist',
  '',
  '- [ ] <What the reviewer must verify before the work is done>',
  '- [ ] <What the reviewer must verify before the work is done>',
].join('\n');

test('renderProfileFromTemplate fills all placeholders', () => {
  const rendered = renderProfileFromTemplate(TEMPLATE, sampleProfile);
  expect(rendered).toContain('name: code-reviewer');
  expect(rendered).toContain('  - adversarial-review');
  expect(rendered).toContain('  - unit-testing');
  expect(rendered).toContain('# Code Reviewer');
  expect(rendered).toContain('Review diffs aggressively.');
  expect(rendered).toContain('- [ ] No security holes');
  expect(rendered).not.toContain('<skill-name>');
});

test('rendered template re-parses into the same profile', () => {
  const rendered = renderProfileFromTemplate(TEMPLATE, sampleProfile);
  const parsed = parseProfile(rendered, 'code-reviewer');
  expect(parsed).toEqual(sampleProfile);
});

test('renderProfileFromTemplate drops list placeholders when empty', () => {
  const rendered = renderProfileFromTemplate(TEMPLATE, {
    name: 'minimal',
    description: 'Bare.',
    model: '',
    skills: [],
    instructions: '',
    checklist: [],
  });
  expect(rendered).not.toContain('<skill-name>');
  expect(rendered).not.toContain('<What the reviewer must verify');
  expect(rendered).toContain('model:');
  expect(rendered).not.toContain('<provider>/<model-id>');
});

// ─── schema validation ───────────────────────────────────────────────

test('validateProfileFields normalizes valid input', () => {
  const profile = validateProfileFields({
    name: 'x',
    description: 'd',
    skills: ['s'],
  });
  expect(profile?.model).toBe('');
  expect(profile?.skills).toEqual(['s']);
  expect(profile?.checklist).toEqual([]);
});

test('validateProfileFields rejects invalid input', () => {
  expect(validateProfileFields({ name: '', description: 'd' })).toBeUndefined();
  expect(validateProfileFields({ name: 'x', description: '' })).toBeUndefined();
});
