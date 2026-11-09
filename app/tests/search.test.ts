import { describe, expect, it } from 'vitest';
import { cube2, encodeCubie2, decodeCubie2, faceletsFromIndex2, indexFromFacelets2, physicalMoves2, N_STATES2, MOVES2, METRIC_MOVES, HEURISTICS2 } from '../src/search/cube2';
import { bfs, bidirectionalBfs, astar, idaStar, effectiveBranchingFactor } from '../src/search/algorithms';
import { getPuzzle, isSolvedUpToRotation } from '../src/core/geometry';
import { compose, equals } from '../src/core/perm';
import { parseAlg, algToPerm, applyAlg, formatAlg } from '../src/core/notation';
import { toCubie, cubieMultiply, cubieEquals, cubieSolved, invariants, type CubieState } from '../src/core/cubie';
import { mulberry32, randInt, randomScramble } from '../src/core/random';
import { cube3Tables, coordSetters, getTwist, getFlip, getSlice, getCPerm, getUD, getSPerm, space3, heuristic3, MOVES18, N_SLICE } from '../src/search/cube3';
import { solveTwoPhase } from '../src/search/twophase';
import { unrankPerm, parityOf } from '../src/core/perm';

const M = cube2();
const P2 = getPuzzle(2);
const P3 = getPuzzle(3);

describe('2×2×2 coordinates', () => {
  it('encode ∘ decode = id (random sample) and move tables agree with facelet moves', () => {
    const rng = mulberry32(7);
    for (let t = 0; t < 2000; t++) {
      const idx = randInt(rng, N_STATES2);
      expect(encodeCubie2(decodeCubie2(idx))).toBe(idx);
      const m = randInt(rng, 9);
      const lhs = faceletsFromIndex2(M.apply(idx, m));
      const rhs = compose(faceletsFromIndex2(idx), P2.moves.get(MOVES2[m])!);
      expect(equals(lhs, rhs)).toBe(true);
    }
  });
  it('full BFS reproduces the known distance distribution (HTM and QTM)', () => {
    // Literature (e.g. Jaap Scherphuis' puzzle pages; OEIS A079761 / A079762)
    expect(M.distanceDistribution('HTM')).toEqual([1, 9, 54, 321, 1847, 9992, 50136, 227536, 870072, 1887748, 623800, 2644]);
    expect(M.distanceDistribution('QTM')).toEqual([1, 6, 27, 120, 534, 2256, 8969, 33058, 114149, 360508, 930588, 1350852, 782536, 90280, 276]);
  });
  it('facelet state with D, L, B and rotations maps to the canonical frame and back', () => {
    const rng = mulberry32('frame2');
    for (let t = 0; t < 30; t++) {
      const w = randomScramble(rng, 15, ['U', 'D', 'R', 'L', 'F', 'B', 'x', 'y', 'z']);
      const s = algToPerm(P2, w);
      const { index, rho } = indexFromFacelets2(s);
      const sol = physicalMoves2(rho, M.solveOptimal(index, 'HTM'));
      expect(isSolvedUpToRotation(P2, applyAlg(P2, s, sol))).toBe(true);
    }
  });
});

describe('heuristics (2×2×2): admissible and consistent', () => {
  const rng = mulberry32('adm');
  for (const metric of ['HTM', 'QTM'] as const) {
    it(`${metric}`, () => {
      const exact = M.exactTable(metric);
      for (const { id } of HEURISTICS2) {
        const h = M.heuristic(id, metric);
        for (let t = 0; t < 5000; t++) {
          const s = randInt(rng, N_STATES2);
          const hs = h(s);
          expect(hs).toBeLessThanOrEqual(exact[s]);
          for (const m of METRIC_MOVES[metric]) expect(Math.abs(hs - h(M.apply(s, m)))).toBeLessThanOrEqual(1);
        }
        expect(h(0)).toBe(0);
      }
    });
  }
});

describe('search algorithms find optimal solutions (2×2×2, oracle = exact table)', () => {
  const exact = M.exactTable('HTM');
  const rng = mulberry32('opt');
  const states: number[] = [];
  while (states.length < 25) {
    const s = randInt(rng, N_STATES2);
    if (exact[s] <= 7) states.push(s);
  }
  const check = (s: number, sol: string[] | null) => {
    expect(sol).not.toBeNull();
    expect(sol!.length).toBe(exact[s]);
    let x = s;
    for (const n of sol!) x = M.apply(x, MOVES2.indexOf(n as (typeof MOVES2)[number]));
    expect(x).toBe(0);
  };
  it('BFS and bidirectional BFS', () => {
    for (const s of states) {
      check(s, bfs(M.space(s)).solutionNames);
      check(s, bidirectionalBfs(M.space(s)).solutionNames);
    }
  });
  it('A* and IDA* with every heuristic', () => {
    for (const s of states.slice(0, 12)) {
      for (const { id } of HEURISTICS2) {
        const h = M.heuristic(id, 'HTM');
        check(s, astar(M.space(s), h).solutionNames);
        check(s, idaStar(M.space(s), h).solutionNames);
      }
    }
  });
  it('QTM subset space', () => {
    const exactQ = M.exactTable('QTM');
    const s = states[3];
    const r = bfs(M.space(s, METRIC_MOVES.QTM));
    expect(r.length).toBe(exactQ[s]);
  });
  it('trace is a faithful log (events reference generated states)', () => {
    const r = astar(M.space(states[0]), M.heuristic('pdb-max', 'HTM'), 'pdb-max', { traceLimit: 10000 });
    const seen = new Set<number | string>();
    for (const e of r.trace!) {
      if (e.t === 'discover') seen.add(e.id);
      if (e.t === 'expand') expect(seen.has(e.id)).toBe(true);
    }
    expect(r.trace!.filter((e) => e.t === 'expand').length).toBe(r.expanded);
  });
  it('effective branching factor', () => {
    expect(effectiveBranchingFactor(2 + 4 + 8, 3)).toBeCloseTo(2, 6);
  });
});

