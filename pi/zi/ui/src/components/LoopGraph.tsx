import { useCallback, useEffect, useMemo } from 'react'
import {
  Background,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleAlert,
  Gavel,
  Link2,
  ListChecks,
  Repeat,
  RotateCcw,
  Search,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { LoopAgent, LoopDetail, LoopStatus } from '@/protocol'
import { runUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'

/**
 * Read-only runtime visualization of a loop — wiki/loop.md §3 as a React Flow
 * canvas, TOP TO BOTTOM, grouped BY CYCLE:
 *
 *   Bookkeeper (kickoff) → Scoper
 *   ┌╌ cycle 1 ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
 *   │ reviewers → aggregate → fixers │
 *   └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
 *   Bookkeeper (cycle += 1)
 *   ┌╌ cycle 2 ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
 *   │ reviewers → aggregate → …      │   ← same SESSIONS, link-marked
 *   └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
 *   Verdict → Done / Incomplete
 *
 * Every reviewer AND fixer gets its OWN node. Reviewer rows of later cycles
 * represent the SAME persistent sessions (wiki loop.md §8) — marked with a
 * link badge. The graph is PROGRESSIVE: stages materialize only when reached;
 * stopped/errored loops keep everything up to the furthest evidenced stage.
 *
 * Navigation: NO auto-fit/zoom — viewport persists to localStorage; custom
 * up/down controls on the right; SHIFT + arrow keys pans anywhere on the page.
 */

// --- Graph definition -------------------------------------------------------

type GraphNode =
  | 'kickoff'
  | 'scoper'
  | 'reviewers'
  | 'aggregate'
  | `reviewer-${string}`
  | `aggregate-c${number}`
  | `fixer-${string}`
  | `fixers-${number}`
  | `transition-${number}`
  | `zone-${number}`
  | 'decision'
  | 'done'
  | 'incomplete'

interface LoopGraphNodeData extends Record<string, unknown> {
  icon: LucideIcon
  title: string
  hint: string
  /** idle · done · active · ok-terminal · warn-terminal · stopped */
  state: 'idle' | 'done' | 'active' | 'ok-terminal' | 'warn-terminal' | 'stopped'
  /** Set when the stage's run page exists — the node becomes clickable. */
  runId?: string
  runLabel?: string
  /** Where the opened run's page should bounce back to. */
  backTo?: string
  /** 1-based pipeline step number badge. */
  step?: number
  /** Same persistent session as the previous cycle's row — link badge. */
  repeatSession?: boolean
}

type LoopStageNodeType = Node<LoopGraphNodeData>

/** Status → glowing node kind within the CURRENT cycle. */
const STATUS_FOCUS: Record<LoopStatus, 'kickoff' | 'scoper' | 'cycle-review' | 'cycle-fix' | 'decision' | null> = {
  pending: 'kickoff',
  scoping: 'scoper',
  reviewing: 'cycle-review',
  fixing: 'cycle-fix',
  'awaiting-user': 'decision',
  done: null,
  incomplete: null,
  deadlocked: null,
  interrupted: null,
  error: null,
}

// --- Layout -----------------------------------------------------------------
// One BLOCK per cycle: reviewers row → aggregate row → fixers row, followed by
// a Bookkeeper transition slot before the next block. Fixed hand-placed rows.
const NODE_W = 224
const NODE_H = 72
const ROW_GAP = 116
const FAN_COL_GAP = 256
/** Vertical distance between one cycle block's first row and the next's. */
const CYCLE_STRIDE = 4 * ROW_GAP
const TERMINAL_OFFSET = 200

/** Top row (reviewers) of cycle c — c is 1-based. */
const cycleRevY = (c: number): number => 2 * ROW_GAP + (c - 1) * CYCLE_STRIDE
const rowY = (revY: number, offsetRows: number): number => revY + offsetRows * ROW_GAP

/** Horizontal fan-out position — node CENTERS mirror around the main axis. */
const fanX = (index: number, count: number): number =>
  (index - (count - 1) / 2) * FAN_COL_GAP - NODE_W / 2

// --- Helpers ----------------------------------------------------------------

/** Resolve the supervisor run backing kickoff/scoper click-through. */
const resolveSupervisor = (agents: LoopAgent[]): LoopAgent | undefined => {
  const candidates = agents.filter((a) => a.kind === 'supervisor' && a.runId !== '')
  return candidates.find((a) => a.running) ?? candidates.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))[0]
}

