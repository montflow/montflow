import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { seedMockRunGlobal, useUiSocket } from './useUiSocket'
import type { LoopAgent, LoopDetail, LoopSummary } from '../protocol'

/**
 * TEMPORARY front-end mock for the loops feature.
 *
 * The real loops backend (kickoff → supervisor run → resumable state file,
 * served from `/api/workspaces/<id>/loops`) is still under construction. To
 * keep the Loops section + detail + agent run pages exercisable end-to-end,
 * loops AND their agent transcripts are persisted to localStorage per
 * workspace. Every time the loops data loads, the agent runs are re-seeded
 * into the socket's run store — so a run page always shows content, even
 * after a reload.
 *
 * Model: the SUPERVISOR is ONE continuous context (a single run whose
 * transcript grows — it resumes to aggregate once reviewers finish).
 * Reviewers are separate fan-out runs during the reviewing phase.
 *
 * The transcripts are SCRIPTED for visibility (the user reads them as if
 * they were real agent streams): the supervisor's run shows the resolved
 * scope (in-scope files, boundaries, per-role prompts) and the canonical
 * aggregate; each reviewer run shows the brief it received, the files it
 * read, and its concrete findings (file/location/severity/recommendation).
 *
 * Replace load/save + the simulation with server calls when the backend lands.
 */

// v2 — invalidates mock transcripts persisted before the runs carried real
// supervisor-brief + reviewer-thought content (stale data just looks broken).
const STORAGE_PREFIX = 'montflow:loops:mock:v2:'

/** A persisted agent run transcript (seeded into the socket on load). */
interface MockRunState {
  status: 'running' | 'done' | 'interrupted'
  title?: string
  entries: Array<{ role: 'user' | 'assistant'; text: string }>
  tools: Array<{ name: string; status: 'running' | 'done' | 'error'; turn: number }>
}

/**
 * A mock loop row — the detail shape plus its run transcripts and a FULL
 * roster of every agent (supervisor + reviewers) that worked on the loop.
 * `roster` stays populated after the loop finishes, so the detail page can
 * always offer click-through to each agent's run — unlike `agents` (the
 * protocol field), which only holds currently-working agents.
 */
type MockLoop = LoopDetail & {
  runs: Record<string, MockRunState>
  roster: LoopAgent[]
}

const storageKey = (workspaceId: string): string => STORAGE_PREFIX + workspaceId

const loadMockLoops = (workspaceId: string): MockLoop[] => {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId))
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as MockLoop[]) : []
  } catch {
    return []
  }
}

const saveMockLoops = (workspaceId: string, loops: MockLoop[]): void => {
  try {
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(loops))
  } catch {
    // Storage unavailable (private mode) — best effort only.
  }
}

/** Full kickoff brief shown as the supervisor's input — nothing truncated. */
const buildKickoffBrief = (options: KickoffOptions): string =>
  options.scope.type === 'agentic'
    ? `Kick off an agentic review loop.

Preset: ${options.preset}
Scope: agentic

Goal:
${options.scope.goal}

Resolve the goal into a concrete review brief — identify the files and changes in scope, spell out the review boundaries, and prepare the per-role prompts (reviewers, aggregation, fixer) the loop will use. Keep the loop's state file in sync as you go.`
    : `Kick off a git-unstaged review loop.

Preset: ${options.preset}
Scope: git unstaged

Read the current uncommitted diff, resolve it into a concrete review brief — identify the files and changes in scope, spell out the review boundaries, and prepare the per-role prompts (reviewers, aggregation, fixer) the loop will use. Keep the loop's state file in sync as you go.`

// ---------------------------------------------------------------------------
// Scripted transcripts (mock) — the content the reviewer/supervisor runs show.
// ---------------------------------------------------------------------------

/**
 * Mock scope the supervisor "resolves" for every kickoff. In the real flow
 * this comes from the diff/review target; here it is a fixed, plausible
 * auth/session target so the runs read like a real pass.
 */
