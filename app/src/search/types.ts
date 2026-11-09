/**
 * Generic search interfaces. A SearchSpace is an *implicit* graph: vertices
 * are generated on demand by applying move indices, never enumerated upfront.
 */
export type Key = number | string;

export interface SearchSpace<S> {
  readonly name: string;
  readonly moveNames: readonly string[];
  readonly start: S;
  /** A single goal state (needed by bidirectional search). */
  readonly goal: S;
  isGoal(s: S): boolean;
  key(s: S): Key;
  apply(s: S, move: number): S;
  /** Moves allowed after `last` (−1 = none) excluding only same-layer repeats (safe for graph search). */
  allowedAfter(last: number): readonly number[];
  /** Canonical-sequence pruning (also commuting opposite faces in a fixed order); safe for tree search. */
  canonicalAfter(last: number): readonly number[];
  inverse(move: number): number;
  /** If keys are integers in [0, indexSize), visited sets use typed arrays. */
  readonly indexSize?: number;
}

export type Heuristic<S> = (s: S) => number;

export interface SearchLimits {
  /** Max number of stored/expanded states before giving up. */
  maxNodes?: number;
  timeLimitMs?: number;
  /** Max number of trace events to record (0 = no trace). */
  traceLimit?: number;
}

export type SearchEvent =
  | { t: 'discover'; id: Key; parent: Key | null; move: number; g: number; h?: number; side?: 'f' | 'b' }
  | { t: 'expand'; id: Key; g: number; h?: number; f?: number; side?: 'f' | 'b' }
  | { t: 'bound'; bound: number }
  | { t: 'meet'; id: Key }
  | { t: 'goal'; id: Key };

export interface SearchResult {
  algorithm: string;
  heuristic?: string;
  success: boolean;
  status: 'solved' | 'node-limit' | 'time-limit' | 'exhausted';
  /** Move indices of the solution (start → goal). */
  solution: number[] | null;
  solutionNames: string[] | null;
  length: number | null;
  /** True when the algorithm guarantees a minimum-length solution (given admissible h). */
  optimalityGuaranteed: boolean;
  expanded: number;
  generated: number;
  /** Distinct states stored (graph search) / unique states touched (approximate for IDA*: = generated). */
  discovered: number;
  /** Peak number of simultaneously stored states — memory proxy. */
  peakStored: number;
  maxDepth: number;
  timeMs: number;
  iterations?: { bound: number; expanded: number; generated: number }[];
  trace?: SearchEvent[];
  traceTruncated?: boolean;
  /** Path of state keys start → goal, for visualisation. */
  pathKeys?: Key[];
}

export class TraceRecorder {
  readonly events: SearchEvent[] = [];
  truncated = false;
  constructor(private readonly limit: number) {}
  get on(): boolean {
    return this.limit > 0 && !this.truncated;
  }
  push(e: SearchEvent): void {
    if (this.limit <= 0) return;
    if (this.events.length >= this.limit) {
      this.truncated = true;
      return;
    }
    this.events.push(e);
  }
}
