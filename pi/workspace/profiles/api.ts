import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import * as Model from './model.ts';
import { runStore } from './runtime.ts';
import * as Store from './store.ts';

/**
 * Inter-extension API: how OTHER extensions read profile context.
 *
 * The profiles feature is **merged into @montflow/workspace** — the workspace
 * extension registers this bus server at load time. External consumers read
 * profiles over this bus; this
 * bus exists for external consumers that cannot import the store.
 *
 * This extension never executes anything (no activation, no model switching,
 * no prompt injection). It only stores profiles. Consumers ask for profile
 * data over the shared event bus and get a typed result back:
 *
 * ```ts
 * import { getProfileViaBus, listProfilesViaBus } from '@montflow/workspace/profiles/api';
 *
 * const result = await getProfileViaBus(pi, 'code-reviewer', ctx.cwd);
 * if (result.ok) {
 *   console.log(result.profile.description, result.profile.skills);
 * }
 * const names = await listProfilesViaBus(pi, ctx.cwd);
 * ```
 *
 * Raw protocol (for consumers that cannot import the helpers):
 * - emit `profiles:get`   `{ id, name, cwd }`            → result on `profiles:get:result`
 * - emit `profiles:list`  `{ id, cwd }`                  → result on `profiles:list:result`
 *
 * Results echo `id` back; consumers match on it to correlate the response.
 */

export const PROFILES_GET_CHANNEL = 'profiles:get';
export const PROFILES_GET_RESULT_CHANNEL = 'profiles:get:result';
export const PROFILES_LIST_CHANNEL = 'profiles:list';
export const PROFILES_LIST_RESULT_CHANNEL = 'profiles:list:result';

/** Default time the client waits for a response before resolving a timeout error. */
export const DEFAULT_TIMEOUT_MS = 5000;

/** Request for a single profile. `id` correlates the response. */
export interface ProfilesGetRequest {
  readonly id: string;
  readonly name: string;
  readonly cwd: string;
}

export type ProfilesGetResult =
  | { readonly id: string; readonly ok: true; readonly profile: Model.Profile }
  | { readonly id: string; readonly ok: false; readonly error: string };

/** Request for the list of profile names. `id` correlates the response. */
export interface ProfilesListRequest {
  readonly id: string;
  readonly cwd: string;
}

export type ProfilesListResult =
  | { readonly id: string; readonly ok: true; readonly names: readonly string[] }
  | { readonly id: string; readonly ok: false; readonly error: string };

const newId = (): string =>
  typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ─── Server side ─────────────────────────────────────────────────────

/**
 * Registers the event-bus listeners that serve profile context to other
 * extensions. Called from the extension factory.
 */
export const registerProfileApi = (pi: ExtensionAPI): void => {
  pi.events.on(PROFILES_GET_CHANNEL, (data) => {
    const request = data as ProfilesGetRequest;
    void (async () => {
      const result = await getProfileForApi(request.cwd, request.name);
      pi.events.emit(PROFILES_GET_RESULT_CHANNEL, { id: request.id, ...result } satisfies ProfilesGetResult);
    })();
  });

  pi.events.on(PROFILES_LIST_CHANNEL, (data) => {
    const request = data as ProfilesListRequest;
    void (async () => {
      const result = await listProfilesForApi(request.cwd);
      pi.events.emit(PROFILES_LIST_RESULT_CHANNEL, { id: request.id, ...result } satisfies ProfilesListResult);
    })();
  });
};

/** Reads + parses a profile for the API. Never throws; failures become `{ ok: false }`. */
const getProfileForApi = async (
  cwd: string,
  name: string,
): Promise<{ readonly ok: true; readonly profile: Model.Profile } | { readonly ok: false; readonly error: string }> => {
  try {
    const markdown = await runStore(Store.readProfileFile(cwd, name));
    return { ok: true, profile: Model.parseProfile(markdown, name) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

/** Lists profile names for the API. Never throws. */
const listProfilesForApi = async (cwd: string): Promise<{ readonly ok: true; readonly names: readonly string[] }> => {
  try {
    const names = await runStore(Store.listProfiles(cwd));
    return { ok: true, names };
  } catch {
    return { ok: true, names: [] };
  }
};

// ─── Client side ─────────────────────────────────────────────────────

/**
 * Requests a single parsed profile over the event bus.
 * Resolves with the result whose correlation id matches this request, or a
 * timeout error when the profiles server is not registered.
 */
export const getProfileViaBus = (
  pi: ExtensionAPI,
  name: string,
  cwd: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ProfilesGetResult> => {
  const id = newId();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      off();
      resolve({ id, ok: false, error: `profiles:get timed out after ${timeoutMs}ms (profiles server not registered?)` });
    }, timeoutMs);
    const off = pi.events.on(PROFILES_GET_RESULT_CHANNEL, (data) => {
      const result = data as ProfilesGetResult;
      if (result.id === id) {
        clearTimeout(timer);
        off();
        resolve(result);
      }
    });
    const request: ProfilesGetRequest = { id, name, cwd };
    pi.events.emit(PROFILES_GET_CHANNEL, request);
  });
};

/** Requests the list of profile names over the event bus. */
export const listProfilesViaBus = (
  pi: ExtensionAPI,
  cwd: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ProfilesListResult> => {
  const id = newId();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      off();
      resolve({ id, ok: false, error: `profiles:list timed out after ${timeoutMs}ms (profiles server not registered?)` });
    }, timeoutMs);
    const off = pi.events.on(PROFILES_LIST_RESULT_CHANNEL, (data) => {
      const result = data as ProfilesListResult;
      if (result.id === id) {
        clearTimeout(timer);
        off();
        resolve(result);
      }
    });
    const request: ProfilesListRequest = { id, cwd };
    pi.events.emit(PROFILES_LIST_CHANNEL, request);
  });
};