const MOCK_SCOPE = {
  target: 'the auth/session area',
  files: [
    'src/server/auth/session.ts',
    'src/server/auth/password.ts',
    'src/server/routes/auth.ts',
  ],
  outOfScope: 'config/secrets loading, deployment infra, the SPA frontend',
} as const

/**
 * The resolved supervisor brief — shown in the supervisor's run so the scope
 * the reviewers were handed is visible (target, files, boundaries, prompts).
 */
const buildSupervisorResolution = (options: KickoffOptions): string => {
  const target =
    options.scope.type === 'agentic'
      ? `the implementation area implied by the goal${options.scope.goal.trim() !== '' ? ` — “${options.scope.goal.trim().slice(0, 100)}”` : ''}`
      : 'the current uncommitted diff'
  return `Scope resolved for this pass.

Review target: ${target} — mapped to the in-scope files below.

In-scope files:
- src/server/auth/session.ts — session cookie issuance + validation (new)
- src/server/auth/password.ts — password hashing + reset (new)
- src/server/routes/auth.ts — login / logout / register handlers (reworked)

Out of scope: ${MOCK_SCOPE.outOfScope}.

Reviewers briefed for this pass:
- security — auth-focused audit: cookie flags, token entropy, password storage, timing, rate-limit placement
- quality — code quality & maintainability of the changed paths

Per-role prompts prepared; the loop state file reflects the resolved scope.`
}

/** Per-lens instructions handed to each reviewer (mirrors a profile's objective). */
const REVIEWER_LENS_INSTRUCTIONS: Record<'security' | 'quality', string> = {
  security:
    'Audit the in-scope files for security and authentication weaknesses — session fixation, cookie flagging, predictable tokens, timing-unsafe comparison, password storage, missing authorization checks. Give each finding a file/location, a severity, and a concrete recommendation.',
  quality:
    'Audit the in-scope files for code quality and maintainability — duplication, error handling, cohesion, dead code. Give each finding a file/location, a severity, and a concrete recommendation.',
}

/**
 * The supervisor's brief as handed to ONE reviewer: the scope + files it must
 * look at and that reviewer's lens. `resume` flavors it as a re-check.
 */
const buildReviewerBrief = (lens: 'security' | 'quality', resume: boolean): string => {
  const opening = resume
    ? 'review the in-scope files against the last pass (resume): re-check every previously reported finding, confirm or update it, and flag anything new.'
    : 'review the scoped target for this pass.'
  const files = MOCK_SCOPE.files.map((file) => `- ${file}`).join('\n')
  return `Supervisor brief — ${opening}

Review target: ${MOCK_SCOPE.target}.

In-scope files:\n${files}

Out of scope: ${MOCK_SCOPE.outOfScope}.

Lens: Reviewer: ${lens}.\n${REVIEWER_LENS_INSTRUCTIONS[lens]}

Write findings to scratch only — the supervisor owns the canonical review.`
}

/** Per-lens scan (turn 1) and findings writeup (turn 2) for fresh reviewer runs. */
const REVIEWER_SCANS: Record<'security' | 'quality', string> = {
  security: `Scanning the in-scope files for auth weaknesses.

session.ts — cookies are issued without Secure/HttpOnly; the token comes from a timestamp rather than a CSPRNG.
password.ts — hashing looks like bare SHA-256 with no per-user salt or work factor.
routes/auth.ts — checking the login handler for rate-limit placement and authz checks on logout/register.`,
  quality: `Scanning the in-scope files for quality and maintainability concerns.

routes/auth.ts — login and register duplicate the input-validation and error-handling boilerplate.
session.ts — cookie parsing is inline, mixing format concerns with session policy.
password.ts — the reset flow mixes hashing logic with email-sending concerns.`,
}