describe('3×3×3 coordinates and pruning tables', () => {
  const T = cube3Tables();
  it('coordinate setters invert getters', () => {
    for (let i = 0; i < 2187; i += 7) expect(getTwist(coordSetters.setTwist(i))).toBe(i);
    for (let i = 0; i < 2048; i += 5) expect(getFlip(coordSetters.setFlip(i))).toBe(i);
    for (let i = 0; i < N_SLICE; i++) expect(getSlice(coordSetters.setSlice(i))).toBe(i);
    for (let i = 0; i < 40320; i += 97) expect(getCPerm(coordSetters.setCPerm(i))).toBe(i);
    for (let i = 0; i < 40320; i += 97) expect(getUD(coordSetters.setUD(i))).toBe(i);
    for (let i = 0; i < 24; i++) expect(getSPerm(coordSetters.setSPerm(i))).toBe(i);
  });
  it('move tables are consistent with cubie multiplication', () => {
    const rng = mulberry32('mt');
    for (let k = 0; k < 200; k++) {
      const c = toCubie(P3, algToPerm(P3, randomScramble(rng, 20)));
      const m = randInt(rng, 18);
      const d = cubieMultiply(c, T.moveCubies[m]);
      expect(T.twistMove[getTwist(c) * 18 + m]).toBe(getTwist(d));
      expect(T.flipMove[getFlip(c) * 18 + m]).toBe(getFlip(d));
      expect(T.sliceMove[getSlice(c) * 18 + m]).toBe(getSlice(d));
      expect(T.cpermMove[getCPerm(c) * 18 + m]).toBe(getCPerm(d));
    }
  });
  it('h_PDB is admissible on short scrambles (oracle: BFS distance)', () => {
    const rng = mulberry32('adm3');
    const h = heuristic3('pdb');
    const hm = heuristic3('misplaced');
    for (let k = 0; k < 12; k++) {
      const c = toCubie(P3, algToPerm(P3, randomScramble(rng, 1 + (k % 4))));
      const r = bfs(space3(c));
      expect(h(c)).toBeLessThanOrEqual(r.length!);
      expect(hm(c)).toBeLessThanOrEqual(r.length!);
      const ida = idaStar(space3(c), h);
      expect(ida.length).toBe(r.length);
    }
  });
});

function randomLegalCubie(rng: () => number): CubieState {
  const c = cubieSolved(3);
  const shuffle = (n: number) => unrankPerm(Math.floor(rng() * [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 39916800, 479001600][n]), n);
  c.cp.set(shuffle(8));
  c.ep.set(shuffle(12));
  if (parityOf(c.cp) !== parityOf(c.ep)) [c.ep[0], c.ep[1]] = [c.ep[1], c.ep[0]];
  let s = 0;
  for (let i = 0; i < 7; i++) s += c.co[i] = Math.floor(rng() * 3);
  c.co[7] = (3 - (s % 3)) % 3;
  s = 0;
  for (let i = 0; i < 11; i++) s += c.eo[i] = Math.floor(rng() * 2);
  c.eo[11] = s % 2;
  return c;
}

describe('two-phase solver (3×3×3)', () => {
  const T = cube3Tables();
  const solves = (c: CubieState, sol: string[]) => {
    let x = c;
    for (const n of sol) x = cubieMultiply(x, T.moveCubies[MOVES18.indexOf(n as (typeof MOVES18)[number])]);
    return cubieEquals(x, cubieSolved(3));
  };
  it('solves random scrambles', () => {
    const rng = mulberry32('tp');
    for (let k = 0; k < 10; k++) {
      const c = toCubie(P3, algToPerm(P3, randomScramble(rng, 30)));
      const r = solveTwoPhase(c, { maxLength: 24, timeLimitMs: 2000 });
      expect(solves(c, r.solution)).toBe(true);
      expect(r.length).toBeLessThanOrEqual(30);
    }
  });
  it('solves uniformly random legal states built from invariants (sufficiency of the First Law, sampled)', () => {
    const rng = mulberry32('legal');
    for (let k = 0; k < 10; k++) {
      const c = randomLegalCubie(rng);
      expect(invariants(c).solvable).toBe(true);
      const r = solveTwoPhase(c, { maxLength: 24, timeLimitMs: 2000 });
      expect(r.length).toBeGreaterThan(0);
      expect(solves(c, r.solution)).toBe(true);
    }
  });
  it('superflip (known distance 20 HTM) gets a valid solution', () => {
    const sf = toCubie(P3, algToPerm(P3, parseAlg("U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2")));
    expect([...sf.eo].every((e) => e === 1)).toBe(true);
    const r = solveTwoPhase(sf, { maxLength: 20, timeLimitMs: 5000 });
    expect(solves(sf, r.solution)).toBe(true);
    expect(formatAlg(parseAlg(r.solution.join(' '))).length).toBeGreaterThan(0);
  });
});
