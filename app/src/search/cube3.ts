/**
 * 3×3×3 coordinates, move tables and pruning tables (pattern databases).
 *
 * Coordinates (Kociemba 1992; see docs/04-algoritmos.md):
 *   twist  ∈ [0,2187)   corner orientations co₀…co₆ in base 3
 *   flip   ∈ [0,2048)   edge orientations eo₀…eo₁₀ in base 2
 *   slice  ∈ [0,495)    positions occupied by the 4 E-slice edges (combination)
 *   cperm  ∈ [0,40320)  corner permutation rank
 *   ud     ∈ [0,40320)  permutation of the 8 U/D edges (only inside H)
 *   sperm  ∈ [0,24)     permutation of the 4 E-slice edges (only inside H)
 * where H = ⟨U, D, R2, L2, F2, B2⟩ is the subgroup with twist = flip = slice = 0.
 *
 * Every pruning table is a BFS distance in a quotient (projection) of the Cayley
 * graph, hence an admissible and consistent lower bound for the distance to the
 * identity (proof in docs/03).
 */
import { getPuzzle } from '../core/geometry';
import { toCubie, cubieMultiply, cubieSolved, type CubieState } from '../core/cubie';
import { rankPerm, unrankPerm } from '../core/perm';
import { buildPruning, inverseTable } from './pruning';
import { bfsDistances } from './cube2';
import type { Heuristic, SearchSpace } from './types';

export const MOVES18 = [
  'U', 'U2', "U'", 'R', 'R2', "R'", 'F', 'F2', "F'",
  'D', 'D2', "D'", 'L', 'L2', "L'", 'B', 'B2', "B'",
] as const;
/** Phase-2 generators (indices into MOVES18): U*, D*, R2, L2, F2, B2. */
export const PHASE2 = [0, 1, 2, 9, 10, 11, 4, 13, 7, 16];

export const N_TWIST = 2187;
export const N_FLIP = 2048;
export const N_SLICE = 495;
export const N_CPERM = 40320;
export const N_UD = 40320;
export const N_SPERM = 24;

const P3 = getPuzzle(3);

function cnk(n: number, k: number): number {
  if (n < k || k < 0) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
}

export const getTwist = (c: CubieState): number => {
  let t = 0;
  for (let i = 0; i < 7; i++) t = t * 3 + c.co[i];
  return t;
};
export const getFlip = (c: CubieState): number => {
  let f = 0;
  for (let i = 0; i < 11; i++) f = f * 2 + c.eo[i];
  return f;
};
export const getSlice = (c: CubieState): number => {
  let a = 0;
  let x = 0;
  for (let j = 11; j >= 0; j--) {
    if (c.ep[j] >= 8) {
      a += cnk(11 - j, x + 1);
      x++;
    }
  }
  return a;
};
export const getCPerm = (c: CubieState): number => rankPerm(c.cp);
export const getUD = (c: CubieState): number => rankPerm(c.ep.subarray(0, 8));
export const getSPerm = (c: CubieState): number => rankPerm(Array.from(c.ep.subarray(8, 12), (e) => e - 8));

