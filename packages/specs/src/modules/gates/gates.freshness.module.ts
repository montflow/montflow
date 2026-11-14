import { normalizeScopeList, scopeContains } from '../scheduler/scope.module.js';
import { type Issue, type Result, finding, noErrors } from '../verify/index.js';

import { GATE_CODES, GATE_RESULTS_FILE, type GateResult, latestResults } from './gates.module.js';
/** Input for {@link verifyResultFreshness}. */
export interface FreshnessInput {
  /** Every record the owner's results file carries. */
  readonly records: ReadonlyArray<GateResult>;
  /** Owner label: the task id, or `phase <id>`. */
  readonly owner: string;
  /** True when the owning task or phase declares complete. */
  readonly complete: boolean;
  /**
   * Recompute the run key a record should carry now, or undefined when its
   * scopes cannot be read (then freshness is unknowable, not stale).
   */
  readonly recompute: (record: GateResult) => string | undefined;
  /**
   * The scope the owning stage declares now, after `stageScope` and the owner
   * fallback. A record whose `scope` differs from it cannot prove the stage.
   */
  readonly declaredScope?: ((record: GateResult) => ReadonlyArray<string> | undefined) | undefined;
  /** True when a record's own scope names a path that no longer exists. */
  readonly missingScope?: ((record: GateResult) => boolean) | undefined;
}

/**
 * Verify that the effective pass per stage still matches its current
 * fingerprint, and that an effective pass carries a run key. Only the latest
 * record per stage is effective — the same rule `verifyGateResults` applies —
 * so a rerun under a new key supersedes an older pass and an append-only results
 * file never bricks a spec. A lone pass whose inputs changed, with no later
 * rerun, is still `gate.stale-result` (error); a later failure supersedes the
 * pass instead of laundering it into green. An effective pass on an unfinished
 * owner with no key is `gate.result-unkeyed` (warning); a complete owner is
 * normally exempt as a legacy record, but a stage that declares its own scope
 * must carry a key, so its unkeyed pass is an error. A keyed pass must carry the
 * `scope` and `fingerprint` its key was computed from; without them the key
 * cannot be checked, so the record is `gate.results-malformed`, not accepted.
 * @param input - records, owner label, completion, and the key recomputation
 * @returns the findings; `valid` is true only with zero errors
 */
export const verifyResultFreshness = (input: FreshnessInput): Result => {
  const issues: Array<Issue> = [];
  for (const record of latestResults(input.records).values()) {
    if (record.kind !== 'mechanical') continue;
    const declared = input.declaredScope?.(record);
    if (record.verdict === 'pass' && record.key === undefined) {
      // Legacy records predate the key grammar. A stage that names its own
      // `scope:` is not legacy: a complete owner's unkeyed pass there could be
      // hand-written, so it stays an error instead of being exempt.
      if (!input.complete) {
        issues.push(
          finding({
            code: GATE_CODES.resultUnkeyed,
            severity: 'warning',
            field: GATE_RESULTS_FILE,
            message: `${input.owner} records a pass for stage ${record.stage} with no run key, so its fingerprint cannot be checked.`,
            expected: 'a `key` and `fingerprint` written by `gate run`',
            actual: 'no key',
            fix: `Re-run mf-specs gate run for stage ${record.stage}; a hand-written or pre-scheduler record proves nothing.`,
          }),
        );
      } else if (declared !== undefined) {
        issues.push(
          finding({
            code: GATE_CODES.resultUnkeyed,
            severity: 'error',
            field: GATE_RESULTS_FILE,
            message: `${input.owner} is complete and records an unkeyed pass for stage ${record.stage}, whose declared scope makes a key mandatory.`,
            expected: 'a `key` and `fingerprint` written by `gate run`',
            actual: 'no key',
            fix: `Re-run mf-specs gate run for stage ${record.stage}; a hand-written record proves nothing.`,
          }),
        );
      }
      continue;
    }
    if (record.verdict !== 'pass' || record.key === undefined) continue;
    // A keyed record must carry the inputs its key was computed from. A key
    // alone is a claim, and a hand-written one would otherwise skip freshness
    // and satisfy `check --require-complete`.
    if (record.scope === undefined || record.fingerprint === undefined) {
      issues.push(
        finding({
          code: GATE_CODES.resultsMalformed,
          severity: 'error',
          field: GATE_RESULTS_FILE,
          message: `${input.owner} records a keyed pass for stage ${record.stage} with no ${record.scope === undefined ? 'scope' : 'fingerprint'}, so its key cannot be checked.`,
          expected: 'a `scope` and `fingerprint` written by `gate run`',
          actual: record.scope === undefined ? 'no scope' : 'no fingerprint',
          fix: `Re-run mf-specs gate run for stage ${record.stage}; a keyed record without its inputs proves nothing.`,
        }),
      );
      continue;
    }
    if (record.command === undefined) continue;
    // Recompute against the stage's declared scope first. Recomputing against
    // the record's own scope would let a later pass under a different scope
    // hide a stale pass for the scope the stage actually declares. A pass that
    // covers the declared scope (a widening `--scope`) is still proof.
    if (
      declared !== undefined &&
      !scopeContains(normalizeScopeList(record.scope), normalizeScopeList(declared))
    ) {
      issues.push(
        finding({
          code: GATE_CODES.staleResult,
          severity: 'error',
          field: GATE_RESULTS_FILE,
          message: `${input.owner} records a pass for stage ${record.stage} under scope '${record.scope.join(',')}', but the stage declares '${declared.join(',')}'.`,
          expected: `a pass covering the declared scope (${declared.join(',')})`,
          actual: `scope ${record.scope.join(',')}`,
          fix: `Re-run mf-specs gate run for stage ${record.stage} with the stage's declared scope.`,
        }),
      );
      continue;
    }
    const currentKey = input.recompute(record);
    if (currentKey === undefined) {
      if (input.missingScope?.(record) === true) {
        issues.push(
          finding({
            code: GATE_CODES.scopeMissing,
            severity: 'warning',
            field: GATE_RESULTS_FILE,
            message: `${input.owner} records a pass for stage ${record.stage}, but its scope '${record.scope.join(',')}' no longer exists.`,
            expected: 'a scope path that still exists under the workspace',
            actual: record.scope.join(', '),
            fix: `Restore the path, or re-run mf-specs gate run for stage ${record.stage} with the current scope.`,
          }),
        );
      }
      continue;
    }
    if (currentKey === record.key) continue;
    issues.push(
      finding({
        code: GATE_CODES.staleResult,
        severity: 'error',
        field: GATE_RESULTS_FILE,
        message: `${input.owner} records a pass for stage ${record.stage} under key ${record.key}, but the current inputs recompute to ${currentKey}.`,
        expected: `a pass whose key matches the current fingerprint (${record.fingerprint ?? 'unknown'})`,
        actual: `key ${record.key} · fingerprint ${record.fingerprint ?? 'unknown'}`,
        fix: `Re-run mf-specs gate run for stage ${record.stage}; the recorded green no longer covers the current inputs.`,
      }),
    );
  }
  return { valid: noErrors(issues), issues };
};
