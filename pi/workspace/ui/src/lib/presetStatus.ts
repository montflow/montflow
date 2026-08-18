import type { PresetConfig, PresetLoopConfig, PresetWorkflowConfig } from '@/protocol'
import { stepError } from '@/lib/workflow'

/**
 * Derived validity of a preset config. Status is NOT stored in the file — it
 * is computed from the config on every render, so it flips to `valid` live
 * as the user completes the required fields (and back to `invalid` when they
 * break them). Saving is allowed in either state.
 *
 * LOOP presets are valid when the canvas holds at least one step, every step
 * is configured (reviewers picked, models set, the human interruptor has its
 * required prompt), and the execution counts are sane.
 *
 * PIPELINE presets are valid when the canvas holds at least one step and
 * every step is configured (reviewer steps must have a picked reviewer;
 * reviewer-group steps must have at least one reviewer).
 */
export interface PresetStatus {
  status: 'valid' | 'invalid'
  /** Human-readable reasons the preset is not valid yet (empty when valid). */
  issues: string[]
}

/** True when the config is a loop (has `maxLoops` and a `steps` array) rather than a pipeline. */
export const isLoopConfigShape = (
  config: PresetConfig | undefined,
): config is PresetLoopConfig =>
  config !== undefined &&
  'maxLoops' in config &&
  Array.isArray((config as PresetLoopConfig).steps)

/**
 * True when the config is a pipeline (has a `steps` array but no `maxLoops`)
 * rather than a loop.
 */
export const isPipelineConfigShape = (
  config: PresetConfig | undefined,
): config is PresetWorkflowConfig =>
  config !== undefined &&
  'steps' in config &&
  Array.isArray((config as PresetWorkflowConfig).steps) &&
  !('maxLoops' in config)

/** Validity of a LOOP config — every step must be configured, plus execution counts. */
const loopStatus = (config: PresetLoopConfig): PresetStatus => {
  const issues: string[] = []
  const steps = Array.isArray(config.steps) ? config.steps.filter(isStepObject) : []
  if (steps.length === 0) {
    issues.push('Empty loop — drag a node onto the canvas')
  } else {
    const stepIssues = steps
      .map((step, index) => {
        const error = stepError(step)
        if (error !== null) return `Step ${index + 1} (${step.kind}): ${error}`
        // Aggregation is part of the reviewer-group — it always runs after it.
        if (step.kind === 'reviewer-group' && (step.model ?? '').trim() === '') {
          return `Step ${index + 1} (reviewer-group): aggregation model missing`
        }
        return null
      })
      .filter((issue): issue is string => issue !== null)
    issues.push(...stepIssues)
  }
  if (!Number.isInteger(config.maxLoops) || config.maxLoops < 1) issues.push('Loops must be at least 1')
  if (config.maxCycles !== undefined && (!Number.isInteger(config.maxCycles) || config.maxCycles < 1)) {
    issues.push('Cycles must be at least 1')
  }
  if (!Number.isInteger(config.deadlock?.flipThreshold) || config.deadlock?.flipThreshold < 1) {
    issues.push('Deadlock flip threshold must be at least 1')
  }
  return { status: issues.length === 0 ? 'valid' : 'invalid', issues }
}

/** Validity of a PIPELINE config. */
const pipelineStatus = (config: PresetWorkflowConfig): PresetStatus => {
  const steps = Array.isArray(config.steps) ? config.steps.filter(isStepObject) : []
  if (steps.length === 0) {
    return {
      status: 'invalid',
      issues: ['Empty pipeline — drag a node onto the canvas'],
    }
  }
  const issues = steps
    .map((step, index) => {
      const error = stepError(step)
      return error === null ? null : `Step ${index + 1} (${step.kind}): ${error}`
    })
    .filter((issue): issue is string => issue !== null)
  return { status: issues.length === 0 ? 'valid' : 'invalid', issues }
}

/** True when a decoded step is a usable object (hand-edited JSON may contain junk). */
const isStepObject = (step: unknown): step is PresetWorkflowConfig['steps'][number] =>
  typeof step === 'object' && step !== null

/**
 * Validity of a preset config. The config shape decides the kind (loop =
 * `maxLoops`, pipeline = `steps`); when the config is missing entirely
 * (invalid/legacy file) the preset counts as invalid.
 */
export const presetStatus = (config: PresetConfig | undefined): PresetStatus => {
  if (isLoopConfigShape(config)) return loopStatus(config)
  if (isPipelineConfigShape(config)) return pipelineStatus(config)
  return {
    status: 'invalid',
    issues: ['Preset file could not be parsed — open JSON mode to repair it'],
  }
}
