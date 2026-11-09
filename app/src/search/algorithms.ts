/**
 * Search algorithms over implicit graphs (unit edge costs).
 *
 *  BFS ......................... optimal; O(b^d) time and memory.
 *  Bidirectional BFS ........... optimal (layer-complete meeting rule); O(b^{d/2}).
 *  A* .......................... optimal if h is admissible (consistent ⇒ no re-expansions).
 *  IDA* ........................ optimal if h is admissible; memory O(d).
 *
 * All functions return the same instrumented SearchResult. When a trace limit
 * is given, the events of the *actual* execution are recorded in order (the
 * UI replays this log; it never synthesises fake exploration).
 */
import type { Heuristic, Key, SearchLimits, SearchResult, SearchSpace } from './types';
import { TraceRecorder } from './types';
import { MinHeap } from './heap';

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

class Visited {
  private parent?: Int32Array;
  private move?: Int8Array;
  private depth?: Uint8Array;
  private map?: Map<Key, { parent: Key | null; move: number; depth: number }>;
  size = 0;
  constructor(indexSize?: number) {
    if (indexSize !== undefined) {
      this.parent = new Int32Array(indexSize).fill(-2);
      this.move = new Int8Array(indexSize).fill(-1);
      this.depth = new Uint8Array(indexSize);
    } else this.map = new Map();
  }
  has(k: Key): boolean {
    return this.map ? this.map.has(k) : this.parent![k as number] !== -2;
  }
  set(k: Key, parent: Key | null, move: number, depth: number): void {
    if (this.map) this.map.set(k, { parent, move, depth });
    else {
      this.parent![k as number] = parent === null ? -1 : (parent as number);
      this.move![k as number] = move;
      this.depth![k as number] = depth;
    }
    this.size++;
  }
  getDepth(k: Key): number {
    return this.map ? this.map.get(k)!.depth : this.depth![k as number];
  }
  /** Moves and keys from root to k. */
  path(k: Key): { moves: number[]; keys: Key[] } {
    const moves: number[] = [];
    const keys: Key[] = [k];
    let cur: Key | null = k;
    for (;;) {
      let p: Key | null;
      let m: number;
      if (this.map) {
        const e: { parent: Key | null; move: number } = this.map.get(cur!)!;
        p = e.parent;
        m = e.move;
      } else {
        const pi: number = this.parent![cur as number];
        p = pi === -1 ? null : pi;
        m = this.move![cur as number];
      }
      if (p === null) break;
      moves.push(m);
      keys.push(p);
      cur = p;
    }
    return { moves: moves.reverse(), keys: keys.reverse() };
  }
}

function baseResult(algorithm: string, optimal: boolean): SearchResult {
  return {
    algorithm,
    success: false,
    status: 'exhausted',
    solution: null,
    solutionNames: null,
    length: null,
    optimalityGuaranteed: optimal,
    expanded: 0,
    generated: 0,
    discovered: 0,
    peakStored: 0,
    maxDepth: 0,
    timeMs: 0,
  };
}

function finish<S>(r: SearchResult, space: SearchSpace<S>, t0: number, rec: TraceRecorder): SearchResult {
  r.timeMs = now() - t0;
  if (r.solution) {
    r.solutionNames = r.solution.map((m) => space.moveNames[m]);
    r.length = r.solution.length;
    r.success = true;
    r.status = 'solved';
  }
  if (rec.events.length) {
    r.trace = rec.events;
    r.traceTruncated = rec.truncated;
  }
  return r;
}

const DEFAULTS = { maxNodes: 5_000_000, timeLimitMs: 60_000, traceLimit: 0 };

