/**
 * Exploration of Cayley graphs Cay(⟨S⟩, S ∪ S⁻¹) of subgroups of the cube groups.
 *
 * Vertices: group elements. Edges: {g, g·s} for s ∈ S ∪ S⁻¹ (undirected, simple).
 * Quantities computed and their status:
 *   • |⟨S⟩|                — exact (Schreier–Sims), independent of exploration;
 *   • sphere sizes |S(r)|  — exact for every radius fully explored;
 *   • diameter, distance distribution, antipodes — exact only if BFS completed;
 *   • girth and a shortest relator — exact if found within the explored ball
 *     (vertex-transitivity: the shortest cycle through e is a shortest cycle);
 *   • symmetries — automorphisms induced by cube symmetries preserving S.
 * The drawn ball B(e, r) is always a PARTIAL view unless |B| = |⟨S⟩|.
 */
import { getPuzzle } from '../core/geometry';
import { compose, isIdentity } from '../core/perm';
import { groupOrder } from '../core/schreier';
import { generatorStabilizer } from '../core/symmetry';
import { toCubie, cubieMultiply, cubieSolved, type CubieState } from '../core/cubie';
import { cube2, MOVES2, N_STATES2 } from '../search/cube2';
import { cubieKey } from '../search/cube3';

export interface CayleySpec {
  n: 2 | 3;
  /** Generator names, e.g. ["R","U"]. Inverses are added automatically. */
  generators: string[];
  maxRadius?: number;
  maxNodes?: number;
  /** Max vertices returned for drawing. */
  drawLimit?: number;
}

export interface CayleyReport {
  n: 2 | 3;
  generators: string[];
  symmetric: string[];
  order: string; // BigInt as decimal string
  sphereSizes: number[];
  ballSize: number;
  complete: boolean;
  diameter: number | null;
  antipodes: number | null;
  girth: number | null;
  relator: string[] | null;
  stabilizer: { rotations: number; total: number };
  branchingBound: number[];
  timeMs: number;
  draw: { nodes: { id: number; d: number }[]; edges: { a: number; b: number; g: number }[]; truncated: boolean };
}

/** Inverse names: X ↔ X', X2 ↔ X2. */
export const inverseName = (m: string): string =>
  m.endsWith("'") ? m.slice(0, -1) : m.endsWith('2') ? m : m + "'";

export function symmetricClosure(gens: string[]): string[] {
  const out: string[] = [];
  for (const g of gens) for (const h of [g, inverseName(g)]) if (!out.includes(h)) out.push(h);
  return out;
}

interface Action<S> {
  id: S;
  mul: (s: S, g: number) => S;
  key: (s: S) => number | string;
}

export function exploreCayley(spec: CayleySpec): CayleyReport {
  const t0 = performance.now();
  const P = getPuzzle(spec.n);
  const S = symmetricClosure(spec.generators);
  const perms = S.map((m) => {
    const p = P.moves.get(m);
    if (!p) throw new Error(`gerador desconhecido ${m}`);
    return p;
  });
  if (spec.n === 2 && S.some((m) => !MOVES2.includes(m as (typeof MOVES2)[number])))
    throw new Error('No 2×2×2 os geradores devem ser potências de U, R, F (canto DBL fixo).');
  const order = groupOrder(P.size, perms);
  const maxNodes = spec.maxNodes ?? (spec.n === 2 ? N_STATES2 : 400_000);
  const maxRadius = spec.maxRadius ?? 64;
  const drawLimit = spec.drawLimit ?? 600;

  let action: Action<number> | Action<CubieState>;
  if (spec.n === 2) {
    const M = cube2();
    const idx = S.map((m) => MOVES2.indexOf(m as (typeof MOVES2)[number]));
    action = { id: 0, mul: (s: number, g: number) => M.apply(s, idx[g]), key: (s: number) => s };
  } else {
    const cub = perms.map((p) => toCubie(P, p));
    action = { id: cubieSolved(3), mul: (s: CubieState, g: number) => cubieMultiply(s, cub[g]), key: cubieKey };
  }
  const res = bfsCayley(action as Action<unknown>, S, perms, maxNodes, maxRadius, drawLimit, BigInt(order));
  return {
    n: spec.n,
    generators: spec.generators,
    symmetric: S,
    order: order.toString(),
    ...res,
    stabilizer: generatorStabilizer(P, spec.generators),
    branchingBound: res.sphereSizes.map((_, r) => (r === 0 ? 1 : S.length * Math.pow(S.length - 1, r - 1))),
    timeMs: performance.now() - t0,
  };
}