const REVIEWER_FINDINGS: Record<'security' | 'quality', string> = {
  security: `Findings (written to scratch only):

1. HIGH — src/server/auth/session.ts:24 — session cookie missing Secure, HttpOnly and SameSite; token is a timestamp-derived value, guessable within its validity window.
   Fix: issue tokens from a CSPRNG; set Secure; HttpOnly; SameSite=Lax; rotate the secret on privilege change.

2. HIGH — src/server/auth/password.ts:12 — passwords hashed with unsalted SHA-256: identical passwords share hashes and the scheme is GPU-crackable.
   Fix: argon2id (or bcrypt) with a random per-user salt and a tuned work factor; rehash legacy hashes on login.

3. MEDIUM — src/server/routes/auth.ts:88 — rate limit runs after the credential comparison, so the login endpoint can be brute-forced on the username before any throttle applies.
   Fix: throttle before the credential check, keyed by IP + username, with backoff on failures.

Summary: Found 3 issues in the auth flow.`,
  quality: `Findings (written to scratch only):

1. MEDIUM — src/server/routes/auth.ts:40,97 — duplicated input validation + error handling in login and register.
   Fix: extract a shared parse-and-validate helper (or middleware) used by both handlers.

2. LOW — src/server/auth/session.ts:10 — inline cookie (de)serialization mixes format concerns with session policy.
   Fix: move cookie parsing behind a small helper so session policy lives in one place.

Summary: Noted 2 code-quality concerns.`,
}

/** Re-check variants for resume runs — confirm prior findings, flag nothing new. */
const RESUME_SCANS: Record<'security' | 'quality', string> = {
  security: `Re-checking the in-scope files against the last pass.

session.ts — verifying the cookie/token findings from the last pass still stand.
password.ts — re-running the hash-scheme check (unchanged since last pass).
routes/auth.ts — confirming the rate-limit placement is still as reported.`,
  quality: `Re-checking the in-scope files against the last pass.

routes/auth.ts — no new handler blocks added; confirming the earlier duplication still exists.
session.ts — cookie parsing still inline.`,
}

const RESUME_FINDINGS: Record<'security' | 'quality', string> = {
  security: `Re-check complete. Confirming the last-pass findings still stand:
1. HIGH — session cookie flags + predictable token (src/server/auth/session.ts:24)
2. HIGH — unsalted SHA-256 (src/server/auth/password.ts:12)
3. MEDIUM — rate limit after credential check (src/server/routes/auth.ts:88)

No new issues found.

Summary: Confirmed no new security issues.`,
  quality: `Re-check complete. No new quality concerns beyond the two already noted.

Summary: Quality check complete.`,
}

/**
 * Scripted transcript for a reviewer's run — the brief it received, the
 * files it examined, and its concrete findings. `resume` flavors it as a
 * confirmation pass. Callers flip status to 'done' when the stage completes.
 */
const buildReviewerRun = (lens: 'security' | 'quality', resume = false): MockRunState => {
  const tools =
    lens === 'security'
      ? [
          { name: 'read', status: 'done' as const, turn: 1 },
          { name: 'read', status: 'done' as const, turn: 1 },
          { name: 'grep', status: 'done' as const, turn: 1 },
          { name: 'read', status: 'done' as const, turn: 2 },
          { name: 'write', status: 'done' as const, turn: 2 },
        ]
      : [
          { name: 'read', status: 'done' as const, turn: 1 },
          { name: 'read', status: 'done' as const, turn: 1 },
          { name: 'grep', status: 'done' as const, turn: 1 },
          { name: 'write', status: 'done' as const, turn: 2 },
        ]
  return {
    status: 'running',
    title: `Reviewer: ${lens}`,
    entries: [
      { role: 'user', text: buildReviewerBrief(lens, resume) },
      { role: 'assistant', text: resume ? RESUME_SCANS[lens] : REVIEWER_SCANS[lens] },
      { role: 'assistant', text: resume ? RESUME_FINDINGS[lens] : REVIEWER_FINDINGS[lens] },
    ],
    tools,
  }
}

/**
 * "Live" preview of a reviewer run for seeding while the loop is still in
 * the reviewing stage: only the brief + scan turn (running) are shown — the
 * findings turn materializes when the stage completes, so an open run page
 * visibly advances instead of displaying the whole transcript upfront.
 */
