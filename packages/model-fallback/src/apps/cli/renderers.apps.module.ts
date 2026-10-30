import type * as Doctor from '../doctor/index.js';
import { FallbackStore, ModelChain } from '../../modules/index.js';
import type * as Engines from './engines.apps.module.js';

/**
 * Pure `data -> text` renderers. Token-lean by default, no ANSI, failures never
 * suppressed: this output is read by agents as often as by humans.
 */

/** One-line usage summary. */
export const USAGE = `mf-model-fallback — inspect and configure the model fallback store.

Usage:
  mf-model-fallback status [--json] [--check] [--dir <path>]
  mf-model-fallback show [--json] [--dir <path>]
  mf-model-fallback models [--json] [--dir <path>] [--server <url>] [--limit <n>]
  mf-model-fallback set --chain <a/b,c/d> [--trigger <name,...>] [--allow-unknown]
                         [--json] [--dir <path>] [--server <url>]
  mf-model-fallback migrate [--json] [--dir <path>]
  mf-model-fallback verify [--json] [--dir <path>] [--server <url>]
  mf-model-fallback doctor [--check] [--json] [--dir <path>]
  mf-model-fallback remove [--json] [--dir <path>]

Store: <workspace>/.agents/@montflow/model-fallback/config.json
Triggers: quota, rate-limit, auth, timeout, provider-internal, transport.
Default triggers: quota, rate-limit, auth.`;

const label = (ref: ModelChain.Ref): string => FallbackStore.plain(ModelChain.label(ref));

const chainBlock = (chain: ReadonlyArray<ModelChain.Ref>): string =>
  chain.map((ref, index) => `  ${index + 1}. ${label(ref)}`).join('\n');

const issues = (
  list: ReadonlyArray<{
    readonly field: string;
    readonly message: string;
    readonly fix?: string | undefined;
  }>,
): string[] =>
  list.map((issue) =>
    issue.fix === undefined
      ? `  ✗ ${issue.field}: ${issue.message}`
      : `  ✗ ${issue.field}: ${issue.message} (fix: ${issue.fix})`,
  );

/** `status` output. */
export const status = (result: Engines.StatusResult): string => {
  const lines = [result.ok ? `✓ ${result.path}` : `✗ ${result.path}`, `source: ${result.source}`];
  if (result.chain.length === 0) {
    lines.push('chain: none');
  } else {
    lines.push('chain:');
    lines.push(chainBlock(result.chain));
  }
  lines.push(`triggers: ${result.triggers.join(', ')}`);
  lines.push(...issues(result.issues));
  if (result.legacy) {
    lines.push('legacy opencode.jsonc options are ignored; run `mf-model-fallback migrate`.');
  }
  if (result.ok && result.chain.length === 0) {
    lines.push('not configured: run `mf-model-fallback set --chain <provider/model>,...`.');
  }
  return lines.join('\n');
};

/** `show` output. */
export const show = (result: Engines.ShowResult): string => {
  const lines = [`source: ${result.source}`, result.path];
  if (result.chain.length === 0) {
    lines.push('chain: none (not configured)');
    lines.push('Run `mf-model-fallback set --chain <provider/model>,...`.');
  } else {
    lines.push(chainBlock(result.chain));
    lines.push(`triggers: ${result.triggers.join(', ')}`);
  }
  lines.push(...issues(result.issues));
  if (result.legacy) {
    lines.push('legacy opencode.jsonc options are ignored; run `mf-model-fallback migrate`.');
  }
  return lines.join('\n');
};

const cost = (usd: number): string => `$${usd.toFixed(2)}/M out`;

const context = (tokens: number): string =>
  tokens >= 1000 ? `${Math.round(tokens / 1000)}k ctx` : `${tokens} ctx`;

/** `models` output. */
export const models = (result: Engines.ModelsResult): string => {
  if (result.available.length === 0) return 'No models available from the running host.';
  const rows = result.available.map((candidate, index) => {
    const marker = candidate.favorite ? '*' : candidate.recent ? '+' : ' ';
    const deprecated = candidate.status === 'deprecated' ? ' (deprecated)' : '';
    return `${String(index + 1).padStart(2)}${marker} ${candidate.label}  ${candidate.name}${deprecated}  ${context(candidate.context)} · ${cost(candidate.outputCost)}`;
  });
  return [...rows, '', `* favorite  + recent`, `suggested: ${result.suggested.join(',')}`].join(
    '\n',
  );
};

/** `set` output. */
export const set = (result: Engines.SetResult): string => {
  const action = result.changed ? 'Updated' : 'Unchanged';
  const lines = [
    `${action} ${result.path}`,
    chainBlock(result.chain),
    `triggers: ${result.triggers.join(', ')}`,
  ];
  if (result.unknown.length > 0) {
    lines.push(`unknown models kept (--allow-unknown): ${result.unknown.join(', ')}`);
  }
  if (!result.checked && result.note !== undefined) {
    lines.push(`not checked against the catalog: ${result.note}`);
  }
  if (result.legacy) {
    lines.push(
      'legacy opencode.jsonc options are now ignored; run `mf-model-fallback migrate` to clear them.',
    );
  }
  return lines.join('\n');
};

/** `migrate` output. */
export const migrate = (result: Engines.MigrateResult): string =>
  [
    `${result.changed ? 'Wrote' : 'Unchanged'} ${result.path}`,
    chainBlock(result.chain),
    `triggers: ${result.triggers.join(', ')}`,
    result.cleared ? 'Cleared the legacy opencode.jsonc options.' : 'No legacy options to clear.',
  ].join('\n');

/** `verify` output. */
export const verify = (result: Engines.VerifyResult): string =>
  [
    `✓ ${result.path}`,
    chainBlock(result.chain),
    `triggers: ${result.triggers.join(', ')}`,
    `${result.chain.length}/${result.chain.length} models resolve against ${result.catalog} available models.`,
  ].join('\n');

/** `remove` output. */
export const remove = (result: Engines.RemoveResult): string => {
  const lines = result.changed ? [`Removed ${result.path}.`] : [`No store file at ${result.path}.`];
  if (result.cleared) lines.push('Cleared the legacy opencode.jsonc options.');
  if (result.warning !== undefined) {
    lines.push(`Could not clear legacy options: ${result.warning}`);
  }
  return lines.join('\n');
};

/** `doctor` output. */
export const doctor = (result: Doctor.DoctorResult): string => {
  const rows = result.artifacts.map(
    (artifact) => `  ${artifact.status.padEnd(9)} ${artifact.name}  ${artifact.detail}`,
  );
  return [`doctor: ${result.status}`, ...rows, result.message].join('\n');
};
