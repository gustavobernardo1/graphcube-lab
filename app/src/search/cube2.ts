/**
 * Coordinate model of the 2×2×2 group G₂ = ⟨U, R, F⟩ (corner DBL fixed).
 *
 * A state is encoded by the integer  idx = π·729 + ω, where
 *   π ∈ [0, 5040)  Lehmer rank of the permutation of the 7 free corners,
 *   ω ∈ [0, 729)   base-3 number formed by the twists of the first 6 free
 *                  corners (the 7th twist is determined: Σ co ≡ 0 mod 3).
 * Hence |G₂| = 7!·3⁶ = 3 674 160 = number of encodings: the map is a bijection
 * (tested), so the state space can be stored exhaustively in 3.6 MB.
 */
import { getPuzzle } from '../core/geometry';
import { toCubie, toFacelet, cubieMultiply, type CubieState } from '../core/cubie';
import { rankPerm, unrankPerm } from '../core/perm';
import { parseMove, type Move } from '../core/notation';
import { canonicalFrame, fromCanonicalFrame } from '../core/symmetry';
import { buildPruning, inverseTable } from './pruning';
import type { Heuristic, SearchSpace } from './types';

export const MOVES2 = ['U', 'U2', "U'", 'R', 'R2', "R'", 'F', 'F2', "F'"] as const;
export type Metric = 'HTM' | 'QTM';
export const METRIC_MOVES: Record<Metric, number[]> = { HTM: [0, 1, 2, 3, 4, 5, 6, 7, 8], QTM: [0, 2, 3, 5, 6, 8] };

const FREE = [0, 1, 2, 3, 4, 5, 7]; // corner positions except DBL (6)
export const N_PERM2 = 5040;
export const N_ORI2 = 729;
export const N_STATES2 = N_PERM2 * N_ORI2; // 3 674 160

const P2 = getPuzzle(2);

function encodePerm(c: CubieState): number {
  return rankPerm(FREE.map((pos) => FREE.indexOf(c.cp[pos])));
}
function encodeOri(c: CubieState): number {
  let o = 0;
  for (let k = 0; k < 6; k++) o = o * 3 + c.co[FREE[k]];
  return o;
}
function decode(perm: number, ori: number): CubieState {
  const q = unrankPerm(perm, 7);
  const cp = new Uint8Array(8);
  const co = new Uint8Array(8);
  cp[6] = 6;
  q.forEach((v, k) => (cp[FREE[k]] = FREE[v]));
  let sum = 0;
  for (let k = 5; k >= 0; k--) {
    co[FREE[k]] = ori % 3;
    sum += ori % 3;
    ori = Math.floor(ori / 3);
  }
  co[FREE[6]] = (3 - (sum % 3)) % 3;
  return { cp, co, ep: new Uint8Array(0), eo: new Uint8Array(0) };
}

export function encodeCubie2(c: CubieState): number {
  if (c.cp[6] !== 6 || c.co[6] !== 0) throw new Error('2×2: canto DBL deve estar fixo');
  return encodePerm(c) * N_ORI2 + encodeOri(c);
}
export function decodeCubie2(idx: number): CubieState {
  return decode(Math.floor(idx / N_ORI2), idx % N_ORI2);
}

/** BFS over an abstract coordinate space; returns the distance from `start` (255 = unreachable). */
export function bfsDistances(
  size: number,
  apply: (s: number, m: number) => number,
  moves: readonly number[],
  start = 0,
): { dist: Uint8Array; levels: number[] } {
  const dist = new Uint8Array(size).fill(255);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  dist[start] = 0;
  queue[tail++] = start;
  const levels = [1];
  while (head < tail) {
    const s = queue[head++];
    const d = dist[s];
    for (const m of moves) {
      const t = apply(s, m);
      if (dist[t] === 255) {
        dist[t] = d + 1;
        queue[tail++] = t;
        levels[d + 1] = (levels[d + 1] ?? 0) + 1;
      }
    }
  }
  return { dist, levels };
}

