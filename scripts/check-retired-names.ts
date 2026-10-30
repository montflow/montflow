/**
 * Fails when a live file carries a retired Pi-era name.
 *
 * Phase C retired the names users type and read; this guard keeps the rest of
 * the tree from re-introducing them. Frozen history (specs, reviews,
 * changelogs, generated payloads) and the migration constant that must still
 * spell the retired prompts directory are allowed explicitly.
 */

/** Any `pi-`/`pi_` compound, any capitalized `Pi` word, a `.pi/` path, or a retired menu command. */
const PATTERNS: ReadonlyArray<RegExp> = [
  /\bpi[-_]/i,
  /\bPi\b/,
  /Pi[A-Z]/,
  /@montflow\/pi-/,
  /\.pi\b/,
  /mf-(prompts|skills)-tui/,
];

/** Paths whose content is frozen history. */
const ALLOWED_PREFIXES = ['.agents/@montflow/specs/', '.agents/@montflow/reviews/'] as const;

/** Generated or historical files that legitimately quote old names. */
const ALLOWED_BASENAMES = ['CHANGELOG.md', 'embedded-payload.generated.ts', 'bun.lock'] as const;

/** The guard itself spells the patterns and the report lines it looks for. */
const ALLOWED_FILES = ['scripts/check-retired-names.ts', 'scripts/check-retired-names.test.ts', 'apps/workspace/src/services/skills/skills.services.module.ts'] as const;

/**
 * Whole files that must keep one retired spelling. Each entry names the exact
 * line shape allowed, so a new Pi name in the same file still fails.
 */
const ALLOWED_LINES: ReadonlyArray<{ readonly file: string; readonly line: RegExp }> = [
  {
    file: 'packages/prompts/src/modules/prompts/prompts.module.ts',
    line: /LEGACY_STORE_SEGMENTS = \['\.agents', '@montflow', 'pi-prompts'\]/,
  },
  {
    file: 'apps/workspace/src/services/prompts/prompts.services.module.ts',
    line: /LEGACY_PROMPTS_DIR = \['\.agents', '@montflow', 'pi-prompts'\]/,
  },
  {
    file: 'packages/prompts/src/tui.ts',
    line: /LEGACY_PROMPTS_DIR = \['\.agents', '@montflow', 'pi-prompts'\]/,
  },
  // The migrated registry keeps third-party repo names verbatim; these are
  // upstream URLs, not montflow surface names.
  {
    file: '.agents/@montflow/references/pi-subagents/REFERENCE.md',
    line: /^(?:name: pi-subagents|url: https:\/\/github\.com\/nicobailon\/pi-subagents\.git|purpose: .*retired pi surface\.)$/,
  },
];

/** Below this many tracked files the scan is not trustworthy. */
const MIN_TRACKED_FILES = 100;

export interface Finding {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

const isAllowedFile = (file: string, basename: (value: string) => string): boolean =>
  ALLOWED_FILES.includes(file) ||
  ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix)) ||
  ALLOWED_BASENAMES.includes(basename(file));

/** Findings for one file's contents, honouring the per-file line allowance. */
export const scanText = (file: string, contents: string, basename: (value: string) => string): ReadonlyArray<Finding> => {
  if (isAllowedFile(file, basename)) return [];
  const allowed = ALLOWED_LINES.filter((entry) => entry.file === file).map((entry) => entry.line);
  const findings: Array<Finding> = [];
  const lines = contents.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined) continue;
    if (!PATTERNS.some((pattern) => pattern.test(line))) continue;
    if (allowed.some((pattern) => pattern.test(line))) continue;
    findings.push({ file, line: index + 1, text: line.trim() });
  }
  return findings;
};

/** Every tracked file, so scratch and ignored output never matter. */
const listTracked = (run: () => { readonly exitCode: number; readonly stdout: Uint8Array }): ReadonlyArray<string> => {
  const result = run();
  if (result.exitCode !== 0) throw new Error('git ls-files failed');
  return new TextDecoder()
    .decode(result.stdout)
    .split('\0')
    .filter((entry) => entry !== '');
};

const main = async (): Promise<void> => {
  const path = await import('node:path');
  const root = path.resolve(import.meta.dirname, '..');
  const tracked = listTracked(() =>
    Bun.spawnSync(['git', 'ls-files', '-z'], { cwd: root }),
  );
  if (tracked.length < MIN_TRACKED_FILES) {
    console.error(`✗ scan floor not met: ${tracked.length} tracked files.`);
    process.exit(1);
  }

  const findings: Array<Finding> = [];
  for (const file of tracked) {
    let contents: string;
    try {
      contents = await Bun.file(path.join(root, file)).text();
    } catch (cause) {
      findings.push({
        file,
        line: 0,
        text: `unreadable: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
      continue;
    }
    findings.push(...scanText(file, contents, path.basename));
  }

  if (findings.length > 0) {
    console.error(`✗ ${findings.length} live Pi-era name(s) found:`);
    for (const finding of findings) {
      console.error(`  ${finding.file}:${finding.line}: ${finding.text}`);
    }
    console.error('Rename them, or add a justified line allowance to scripts/check-retired-names.ts.');
    process.exit(1);
  }

  console.log(`✓ no live Pi-era names (${tracked.length} files).`);
};

if (import.meta.main) await main();