function setTwist(t: number): CubieState {
  const c = cubieSolved(3);
  let sum = 0;
  for (let i = 6; i >= 0; i--) {
    c.co[i] = t % 3;
    sum += c.co[i];
    t = Math.floor(t / 3);
  }
  c.co[7] = (3 - (sum % 3)) % 3;
  return c;
}
function setFlip(f: number): CubieState {
  const c = cubieSolved(3);
  let sum = 0;
  for (let i = 10; i >= 0; i--) {
    c.eo[i] = f & 1;
    sum += f & 1;
    f >>= 1;
  }
  c.eo[11] = sum % 2;
  return c;
}
function setSlice(idx: number): CubieState {
  const c = cubieSolved(3);
  const slice = [8, 9, 10, 11];
  const other = [0, 1, 2, 3, 4, 5, 6, 7];
  c.ep.fill(255);
  let x = 4;
  let a = idx;
  for (let j = 0; j < 12; j++) {
    if (x > 0 && a - cnk(11 - j, x) >= 0) {
      c.ep[j] = slice[4 - x];
      a -= cnk(11 - j, x);
      x--;
    }
  }
  let y = 0;
  for (let j = 0; j < 12; j++) if (c.ep[j] === 255) c.ep[j] = other[y++];
  return c;
}
function setCPerm(r: number): CubieState {
  const c = cubieSolved(3);
  c.cp.set(unrankPerm(r, 8));
  return c;
}
function setUD(r: number): CubieState {
  const c = cubieSolved(3);
  c.ep.set(unrankPerm(r, 8), 0);
  return c;
}
function setSPerm(r: number): CubieState {
  const c = cubieSolved(3);
  c.ep.set(unrankPerm(r, 4).map((e) => e + 8), 8);
  return c;
}
export const coordSetters = { setTwist, setFlip, setSlice, setCPerm, setUD, setSPerm };

export class Cube3Tables {
  readonly moveCubies: CubieState[] = MOVES18.map((m) => toCubie(P3, P3.moves.get(m)!));
  readonly movePerms: Uint8Array[] = MOVES18.map((m) => P3.moves.get(m)!);
  twistMove!: Uint16Array;
  flipMove!: Uint16Array;
  sliceMove!: Uint16Array;
  cpermMove!: Uint16Array;
  udMove!: Uint16Array;
  spermMove!: Uint8Array;
  pTwistSlice!: Uint8Array;
  pFlipSlice!: Uint8Array;
  pCPerm!: Uint8Array;
  pCPermSPerm!: Uint8Array;
  pUDSPerm!: Uint8Array;
  buildTimeMs = 0;
  private built = false;

  private table(n: number, set: (i: number) => CubieState, get: (c: CubieState) => number, moves: readonly number[], Arr: typeof Uint16Array | typeof Uint8Array) {
    const t = new Arr(n * 18).fill(Arr === Uint8Array ? 255 : 65535);
    for (let i = 0; i < n; i++) {
      const c = set(i);
      for (const m of moves) t[i * 18 + m] = get(cubieMultiply(c, this.moveCubies[m]));
    }
    return t;
  }

  build(): this {
    if (this.built) return this;
    const t0 = performance.now();
    const all = MOVES18.map((_, i) => i);
    this.twistMove = this.table(N_TWIST, setTwist, getTwist, all, Uint16Array) as Uint16Array;
    this.flipMove = this.table(N_FLIP, setFlip, getFlip, all, Uint16Array) as Uint16Array;
    this.sliceMove = this.table(N_SLICE, setSlice, getSlice, all, Uint16Array) as Uint16Array;
    this.cpermMove = this.table(N_CPERM, setCPerm, getCPerm, all, Uint16Array) as Uint16Array;
    this.udMove = this.table(N_UD, setUD, getUD, PHASE2, Uint16Array) as Uint16Array;
    this.spermMove = this.table(N_SPERM, setSPerm, getSPerm, PHASE2, Uint8Array) as Uint8Array;
    const { twistMove, flipMove, sliceMove, cpermMove, udMove, spermMove } = this;
    this.pTwistSlice = bfsDistances(N_TWIST * N_SLICE, (i, m) => {
      const t = (i / N_SLICE) | 0;
      return twistMove[t * 18 + m] * N_SLICE + sliceMove[(i - t * N_SLICE) * 18 + m];
    }, all).dist;
    this.pFlipSlice = bfsDistances(N_FLIP * N_SLICE, (i, m) => {
      const f = (i / N_SLICE) | 0;
      return flipMove[f * 18 + m] * N_SLICE + sliceMove[(i - f * N_SLICE) * 18 + m];
    }, all).dist;
    this.pCPerm = bfsDistances(N_CPERM, (i, m) => cpermMove[i * 18 + m], all).dist;
    this.pCPermSPerm = bfsDistances(N_CPERM * N_SPERM, (i, m) => {
      const c = (i / N_SPERM) | 0;
      return cpermMove[c * 18 + m] * N_SPERM + spermMove[(i - c * N_SPERM) * 18 + m];
    }, PHASE2).dist;
    this.pUDSPerm = bfsDistances(N_UD * N_SPERM, (i, m) => {
      const u = (i / N_SPERM) | 0;
      return udMove[u * 18 + m] * N_SPERM + spermMove[(i - u * N_SPERM) * 18 + m];
    }, PHASE2).dist;
    this.buildTimeMs = performance.now() - t0;
    this.built = true;
    return this;
  }