export class Cube2Model {
  readonly moveCubies: CubieState[];
  readonly movePerms: Uint8Array[];
  readonly permMove = new Uint16Array(N_PERM2 * 9);
  readonly oriMove = new Uint16Array(N_ORI2 * 9);
  /** misplaced[π·…]: number of free corners not in place, per perm & ori (combined at query). */
  private readonly permOk = new Uint8Array(N_PERM2); // bitmask of k with q[k] = k
  private readonly oriOk = new Uint8Array(N_ORI2); // bitmask of k with twist 0
  private exact = new Map<Metric, Uint8Array>();
  private exactLevels = new Map<Metric, number[]>();
  private pdbs = new Map<string, Uint8Array>();

  constructor() {
    this.movePerms = MOVES2.map((m) => P2.moves.get(m)!);
    this.moveCubies = this.movePerms.map((p) => toCubie(P2, p));
    for (let p = 0; p < N_PERM2; p++) {
      const c = decode(p, 0);
      for (let m = 0; m < 9; m++) this.permMove[p * 9 + m] = encodePerm(cubieMultiply(c, this.moveCubies[m]));
      let mask = 0;
      const q = unrankPerm(p, 7);
      q.forEach((v, k) => (mask |= v === k ? 1 << k : 0));
      this.permOk[p] = mask;
    }
    for (let o = 0; o < N_ORI2; o++) {
      const c = decode(0, o);
      for (let m = 0; m < 9; m++) this.oriMove[o * 9 + m] = encodeOri(cubieMultiply(c, this.moveCubies[m]));
      let mask = 0;
      FREE.forEach((pos, k) => (mask |= c.co[pos] === 0 ? 1 << k : 0));
      this.oriOk[o] = mask;
    }
  }

  apply(s: number, m: number): number {
    const p = (s / N_ORI2) | 0;
    const o = s - p * N_ORI2;
    return this.permMove[p * 9 + m] * N_ORI2 + this.oriMove[o * 9 + m];
  }

  /** Number of free corners whose position or twist is wrong (0..7). */
  misplaced(s: number): number {
    const p = (s / N_ORI2) | 0;
    const ok = this.permOk[p] & this.oriOk[s - p * N_ORI2];
    let c = 0;
    for (let k = 0; k < 7; k++) if (!(ok & (1 << k))) c++;
    return c;
  }

  /** Exact distance table d*(s) for all 3 674 160 states (BFS from the identity). */
  exactTable(metric: Metric): Uint8Array {
    let t = this.exact.get(metric);
    if (!t) {
      const r = bfsDistances(N_STATES2, (s, m) => this.apply(s, m), METRIC_MOVES[metric]);
      t = r.dist;
      this.exact.set(metric, t);
      this.exactLevels.set(metric, r.levels);
    }
    return t;
  }
  distanceDistribution(metric: Metric): number[] {
    this.exactTable(metric);
    return this.exactLevels.get(metric)!;
  }

  /** Pattern database on the orientation or permutation projection. */
  pdb(kind: 'ori' | 'perm', metric: Metric): Uint8Array {
    const key = kind + metric;
    let t = this.pdbs.get(key);
    if (!t) {
      t =
        kind === 'ori'
          ? bfsDistances(N_ORI2, (o, m) => this.oriMove[o * 9 + m], METRIC_MOVES[metric]).dist
          : bfsDistances(N_PERM2, (p, m) => this.permMove[p * 9 + m], METRIC_MOVES[metric]).dist;
      this.pdbs.set(key, t);
    }
    return t;
  }

