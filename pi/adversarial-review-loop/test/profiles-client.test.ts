import { test, expect } from 'vitest';
import { createEventBus, type EventBus, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  getProfileViaBus,
  listProfilesViaBus,
  isProfilesExtensionLoaded,
  profileToReviewerProfile,
  objectiveFromProfile,
  titleFromProfileName,
  listProfilesWithDetails,
  type Profile,
} from '../profiles-client';
import { REVIEWER_SKILL_PATH } from '../skill-paths';

/** A minimal ExtensionAPI surface: just the event bus. */
const fakePi = (events: EventBus): ExtensionAPI => ({ events }) as unknown as ExtensionAPI;

/** A fake pi whose getCommands lists the given command names. */
const fakePiWithCommands = (names: readonly string[]): ExtensionAPI =>
  ({
    events: createEventBus(),
    getCommands: () => names.map((name) => ({ name, source: 'extension' as const })),
  }) as unknown as ExtensionAPI;

const sampleProfile = (): Profile => ({
  name: 'security-auditor',
  description: 'You are a security-focused reviewer.',
  model: 'anthropic/claude-sonnet-4-5',
  skills: ['adversarial-review'],
  instructions: 'Assume the author made mistakes.',
  checklist: ['No secrets in logs', 'Authz checks on every endpoint'],
});

/** Registers a fake profiles server that answers from the given profiles. */
const serveProfiles = (pi: ExtensionAPI, profiles: readonly Profile[]): void => {
  pi.events.on('profiles:list', (data) => {
    const request = data as { id: string };
    pi.events.emit('profiles:list:result', {
      id: request.id,
      ok: true,
      names: profiles.map((profile) => profile.name),
    });
  });
  pi.events.on('profiles:get', (data) => {
    const request = data as { id: string; name: string };
    const profile = profiles.find((candidate) => candidate.name === request.name);
    pi.events.emit(
      'profiles:get:result',
      profile === undefined
        ? { id: request.id, ok: false, error: `Profile not found: ${request.name}` }
        : { id: request.id, ok: true, profile },
    );
  });
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

// ─── isProfilesExtensionLoaded ───────────────────────────────────────

test('isProfilesExtensionLoaded: true when /profiles command registered', () => {
  const pi = fakePiWithCommands(['profiles', 'adversarial-review-loop']);
  expect(isProfilesExtensionLoaded(pi)).toBe(true);
});

test('isProfilesExtensionLoaded: false when profiles command missing', () => {
  const pi = fakePiWithCommands(['adversarial-review-loop']);
  expect(isProfilesExtensionLoaded(pi)).toBe(false);
});

// ─── listProfilesWithDetails ─────────────────────────────────────────

test('listProfilesWithDetails: returns parsed profiles with descriptions', async () => {
  const pi = fakePi(createEventBus());
  serveProfiles(pi, [sampleProfile()]);

  const profiles = await listProfilesWithDetails(pi, '/repo');
  expect(profiles).toHaveLength(1);
  expect(profiles[0]?.name).toBe('security-auditor');
  expect(profiles[0]?.description).toContain('security-focused');
});

test('listProfilesWithDetails: empty when the bus has no profiles', async () => {
  const pi = fakePiWithCommands(['profiles']);
  serveProfiles(pi, []);
  const profiles = await listProfilesWithDetails(pi, '/repo');
  expect(profiles).toEqual([]);
});

// ─── Bus clients ─────────────────────────────────────────────────────

test('getProfileViaBus / listProfilesViaBus: correlate by id over the bus', async () => {
  const pi = fakePi(createEventBus());
  serveProfiles(pi, [sampleProfile()]);

  const [get, list] = await Promise.all([
    getProfileViaBus(pi, 'security-auditor', '/repo'),
    listProfilesViaBus(pi, '/repo'),
  ]);
  expect(get.ok).toBe(true);
  expect(list.ok).toBe(true);
  if (!get.ok || !list.ok) return;
  expect(get.profile.name).toBe('security-auditor');
  expect(list.names).toEqual(['security-auditor']);
});

test('bus clients time out when the profiles extension is not loaded', async () => {
  const pi = fakePi(createEventBus());
  const [get, list] = await Promise.all([
    getProfileViaBus(pi, 'x', '/repo', 40),
    listProfilesViaBus(pi, '/repo', 40),
  ]);
  expect(get.ok).toBe(false);
  expect(list.ok).toBe(false);
  if (get.ok || list.ok) return;
  expect(get.error).toContain('timed out');
  expect(list.error).toContain('timed out');
});