const buildGraph = (
  loop: LoopDetail & { roster?: LoopAgent[] },
  backTo: string,
): { nodes: LoopStageNodeType[]; edges: Edge[] } => {
  const roster = loop.roster ?? loop.agents ?? []
  const focus = STATUS_FOCUS[loop.status]
  const reviewers = roster.filter((a) => a.kind === 'reviewer' && a.runId !== '')
  const fixers = roster.filter((a) => a.kind === 'fixer' && a.runId !== '')
  const anyReviewerDone = reviewers.some(
    (a) => !a.running && (a.finishedAt !== undefined || a.outcome !== undefined),
  )

  // --- Progressive reveal ---------------------------------------------------
  // Rendered cycles: 1..K where K is the current cycle. Past cycles are FULLY
  // visible (they completed — the cycle counter proves it). The CURRENT cycle
  // reveals progressively; STOP RULE: on interrupted/error the status alone
  // proves nothing about the current cycle, so its unreached stages stay
  // hidden based on roster evidence. An errored Bookkeeper (no agents ever
  // spawned) renders as kickoff ALONE — K collapses to nothing rendered.
  const crashed = loop.status === 'interrupted' || loop.status === 'error'
  const K = crashed
    ? reviewers.length > 0 || fixers.length > 0
      ? Math.max(1, loop.cycle ?? 1)
      : 0 // nothing beyond kickoff is evidenced
    : Math.max(1, loop.cycle ?? 1)

  // Current-cycle stage visibility (progressive / evidence-based).
  const curReviewers =
    K === 0
      ? false
      : crashed
        ? reviewers.length > 0
        : loop.status !== 'pending' &&
          loop.status !== 'scoping'
  const curAggregate =
    K > 0 &&
    (crashed
      ? anyReviewerDone
      : (loop.status === 'reviewing' && anyReviewerDone) ||
        loop.status === 'fixing' ||
        loop.status === 'awaiting-user' ||
        loop.status === 'done' ||
        loop.status === 'incomplete')
  const curFixers =
    K > 0 &&
    (crashed
      ? fixers.length > 0
      : loop.status === 'fixing' ||
        fixers.length > 0 ||
        loop.status === 'done' ||
        loop.status === 'incomplete')
  const showDecision =
    !crashed &&
    (loop.status === 'awaiting-user' ||
      loop.status === 'done' ||
      loop.status === 'incomplete')

  const makeNode = (
    id: GraphNode,
    pos: { x: number; y: number },
    data: LoopGraphNodeData,
    extra?: Partial<LoopStageNodeType>,
  ): LoopStageNodeType => ({
    id,
    type: 'loopStage',
    position: pos,
    draggable: false,
    data,
    ...extra,
  })

  const nodes: LoopStageNodeType[] = []

  // Zone boxes first — equal zIndex, insertion order puts them underneath.
  for (let c = 1; c <= K; c += 1) {
    const count = Math.max(reviewers.length, 1)
    const halfW = ((count - 1) / 2) * FAN_COL_GAP + NODE_W / 2 + 44
    nodes.push({
      id: `zone-${c}`,
      type: 'cycleZone',
      position: { x: -halfW, y: cycleRevY(c) - 36 },
      draggable: false,
      selectable: false,
      data: {
        icon: Repeat,
        title: `loop ${loop.loop ?? 1} · cycle ${c}`,
        hint: '',
        state: 'idle',
      },
      style: { width: halfW * 2, height: 2 * ROW_GAP + NODE_H + 64 },
    })
  }

  const supervisor = resolveSupervisor(roster)
  nodes.push(
    makeNode('kickoff', { x: -NODE_W / 2, y: 0 }, {
      icon: BrainCircuit,
      title: 'Bookkeeper',
      hint: 'scaffold loop.json + scope skeleton',
      state: focus === 'kickoff' ? 'active' : 'done',
      runId: supervisor?.runId,
      runLabel: supervisor?.label,
      backTo,
      step: 1,
    }),
  )
  if (K > 0) {
    nodes.push(
      makeNode('scoper', { x: -NODE_W / 2, y: ROW_GAP }, {
        icon: Search,
        title: 'Scoper',
        hint: 'prompt → scope.md (once)',
        state: focus === 'scoper' ? 'active' : 'done',
        runId: supervisor?.runId,
        runLabel: supervisor?.label,
        backTo,
        step: 2,
      }),
    )
  }

  /** Agent state within a fan-out row. */
  const agentState = (agent: LoopAgent, isActive: boolean): LoopGraphNodeData['state'] =>
    isActive
      ? 'active'
      : agent.outcome === 'error' || agent.outcome === 'interrupted'
        ? 'stopped'
        : agent.finishedAt !== undefined || agent.outcome !== undefined
          ? 'done'
          : 'idle'

  /** Build one cycle's reviewer row (same sessions in EVERY cycle). */
  const reviewerIds = (c: number): GraphNode[] => {
    if (!curReviewers && c === K) return []
    const ids: GraphNode[] = []
    if (reviewers.length > 0) {
      reviewers.forEach((agent, i) => {
        const id: GraphNode = c === 1 ? `reviewer-${agent.runId}` : `reviewer-c${c}-${agent.runId}`
        ids.push(id)
        const isActive = c === K && focus === 'cycle-review' && !anyReviewerDone
        nodes.push(
          makeNode(id, { x: fanX(i, reviewers.length), y: cycleRevY(c) }, {
            icon: Users,
            title: agent.label,
            hint: agent.model ?? agent.runId.slice(0, 8),
            state: c < K ? 'done' : agentState(agent, isActive),
            runId: agent.runId,
            runLabel: agent.label,
            backTo,
            step: 3,
            repeatSession: c > 1,
          }),
        )
      })
    } else if (c === K) {
      ids.push('reviewers')
      nodes.push(
        makeNode('reviewers', { x: -NODE_W / 2, y: cycleRevY(c) }, {
          icon: Users,
          title: 'Reviewers',
          hint: 'fan-out per preset · scratch findings',
          state: focus === 'cycle-review' ? 'active' : 'idle',
          backTo,
          step: 3,
        }),
      )
    }
    return ids
  }

  /** One cycle's aggregate node. */
  const aggregateId = (c: number): string | undefined => {
    if (c === K && !curAggregate) return undefined
    const id: GraphNode = c === 1 ? 'aggregate' : `aggregate-c${c}`
    nodes.push(
      makeNode(id, { x: -NODE_W / 2, y: rowY(cycleRevY(c), 1) }, {
        icon: ListChecks,
        title: 'Aggregate',
        hint: 'scratch → canonical review',
        state: c < K || (c === K && focus !== 'cycle-review' && loop.status !== 'pending' && loop.status !== 'scoping') ? 'done' : 'idle',
        backTo,
        step: 4,
      }),
    )
    return id
  }

  /** One cycle's fixers — per-fixer fan-out on the CURRENT cycle only (the
   * roster cannot attribute historical fixer runs to their cycle). */
  const fixersRow = (c: number): string[] => {
    if (c === K) {
      if (!curFixers) return []
      const ids: GraphNode[] = []
      if (fixers.length > 0) {
        fixers.forEach((agent, i) => {
          const id: GraphNode = `fixer-${agent.runId}`
          ids.push(id)
          nodes.push(
            makeNode(id, { x: fanX(i, fixers.length), y: rowY(cycleRevY(c), 2) }, {
              icon: Wrench,
              title: agent.label,
              hint: agent.model ?? agent.runId.slice(0, 8),
              state: agentState(agent, focus === 'cycle-fix'),
              runId: agent.runId,
              runLabel: agent.label,
              backTo,
              step: 5,
            }),
          )
        })
      } else {
        ids.push(`fixers-${c}`)
        nodes.push(
          makeNode(`fixers-${c}`, { x: -NODE_W / 2, y: rowY(cycleRevY(c), 2) }, {
            icon: Wrench,
            title: 'Fixers',
            hint: 'one agent per Open finding',
            state: focus === 'cycle-fix' ? 'active' : 'idle',
            backTo,
            step: 5,
          }),
        )
      }
      return ids
    }
    // Past cycle — completed wave, generic node (runs aren't cycle-tagged).
    const id: GraphNode = `fixers-${c}`
    nodes.push(
      makeNode(id, { x: -NODE_W / 2, y: rowY(cycleRevY(c), 2) }, {
        icon: Wrench,
        title: 'Fixers',
        hint: 'wave completed',
        state: 'done',
        backTo,
        step: 5,
      }),
    )
    return [id]
  }

  // Assemble cycles + collect ids for wiring.
  const cycleReviewerIds: string[][] = []
  const cycleAggregateId: (string | undefined)[] = []
  const cycleFixerIds: string[][] = []
  for (let c = 1; c <= K; c += 1) {
    cycleReviewerIds.push(reviewerIds(c))
    cycleAggregateId.push(aggregateId(c))
    cycleFixerIds.push(fixersRow(c))
    if (c < K) {
      // Bookkeeper transition between cycles.
      nodes.push(
        makeNode(`transition-${c}`, { x: -NODE_W / 2, y: rowY(cycleRevY(c), 3) }, {
          icon: BrainCircuit,
          title: 'Bookkeeper',
          hint: 'cycle += 1 · re-spawn reviewers',
          state: 'done',
          backTo,
          step: 6,
        }),
      )
    }
  }

  if (showDecision) {
    const verdictY = rowY(cycleRevY(K), 3)
    nodes.push(
      makeNode('decision', { x: -NODE_W / 2, y: verdictY }, {
        icon: Gavel,
        title: 'Verdict',
        hint: 'open issues remain?',
        state: focus === 'decision' ? 'active' : 'done',
        backTo,
        step: 7,
      }),
    )
    nodes.push(
      makeNode('done', { x: -TERMINAL_OFFSET - NODE_W / 2, y: verdictY + ROW_GAP }, {
        icon: CircleCheck,
        title: 'Done',
        hint: 'clean · zero open issues',
        state: loop.status === 'done' ? 'ok-terminal' : 'idle',
      }),
    )
    nodes.push(
      makeNode('incomplete', { x: TERMINAL_OFFSET - NODE_W / 2, y: verdictY + ROW_GAP }, {
        icon: CircleAlert,
        title: 'Incomplete',
        hint: 'stopped at cap — findings kept',
        state: loop.status === 'incomplete' ? 'warn-terminal' : 'idle',
      }),
    )
  }

  // --- Edges ------------------------------------------------------------------
  const edgeStyle = (lit: boolean): Edge['style'] => ({
    stroke: lit ? 'var(--primary)' : 'var(--border)',
    strokeWidth: 2,
  })
  const labelStyle = { fill: 'var(--muted-foreground)', fontSize: 10 }
  const labelBgStyle = { fill: 'var(--card)', stroke: 'var(--border)', strokeWidth: 1 }
  const lit = (cond: boolean): Partial<Edge> =>
    cond ? { animated: true, style: edgeStyle(true) } : { style: edgeStyle(false) }

  const edges: Edge[] = [
    { id: 'kickoff->scoper', source: 'kickoff', target: 'scoper', ...lit(focus === 'scoper') },
  ]
  for (let c = 1; c <= K; c += 1) {
    const revs = cycleReviewerIds[c]!
    const agg = cycleAggregateId[c]!
    const fixIds = cycleFixerIds[c]!
    const source = c === 1 ? 'scoper' : `transition-${c - 1}`
    for (const target of revs) {
      edges.push({
        id: `${source}->${target}`,
        source,
        target,
        ...(c === K ? lit(focus === 'cycle-review' && !anyReviewerDone) : {}),
      })
    }
    if (agg !== undefined) {
      for (const rev of revs) {
        edges.push({ id: `${rev}->${agg}`, source: rev, target: agg, ...(c === K ? lit(focus === 'cycle-review' && anyReviewerDone) : {}) })
      }
    }
    if (agg !== undefined) {
      for (const fx of fixIds) {
        edges.push({ id: `${agg}->${fx}`, source: agg, target: fx, ...(c === K ? lit(focus === 'cycle-fix') : {}) })
      }
      if (c < K) {
        edges.push({ id: `aggregate-c${c}->transition-${c}`, source: agg, target: `transition-${c}` })
      } else if (showDecision) {
        edges.push({
          id: `${agg}->decision`,
          source: agg,
          target: 'decision',
          ...(focus === 'decision'
            ? { animated: true, style: edgeStyle(true) }
            : { style: edgeStyle(false) }),
        })
      }
    }
    if (c < K) {
      for (const fx of fixIds) {
        edges.push({ id: `${fx}->transition-${c}`, source: fx, target: `transition-${c}` })
      }
    }
  }
  if (showDecision) {
    edges.push(
      {
        id: 'decision->done',
        source: 'decision',
        target: 'done',
        label: 'clean',
        animated: loop.status === 'done',
        style: edgeStyle(loop.status === 'done'),
        labelStyle,
        labelBgStyle,
        labelBgPadding: [6, 2],
        labelBgBorderRadius: 4,
      },
      {
        id: 'decision->incomplete',
        source: 'decision',
        target: 'incomplete',
        label: 'stop here',
        animated: loop.status === 'incomplete',
        style: edgeStyle(loop.status === 'incomplete'),
        labelStyle,
        labelBgStyle,
        labelBgPadding: [6, 2],
        labelBgBorderRadius: 4,
      },
    )
  }

  // Progressive graph: drop any edge touching a not-yet-materialized node.
  const visible = new Set(nodes.map((node) => node.id))
  return { nodes, edges: edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target)) }
}

