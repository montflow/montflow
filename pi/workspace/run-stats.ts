/**
 * One turn's provider-reported usage (the `usage` slice of an assistant
 * message). Cost is provider-computed; a provider that does not report cost
 * leaves `cost` undefined (sums to zero).
 */
export interface TurnUsage {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly cost?: { readonly total: number };
}

/**
 * Accumulated run statistics for the whole loop: wall-clock start + summed
 * provider-reported usage/cost across every agent turn (supervisor brief &
 * aggregate, every reviewer, every fixer).
 *
 * The SAME mutable instance flows through the graph context and the loop
 * widget (like {@link StreamStore}), so the widget's 1s re-render timer reads
 * fresh totals without re-pushing the widget after every turn.
 */
export class RunStats {
  readonly startedAt: number;
  private turns = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private cacheReadTokens = 0;
  private cacheWriteTokens = 0;
  private cost = 0;

  constructor(startedAt: number = Date.now()) {
    this.startedAt = startedAt;
  }

  /** Adds one turn's usage (aggregated from the turn's assistant messages). */
  addUsage(usage: TurnUsage): void {
    this.turns += 1;
    this.inputTokens += usage.input;
    this.outputTokens += usage.output;
    this.cacheReadTokens += usage.cacheRead;
    this.cacheWriteTokens += usage.cacheWrite;
    this.cost += usage.cost?.total ?? 0;
  }

  /** How many agent turns reported usage so far. */
  get totalTurns(): number {
    return this.turns;
  }

  /** Summed provider-reported cost in USD (0 when providers report none). */
  get totalCost(): number {
    return this.cost;
  }

  /** Total tokens consumed (input + output + cache reads/writes). */
  get totalTokens(): number {
    return this.inputTokens + this.outputTokens + this.cacheReadTokens + this.cacheWriteTokens;
  }
}
