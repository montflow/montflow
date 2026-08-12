import { test, expect } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  getProfile,
  listProfiles,
  listProfilesWithDetails,
  profileToReviewerProfile,
  objectiveFromProfile,
  titleFromProfileName,
  type Profile,
} from '../profiles-client';
import { REVIEWER_SKILL_PATH } from '../skill-paths';
import { serializeProfile } from '../profiles/model';

const sampleProfile = (): Profile => ({
  name: 'security-auditor',
  description: 'You are a security-focused reviewer.',
  model: 'anthropic/claude-sonnet-4-5',
  skills: ['adversarial-review'],
  instructions: 'Assume the author made mistakes.',
  checklist: ['No secrets in logs', 'Authz checks on every endpoint'],
});

/** Temp project with a profile written to `.agents/@montflow/profiles/`. */
const makeProject = (profiles: readonly Profile[]): string => {
  const dir = join(tmpdir(), `profiles-client-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  rmSync(dir, { recursive: true, force: true });
  for (const profile of profiles) {
    const root = join(dir, '.agents', '@montflow', 'profiles', profile.name);
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'PROFILE.md'), serializeProfile(profile), 'utf8');
  }
  return dir;
};

// ─── titleFromProfileName / objectiveFromProfile ─────────────────────

test('titleFromProfileName: slug to title case', () => {
  expect(titleFromProfileName('security-auditor')).toBe('Security Auditor');
  expect(titleFromProfileName('generic')).toBe('Generic');
});

test('objectiveFromProfile: joins description, instructions, checklist', () => {
  const objective = objectiveFromProfile(sampleProfile());
  expect(objective).toContain('You are a security-focused reviewer.');
  expect(objective).toContain('Assume the author made mistakes.');
  expect(objective).toContain('Review checklist: No secrets in logs; Authz checks on every endpoint');
});

test('objectiveFromProfile: empty checklist is skipped', () => {
  const objective = objectiveFromProfile({ ...sampleProfile(), checklist: [] });
  expect(objective).not.toContain('Review checklist');
});

// ─── profileToReviewerProfile ────────────────────────────────────────

test('profileToReviewerProfile: maps id/label/model/skill/objective', () => {
  const reviewer = profileToReviewerProfile(sampleProfile());
  expect(reviewer.id).toBe('security-auditor');
  expect(reviewer.label).toBe('Security Auditor');
  expect(reviewer.model).toBe('anthropic/claude-sonnet-4-5');
  expect(reviewer.skillPath).toBe(REVIEWER_SKILL_PATH);
  expect(reviewer.objective).toContain('Assume the author made mistakes.');
  expect(reviewer.focus).toBe(reviewer.objective); // focus stays in sync
});

test('profileToReviewerProfile: model override wins over profile model', () => {
  const reviewer = profileToReviewerProfile(sampleProfile(), 'deepseek-v4-pro');
  expect(reviewer.model).toBe('deepseek-v4-pro');
});

test('profileToReviewerProfile: falls back to default model when profile has none', () => {
  const reviewer = profileToReviewerProfile({ ...sampleProfile(), model: '' });
  expect(reviewer.model).toBe('deepseek-v4-pro');
});

test('profileToReviewerProfile: thinking level passes through when given', () => {
  expect(profileToReviewerProfile(sampleProfile()).thinkingLevel).toBeUndefined();
  const reviewer = profileToReviewerProfile(sampleProfile(), 'm', undefined, 'xhigh');
  expect(reviewer.thinkingLevel).toBe('xhigh');
});

// ─── Direct store access (merged profiles feature) ───────────────────

test('getProfile: returns the parsed profile from .agents/@montflow/profiles/', async () => {
  const project = makeProject([sampleProfile()]);
  try {
    const result = await getProfile('security-auditor', project);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.name).toBe('security-auditor');
    expect(result.profile.skills).toEqual(['adversarial-review']);
    expect(result.profile.instructions).toBe('Assume the author made mistakes.');
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('getProfile: ok:false with a message for a missing profile', async () => {
  const project = makeProject([sampleProfile()]);
  try {
    const result = await getProfile('does-not-exist', project);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('not found');
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('listProfiles: returns profile names sorted', async () => {
  const project = makeProject([
    sampleProfile(),
    { ...sampleProfile(), name: 'linguist-reviewer' },
  ]);
  try {
    const result = await listProfiles(project);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.names).toEqual(['linguist-reviewer', 'security-auditor']);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('listProfiles: empty when no profiles are stored', async () => {
  const project = makeProject([]);
  try {
    const result = await listProfiles(project);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.names).toEqual([]);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('listProfilesWithDetails: returns parsed profiles with descriptions', async () => {
  const project = makeProject([sampleProfile()]);
  try {
    const profiles = await listProfilesWithDetails(project);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.name).toBe('security-auditor');
    expect(profiles[0]?.description).toContain('security-focused');
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('listProfilesWithDetails: empty when no profiles are stored', async () => {
  const project = makeProject([]);
  try {
    const profiles = await listProfilesWithDetails(project);
    expect(profiles).toEqual([]);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
