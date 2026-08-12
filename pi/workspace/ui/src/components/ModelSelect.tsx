import { useModels } from '@/lib/useModels'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Cpu, Loader2 } from 'lucide-react'

/** Sentinel for "use the header picker's default" (radix needs non-empty values). */
const DEFAULT_MODEL = '__default__'

interface ModelSelectProps {
  conn: 'connecting' | 'open' | 'closed'
  /** Per-run model id, or null to follow the header picker default. */
  value: string | null
  onChange: (value: string | null) => void
}

/**
 * Per-run model override dropdown for agentic dialogs (skill/profile
 * creation). Preselect the header picker's current choice; picking a
 * different model here overrides it for this run only.
 */
export function ModelSelect({ conn, value, onChange }: ModelSelectProps) {
  const modelsQuery = useModels(conn)
  const models = modelsQuery.data?.models ?? []
  const selectedModel = models.find((model) => model.id === value) ?? null

  if (models.length === 0) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
        {modelsQuery.isPending && modelsQuery.isFetching ? (
          <>
            <Loader2 className="size-3 animate-spin" />
            Loading models…
          </>
        ) : (
          <>
            <Cpu className="size-3" />
            No models available — this run uses the session's current model.
          </>
        )}
      </div>
    )
  }

  return (
    <Select
      value={value ?? DEFAULT_MODEL}
      onValueChange={(next) => onChange(next === DEFAULT_MODEL ? null : next)}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue placeholder="Default">
          {selectedModel !== null ? (
            <span className="font-mono">{selectedModel.id}</span>
          ) : (
            <span>Default (header picker)</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={DEFAULT_MODEL}>
          <span className="font-medium">Default (header picker)</span>
          <span className="text-muted-foreground"> — follows the header model selection</span>
        </SelectItem>
        {models.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            <span className="font-mono">{model.id}</span>
            {model.isCurrent && (
              <span className="ml-2 rounded-full bg-emerald-500/15 px-1.5 py-px text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                current
              </span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
