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
  ChevronDown,
  ChevronUp,
  Flag,
  Layers,
  ListTodo,
  Repeat,
  RotateCcw,
  Search,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { SpecDetailInfo } from '@/protocol'

/**
 * Read-only visualization of a feature spec — wiki/feature-specs.md §1–3 as a
 * React Flow canvas, TOP TO BOTTOM, grouped BY PHASE:
 *
 *   ┌╌ Phase A · foundation ╌╌╌╌╌╌╌╌╌╌╌┐
 *   │ (A) → [A001] [A002] [A003]       │
 *   └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
 *   ┌╌ Phase B · build ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
 *   │ (B) → [B001] [B002]              │
 *   └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
 *   Complete
 *
 * Each phase is a pill node fanning out to its tasks; every task flows into
 * the NEXT phase's pill (fan-in), so the sequential contract reads directly
 * off the canvas. Status drives the node state — glowing = in-progress now,
 * tick-green = complete, amber = blocked — and the detail query polls, so the
 * graph follows the bookkeeping agent as it rewrites frontmatter.
 *
 * Same conventions as LoopGraph.tsx: NO auto-fit — viewport persists to
 * localStorage; custom up/down controls on the right; SHIFT + arrow keys pans.
 */

// --- Graph definition -------------------------------------------------------

type GraphNode = `phase-${string}` | `task-${string}` | 'empty' | 'complete'

interface SpecGraphNodeData extends Record<string, unknown> {
  icon: LucideIcon
  title: string
  hint: string
  /** idle · done · active · blocked · terminal-ok */
  state: 'idle' | 'done' | 'active' | 'blocked' | 'terminal-ok'
}

type SpecStageNodeType = Node<SpecGraphNodeData>

/** Task status → node state. */
const taskState = (status: string): SpecGraphNodeData['state'] => {
  if (status === 'in-progress') return 'active'
  if (status === 'complete') return 'done'
  if (status === 'blocked') return 'blocked'
  return 'idle'
}

const phaseState = taskState

/** Icon per task type. */
const typeIcon = (type: string): LucideIcon => {
  if (type === 'planning') return ListTodo
  if (type === 'execution') return Wrench
  return Search
}

// --- Layout -----------------------------------------------------------------
// One BLOCK per phase: pill row → task row, then a gap before the next block.
const NODE_W = 224
const NODE_H = 72
const ROW_GAP = 116
const FAN_COL_GAP = 256
/** Vertical distance between one phase's pill row and the next phase's. */
const PHASE_STRIDE = ROW_GAP + NODE_H + 132

const phasePillY = (index: number): number => index * PHASE_STRIDE
const taskRowY = (pillY: number): number => pillY + ROW_GAP

/** Horizontal fan-out position — node CENTERS mirror around the main axis. */
const fanX = (index: number, count: number): number =>
  (index - (count - 1) / 2) * FAN_COL_GAP - NODE_W / 2

