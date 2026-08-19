import { test, expect, describe, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateRunTitle, titleFromOpencodeOutput, TITLE_MODEL } from '../run-title';

/**
 * A fake opencode binary that prints a canned script, pointed to via
 * OPENCODE_BIN. Returns the binary path; the caller removes the temp dir.
 */
const fakeOpencode = async (script: string): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'run-title-'));
  const bin = join(dir, 'opencode');
  await writeFile(bin, script, { mode: 0o755 });
  process.env.OPENCODE_BIN = bin;
  return bin;
};

const cleanupFake = (bin: string): Promise<void> =>
  rm(join(bin, '..'), { recursive: true, force: true });

describe('titleFromOpencodeOutput', () => {
  test('collects plain text parts from the opencode JSON event stream', () => {
    const chunks = [
      JSON.stringify({ type: 'step_start', part: { type: 'step-start' } }) + '\n',
      JSON.stringify({ type: 'text', part: { type: 'text', text: 'Security-focused ' } }) + '\n',
      JSON.stringify({ type: 'text', part: { type: 'text', text: 'PR review skill' } }) + '\n',
      JSON.stringify({ type: 'step_finish', part: { type: 'step-finish' } }) + '\n',
    ];
    expect(titleFromOpencodeOutput(chunks)).toBe('Security-focused PR review skill');
  });

  test('ignores thinking/tool events and malformed lines', () => {
    const chunks = [
      'not json at all\n',
      JSON.stringify({ type: 'text', part: { type: 'thinking', text: 'hmm' } }) + '\n',
      JSON.stringify({ type: 'text', part: { type: 'text', text: '**Fix** #the bug' } }) + '\n',
    ];
    expect(titleFromOpencodeOutput(chunks)).toBe('Fix the bug');
  });

  test('returns empty string when nothing usable arrived', () => {
    expect(titleFromOpencodeOutput([])).toBe('');
    expect(titleFromOpencodeOutput(['{"type":"step_start"}'])).toBe('');
  });
});

describe('generateRunTitle', () => {
  const originalBin = process.env.OPENCODE_BIN;
  afterEach(() => {
    if (originalBin === undefined) delete process.env.OPENCODE_BIN;
    else process.env.OPENCODE_BIN = originalBin;
  });

  test('returns the generated title from a fake opencode', async () => {
    const bin = await fakeOpencode(
      `#!/bin/sh
cat <<'EOF'
{"type":"text","part":{"type":"text","text":"Refactor review loop"}}
{"type":"step_finish","part":{"type":"step-finish"}}
EOF
exit 0`,
    );
    try {
      await expect(generateRunTitle('Refactor the review loop to use Effect')).resolves.toBe(
        'Refactor review loop',
      );
    } finally {
      await cleanupFake(bin);
    }
  });

  test('prepends a prefix to the generated name', async () => {
    const bin = await fakeOpencode(
      `#!/bin/sh
cat <<'EOF'
{"type":"text","part":{"type":"text","text":"Audit PRs"}}
EOF
exit 0`,
    );
    try {
      await expect(
        generateRunTitle('Create a skill that audits pull requests', { prefix: '[skill-create]' }),
      ).resolves.toBe('[skill-create] Audit PRs');
    } finally {
      await cleanupFake(bin);
    }
  });

  test('prefix + name never exceed 32 characters', async () => {
    const bin = await fakeOpencode(
      `#!/bin/sh
cat <<'EOF'
{"type":"text","part":{"type":"text","text":"A ridiculously overlong generated name that must be cut down hard"}}
EOF
exit 0`,
    );
    try {
      const title = await generateRunTitle('Create a preset', { prefix: '[skill-create]' });
      expect(title).not.toBeNull();
      expect(title!.startsWith('[skill-create] ')).toBe(true);
      expect(title!.length).toBeLessThanOrEqual(32);
    } finally {
      await cleanupFake(bin);
    }
  });

  test('falls back to null when opencode exits nonzero with no output', async () => {
    const bin = await fakeOpencode('#!/bin/sh\necho "boom" >&2\nexit 1');
    try {
      await expect(generateRunTitle('Create a preset')).resolves.toBeNull();
    } finally {
      await cleanupFake(bin);
    }
  });

  test('falls back to null when the binary is missing', async () => {
    process.env.OPENCODE_BIN = join(tmpdir(), 'definitely-missing-opencode');
    await expect(generateRunTitle('Create a skill')).resolves.toBeNull();
  });

  test('falls back to null for an empty prompt', async () => {
    await expect(generateRunTitle('   ')).resolves.toBeNull();
  });

  test('uses the opencode/big-pickle model', () => {
    expect(TITLE_MODEL).toBe('opencode/big-pickle');
  });
});