// ---------------------------------------------------------------------------
// Breadth-first search
// ---------------------------------------------------------------------------
export function bfs<S>(space: SearchSpace<S>, limits: SearchLimits = {}): SearchResult {
  const L = { ...DEFAULTS, ...limits };
  const t0 = now();
  const rec = new TraceRecorder(L.traceLimit);
  const r = baseResult('BFS', true);
  const visited = new Visited(space.indexSize);
  const k0 = space.key(space.start);
  visited.set(k0, null, -1, 0);
  rec.push({ t: 'discover', id: k0, parent: null, move: -1, g: 0 });
  r.discovered = 1;
  if (space.isGoal(space.start)) {
    r.solution = [];
    r.pathKeys = [k0];
    rec.push({ t: 'goal', id: k0 });
    return finish(r, space, t0, rec);
  }
  let frontier: { s: S; last: number }[] = [{ s: space.start, last: -1 }];
  let depth = 0;
  while (frontier.length) {
    const next: { s: S; last: number }[] = [];
    for (const { s, last } of frontier) {
      const k = space.key(s);
      r.expanded++;
      rec.push({ t: 'expand', id: k, g: depth });
      for (const m of space.allowedAfter(last)) {
        const s2 = space.apply(s, m);
        r.generated++;
        const k2 = space.key(s2);
        if (visited.has(k2)) continue;
        visited.set(k2, k, m, depth + 1);
        r.discovered++;
        rec.push({ t: 'discover', id: k2, parent: k, move: m, g: depth + 1 });
        if (space.isGoal(s2)) {
          const p = visited.path(k2);
          r.solution = p.moves;
          r.pathKeys = p.keys;
          r.maxDepth = depth + 1;
          r.peakStored = Math.max(r.peakStored, visited.size);
          rec.push({ t: 'goal', id: k2 });
          return finish(r, space, t0, rec);
        }
        next.push({ s: s2, last: m });
      }
      if (visited.size > L.maxNodes) {
        r.status = 'node-limit';
        r.peakStored = visited.size;
        return finish(r, space, t0, rec);
      }
      if ((r.expanded & 1023) === 0 && now() - t0 > L.timeLimitMs) {
        r.status = 'time-limit';
        r.peakStored = visited.size;
        return finish(r, space, t0, rec);
      }
    }
    depth++;
    r.maxDepth = depth;
    r.peakStored = Math.max(r.peakStored, visited.size);
    frontier = next;
  }
  r.status = 'exhausted';
  return finish(r, space, t0, rec);
}

// ---------------------------------------------------------------------------
// Bidirectional BFS (requires a symmetric generating set: m⁻¹ is a move)
// ---------------------------------------------------------------------------
export function bidirectionalBfs<S>(space: SearchSpace<S>, limits: SearchLimits = {}): SearchResult {
  const L = { ...DEFAULTS, ...limits };
  const t0 = now();
  const rec = new TraceRecorder(L.traceLimit);
  const r = baseResult('BFS bidirecional', true);
  const kS = space.key(space.start);
  const kG = space.key(space.goal);
  const fwd = new Visited(space.indexSize);
  const bwd = new Visited(space.indexSize);
  fwd.set(kS, null, -1, 0);
  bwd.set(kG, null, -1, 0);
  rec.push({ t: 'discover', id: kS, parent: null, move: -1, g: 0, side: 'f' });
  rec.push({ t: 'discover', id: kG, parent: null, move: -1, g: 0, side: 'b' });
  r.discovered = kS === kG ? 1 : 2;
  if (kS === kG) {
    r.solution = [];
    r.pathKeys = [kS];
    return finish(r, space, t0, rec);
  }
  let fFront: { s: S; last: number }[] = [{ s: space.start, last: -1 }];
  let bFront: { s: S; last: number }[] = [{ s: space.goal, last: -1 }];
  let fDepth = 0;
  let bDepth = 0;
  while (fFront.length && bFront.length) {
    const forward = fFront.length <= bFront.length;
    const front = forward ? fFront : bFront;
    const mine = forward ? fwd : bwd;
    const other = forward ? bwd : fwd;
    const depth = forward ? fDepth : bDepth;
    const side = forward ? 'f' : 'b';
    const next: { s: S; last: number }[] = [];
    let best: { k: Key; total: number } | null = null;
    for (const { s, last } of front) {
      const k = space.key(s);
      r.expanded++;
      rec.push({ t: 'expand', id: k, g: depth, side });
      for (const m of space.allowedAfter(last)) {
        const s2 = space.apply(s, m);
        r.generated++;
        const k2 = space.key(s2);
        if (mine.has(k2)) continue;
        mine.set(k2, k, m, depth + 1);
        r.discovered++;
        rec.push({ t: 'discover', id: k2, parent: k, move: m, g: depth + 1, side });
        if (other.has(k2)) {
          const total = depth + 1 + other.getDepth(k2);
          if (!best || total < best.total) best = { k: k2, total };
        }
        next.push({ s: s2, last: m });
      }
      if (fwd.size + bwd.size > L.maxNodes) {
        r.status = 'node-limit';
        r.peakStored = fwd.size + bwd.size;
        return finish(r, space, t0, rec);
      }
      if ((r.expanded & 1023) === 0 && now() - t0 > L.timeLimitMs) {
        r.status = 'time-limit';
        r.peakStored = fwd.size + bwd.size;
        return finish(r, space, t0, rec);
      }
    }
    r.peakStored = Math.max(r.peakStored, fwd.size + bwd.size);
    if (forward) {
      fDepth++;
      fFront = next;
    } else {
      bDepth++;
      bFront = next;
    }
    r.maxDepth = fDepth + bDepth;
    if (best) {
      // The whole layer has been generated, so `best` is minimal (see docs/04-algoritmos.md).
      rec.push({ t: 'meet', id: best.k });
      const pf = fwd.path(best.k);
      const pb = bwd.path(best.k);
      const back = pb.moves.slice().reverse().map((m) => space.inverse(m));
      r.solution = [...pf.moves, ...back];
      r.pathKeys = [...pf.keys, ...pb.keys.slice(0, -1).reverse()];
      rec.push({ t: 'goal', id: kG });
      return finish(r, space, t0, rec);
    }
  }
  return finish(r, space, t0, rec);
}

