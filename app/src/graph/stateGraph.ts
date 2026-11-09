/**
 * Implicit state graph explorer.
 *
 * Vertices are complete configurations, normalised to the canonical frame
 * (centres fixed for n = 3; corner DBL fixed for n = 2), so that physically
 * identical cubes seen from different orientations are one vertex. Edges are
 * generator moves (HTM: the 18 face turns for n = 3, the 9 turns of U, R, F for
 * n = 2). Only explicitly visited or expanded vertices are materialised.
 *
 * Proposition (docs/03): the map g ↦ (solved)·g is an isomorphism between the
 * Cayley graph Cay(G, S) and this state graph; the two views differ in what they
 * are centred on (the current configuration vs. the identity) and in which
 * generating sets are offered.
 */
import { getPuzzle, type Puzzle } from '../core/geometry';
import { compose, permKey } from '../core/perm';
import { canonicalFrame } from '../core/symmetry';

export interface SGNode {
  key: string;
  state: Uint8Array; // canonical facelet state
  order: number; // creation order
  visits: number;
  expanded: boolean;
  onHistory: boolean;
}
export interface SGEdge {
  a: string;
  b: string;
  move: string; // a·move = b
  history: boolean;
}
export interface CycleInfo {
  length: number;
  word: string[];
  at: number; // history index where it closed
}

export class StateGraph {
  readonly P: Puzzle;
  readonly generators: string[];
  nodes = new Map<string, SGNode>();
  edges = new Map<string, SGEdge>();
  history: string[] = [];
  historyMoves: string[] = [];
  cycles: CycleInfo[] = [];
  current = '';
  path: string[] = [];
  version = 0;

  constructor(n: 2 | 3) {
    this.P = getPuzzle(n);
    this.generators = n === 3 ? this.P.faceMoves.slice() : ['U', 'U2', "U'", 'R', 'R2', "R'", 'F', 'F2', "F'"];
  }

  canonical(s: Uint8Array): Uint8Array {
    return canonicalFrame(this.P, s).t;
  }

  private addNode(t: Uint8Array): SGNode {
    const key = permKey(t);
    let node = this.nodes.get(key);
    if (!node) {
      node = { key, state: t, order: this.nodes.size, visits: 0, expanded: false, onHistory: false };
      this.nodes.set(key, node);
    }
    return node;
  }

  private addEdge(a: string, b: string, move: string, history: boolean): void {
    const ek = a < b ? `${a}|${b}` : `${b}|${a}`;
    const e = this.edges.get(ek);
    if (e) {
      e.history ||= history;
    } else this.edges.set(ek, { a, b, move, history });
  }

  reset(physical: Uint8Array): void {
    this.nodes.clear();
    this.edges.clear();
    this.history = [];
    this.historyMoves = [];
    this.cycles = [];
    this.path = [];
    const n = this.addNode(this.canonical(physical));
    n.visits = 1;
    n.onHistory = true;
    this.current = n.key;
    this.history.push(n.key);
    this.version++;
  }

  /** Adds all neighbours of a vertex (local expansion). */
  expand(key: string): void {
    const node = this.nodes.get(key);
    if (!node) return;
    for (const g of this.generators) {
      const t = compose(node.state, this.P.moves.get(g)!);
      const nb = this.addNode(t);
      this.addEdge(key, nb.key, g, false);
    }
    node.expanded = true;
    this.version++;
  }

  /** Neighbour reached from `key` by generator g. */
  neighbour(key: string, g: string): Uint8Array {
    return compose(this.nodes.get(key)!.state, this.P.moves.get(g)!);
  }

  /** Finds a word of ≤ 2 generators taking canonical a to canonical b. */
  private connect(a: Uint8Array, bKey: string): string[] | null {
    for (const g of this.generators) if (permKey(compose(a, this.P.moves.get(g)!)) === bKey) return [g];
    for (const g of this.generators) {
      const x = compose(a, this.P.moves.get(g)!);
      for (const h of this.generators) if (permKey(compose(x, this.P.moves.get(h)!)) === bKey) return [g, h];
    }
    return null;
  }

  /**
   * Records a physical move. Rotations do not change the vertex; slice turns are
   * recorded as the equivalent pair of face turns (e.g. M ≡ R L' up to rotation).
   * Returns a detected cycle, if the new vertex was already on the history.
   */
  recordMove(physicalAfter: Uint8Array): CycleInfo | null {
    const prev = this.nodes.get(this.current)!;
    const t = this.canonical(physicalAfter);
    const key = permKey(t);
    if (key === this.current) return null;
    const word = this.connect(prev.state, key);
    let cur = prev;
    if (word) {
      for (const g of word) {
        const next = this.addNode(compose(cur.state, this.P.moves.get(g)!));
        this.addEdge(cur.key, next.key, g, true);
        this.historyMoves.push(g);
        cur = next;
      }
    } else {
      cur = this.addNode(t); // jump (e.g. state loaded directly)
      this.historyMoves.push('↯');
    }
    let cycle: CycleInfo | null = null;
    const idx = this.history.lastIndexOf(cur.key);
    if (idx >= 0) {
      const w = this.historyMoves.slice(idx);
      if (!w.includes('↯')) {
        cycle = { length: w.length, word: w, at: this.history.length };
        this.cycles.push(cycle);
      }
    }
    // intermediate vertex of a 2-move word also enters the history
    if (word && word.length === 2) {
      const mid = compose(prev.state, this.P.moves.get(word[0])!);
      const mk = permKey(mid);
      this.history.push(mk);
      this.nodes.get(mk)!.onHistory = true;
    }
    cur.visits++;
    cur.onHistory = true;
    this.history.push(cur.key);
    this.current = cur.key;
    this.version++;
    return cycle;
  }

  setPath(states: Uint8Array[]): void {
    this.path = [];
    let prev: SGNode | null = null;
    for (const s of states) {
      const node = this.addNode(this.canonical(s));
      if (prev) {
        const w = this.connect(prev.state, node.key);
        if (w && w.length === 1) this.addEdge(prev.key, node.key, w[0], false);
      }
      this.path.push(node.key);
      prev = node;
    }
    this.version++;
  }

  repeatedStates(): number {
    let r = 0;
    for (const n of this.nodes.values()) if (n.visits > 1) r++;
    return r;
  }
}