// --- Custom nodes -----------------------------------------------------------

function LoopStageNode({ data }: NodeProps<LoopStageNodeType>) {
  const Icon = data.icon
  const clickable = data.runId !== undefined
  return (
    <button
      type="button"
      onClick={() => {
        if (clickable)
          navigate(
            `${runUrl(data.runId!)}?from=${encodeURIComponent(data.backTo ?? '')}`,
          )
      }}
      disabled={!clickable}
      title={
        clickable
          ? `Open ${data.runLabel} — the run page shows its live thoughts`
          : data.hint
      }
      className={[
        'relative flex h-[72px] w-[224px] cursor-default items-center gap-3 rounded-lg border bg-card p-3 text-left shadow-sm transition-all',
        data.state === 'active'
          ? 'border-primary ring-2 ring-primary/40 shadow-primary/10 hover:bg-muted/30'
          : '',
        data.state === 'done' ? 'border-emerald-500/40 opacity-80' : '',
        data.state === 'stopped' ? 'border-amber-500/50 opacity-80' : '',
        data.state === 'ok-terminal' ? 'border-emerald-500 bg-emerald-500/10' : '',
        data.state === 'warn-terminal' ? 'border-amber-500 bg-amber-500/10' : '',
        data.state === 'idle' ? 'opacity-70' : '',
        clickable ? 'cursor-pointer hover:border-primary/50 hover:bg-muted/30' : '',
      ].join(' ')}
    >
      {data.step !== undefined && (
        <span className="pointer-events-none absolute right-2 top-1.5 font-mono text-[9px] tabular-nums text-muted-foreground/50">
          {String(data.step).padStart(2, '0')}
        </span>
      )}
      {data.repeatSession === true && (
        <span
          title="Same persistent reviewer session as the previous cycle"
          className="pointer-events-none absolute bottom-1.5 right-2 flex items-center gap-0.5 rounded bg-blue-500/10 px-1 py-px text-[9px] font-medium text-blue-600 dark:text-blue-400"
        >
          <Link2 className="size-2.5" />
          same session
        </span>
      )}
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-1 !h-1 !min-w-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-1 !h-1 !min-w-0" />
      <span
        className={[
          'relative flex size-8 shrink-0 items-center justify-center rounded-md',
          data.state === 'active'
            ? 'bg-primary/15 text-primary'
            : data.state === 'done'
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground',
        ].join(' ')}
      >
        <Icon className={`size-4 ${data.state === 'active' ? 'animate-pulse' : ''}`} />
        {data.state === 'active' && (
          <span className="absolute -right-0.5 -top-0.5 inline-block size-2 animate-pulse rounded-full bg-primary" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-tight">{data.title}</span>
        <span className="block truncate text-[10px] text-muted-foreground">{data.hint}</span>
      </span>
    </button>
  )
}

/** Dotted cycle boundary — pure decoration, ignores pointer events. */
function CycleZoneNode({ data }: NodeProps<LoopStageNodeType>) {
  return (
    <div className="pointer-events-none flex h-full w-full flex-col rounded-xl border-2 border-dashed border-border/80">
      <span className="m-2 mr-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        {data.title}
      </span>
    </div>
  )
}

const nodeTypes = { loopStage: LoopStageNode, cycleZone: CycleZoneNode }

// --- Viewport persistence ----------------------------------------------------

/**
 * Pan/zoom position persisted per loop in localStorage — same convention as
 * the workspace panel prefs (useWorkspacePrefs.ts): `montflow:<feature>:`
 * prefix, defensive load, best-effort save. The graph comes back exactly as
 * the user left it instead of re-fitting (no auto-zoom) on every visit.
 */
interface StoredViewport {
  x: number
  y: number
  zoom: number
}

const VIEWPORT_PREFIX = 'montflow:loop-graph:'

/** Static default when nothing is saved yet: top of the chain visible. */
const DEFAULT_VIEWPORT: StoredViewport = { x: 332, y: 32, zoom: 0.85 }

const loadViewport = (loopId: string): StoredViewport => {
  try {
    const raw = localStorage.getItem(VIEWPORT_PREFIX + loopId)
    if (raw === null) return DEFAULT_VIEWPORT
    const parsed = JSON.parse(raw) as Partial<StoredViewport>
    if (
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number' ||
      typeof parsed.zoom !== 'number' ||
      !Number.isFinite(parsed.x) ||
      !Number.isFinite(parsed.y) ||
      !Number.isFinite(parsed.zoom)
    ) {
      return DEFAULT_VIEWPORT
    }
    return { x: parsed.x, y: parsed.y, zoom: parsed.zoom }
  } catch {
    return DEFAULT_VIEWPORT
  }
}

const saveViewport = (loopId: string, viewport: StoredViewport): void => {
  try {
    localStorage.setItem(VIEWPORT_PREFIX + loopId, JSON.stringify(viewport))
  } catch {
    // Storage full or unavailable (private mode) — best effort only.
  }
}

// --- Canvas (needs the flow instance — mounted inside ReactFlowProvider) -----

/** One press of a button / hotkey pans this far (screen pixels). */
const PAN_STEP = 120
/** Eased interpolation time for one pan step — short enough that holding a
 * key (auto-repeat) reads as continuous gliding instead of stuttering. */
const PAN_DURATION_MS = 140
/** Reset travels further, so it gets a slightly longer, more visible glide. */
const RESET_DURATION_MS = 320

function LoopGraphCanvas({
  loop,
  backTo,
  initialViewport,
}: {
  loop: LoopDetail & { roster?: LoopAgent[] }
  backTo: string
  initialViewport: StoredViewport
}) {
  const instance = useReactFlow()
  const { nodes, edges } = useMemo(() => buildGraph(loop, backTo), [loop, backTo])

  /** Pan the canvas by screen-space pixels and persist the new viewport.
   * Animated: React Flow eases the transform to the target, and key-repeat
   * recomputes from the CURRENT interpolated position mid-glide, so holding
   * Shift+arrow produces one continuous scroll instead of jumps. */
  const pan = useCallback(
    (dx: number, dy: number) => {
      const current = instance.getViewport()
      const next = { x: current.x + dx, y: current.y + dy, zoom: current.zoom }
      void instance.setViewport(next, { duration: PAN_DURATION_MS })
      saveViewport(loop.id, next)
    },
    [instance, loop.id],
  )

  /** Back to the static default position and clear the saved one. */
  const resetView = useCallback(() => {
    void instance.setViewport(DEFAULT_VIEWPORT, { duration: RESET_DURATION_MS })
    saveViewport(loop.id, DEFAULT_VIEWPORT)
  }, [instance, loop.id])

  // SHIFT + arrow keys pans the canvas from anywhere on the page. Moving the
  // viewport DOWN the pipeline means shifting the content UP (negative dy).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.shiftKey) return
      const target = event.target as HTMLElement | null
      if (
        target !== null &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return // never steal keystrokes while typing
      }
      const delta = event.key === 'ArrowDown'
        ? { dx: 0, dy: -PAN_STEP }
        : event.key === 'ArrowUp'
          ? { dx: 0, dy: PAN_STEP }
          : event.key === 'ArrowLeft'
            ? { dx: PAN_STEP, dy: 0 }
            : event.key === 'ArrowRight'
              ? { dx: -PAN_STEP, dy: 0 }
              : null
      if (delta === null) return
      event.preventDefault()
      pan(delta.dx, delta.dy)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pan])

  return (
    <>
      <ReactFlow
        key={loop.id}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        // NO auto-zoom/fit — the viewport is the user's: it starts from the
        // saved position (or the static default) and every pan/zoom is
        // persisted back to localStorage.
        defaultViewport={initialViewport}
        onMoveEnd={(_, viewport) => saveViewport(loop.id, viewport)}
        // Wheel scrolling belongs to the page; panning happens via drag,
        // the side controls, or SHIFT + arrow keys.
        zoomOnScroll={false}
        panOnScroll={false}
        preventScrolling={false}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} />
      </ReactFlow>
      {/* Custom pan controls — right edge, theme-styled (no stock Controls). */}
      <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => pan(0, PAN_STEP)}
          title={`Pan up (${PAN_STEP}px) — or press Shift+↑`}
          className="flex size-7 items-center justify-center rounded-md border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted"
        >
          <ChevronUp className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => pan(0, -PAN_STEP)}
          title={`Pan down (${PAN_STEP}px) — or press Shift+↓`}
          className="flex size-7 items-center justify-center rounded-md border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted"
        >
          <ChevronDown className="size-4" />
        </button>
        <div className="mx-auto h-px w-4 bg-border" />
        <button
          type="button"
          onClick={resetView}
          title="Reset view — back to the default position"
          className="flex size-7 items-center justify-center rounded-md border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>
    </>
  )
}