// ---------------------------------------------------------------------------
// A*
// ---------------------------------------------------------------------------
export function astar<S>(
  space: SearchSpace<S>,
  h: Heuristic<S>,
  heuristicName = 'h',
  limits: SearchLimits = {},
): SearchResult {
  const L = { ...DEFAULTS, ...limits };
  const t0 = now();
  const rec = new TraceRecorder(L.traceLimit);
  const r = baseResult('A*', true);
  r.heuristic = heuristicName;
  const visited = new Visited(space.indexSize);
  const bestG = new Map<Key, number>();
  // entry: [f, -g (tie-break: deeper first), seq]
  const heap = new MinHeap<{ s: S; k: Key; g: number; last: number }>();
  const k0 = space.key(space.start);
  const h0 = h(space.start);
  visited.set(k0, null, -1, 0);
  bestG.set(k0, 0);
  heap.push(h0, 0, { s: space.start, k: k0, g: 0, last: -1 });
  rec.push({ t: 'discover', id: k0, parent: null, move: -1, g: 0, h: h0 });
  r.discovered = 1;
  while (heap.size) {
    const { s, k, g, last } = heap.pop()!;
    if (g > bestG.get(k)!) continue; // stale entry
    const hs = h(s);
    r.expanded++;
    r.maxDepth = Math.max(r.maxDepth, g);
    rec.push({ t: 'expand', id: k, g, h: hs, f: g + hs });
    if (space.isGoal(s)) {
      const p = visited.path(k);
      r.solution = p.moves;
      r.pathKeys = p.keys;
      r.peakStored = Math.max(r.peakStored, bestG.size);
      rec.push({ t: 'goal', id: k });
      return finish(r, space, t0, rec);
    }
    for (const m of space.allowedAfter(last)) {
      const s2 = space.apply(s, m);
      r.generated++;
      const k2 = space.key(s2);
      const g2 = g + 1;
      const old = bestG.get(k2);
      if (old !== undefined && old <= g2) continue;
      if (old === undefined) r.discovered++;
      bestG.set(k2, g2);
      visited.set(k2, k, m, g2); // (re)parent: a shorter path to k2 was found
      const h2 = h(s2);
      heap.push(g2 + h2, -g2, { s: s2, k: k2, g: g2, last: m });
      rec.push({ t: 'discover', id: k2, parent: k, move: m, g: g2, h: h2 });
    }
    r.peakStored = Math.max(r.peakStored, bestG.size);
    if (bestG.size > L.maxNodes) {
      r.status = 'node-limit';
      return finish(r, space, t0, rec);
    }
    if ((r.expanded & 1023) === 0 && now() - t0 > L.timeLimitMs) {
      r.status = 'time-limit';
      return finish(r, space, t0, rec);
    }
  }
  return finish(r, space, t0, rec);
}