const liveReviewerPreview = (run: MockRunState): MockRunState => ({
  status: 'running',
  title: run.title,
  entries: run.entries.slice(0, 2), // brief + scan
  tools: run.tools.filter((tool) => tool.turn === 1),
})

/**
 * Push one mock run into the SHARED socket store as a full SkillRunState
 * (the store's shape needs folder + workspaceId, which the mock transcript
 * does not carry). The run page reads that store, so seeding here updates any
 * open run page live — no exit/re-enter needed.
 */
const seedMockRunFor = (workspaceId: string, runId: string, run: MockRunState): void => {
  seedMockRunGlobal(runId, {
    status: run.status,
    folder: '',
    workspaceId,
    entries: run.entries,
    tools: run.tools,
    title: run.title,
  })
}

/** Seed every run of a mock loop into the shared socket store. */
const seedLoopRuns = (workspaceId: string, loop: MockLoop): void => {
  for (const [runId, run] of Object.entries(loop.runs)) {
    seedMockRunFor(workspaceId, runId, run)
  }
}

/** The supervisor's aggregate turn — merges the scratch into one canonical review. */
const SUPERVISOR_AGGREGATION = `Reviewers completed. Reading both scratch reports and merging them into the canonical review.

Canonical findings (deduped across sources):
1. HIGH — session cookie flags + predictable token — src/server/auth/session.ts:24 (security)
2. HIGH — unsalted SHA-256 password storage — src/server/auth/password.ts:12 (security)
3. MEDIUM — login rate limit applied after the credential check — src/server/routes/auth.ts:88 (security)
4. LOW — duplicated validation + inline cookie parsing — src/server/routes/auth.ts:40, src/server/auth/session.ts:10 (quality)

Coverage: session handling, credential storage, and route authorization checked. Skipped (out of scope): ${MOCK_SCOPE.outOfScope}.

Canonical review written to .agents/@montflow/reviews/.`

/** Builds the placeholder loop for a kickoff: a running supervisor + its run. */
const buildMockLoop = (options: KickoffOptions): MockLoop => {
  const now = Date.now()
  const supervisorRunId = `run-${now}`
  return {
    id: `loop-${now.toString(36)}`,
    preset: options.preset,
    status: 'kickoff',
    running: true,
    updatedAt: now,
    agents: [{ runId: supervisorRunId, label: 'Supervisor', kind: 'supervisor', running: true }],
    roster: [{ runId: supervisorRunId, label: 'Supervisor', kind: 'supervisor', running: true }],
    history: [
      { at: now, title: 'Kicked off', detail: `Starting a ${options.scope.type} review with preset ${options.preset}.` },
    ],
    runs: {
      [supervisorRunId]: {
        status: 'running',
        title: 'Supervisor — resolving the review brief',
        entries: [
          { role: 'user', text: buildKickoffBrief(options) },
          { role: 'assistant', text: buildSupervisorResolution(options) },
        ],
        tools: [
          { name: 'glob', status: 'done', turn: 1 },
          { name: 'read', status: 'done', turn: 1 },
          { name: 'grep', status: 'done', turn: 1 },
          { name: 'write', status: 'done', turn: 1 },
        ],
      },
    },
  }
}

