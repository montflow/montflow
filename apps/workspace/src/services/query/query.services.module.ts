import { QueryClient } from '@tanstack/solid-query';
import { Effect } from 'effect';
import {
  featuresInstalled,
  fetchFeatures,
  type FeatureSummary,
  type FeaturesPhase,
} from '../features/features.services.module.js';
import {
  fetchProfiles,
  isExtensionInstalled as isProfilesExtensionInstalled,
  type ProfileSummary,
  type ProfileVerify,
  type ProfilesPhase,
  verifyProfile,
} from '../profiles/profiles.services.module.js';
import {
  fetchPrompts,
  isExtensionInstalled as isPromptsExtensionInstalled,
  type PromptSummary,
  type PromptsPhase,
} from '../prompts/prompts.services.module.js';
import {
  fetchRuns,
  runsInstalled,
  type RunSummary,
  type RunsPhase,
} from '../runs/runs.services.module.js';
import {
  fetchSkills,
  isExtensionInstalled,
  type SkillSummary,
  type SkillsPhase,
} from '../skills/skills.services.module.js';

/** Cached skills-list snapshot behind the `skills` query key. */
export interface SkillsList {
  readonly installed: boolean;
  readonly rows: ReadonlyArray<SkillSummary>;
}

/**
 * Query key for the workspace skills list. Single source for the
 * fetch, the delete cache patches, and invalidation — every skills
 * read/write in `app.tsx` goes through this key.
 */
export const skillsKey = ['skills'] as const;

/** Cached profiles-list snapshot behind the `profiles` query key. */
export interface ProfilesList {
  readonly installed: boolean;
  readonly rows: ReadonlyArray<ProfileSummary>;
}

/**
 * Query key for the workspace profiles list. Mirrors `skillsKey` —
 * every profiles read/write in `app.tsx` goes through this key so
 * flow completions update the UI through the cache, never signals.
 */
export const profilesKey = ['profiles'] as const;

/**
 * Query key for one profile's verification result. Stable per id — the
 * key collapses to `['profile-verify', id]`, so the cache-first client
 * reuses the cached result when the same profile is revisited and never
 * refetches behind the user's back.
 * @param id - profile slug
 * @returns stable cache key
 */
export const profileVerifyKey = (id: string) => ['profile-verify', id] as const;

/** Cached prompts-list snapshot behind the `prompts` query key. */
export interface PromptsList {
  readonly installed: boolean;
  readonly rows: ReadonlyArray<PromptSummary>;
}

/**
 * Query key for the workspace prompts list. Mirrors `skillsKey` —
 * every prompts read/write in `app.tsx` goes through this key so flow
 * completions update the UI through the cache, never signals.
 */
export const promptsKey = ['prompts'] as const;

/** Cached runs-list snapshot behind the `runs` query key. */
export interface RunsList {
  readonly installed: boolean;
  readonly rows: ReadonlyArray<RunSummary>;
}

/**
 * Query key for the workspace runs list. Mirrors `skillsKey` —
 * every runs read/write in `app.tsx` goes through this key so flow
 * completions update the UI through the cache, never signals.
 */
export const runsKey = ['runs'] as const;

/** Cached features-list snapshot behind the `features` query key. */
export interface FeaturesList {
  readonly installed: boolean;
  readonly rows: ReadonlyArray<FeatureSummary>;
}

/**
 * Query key for the workspace features list. Mirrors `skillsKey` —
 * the features panel is read-only, so this key only fetches and
 * invalidates.
 */
export const featuresKey = ['features'] as const;

/**
 * TUI-tuned client: cache-first (`staleTime` infinity — the list only
 * moves on explicit invalidate/patch, never behind the user's back),
 * no window-focus or reconnect refetch (no browser in the TUI loop),
 * one retry so a failing file read surfaces fast.
 * @returns fresh query client for the composition root provider
 */
export const makeQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        retry: 1,
      },
    },
  });

/**
 * Skills-list query bridge: the staged boot (extension check, then the
 * list read) as one TanStack query. Resolves the installed flag with
 * the rows so the panel never needs a second read; rejects with a
 * displayable Error the caller toasts. Reports each stage through
 * `onPhase` so the panel Loader keeps narrating step by step.
 * @param root - workspace root (skill store owner)
 * @param onPhase - Loader stage reporter (`extension`, then `skills`)
 * @returns Promise resolving to the list snapshot
 */