// ---------------------------------------------------------------------------
// IDA*
// ---------------------------------------------------------------------------
export function idaStar<S>(
  space: SearchSpace<S>,
  h: Heuristic<S>,
  heuristicName = 'h',
  limits: SearchLimits = {},
): SearchResult {
  const L = { ...DEFAULTS, ...limits, maxNodes: limits.maxNodes ?? 50_000_000 };
  const t0 = now();
  const rec = new TraceRecorder(L.traceLimit);
  const r = baseResult('IDA*', true);
  r.heuristic = heuristicName;
  r.iterations = [];
  const path: number[] = [];
  const keys: Key[] = [];
  const FOUND = -1;
  let aborted: 'node-limit' | 'time-limit' | null = null;

  const dfs = (s: S, g: number, bound: number, last: number, k: Key): number => {
    const hs = h(s);
    const f = g + hs;
    if (f > bound) return f;
    if (space.isGoal(s)) {
      rec.push({ t: 'goal', id: k });
      return FOUND;
    }
    r.expanded++;
    r.maxDepth = Math.max(r.maxDepth, g);
    rec.push({ t: 'expand', id: k, g, h: hs, f });
    if (r.expanded > L.maxNodes) {
      aborted = 'node-limit';
      return Infinity;
    }
    if ((r.expanded & 4095) === 0 && now() - t0 > L.timeLimitMs) {
      aborted = 'time-limit';
      return Infinity;
    }
    let min = Infinity;
    for (const m of space.canonicalAfter(last)) {
      const s2 = space.apply(s, m);
      r.generated++;
      const k2 = rec.on ? space.key(s2) : 0;
      if (rec.on) rec.push({ t: 'discover', id: k2, parent: k, move: m, g: g + 1 });
      path.push(m);
      keys.push(k2);
      const t = dfs(s2, g + 1, bound, m, k2);
      if (t === FOUND) return FOUND;
      path.pop();
      keys.pop();
      if (aborted) return Infinity;
      if (t < min) min = t;
    }
    return min;
  };

  const k0 = space.key(space.start);
  let bound = h(space.start);
  r.discovered = 1;
  for (;;) {
    rec.push({ t: 'bound', bound });
    const e0 = r.expanded;
    const g0 = r.generated;
    const t = dfs(space.start, 0, bound, -1, k0);
    r.iterations.push({ bound, expanded: r.expanded - e0, generated: r.generated - g0 });
    if (t === FOUND) {
      r.solution = path.slice();
      // recompute keys along the path (trace may be off)
      const pk: Key[] = [k0];
      let s = space.start;
      for (const m of r.solution) {
        s = space.apply(s, m);
        pk.push(space.key(s));
      }
      r.pathKeys = pk;
      break;
    }
    if (aborted) {
      r.status = aborted;
      break;
    }
    if (t === Infinity) break;
    bound = t;
  }
  r.discovered = r.generated + 1; // IDA* keeps no closed set: every generation is a fresh node
  r.peakStored = r.maxDepth + 1;
  return finish(r, space, t0, rec);
}

/**
 * Effective branching factor b*: the branching of a uniform tree of depth d
 * with N+1 nodes, N + 1 = 1 + b* + … + (b*)^d (Russell & Norvig).
 */
export function effectiveBranchingFactor(N: number, d: number): number {
  if (d <= 0) return NaN;
  const total = (b: number) => {
    let s = 1;
    let p = 1;
    for (let i = 1; i <= d; i++) {
      p *= b;
      s += p;
    }
    return s;
  };
  let lo = 0;
  let hi = Math.max(2, N + 1);
  for (let it = 0; it < 200; it++) {
    const mid = (lo + hi) / 2;
    if (total(mid) < N + 1) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