export function useLoops(
  workspaceId: string | null,
  conn: 'connecting' | 'open' | 'closed',
) {
  const { seedMockRun } = useUiSocket()
  const query = useQuery({
    queryKey: ['loops', workspaceId],
    queryFn: async () => {
      if (workspaceId === null) throw new Error('No workspace selected')
      return loadMockLoops(workspaceId)
    },
    enabled: workspaceId !== null && conn !== 'closed',
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  // Re-seed the socket's run store from the persisted loop transcripts.
  // The socket runs are in-memory only, so after a reload (or for any loop
  // persisted from an earlier session) this re-materials them — and the
  // supervisor's single continuous stream always reflects its latest state.
  useEffect(() => {
    if (workspaceId === null) return
    const loops = query.data
    if (loops === undefined) return
    for (const loop of loops) {
      for (const [runId, run] of Object.entries(loop.runs ?? {})) {
        seedMockRun(runId, {
          status: run.status,
          folder: '',
          workspaceId,
          entries: run.entries,
          tools: run.tools,
          title: run.title,
        })
      }
    }
  }, [query.data, seedMockRun, workspaceId])

  return query
}

/**
 * Rich detail for one loop — the summary plus its agents (live + done) and
 * history timeline, derived from the shared interval cache (same key as the
 * list, so mutations invalidating the list refresh this too).
 */
export function useLoopDetail(
  workspaceId: string | null,
  loopId: string | null,
  conn: 'connecting' | 'open' | 'closed',
) {
  const { data: loops, ...rest } = useLoops(workspaceId, conn)
  const detail = useMemo(
    () => (loopId === null ? null : (loops ?? []).find((l) => l.id === loopId) ?? null),
    [loops, loopId],
  )
  return { ...rest, data: detail }
}

/** Inputs a kickoff needs to resolve before the loop can be dispatched. */
export interface KickoffScope {
  type: 'git-unstaged'
}
export interface KickoffAgenticScope {
  type: 'agentic'
  /** The feature/spec goal the supervisor resolves into a brief. */
  goal: string
}
export type KickoffOptions =
  | { preset: string; scope: KickoffScope }
  | { preset: string; scope: KickoffAgenticScope }

/**
 * Dispatch a kickoff: creates a placeholder loop (with a running Supervisor)
 * and drives the mock simulation. Becomes a real dispatch when the backend
 * lands.
 */
export function useCreateLoop(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (options: KickoffOptions): Promise<MockLoop> => buildMockLoop(options),
    onSuccess: (loop) => {
      if (workspaceId === null) return
      const wsId = workspaceId
      saveMockLoops(wsId, [loop, ...loadMockLoops(wsId)])
      seedLoopRuns(wsId, loop) // an open supervisor run page updates live
      void queryClient.invalidateQueries({ queryKey: ['loops', wsId] })
      simulateLoop(wsId, loop, queryClient)
    },
  })
}

/**
 * TEMP mock driver: walks a kicked-off loop through supervisor → reviewers →
 * done. The supervisor stays ONE continuous run — its stream is appended to
 * (resumes) when the reviewers complete. Each stage checks `running` so a
 * stop freezes progression.
 */