// --- Public component ---------------------------------------------------------

export function LoopGraph({
  loop,
  backTo,
}: {
  loop: LoopDetail & { roster?: LoopAgent[] }
  backTo: string
}) {
  // Restored once per loop — the flow re-reads it because the canvas is
  // keyed by loop id.
  const initialViewport = useMemo(() => loadViewport(loop.id), [loop.id])

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-muted-foreground">
          <Repeat className="size-4" />
        </span>
        <h2 className="text-sm font-semibold text-muted-foreground">Pipeline</h2>
        <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
          grouped by cycle
        </span>
        {loop.cycle !== undefined && (
          <span className="rounded-full bg-blue-500/10 px-1.5 py-px text-[10px] text-blue-600 dark:text-blue-400">
            loop {loop.loop ?? 1} · cycle {loop.cycle}
            {loop.maxCycles !== undefined && `/${loop.maxCycles}`}
          </span>
        )}
      </div>
      <div className="relative h-[600px] overflow-hidden rounded-md border bg-muted/10">
        <ReactFlowProvider>
          <LoopGraphCanvas loop={loop} backTo={backTo} initialViewport={initialViewport} />
        </ReactFlowProvider>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Glowing stage = executing now · ticks = completed · link badge = same session as the
        previous cycle · click a stage to open its run.
      </p>
    </section>
  )
}
