import type * as Doctor from '../doctor/index.js';
import { ModelChain } from '../../modules/index.js';
import type * as Engines from './engines.apps.module.js';

/**
 * Pure `data -> text` renderers. Token-lean by default, no ANSI, failures never
 * suppressed: this output is read by agents as often as by humans.
 */

/** One-line usage summary. */
export const USAGE = `mf-model-fallback — show, set, and verify model fallback chains.

Usage:
  mf-model-fallback show [--json] [--dir <path>]
  mf-model-fallback models [--json] [--dir <path>] [--server <url>] [--limit <n>]
  mf-model-fallback set --chain <a/b,c/d> [--trigger <name,...>] [--allow-unknown]
                         [--json] [--dir <path>] [--server <url>]
  mf-model-fallback verify [--json] [--dir <path>] [--server <url>]
  mf-model-fallback doctor [--check] [--json] [--dir <path>]
  mf-model-fallback remove [--json] [--dir <path>]

Triggers: quota, rate-limit, auth, timeout, provider-internal, transport.
Default triggers: quota, rate-limit, auth.`;

const label = (ref: ModelChain.Ref): string => ModelChain.label(ref);

const chainBlock = (chain: ReadonlyArray<ModelChain.Ref>): string =>
  chain.map((ref, index) => `  ${index + 1}. ${label(ref)}`).join('\n');

/** `show` output. */
export const show = (result: Engines.ShowResult): string => {
  if (result.chain.length === 0) {
    const state = result.present ? 'No fallback chain configured' : 'No config file yet';
    return `${state} (${result.path}).\nRun \`mf-model-fallback set --chain <provider/model>,...\`.`;
  }
  return [result.path, chainBlock(result.chain), `triggers: ${result.triggers.join(', ')}`].join(
    '\n',
  );
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
  return lines.join('\n');
};

/** `verify` output. */
export const verify = (result: Engines.VerifyResult): string =>
  [
    `✓ ${result.path}`,
    chainBlock(result.chain),
    `triggers: ${result.triggers.join(', ')}`,
    `${result.chain.length}/${result.chain.length} models resolve against ${result.catalog} available models.`,
  ].join('\n');

/** `remove` output. */
export const remove = (result: Engines.RemoveResult): string =>
  result.changed
    ? `Removed the model-fallback entry from ${result.path}.`
    : `No model-fallback entry in ${result.path}.`;

/** `doctor` output. */
export const doctor = (result: Doctor.DoctorResult): string => {
  const rows = result.artifacts.map(
    (artifact) => `  ${artifact.status.padEnd(9)} ${artifact.name}  ${artifact.detail}`,
  );
  return [`doctor: ${result.status}`, ...rows, result.message].join('\n');
};