function simulateLoop(
  wsId: string,
  loop: MockLoop,
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  const supervisorRunId = loop.agents[0]?.runId

  // Stage 2 — supervisor done (brief), reviewers fan out into live previews.
  window.setTimeout(() => {
    if (loadMockLoops(wsId).find((l) => l.id === loop.id)?.running !== true) return
    const t1 = Date.now()
    const reviewers = [
      { runId: `run-${t1}-r1`, lens: 'security' as const, label: 'Reviewer: security', summary: 'Found 3 issues in the auth flow.' },
      { runId: `run-${t1}-r2`, lens: 'quality' as const, label: 'Reviewer: quality', summary: 'Noted 2 code-quality concerns.' },
    ]
    const reviewerRuns: Record<string, MockRunState> = {}
    for (const rv of reviewers) reviewerRuns[rv.runId] = buildReviewerRun(rv.lens)
    const current = loadMockLoops(wsId).find((l) => l.id === loop.id)
    if (current === undefined) return
    const updated: MockLoop = {
      ...current,
      status: 'reviewing',
      updatedAt: t1,
      agents: reviewers.map((rv) => ({
        runId: rv.runId,
        label: rv.label,
        kind: 'reviewer' as const,
        running: true,
      })),
      roster: [
        // Supervisor finished scoping — mark it done but keep it on the roster.
        ...current.roster.map((a) => (a.running ? { ...a, running: false, outcome: 'ok' as const, finishedAt: t1 } : a)),
        ...reviewers.map((rv) => ({ runId: rv.runId, label: rv.label, kind: 'reviewer' as const, running: true })),
      ],
      history: [
        ...current.history,
        { at: t1, title: 'Supervisor resolved the brief', detail: `Scoped the review to ${MOCK_SCOPE.target} and briefed 2 reviewers on ${MOCK_SCOPE.files.length} files.`, runId: supervisorRunId },
      ],
      runs: { ...current.runs, ...reviewerRuns },
    }
    saveMockLoops(wsId, loadMockLoops(wsId).map((l) => (l.id === loop.id ? updated : l)))
    // Seed the reviewers' LIVE previews (just the brief + scan) so any open
    // reviewer run page picks up the new turn immediately.
    for (const rv of reviewers) seedMockRunFor(wsId, rv.runId, liveReviewerPreview(reviewerRuns[rv.runId]!))
    void queryClient.invalidateQueries({ queryKey: ['loops', wsId] })

    // Stage 3 — reviewers done; the supervisor's single context resumes to
    // aggregate. Full transcripts (findings + canonical) are seeded now, so
    // an open run page advances from scan → findings → done.
    window.setTimeout(() => {
      if (loadMockLoops(wsId).find((l) => l.id === loop.id)?.running !== true) return
      const t2 = Date.now()
      const current2 = loadMockLoops(wsId).find((l) => l.id === loop.id)
      if (current2 === undefined) return
      const supervisor = supervisorRunId !== undefined ? current2.runs[supervisorRunId] : undefined
      const updatedSupervisor =
        supervisor !== undefined
          ? {
              ...supervisor,
              status: 'done' as const,
              entries: [...supervisor.entries, { role: 'assistant' as const, text: SUPERVISOR_AGGREGATION }],
              tools: [
                ...supervisor.tools,
                { name: 'read', status: 'done' as const, turn: supervisor.entries.length },
                { name: 'write', status: 'done' as const, turn: supervisor.entries.length },
              ],
            }
          : undefined
      const doneReviewers: Record<string, MockRunState> = {}
      for (const rv of reviewers) doneReviewers[rv.runId] = { ...reviewerRuns[rv.runId]!, status: 'done' as const }
      const updatedFinal: MockLoop = {
        ...current2,
        status: 'done',
        running: false,
        updatedAt: t2,
        agents: [],
        roster: current2.roster.map((a) =>
          a.running ? { ...a, running: false, outcome: 'ok' as const, finishedAt: t2 } : a,
        ),
        history: [
          ...current2.history,
          ...reviewers.map((rv) => ({ at: t2, title: `${rv.label} completed`, detail: rv.summary, runId: rv.runId })),
        ],
        runs: {
          ...current2.runs,
          ...(updatedSupervisor !== undefined && supervisorRunId !== undefined
            ? { [supervisorRunId]: updatedSupervisor }
            : {}),
          ...doneReviewers,
        },
      }
      saveMockLoops(wsId, loadMockLoops(wsId).map((l) => (l.id === loop.id ? updatedFinal : l)))
      seedLoopRuns(wsId, updatedFinal)
      void queryClient.invalidateQueries({ queryKey: ['loops', wsId] })
    }, 8000)
  }, 8000)
}

/** Stop a running loop — interrupt it and its runs, and persist. */
export function useStopLoop(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (loopId: string) => loopId,
    onSuccess: (loopId) => {
      if (workspaceId === null) return
      const wsId = workspaceId
      const now = Date.now()
      let stopped: MockLoop | undefined
      saveMockLoops(
        wsId,
        loadMockLoops(wsId).map((l) => {
          if (l.id !== loopId) return l
          stopped = {
            ...l,
            status: 'interrupted',
            running: false,
            updatedAt: now,
            agents: l.agents.map((a) =>
              a.running ? { ...a, running: false, outcome: 'interrupted' as const, finishedAt: now } : a,
            ),
            roster: l.roster.map((a) =>
              a.running ? { ...a, running: false, outcome: 'interrupted' as const, finishedAt: now } : a,
            ),
            runs: Object.fromEntries(
              Object.entries(l.runs).map(([id, r]) => [
                id,
                r.status === 'running' ? { ...r, status: 'interrupted' as const } : r,
              ]),
            ),
          }
          return stopped
        }),
      )
      if (stopped !== undefined) seedLoopRuns(wsId, stopped) // open run pages flip to interrupted
      void queryClient.invalidateQueries({ queryKey: ['loops', wsId] })
    },
  })
}

