import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
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
import {
  getProfileViaBus,
  isProfilesExtensionLoaded,
  profileToReviewerProfile,
  PROFILES_INSTALL_HINT,
} from './profiles-client';
import type { PresetLoopConfigDecoded, ReviewerRefDecoded } from './preset-schema';

/**
 * Resolves one stored reviewer reference to a full runtime reviewer profile.
 * Builtin ids expand from the builtin catalog; profile references are fetched
 * over the profiles event bus (the same source the wizard uses when building
 * a roster). All derived fields (objective, bundled skill path) come from the
 * source — nothing is baked into the preset file.
 * @param {ExtensionAPI} pi The Pi extension API (event bus for profiles)
 * @param {ExtensionContext} ctx The command context
 * @param {ReviewerRefDecoded} ref The stored reference
 * @returns The resolved reviewer profile, or null on error (already notified)
 */
export const resolveReviewerRef = async (
  pi: ExtensionAPI,
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
      skillPath: builtin.skillPath,
      objective: builtin.objective,
    });
  }

  if (ref.name === undefined) {
    ctx.ui.notify('Preset has a profile reviewer reference without a name.', 'error');
    return null;
  }
  if (!isProfilesExtensionLoaded(pi)) {
    ctx.ui.notify(PROFILES_INSTALL_HINT, 'error');
    return null;
  }
  const result = await getProfileViaBus(pi, ref.name, ctx.cwd);
  if (!result.ok) {
    ctx.ui.notify(
      `Profile '${ref.name}' referenced by the preset was not found: ${result.error}`,
      'error',
    );
    return null;
  }
  return profileToReviewerProfile(result.profile, ref.model, ref.fallbackModels);
};

/**
 * Resolves a stored (reference-based) loop config to the runtime
 * {@link LoopConfig}, expanding every reviewer reference and filling the
 * always-bundled supervisor/reviewer skill paths.
 * @param {ExtensionAPI} pi The Pi extension API (event bus for profiles)
 * @param {ExtensionContext} ctx The command context
 * @param {PresetLoopConfigDecoded} stored The stored config
 * @returns The runtime loop config, or null when a reviewer cannot be resolved
 */
export const resolvePresetConfig = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  stored: PresetLoopConfigDecoded,
): Promise<LoopConfig | null> => {
  const reviewers: ReviewerProfile[] = [];
  for (const ref of stored.reviewers) {
    const reviewer = await resolveReviewerRef(pi, ctx, ref);
    if (reviewer === null) return null;
    reviewers.push(reviewer);
  }
  return {
    reviewers,
    supervisor: {
      model: stored.supervisor.model,
      skillPath: SUPERVISOR_SKILL_PATH,
      fallbackModels: stored.supervisor.fallbackModels,
    },
    fixerModel: stored.fixerModel,
    fixerFallbackModels: stored.fixerFallbackModels,
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
    deadlock: stored.deadlock,
  };
};
