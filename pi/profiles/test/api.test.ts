import { test, expect } from 'vitest';
import { createEventBus, type EventBus } from '@earendil-works/pi-coding-agent';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { getProfileViaBus, listProfilesViaBus, registerProfileApi } from '../api';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { serializeProfile } from '../model';

/** A minimal ExtensionAPI surface: just the event bus (all the API needs). */
const fakePi = (events: EventBus): ExtensionAPI => ({ events }) as unknown as ExtensionAPI;

const makeProject = (): string => {
  const dir = join(tmpdir(), `profiles-api-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, '.agents', 'profiles', 'code-reviewer'), { recursive: true });
  writeFileSync(
    join(dir, '.agents', 'profiles', 'code-reviewer', 'PROFILE.md'),
    serializeProfile({
      name: 'code-reviewer',
      description: 'You are a senior code reviewer focused on security.',
      model: 'anthropic/claude-sonnet-4-5',
      skills: ['adversarial-review'],
      purpose: 'Catch bugs before they ship.',
      instructions: 'Review diffs aggressively.',
      checklist: ['No security holes'],
    }),
    'utf8',
  );
  return dir;
};

test('getProfileViaBus returns the parsed profile', async () => {
  const project = makeProject();
  try {
    const pi = fakePi(createEventBus());
    registerProfileApi(pi);

    const result = await getProfileViaBus(pi, 'code-reviewer', project);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.name).toBe('code-reviewer');
    expect(result.profile.skills).toEqual(['adversarial-review']);
    expect(result.profile.instructions).toBe('Review diffs aggressively.');
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('getProfileViaBus resolves ok:false for a missing profile', async () => {
  const project = makeProject();
  try {
    const pi = fakePi(createEventBus());
    registerProfileApi(pi);

    const result = await getProfileViaBus(pi, 'does-not-exist', project);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('not found');
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('listProfilesViaBus returns profile names', async () => {
  const project = makeProject();
  try {
    const pi = fakePi(createEventBus());
    registerProfileApi(pi);

    const result = await listProfilesViaBus(pi, project);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.names).toEqual(['code-reviewer']);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('correlates concurrent requests by id (responses do not cross)', async () => {
  const project = makeProject();
  try {
    const pi = fakePi(createEventBus());
    registerProfileApi(pi);

    const [missing, existing] = await Promise.all([
      getProfileViaBus(pi, 'missing', project),
      getProfileViaBus(pi, 'code-reviewer', project),
    ]);
    expect(missing.ok).toBe(false);
    expect(existing.ok).toBe(true);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('times out when the profiles extension is not loaded', async () => {
  const project = makeProject();
  try {
    const pi = fakePi(createEventBus());
    // Note: registerProfileApi is NOT called — no server.

    const result = await getProfileViaBus(pi, 'code-reviewer', project, 50);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('timed out');
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
