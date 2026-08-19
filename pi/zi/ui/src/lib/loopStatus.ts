import {
  CircleAlert,
  CircleCheck,
  Loader2,
  MessageCircle,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { LoopStatus } from '../protocol'

/** Status badge styling for a loop lifecycle state (shared by LoopsSection and LoopDetail). */
export const LOOP_STATUS_META: Record<
  LoopStatus,
  { label: string; className: string; Icon: LucideIcon }
> = {
  kickoff: { label: 'kickoff', className: 'bg-muted text-muted-foreground', Icon: Zap },
  scoping: { label: 'scoping', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', Icon: Loader2 },
  reviewing: { label: 'reviewing', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', Icon: Loader2 },
  fixing: { label: 'fixing', className: 'bg-violet-500/15 text-violet-600 dark:text-violet-400', Icon: Loader2 },
  'awaiting-user': { label: 'awaiting user', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', Icon: MessageCircle },
  done: { label: 'done', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', Icon: CircleCheck },
  deadlocked: { label: 'deadlocked', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', Icon: CircleAlert },
  interrupted: { label: 'interrupted', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', Icon: CircleAlert },
  error: { label: 'error', className: 'bg-red-500/15 text-red-600 dark:text-red-400', Icon: XCircle },
}