const buildGraph = (
  spec: SpecDetailInfo,
): { nodes: SpecStageNodeType[]; edges: Edge[] } => {
  const makeNode = (
    id: GraphNode,
    pos: { x: number; y: number },
    data: SpecGraphNodeData,
  ): SpecStageNodeType => ({
    id,
    type: 'specStage',
    position: pos,
    draggable: false,
    data,
  })

  const nodes: SpecStageNodeType[] = []
  const edges: Edge[] = []

  const edgeStyle = (lit: boolean): Edge['style'] => ({
    stroke: lit ? 'var(--primary)' : 'var(--border)',
    strokeWidth: 2,
  })
  const lit = (cond: boolean): Partial<Edge> =>
    cond ? { animated: true, style: edgeStyle(true) } : { style: edgeStyle(false) }

  // Empty spec — single placeholder, no phases to draw.
  if (spec.phases.length === 0) {
    nodes.push(
      makeNode('empty', { x: -NODE_W / 2, y: 0 }, {
        icon: Layers,
        title: 'No phases yet',
        hint: 'add phase A to start planning',
        state: 'idle',
      }),
    )
    return { nodes, edges }
  }

  /** Sources that flow INTO the next phase pill: this phase's tasks when it
   * has any, otherwise its own pill (empty phases pass the chain through). */
  let upstreamSources: string[] = []

  spec.phases.forEach((phase, p) => {
    const pillId: GraphNode = `phase-${phase.id}`
    const pState = phaseState(phase.status)
    const pillY = phasePillY(p)
    const taskIds: string[] = []

    // Dashed zone box underneath — same decoration convention as loop cycles.
    const count = Math.max(phase.tasks.length, 1)
    const halfW = ((count - 1) / 2) * FAN_COL_GAP + NODE_W / 2 + 44
    nodes.push({
      id: `zone-${phase.id}`,
      type: 'phaseZone',
      position: { x: -halfW, y: pillY - 36 },
      draggable: false,
      selectable: false,
      data: {
        icon: Layers,
        title: `Phase ${phase.id} · ${phase.name} — ${phase.status}`,
        hint: '',
        state: 'idle',
      },
      style: { width: halfW * 2, height: ROW_GAP + NODE_H + 64 },
    })

    nodes.push(
      makeNode(pillId, { x: -NODE_W / 2, y: pillY }, {
        icon: Layers,
        title: `Phase ${phase.id}`,
        hint: `${phase.name} · ${phase.tasks.length} task${phase.tasks.length === 1 ? '' : 's'}`,
        state: pState,
      }),
    )

    phase.tasks.forEach((task, i) => {
      const taskId: GraphNode = `task-${task.id}`
      taskIds.push(taskId)
      const Icon = typeIcon(task.type)
      nodes.push(
        makeNode(taskId, { x: fanX(i, phase.tasks.length), y: taskRowY(pillY) }, {
          icon: Icon,
          title: task.name,
          hint: `${task.id} · ${task.type}${task.loopPreset !== null ? ` · loop:${task.loopPreset}` : ''}`,
          state: taskState(task.status),
        }),
      )
      // Pill → task fan-out; lit while the task is actually moving.
      edges.push({
        id: `${pillId}->${taskId}`,
        source: pillId,
        target: taskId,
        ...lit(taskState(task.status) === 'active'),
      })
    })

    // Upstream sources → this pill (fan-in); lit while the phase runs.
    for (const source of upstreamSources) {
      edges.push({
        id: `${source}->${pillId}`,
        source,
        target: pillId,
        ...lit(pState === 'active'),
      })
    }
    upstreamSources = taskIds.length > 0 ? taskIds : [pillId]
  })

  // Terminal — after the last phase.
  const terminalY = taskRowY(phasePillY(spec.phases.length - 1)) + ROW_GAP
  const complete = spec.status === 'complete'
  nodes.push(
    makeNode('complete', { x: -NODE_W / 2, y: terminalY }, {
      icon: Flag,
      title: 'Complete',
      hint: `spec status: ${spec.status}`,
      state: complete ? 'terminal-ok' : 'idle',
    }),
  )
  for (const source of upstreamSources) {
    edges.push({
      id: `${source}->complete`,
      source,
      target: 'complete',
      ...lit(complete),
    })
  }

  return { nodes, edges }
}

// --- Custom nodes -----------------------------------------------------------