/** Resume a stopped loop — re-fans out reviewers and resumes the supervisor context. */
export function useResumeLoop(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (loopId: string) => loopId,
    onSuccess: (loopId) => {
      if (workspaceId === null) return
      const wsId = workspaceId
      const t1 = Date.now()
      const reviewers = [
        { runId: `run-${t1}-r1`, lens: 'security' as const, label: 'Reviewer: security', summary: 'Confirmed no new security issues.' },
        { runId: `run-${t1}-r2`, lens: 'quality' as const, label: 'Reviewer: quality', summary: 'Quality check complete.' },
      ]
      const reviewerRuns: Record<string, MockRunState> = {}
      for (const rv of reviewers) reviewerRuns[rv.runId] = buildReviewerRun(rv.lens, true)
      const current = loadMockLoops(wsId).find((l) => l.id === loopId)
      if (current === undefined) return
      const updated: MockLoop = {
        ...current,
        running: true,
        status: 'reviewing',
        updatedAt: t1,
        agents: reviewers.map((rv) => ({
          runId: rv.runId,
          label: rv.label,
          kind: 'reviewer' as const,
          running: true,
        })),
        roster: [
          ...current.roster,
          ...reviewers.map((rv) => ({ runId: rv.runId, label: rv.label, kind: 'reviewer' as const, running: true })),
        ],
        history: [
          ...current.history,
          { at: t1, title: 'Resumed — continuing the review', detail: 'Picking up from the last recorded step.' },
        ],
        runs: { ...current.runs, ...reviewerRuns },
      }
      saveMockLoops(wsId, loadMockLoops(wsId).map((l) => (l.id === loopId ? updated : l)))
      for (const rv of reviewers) seedMockRunFor(wsId, rv.runId, liveReviewerPreview(reviewerRuns[rv.runId]!))
      void queryClient.invalidateQueries({ queryKey: ['loops', wsId] })

      window.setTimeout(() => {
        if (loadMockLoops(wsId).find((l) => l.id === loopId)?.running !== true) return
        const t2 = Date.now()
        const current2 = loadMockLoops(wsId).find((l) => l.id === loopId)
        if (current2 === undefined) return
        const doneReviewers: Record<string, MockRunState> = {}
        for (const rv of reviewers) doneReviewers[rv.runId] = { ...reviewerRuns[rv.runId]!, status: 'done' as const }
        const updatedFinal: MockLoop = {
          ...current2,
          status: 'done',
          running: false,
          updatedAt: t2,
          agents: [],
          roster: current2.roster.map((a) =>
            a.running ? { ...a, running: false, outcome: 'ok' as const, finishedAt: t2 } : a,
          ),
          history: [
            ...current2.history,
            ...reviewers.map((rv) => ({ at: t2, title: `${rv.label} completed`, detail: rv.summary, runId: rv.runId })),
          ],
          runs: { ...current2.runs, ...doneReviewers },
        }
        saveMockLoops(wsId, loadMockLoops(wsId).map((l) => (l.id === loopId ? updatedFinal : l)))
        seedLoopRuns(wsId, updatedFinal)
        void queryClient.invalidateQueries({ queryKey: ['loops', wsId] })
      }, 8000)
    },
  })
}

/** Delete a stopped loop, removing it from the local store. */
export function useDeleteLoop(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (loopId: string) => loopId,
    onSuccess: (loopId) => {
      if (workspaceId === null) return
      const wsId = workspaceId
      saveMockLoops(wsId, loadMockLoops(wsId).filter((l) => l.id !== loopId))
      void queryClient.invalidateQueries({ queryKey: ['loops', wsId] })
    },
  })
}

/** Re-export so unrelated imports (LoopSummary) keep working. */
export type { LoopSummary }
