import { describe, expect, it } from 'vitest';
import { structuralLayout } from '../src/graph/structural';
import { exploreCayley, isRelation, symmetricClosure } from '../src/graph/cayley';
import { StateGraph } from '../src/graph/stateGraph';
import { getPuzzle } from '../src/core/geometry';
import { parseAlg, applyMove } from '../src/core/notation';
import { identity } from '../src/core/perm';

describe('structural diagram', () => {
  for (const n of [2, 3] as const) {
    it(`n=${n}: every sticker lies exactly on its two layer circles`, () => {
      const L = structuralLayout(n);
      expect(L.points.length).toBe(6 * n * n);
      expect(L.circles.length).toBe(3 * n);
      for (const p of L.points) {
        for (const cid of p.circles) {
          const c = L.circles[cid];
          expect(Math.abs(Math.hypot(p.x - c.cx, p.y - c.cy) - c.r)).toBeLessThan(1e-9);
        }
      }
      // each circle carries the 4n ring stickers of its layer
      for (const c of L.circles) expect(L.points.filter((p) => p.circles.includes(c.id)).length).toBe(4 * n);
      // positions are distinct (drawable)
      let minD = Infinity;
      for (let i = 0; i < L.points.length; i++)
        for (let j = i + 1; j < L.points.length; j++)
          minD = Math.min(minD, Math.hypot(L.points[i].x - L.points[j].x, L.points[i].y - L.points[j].y));
      expect(minD).toBeGreaterThan(15);
    });
  }
});

describe('Cayley graphs', () => {
  it('symmetric closure', () => {
    expect(symmetricClosure(['R', 'U2'])).toEqual(['R', "R'", 'U2']);
  });
  it('⟨R,U⟩ on the 2×2×2: complete BFS, spheres sum to the group order', () => {
    const r = exploreCayley({ n: 2, generators: ['R', 'U'] });
    expect(r.order).toBe('29160');
    expect(r.complete).toBe(true);
    expect(r.sphereSizes.reduce((a, b) => a + b, 0)).toBe(29160);
    expect(r.girth).toBe(4);
    expect(isRelation(2, r.relator!)).toBe(true);
    expect(r.relator!.length).toBe(r.girth);
  });
  it('⟨R2,U2⟩ on the 3×3×3 is dihedral of order 12: Cayley graph is a 12-cycle', () => {
    const r = exploreCayley({ n: 3, generators: ['R2', 'U2'] });
    expect(r.order).toBe('12');
    expect(r.sphereSizes).toEqual([1, 2, 2, 2, 2, 2, 1]);
    expect(r.girth).toBe(12);
  });
  it('HTM generators create triangles (girth 3); the 3×3×3 HTM spheres match OEIS A080601', () => {
    const r = exploreCayley({ n: 3, generators: getPuzzle(3).faceMoves, maxRadius: 3 });
    expect(r.sphereSizes.slice(0, 4)).toEqual([1, 18, 243, 3240]);
    expect(r.girth).toBe(3);
    expect(isRelation(3, r.relator!)).toBe(true);
  });
});

describe('state graph', () => {
  const P = getPuzzle(3);
  const run = (alg: string) => {
    const g = new StateGraph(3);
    let s = identity(P.size);
    g.reset(s);
    const cycles = [];
    for (const m of parseAlg(alg)) {
      s = applyMove(P, s, m);
      const c = g.recordMove(s);
      if (c) cycles.push(c);
    }
    return { g, cycles };
  };
  it('detects the cycle R⁴ = e', () => {
    const { g, cycles } = run('R R R R');
    expect(cycles.length).toBe(1);
    expect(cycles[0].length).toBe(4);
    expect(g.nodes.size).toBe(4);
  });
  it('(R U R\' U\')⁶ closes a cycle of length 24', () => {
    const { cycles } = run("(R U R' U')6");
    expect(cycles.map((c) => c.length)).toContain(24);
  });
  it('rotations do not create vertices; slices map to two face turns', () => {
    const { g } = run('x y M');
    expect(g.nodes.size).toBe(3);
    expect(g.historyMoves.length).toBe(2);
  });
});
