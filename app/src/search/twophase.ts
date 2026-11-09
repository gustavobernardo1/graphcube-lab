/**
 * Kociemba's two-phase algorithm (Kociemba 1992; Kociemba, "Cube Explorer").
 *
 *   Phase 1: IDA* in G from s to the subgroup H = ⟨U,D,R2,L2,F2,B2⟩
 *            (twist = flip = slice = 0), with h₁ = max(P[twist,slice], P[flip,slice]).
 *   Phase 2: IDA* inside H to the identity, with h₂ = max(P[cperm,sperm], P[ud,sperm]).
 *
 * Phase-1 solutions are enumerated by increasing length; each is completed by
 * an optimal phase-2 search bounded by the best total found so far. The result
 * is a VALID solution, but NOT guaranteed to be minimal (it is optimal only
 * for the decomposition s → H → e). Optimality is never claimed for it.
 */
import { cubieMultiply, type CubieState } from '../core/cubie';
import {
  cube3Tables, getTwist, getFlip, getSlice, getCPerm, getUD, getSPerm,
  MOVES18, PHASE2, N_SLICE, N_SPERM,
} from './cube3';

export interface TwoPhaseResult {
  solution: string[];
  phase1: string[];
  phase2: string[];
  length: number;
  timeMs: number;
  nodes: number;
  /** Lengths of successive improvements (first solution found, then better ones). */
  improvements: { length: number; atMs: number }[];
  exhaustedTime: boolean;
}

const now = () => performance.now();
const face = (m: number) => (m / 3) | 0;
/** Opposite face pairs in URFDLB order: U–D (0,3), R–L (1,4), F–B (2,5). */
const skip = (last: number, m: number) => {
  if (last < 0) return false;
  const a = face(last);
  const b = face(m);
  return a === b || (a === b + 3); // same face, or (D,U),(L,R),(B,F) order
};
const IN_PHASE2 = new Set(PHASE2);

export function solveTwoPhase(
  start: CubieState,
  opts: { maxLength?: number; timeLimitMs?: number } = {},
): TwoPhaseResult {
  const T = cube3Tables();
  const target = opts.maxLength ?? 20;
  const timeLimit = opts.timeLimitMs ?? 3000;
  const t0 = now();
  let nodes = 0;
  let best: number[] | null = null;
  let bestP1 = 0;
  const improvements: TwoPhaseResult['improvements'] = [];
  const p1: number[] = [];
  const p2: number[] = [];
  let stop = false;

  const h1 = (t: number, f: number, s: number) => {
    const a = T.pTwistSlice[t * N_SLICE + s];
    const b = T.pFlipSlice[f * N_SLICE + s];
    return a > b ? a : b;
  };
  const h2 = (c: number, u: number, sp: number) => {
    const a = T.pCPermSPerm[c * N_SPERM + sp];
    const b = T.pUDSPerm[u * N_SPERM + sp];
    return a > b ? a : b;
  };

  const search2 = (c: number, u: number, sp: number, togo: number, last: number): boolean => {
    if (togo === 0) return c === 0 && u === 0 && sp === 0;
    for (const m of PHASE2) {
      if (skip(last, m)) continue;
      nodes++;
      const c2 = T.cpermMove[c * 18 + m];
      const u2 = T.udMove[u * 18 + m];
      const s2 = T.spermMove[sp * 18 + m];
      if (h2(c2, u2, s2) > togo - 1) continue;
      p2.push(m);
      if (search2(c2, u2, s2, togo - 1, m)) return true;
      p2.pop();
    }
    return false;
  };

  const phase2From = (depth1: number) => {
    let c = start;
    for (const m of p1) c = cubieMultiply(c, T.moveCubies[m]);
    const cp = getCPerm(c);
    const ud = getUD(c);
    const sp = getSPerm(c);
    const maxD2 = Math.min(best ? best.length - 1 - depth1 : 30, 18);
    for (let d2 = h2(cp, ud, sp); d2 <= maxD2; d2++) {
      p2.length = 0;
      if (search2(cp, ud, sp, d2, p1.length ? p1[p1.length - 1] : -1)) {
        best = [...p1, ...p2];
        bestP1 = depth1;
        improvements.push({ length: best.length, atMs: now() - t0 });
        if (best.length <= target) stop = true;
        return;
      }
    }
  };

  const search1 = (t: number, f: number, s: number, togo: number, last: number): void => {
    if (stop) return;
    if (togo === 0) {
      if (t === 0 && f === 0 && s === 0 && (last < 0 || !IN_PHASE2.has(last))) phase2From(p1.length);
      return;
    }
    if ((nodes & 8191) === 0 && best && now() - t0 > timeLimit) {
      stop = true;
      return;
    }
    for (let m = 0; m < 18; m++) {
      if (skip(last, m)) continue;
      nodes++;
      const t2 = T.twistMove[t * 18 + m];
      const f2 = T.flipMove[f * 18 + m];
      const s2 = T.sliceMove[s * 18 + m];
      if (h1(t2, f2, s2) > togo - 1) continue;
      p1.push(m);
      search1(t2, f2, s2, togo - 1, m);
      p1.pop();
      if (stop) return;
    }
  };

  const t = getTwist(start);
  const f = getFlip(start);
  const s = getSlice(start);
  let exhaustedTime = false;
  for (let d1 = h1(t, f, s); d1 <= 20 && !stop; d1++) {
    if (best && (best as number[]).length <= d1) break; // phase-1 alone would be no shorter
    search1(t, f, s, d1, -1);
    if (best && now() - t0 > timeLimit) {
      exhaustedTime = true;
      break;
    }
  }
  const sol = (best ?? []) as number[];
  const names = sol.map((m) => MOVES18[m]);
  return {
    solution: names,
    phase1: names.slice(0, bestP1),
    phase2: names.slice(bestP1),
    length: sol.length,
    timeMs: now() - t0,
    nodes,
    improvements,
    exhaustedTime,
  };
}