export const fetchSkillsList = (
  root: string,
  onPhase: (phase: SkillsPhase) => void,
): Promise<SkillsList> =>
  isExtensionInstalled(root).pipe(
    Effect.flatMap((installed) => {
      onPhase('extension');
      if (!installed) {
        const empty: SkillsList = { installed, rows: [] };
        return Effect.succeed(empty);
      }
      onPhase('skills');
      return fetchSkills(root).pipe(
        Effect.map((rows) => ({ installed, rows })),
        Effect.mapError((message) => new Error(message)),
      );
    }),
    Effect.runPromise,
  );

/**
 * Profiles-list query bridge: same staged boot as `fetchSkillsList`
 * (extension check, then the list read) as one TanStack query.
 * @param root - workspace root (profile store owner)
 * @param onPhase - Loader stage reporter (`extension`, then `profiles`)
 * @returns Promise resolving to the list snapshot
 */
export const fetchProfilesList = (
  root: string,
  onPhase: (phase: ProfilesPhase) => void,
): Promise<ProfilesList> =>
  isProfilesExtensionInstalled(root).pipe(
    Effect.flatMap((installed) => {
      onPhase('extension');
      if (!installed) {
        const empty: ProfilesList = { installed, rows: [] };
        return Effect.succeed(empty);
      }
      onPhase('profiles');
      return fetchProfiles(root).pipe(
        Effect.map((rows) => ({ installed, rows })),
        Effect.mapError((message) => new Error(message)),
      );
    }),
    Effect.runPromise,
  );

/**
 * Profile-verification query bridge: read one raw `PROFILE.md` and run
 * the extension's mechanical check through {@link verifyProfile}. The
 * key is `['profile-verify', id]` and the client is cache-first, so
 * navigating away and back reuses the cached result instead of
 * re-reading the file.
 * @param root - workspace root (profile store owner)
 * @param id - profile slug
 * @returns Promise resolving to the verify result, rejecting with a displayable Error
 */
export const fetchProfileVerify = (root: string, id: string): Promise<ProfileVerify> =>
  verifyProfile(root, id).pipe(
    Effect.mapError((message) => new Error(message)),
    Effect.runPromise,
  );

/**
 * Prompts-list query bridge: same staged boot as `fetchSkillsList`
 * (extension check, then the list read) as one TanStack query.
 * @param root - workspace root (prompt store owner)
 * @param onPhase - Loader stage reporter (`extension`, then `prompts`)
 * @returns Promise resolving to the list snapshot
 */
export const fetchPromptsList = (
  root: string,
  onPhase: (phase: PromptsPhase) => void,
): Promise<PromptsList> =>
  isPromptsExtensionInstalled(root).pipe(
    Effect.flatMap((installed) => {
      onPhase('extension');
      if (!installed) {
        const empty: PromptsList = { installed, rows: [] };
        return Effect.succeed(empty);
      }
      onPhase('prompts');
      return fetchPrompts(root).pipe(
        Effect.map((rows) => ({ installed, rows })),
        Effect.mapError((message) => new Error(message)),
      );
    }),
    Effect.runPromise,
  );

/**
 * Runs-list query bridge: same staged boot as `fetchSkillsList`
 * (store-directory check, then the list read) as one TanStack query.
 * @param root - workspace root (runs store owner)
 * @param onPhase - Loader stage reporter (`extension`, then `runs`)
 * @returns Promise resolving to the list snapshot
 */
export const fetchRunsList = (
  root: string,
  onPhase: (phase: RunsPhase) => void,
): Promise<RunsList> =>
  runsInstalled(root).pipe(
    Effect.flatMap((installed) => {
      onPhase('extension');
      if (!installed) {
        const empty: RunsList = { installed, rows: [] };
        return Effect.succeed(empty);
      }
      onPhase('runs');
      return fetchRuns(root).pipe(
        Effect.map((rows) => ({ installed, rows })),
        Effect.mapError((message) => new Error(message)),
      );
    }),
    Effect.runPromise,
  );

/**
 * Features-list query bridge: same staged boot as `fetchSkillsList`
 * (directory check, then the verify/analyze read) as one TanStack
 * query. Read-only — there is no create/delete/install flow.
 * @param root - workspace root (features directory owner)
 * @param onPhase - Loader stage reporter (`extension`, then `features`)
 * @returns Promise resolving to the list snapshot
 */
export const fetchFeaturesList = (
  root: string,
  onPhase: (phase: FeaturesPhase) => void,
): Promise<FeaturesList> =>
  featuresInstalled(root).pipe(
    Effect.flatMap((installed) => {
      onPhase('extension');
      if (!installed) {
        const empty: FeaturesList = { installed, rows: [] };
        return Effect.succeed(empty);
      }
      onPhase('features');
      return fetchFeatures(root).pipe(
        Effect.map((rows) => ({ installed, rows })),
        Effect.mapError((message) => new Error(message)),
      );
    }),
    Effect.runPromise,
  );