  /** Admissible, consistent lower bound: max of three projections' exact distances. */
  hPdb(c: CubieState): number {
    const s = getSlice(c);
    const a = this.pTwistSlice[getTwist(c) * N_SLICE + s];
    const b = this.pFlipSlice[getFlip(c) * N_SLICE + s];
    const d = this.pCPerm[getCPerm(c)];
    return Math.max(a, b, d);
  }
}

let shared: Cube3Tables | null = null;
export const cube3Tables = (): Cube3Tables => (shared ??= new Cube3Tables()).build();

/** Corners / edges whose position or orientation is wrong. */
export function misplaced3(c: CubieState): { corners: number; edges: number } {
  let corners = 0;
  let edges = 0;
  for (let i = 0; i < 8; i++) if (c.cp[i] !== i || c.co[i] !== 0) corners++;
  for (let i = 0; i < 12; i++) if (c.ep[i] !== i || c.eo[i] !== 0) edges++;
  return { corners, edges };
}

export type Heuristic3Name = 'zero' | 'misplaced' | 'pdb';
export const HEURISTICS3: { id: Heuristic3Name; label: string; description: string }[] = [
  { id: 'zero', label: 'h₀ = 0', description: 'Heurística nula.' },
  { id: 'misplaced', label: 'h_pec', description: 'max(⌈cantos fora/4⌉, ⌈arestas fora/4⌉): cada giro move 4 cantos e 4 arestas.' },
  { id: 'pdb', label: 'h_PDB', description: 'max das PDBs (twist×slice, flip×slice, perm. de cantos).' },
];

export function heuristic3(name: Heuristic3Name): Heuristic<CubieState> {
  if (name === 'zero') return () => 0;
  if (name === 'misplaced')
    return (c) => {
      const m = misplaced3(c);
      return Math.max(Math.ceil(m.corners / 4), Math.ceil(m.edges / 4));
    };
  const t = cube3Tables();
  return (c) => t.hPdb(c);
}

export const cubieKey = (c: CubieState): string =>
  String.fromCharCode(...c.cp, ...c.co, ...c.ep, ...c.eo);

const isSolvedCubie = (c: CubieState): boolean => {
  for (let i = 0; i < 8; i++) if (c.cp[i] !== i || c.co[i]) return false;
  for (let i = 0; i < 12; i++) if (c.ep[i] !== i || c.eo[i]) return false;
  return true;
};

/** Implicit state space of the 3×3×3 with generators MOVES18 (or a subset). */
export function space3(start: CubieState, moveIdx: readonly number[] = MOVES18.map((_, i) => i)): SearchSpace<CubieState> {
  const cubies = moveIdx.map((i) => toCubie(P3, P3.moves.get(MOVES18[i])!));
  const names = moveIdx.map((i) => MOVES18[i]);
  const perms = moveIdx.map((i) => P3.moves.get(MOVES18[i])!);
  const pr = buildPruning(names, perms);
  const inv = inverseTable(perms);
  return {
    name: `3×3×3 ⟨${names.join(',')}⟩`,
    moveNames: names,
    start,
    goal: cubieSolved(3),
    isGoal: isSolvedCubie,
    key: cubieKey,
    apply: (s, m) => cubieMultiply(s, cubies[m]),
    allowedAfter: (l) => pr.allowedAfter[l + 1],
    canonicalAfter: (l) => pr.canonicalAfter[l + 1],
    inverse: (m) => inv[m],
  };
}