function SpecStageNode({ data }: NodeProps<SpecStageNodeType>) {
  const Icon = data.icon
  return (
    <div
      title={data.hint}
      className={[
        'relative flex h-[72px] w-[224px] cursor-default items-center gap-3 rounded-lg border bg-card p-3 text-left shadow-sm transition-all',
        data.state === 'active'
          ? 'border-primary ring-2 ring-primary/40 shadow-primary/10 hover:bg-muted/30'
          : '',
        data.state === 'done' ? 'border-emerald-500/40 opacity-80' : '',
        data.state === 'blocked' ? 'border-amber-500/50 opacity-80' : '',
        data.state === 'terminal-ok' ? 'border-emerald-500 bg-emerald-500/10' : '',
        data.state === 'idle' ? 'opacity-70' : '',
      ].join(' ')}
    >
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-1 !h-1 !min-w-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-1 !h-1 !min-w-0" />
      <span
        className={[
          'relative flex size-8 shrink-0 items-center justify-center rounded-md',
          data.state === 'active'
            ? 'bg-primary/15 text-primary'
            : data.state === 'done' || data.state === 'terminal-ok'
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : data.state === 'blocked'
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
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
    </div>
  )
}

/** Dotted phase boundary — pure decoration, ignores pointer events. */
function PhaseZoneNode({ data }: NodeProps<SpecStageNodeType>) {
  return (
    <div className="pointer-events-none flex h-full w-full flex-col rounded-xl border-2 border-dashed border-border/80">
      <span className="m-2 mr-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        {data.title}
      </span>
    </div>
  )
}

const nodeTypes = { specStage: SpecStageNode, phaseZone: PhaseZoneNode }

// --- Viewport persistence ----------------------------------------------------

/**
 * Pan/zoom persisted per spec in localStorage — same convention as the loop
 * graph (`montflow:<feature>:` prefix). No auto-fit on revisit.
 */
interface StoredViewport {
  x: number
  y: number
  zoom: number
}

const VIEWPORT_PREFIX = 'montflow:spec-graph:'
const DEFAULT_VIEWPORT: StoredViewport = { x: 332, y: 32, zoom: 0.85 }

const loadViewport = (specName: string): StoredViewport => {
  try {
    const raw = localStorage.getItem(VIEWPORT_PREFIX + specName)
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

const saveViewport = (specName: string, viewport: StoredViewport): void => {
  try {
    localStorage.setItem(VIEWPORT_PREFIX + specName, JSON.stringify(viewport))
  } catch {
    // Storage full or unavailable (private mode) — best effort only.
  }
}

// --- Canvas -------------------------------------------------------------------

const PAN_STEP = 120
const PAN_DURATION_MS = 140
const RESET_DURATION_MS = 320

function SpecGraphCanvas({
  specName,
  spec,
  initialViewport,
}: {
  specName: string
  spec: SpecDetailInfo
  initialViewport: StoredViewport
}) {
  const instance = useReactFlow()
  const { nodes, edges } = useMemo(() => buildGraph(spec), [spec])

  const pan = useCallback(
    (dx: number, dy: number) => {
      const current = instance.getViewport()
      const next = { x: current.x + dx, y: current.y + dy, zoom: current.zoom }
      void instance.setViewport(next, { duration: PAN_DURATION_MS })
      saveViewport(specName, next)
    },
    [instance, specName],
  )

  const resetView = useCallback(() => {
    void instance.setViewport(DEFAULT_VIEWPORT, { duration: RESET_DURATION_MS })
    saveViewport(specName, DEFAULT_VIEWPORT)
  }, [instance, specName])

  // SHIFT + arrow keys pans the canvas from anywhere on the page.
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
      const delta =
        event.key === 'ArrowDown'
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
        key={specName}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        defaultViewport={initialViewport}
        onMoveEnd={(_, viewport) => saveViewport(specName, viewport)}
        zoomOnScroll={false}
        panOnScroll={false}
        preventScrolling={false}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} />
      </ReactFlow>
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

export function SpecGraph({ spec }: { spec: SpecDetailInfo }) {
  const initialViewport = useMemo(() => loadViewport(spec.name), [spec.name])
  const activeTasks = spec.phases.reduce(
    (sum, phase) => sum + phase.tasks.filter((t) => t.status === 'in-progress').length,
    0,
  )

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-muted-foreground">
          <Layers className="size-4" />
        </span>
        <h2 className="text-sm font-semibold text-muted-foreground">Pipeline</h2>
        <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
          grouped by phase
        </span>
        <span className="rounded-full bg-blue-500/10 px-1.5 py-px text-[10px] text-blue-600 dark:text-blue-400">
          {spec.phases.length} phase{spec.phases.length === 1 ? '' : 's'} · {spec.taskCount} task
          {spec.taskCount === 1 ? '' : 's'}
        </span>
        {activeTasks > 0 && (
          <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">
            {activeTasks} running
          </span>
        )}
      </div>
      <div className="relative h-[520px] overflow-hidden rounded-md border bg-muted/10">
        <ReactFlowProvider>
          <SpecGraphCanvas specName={spec.name} spec={spec} initialViewport={initialViewport} />
        </ReactFlowProvider>
      </div>
      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Repeat className="size-3" /> Glowing stage = in progress · ticks = complete · amber =
        blocked · phases run sequentially · updates as the bookkeeper rewrites frontmatter.
      </p>
    </section>
  )
}