function bfsCayley<S>(
  A: Action<S>,
  names: string[],
  perms: Uint8Array[],
  maxNodes: number,
  maxRadius: number,
  drawLimit: number,
  _order: bigint,
) {
  const dist = new Map<number | string, number>();
  const parent = new Map<number | string, { p: number | string; g: number }>();
  const drawId = new Map<number | string, number>();
  const drawNodes: { id: number; d: number }[] = [];
  const drawEdges: { a: number; b: number; g: number }[] = [];
  const edgeSeen = new Set<string>();
  const invIdx = perms.map((p) => perms.findIndex((q) => isIdentity(compose(p, q))));
  const sphereSizes = [1];
  const k0 = A.key(A.id);
  dist.set(k0, 0);
  drawId.set(k0, 0);
  drawNodes.push({ id: 0, d: 0 });
  let frontier: S[] = [A.id];
  let girth: number | null = null;
  let girthWitness: { u: number | string; g: number; v: number | string } | null = null;
  let complete = false;
  let r = 0;
  let truncated = false;
  let aborted = false;
  while (frontier.length && r < maxRadius) {
    const next: S[] = [];
    for (const s of frontier) {
      const k = A.key(s);
      const par = parent.get(k);
      for (let g = 0; g < names.length; g++) {
        if (par && invIdx[g] === par.g) continue; // tree edge back to parent
        const t = A.mul(s, g);
        const kt = A.key(t);
        const dt = dist.get(kt);
        if (dt === undefined) {
          dist.set(kt, r + 1);
          parent.set(kt, { p: k, g });
          next.push(t);
          if (drawNodes.length < drawLimit) {
            drawId.set(kt, drawNodes.length);
            drawNodes.push({ id: drawNodes.length, d: r + 1 });
          } else truncated = true;
        } else {
          // non-tree edge: closed walk of length r + dt + 1 through e
          const len = r + dt + 1;
          if (girth === null || len < girth) {
            girth = len;
            girthWitness = { u: k, g, v: kt };
          }
        }
        const a = drawId.get(k);
        const b = drawId.get(kt);
        if (a !== undefined && b !== undefined && a !== b) {
          const ek = a < b ? `${a}-${b}` : `${b}-${a}`;
          if (!edgeSeen.has(ek)) {
            edgeSeen.add(ek);
            drawEdges.push({ a, b, g });
          }
        }
      }
      if (dist.size > maxNodes) {
        aborted = true;
        break;
      }
    }
    if (aborted) break; // last sphere is partial: not reported
    r++;
    if (next.length) sphereSizes.push(next.length);
    frontier = next;
  }
  if (!aborted && frontier.length === 0) complete = true;
  let relator: string[] | null = null;
  if (girthWitness) {
    const pathTo = (k: number | string): number[] => {
      const out: number[] = [];
      let cur = k;
      for (;;) {
        const e = parent.get(cur);
        if (!e) break;
        out.push(e.g);
        cur = e.p;
      }
      return out.reverse();
    };
    const pu = pathTo(girthWitness.u);
    const pv = pathTo(girthWitness.v);
    // e → u → (g) → v → e  : word pu · g · pv⁻¹
    const word = [...pu, girthWitness.g, ...pv.slice().reverse().map((g) => invIdx[g])];
    relator = word.map((g) => names[g]);
  }
  const diameter = complete ? sphereSizes.length - 1 : null;
  return {
    sphereSizes,
    ballSize: dist.size,
    complete,
    diameter,
    antipodes: complete ? sphereSizes[sphereSizes.length - 1] : null,
    girth,
    relator,
    draw: { nodes: drawNodes, edges: drawEdges, truncated: truncated || !complete },
  };
}

/** Verifies that a word is a relation (product = identity) — used in tests and UI. */
export function isRelation(n: 2 | 3, word: string[]): boolean {
  const P = getPuzzle(n);
  let s: Uint8Array = Uint8Array.from({ length: P.size }, (_, i) => i);
  for (const m of word) s = compose(s, P.moves.get(m)!);
  return isIdentity(s);
}