  heuristic(name: Heuristic2Name, metric: Metric): Heuristic<number> {
    switch (name) {
      case 'zero':
        return () => 0;
      case 'misplaced':
        return (s) => Math.ceil(this.misplaced(s) / 4);
      case 'pdb-ori': {
        const t = this.pdb('ori', metric);
        return (s) => t[s % N_ORI2];
      }
      case 'pdb-perm': {
        const t = this.pdb('perm', metric);
        return (s) => t[(s / N_ORI2) | 0];
      }
      case 'pdb-max': {
        const a = this.pdb('ori', metric);
        const b = this.pdb('perm', metric);
        return (s) => {
          const x = a[s % N_ORI2];
          const y = b[(s / N_ORI2) | 0];
          return x > y ? x : y;
        };
      }
      case 'exact': {
        const t = this.exactTable(metric);
        return (s) => t[s];
      }
    }
  }

  space(start: number, moveIdx: readonly number[] = METRIC_MOVES.HTM): SearchSpace<number> {
    const names = moveIdx.map((i) => MOVES2[i]);
    const perms = moveIdx.map((i) => this.movePerms[i]);
    const pr = buildPruning(names, perms);
    const inv = inverseTable(perms);
    const model = this;
    return {
      name: `2×2×2 ⟨${names.join(',')}⟩`,
      moveNames: names,
      start,
      goal: 0,
      indexSize: N_STATES2,
      isGoal: (s) => s === 0,
      key: (s) => s,
      apply: (s, m) => model.apply(s, moveIdx[m]),
      allowedAfter: (l) => pr.allowedAfter[l + 1],
      canonicalAfter: (l) => pr.canonicalAfter[l + 1],
      inverse: (m) => inv[m],
    };
  }

  /** Optimal solution by steepest descent on the exact table. */
  solveOptimal(s: number, metric: Metric): string[] {
    const t = this.exactTable(metric);
    const out: string[] = [];
    while (t[s] !== 0) {
      let moved = false;
      for (const m of METRIC_MOVES[metric]) {
        const n = this.apply(s, m);
        if (t[n] === t[s] - 1) {
          out.push(MOVES2[m]);
          s = n;
          moved = true;
          break;
        }
      }
      if (!moved) throw new Error('tabela inconsistente');
    }
    return out;
  }
}

export type Heuristic2Name = 'zero' | 'misplaced' | 'pdb-ori' | 'pdb-perm' | 'pdb-max' | 'exact';
export const HEURISTICS2: { id: Heuristic2Name; label: string; description: string }[] = [
  { id: 'zero', label: 'h₀ = 0', description: 'Heurística nula (A* ≡ custo uniforme).' },
  { id: 'misplaced', label: 'h_pec = ⌈k/4⌉', description: 'k = cantos fora de posição ou orientação; cada giro move 4 cantos.' },
  { id: 'pdb-ori', label: 'h_ori (PDB 729)', description: 'Distância exata no quociente das orientações.' },
  { id: 'pdb-perm', label: 'h_perm (PDB 5040)', description: 'Distância exata no quociente das permutações.' },
  { id: 'pdb-max', label: 'h_max = max(h_ori, h_perm)', description: 'Máximo de duas PDBs: admissível e consistente.' },
  { id: 'exact', label: 'h* (tabela exata)', description: 'Distância real (oráculo; usada só como referência).' },
];

let shared: Cube2Model | null = null;
export const cube2 = (): Cube2Model => (shared ??= new Cube2Model());

/** Facelet state (any orientation in space) → canonical index + frame rotation. */
export function indexFromFacelets2(s: Uint8Array): { index: number; rho: Uint8Array } {
  const { rho, t } = canonicalFrame(P2, s);
  return { index: encodeCubie2(toCubie(P2, t)), rho };
}

export function faceletsFromIndex2(idx: number): Uint8Array {
  return toFacelet(P2, decodeCubie2(idx));
}

/** Converts canonical-frame move names to physical moves for a facelet state with frame ρ. */
export function physicalMoves2(rho: Uint8Array, names: readonly string[]): Move[] {
  return fromCanonicalFrame(P2, rho, names.map(parseMove));
}
