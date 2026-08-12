import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  BUILTIN_REVIEWERS,
  DEFAULT_AGENT_CONCURRENCY,
  DEFAULT_MAX_CYCLES,
  DEFAULT_MAX_LOOPS,
  makeReviewerProfile,
  type LoopConfig,
  type ReviewerProfile,
} from './config';
import { SUPERVISOR_SKILL_PATH } from './skill-paths';
import { getProfile, profileToReviewerProfile } from './profiles-client';
import {
  isLoopConfig,
  type PresetLoopConfigDecoded,
  type ReviewerRefDecoded,
  type ReviewPresetDecoded,
} from './preset-schema';

/**
 * Resolves one stored reviewer reference to a full runtime reviewer profile.
 * Builtin ids expand from the builtin catalog; profile references are read
 * directly from the merged profiles store (the same source the wizard uses
 * when building a roster). All derived fields (objective, bundled skill path)
 * come from the source — nothing is baked into the preset file.
 * @param {ExtensionContext} ctx The command context
 * @param {ReviewerRefDecoded} ref The stored reference
 * @returns The resolved reviewer profile, or null on error (already notified)
 */
export const resolveReviewerRef = async (
  ctx: ExtensionContext,
  ref: ReviewerRefDecoded,
): Promise<ReviewerProfile | null> => {
  if (ref.type === 'builtin') {
    if (ref.id === undefined) {
      ctx.ui.notify('Preset has a builtin reviewer reference without an id.', 'error');
      return null;
    }
    const builtin = BUILTIN_REVIEWERS[ref.id];
    if (builtin === undefined) {
      ctx.ui.notify(`Unknown builtin reviewer '${ref.id}' in preset.`, 'error');
      return null;
    }
    const model =
      ref.model !== undefined && ref.model.trim() !== '' ? ref.model : builtin.defaultModel;
    return makeReviewerProfile({
      id: builtin.id,
      label: builtin.label,
      model,
      fallbackModels: ref.fallbackModels,
      thinkingLevel: ref.thinkingLevel,
      skillPath: builtin.skillPath,
      objective: builtin.objective,
    });
  }

  if (ref.name === undefined) {
    ctx.ui.notify('Preset has a profile reviewer reference without a name.', 'error');
    return null;
  }
  const result = await getProfile(ref.name, ctx.cwd);
  if (!result.ok) {
    ctx.ui.notify(
      `Profile '${ref.name}' referenced by the preset was not found: ${result.error}`,
      'error',
    );
    return null;
  }
  return profileToReviewerProfile(result.profile, ref.model, ref.fallbackModels, ref.thinkingLevel);
};

/**
 * Resolves a stored preset to a runtime {@link LoopConfig}. Loop presets
 * expand every reviewer reference and fill the always-bundled skill paths;
 * workflow presets are not executable yet — the user is notified and null is
 * returned so the caller can abort the flow.
 * @param {ExtensionContext} ctx The command context
 * @param {ReviewPresetDecoded} preset The stored preset
 * @returns The runtime loop config, or null when the preset is a workflow or a reviewer cannot be resolved
 */
export const resolveLoopPreset = async (
  ctx: ExtensionContext,
  preset: ReviewPresetDecoded,
): Promise<LoopConfig | null> => {
  if (!isLoopConfig(preset.config)) {
    ctx.ui.notify(
      `Preset '${preset.name}' is a workflow preset — workflows are not executable yet. ` +
        'Edit it as JSON for now.',
      'error',
    );
    return null;
  }
  return resolvePresetConfig(ctx, preset.config);
};

/**
 * Resolves a stored (reference-based) loop config to the runtime
 * {@link LoopConfig}, expanding every reviewer reference and filling the
 * always-bundled supervisor/reviewer skill paths.
 * @param {ExtensionContext} ctx The command context
 * @param {PresetLoopConfigDecoded} stored The stored config
 * @returns The runtime loop config, or null when a reviewer cannot be resolved
 */
export const resolvePresetConfig = async (
  ctx: ExtensionContext,
  stored: PresetLoopConfigDecoded,
): Promise<LoopConfig | null> => {
  const reviewers: ReviewerProfile[] = [];
  for (const ref of stored.reviewers) {
    const reviewer = await resolveReviewerRef(ctx, ref);
    if (reviewer === null) return null;
    reviewers.push(reviewer);
  }
  return {
    reviewers,
    supervisor: {
      model: stored.supervisor.model,
      skillPath: SUPERVISOR_SKILL_PATH,
      fallbackModels: stored.supervisor.fallbackModels,
      thinkingLevel: stored.supervisor.thinkingLevel,
    },
    fixerModel: stored.fixerModel,
    fixerFallbackModels: stored.fixerFallbackModels,
    fixerThinkingLevel: stored.fixerThinkingLevel,
    // Legacy presets predate the loop/cycle split: their maxLoops meant
    // review cycles, so it becomes the per-loop cycle cap with the default
    // loop count (mirrors normalizeStoredConfig in loop-state.ts).
    maxLoops:
      stored.maxCycles !== undefined && stored.maxCycles > 0
        ? stored.maxLoops
        : DEFAULT_MAX_LOOPS,
    maxCycles:
      stored.maxCycles !== undefined && stored.maxCycles > 0
        ? stored.maxCycles
        : stored.maxLoops > 0
          ? stored.maxLoops
          : DEFAULT_MAX_CYCLES,
    agentConcurrency: stored.agentConcurrency ?? DEFAULT_AGENT_CONCURRENCY,
    supervisorTimeoutMs: stored.supervisorTimeoutMs,
    deadlock: stored.deadlock,
  };
};
