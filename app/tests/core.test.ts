import { describe, expect, it } from 'vitest';
import {
  compose, inverse, identity, isIdentity, order, sign, cycles, cycleType, commutator, conjugate,
  equals, isPermutation, rankPerm, unrankPerm, power,
} from '../src/core/perm';
import { getPuzzle, faceletString, isSolvedUpToRotation } from '../src/core/geometry';
import { parseAlg, algToPerm, invertAlg, simplifyAlg, formatAlg, htmLength, qtmLength } from '../src/core/notation';
import { toCubie, toFacelet, cubieMultiply, cubieEquals, cubieInverse, invariants, cubieTables, cubieSolved } from '../src/core/cubie';
import { mulberry32, randomScramble } from '../src/core/random';
import { symmetryData, canonicalFrame, fromCanonicalFrame, generatorStabilizer, conjugateMove } from '../src/core/symmetry';
import { groupOrder, StabilizerChain } from '../src/core/schreier';

const P3 = getPuzzle(3);
const P2 = getPuzzle(2);
const alg3 = (s: string) => algToPerm(P3, parseAlg(s));
const alg2 = (s: string) => algToPerm(P2, parseAlg(s));

describe('permutations', () => {
  it('group axioms on random permutations', () => {
    const rng = mulberry32(1);
    const rand = (n: number) => {
      const a = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return Uint8Array.from(a);
    };
    for (let t = 0; t < 50; t++) {
      const [a, b, c] = [rand(20), rand(20), rand(20)];
      expect(equals(compose(compose(a, b), c), compose(a, compose(b, c)))).toBe(true);
      expect(isIdentity(compose(a, inverse(a)))).toBe(true);
      expect(equals(compose(a, identity(20)), a)).toBe(true);
      expect(sign(compose(a, b))).toBe(sign(a) * sign(b));
      expect(isIdentity(power(a, order(a)))).toBe(true);
    }
  });
  it('cycle decomposition and ranking', () => {
    const p = Uint8Array.from([1, 2, 0, 4, 3, 5]);
    expect(cycles(p)).toEqual([[0, 1, 2], [3, 4]]);
    expect(cycleType(p)).toEqual([3, 2]);
    expect(order(p)).toBe(6);
    expect(sign(p)).toBe(-1);
    for (let r = 0; r < 120; r++) expect(rankPerm(unrankPerm(r, 5))).toBe(r);
  });
});

describe('facelet geometry (n = 3)', () => {
  it('has 54 stickers and moves are permutations', () => {
    expect(P3.size).toBe(54);
    for (const [, m] of P3.moves) expect(isPermutation(m)).toBe(true);
  });
  it('reproduces the standard facelet tables (oracle: Kociemba)', () => {
    // 1-based facelet labels U1..U9 R1..R9 F1..F9 D1..D9 L1..L9 B1..B9
    const f = (s: string) => 'URFDLB'.indexOf(s[0]) * 9 + Number(s[1]) - 1;
    const corner = [['U9','R1','F3'],['U7','F1','L3'],['U1','L1','B3'],['U3','B1','R3'],['D3','F9','R7'],['D1','L9','F7'],['D7','B9','L7'],['D9','R9','B7']];
    const edge = [['U6','R2'],['U8','F2'],['U4','L2'],['U2','B2'],['D6','R8'],['D2','F8'],['D4','L8'],['D8','B8'],['F6','R4'],['F4','L6'],['B6','L4'],['B4','R6']];
    const t = cubieTables(P3);
    expect(t.cornerFacelets).toEqual(corner.map((c) => c.map(f)));
    expect(t.edgeFacelets).toEqual(edge.map((c) => c.map(f)));
  });
  it('a quarter face turn moves 20 stickers in five 4-cycles', () => {
    for (const X of ['U', 'D', 'R', 'L', 'F', 'B']) {
      const m = P3.moves.get(X)!;
      expect(cycleType(m)).toEqual([4, 4, 4, 4, 4]);
      expect(order(m)).toBe(4);
      expect(sign(m)).toBe(-1); // five 4-cycles: 15 transpositions
    }
  });
  it('R moves U-face stickers to B (standard orientation check)', () => {
    // After R, the solved U-colour that was on U3/U6/U9 appears on B (B7,B4,B1).
    const s = alg3('R');
    const str = faceletString(P3, s);
    expect(str).toBe('UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB');
  });
  it('known facelet strings for U and F', () => {
    expect(faceletString(P3, alg3('U'))).toBe('UUUUUUUUUBBBRRRRRRRRRFFFFFFDDDDDDDDDFFFLLLLLLLLLBBBBBB');
    expect(faceletString(P3, alg3('F'))).toBe('UUUUUULLLURRURRURRFFFFFFFFFRRRDDDDDDLLDLLDLLDBBBBBBBBB');
  });
});

describe('identity, inverses, orders, composition (3×3×3)', () => {
  it('X⁴ = e, X X\' = e, X2 = X X for all moves', () => {
    for (const X of ['U', 'D', 'R', 'L', 'F', 'B', 'M', 'E', 'S', 'x', 'y', 'z']) {
      expect(isIdentity(alg3(`${X} ${X} ${X} ${X}`))).toBe(true);
      expect(isIdentity(alg3(`${X} ${X}'`))).toBe(true);
      expect(equals(alg3(`${X}2`), alg3(`${X} ${X}`))).toBe(true);
    }
  });
  it('w · w⁻¹ = e for random words', () => {
    const rng = mulberry32('inverse');
    for (let t = 0; t < 100; t++) {
      const w = randomScramble(rng, 25);
      expect(isIdentity(compose(algToPerm(P3, w), algToPerm(P3, invertAlg(w))))).toBe(true);
      expect(equals(algToPerm(P3, simplifyAlg(w.concat(w))), algToPerm(P3, w.concat(w)))).toBe(true);
    }
  });
  it('homomorphism: perm(w₁w₂) = perm(w₁)·perm(w₂)', () => {
    const rng = mulberry32('hom');
    for (let t = 0; t < 50; t++) {
      const a = randomScramble(rng, 10);
      const b = randomScramble(rng, 10);
      expect(equals(algToPerm(P3, [...a, ...b]), compose(algToPerm(P3, a), algToPerm(P3, b)))).toBe(true);
    }
  });
  it('classical element orders', () => {
    expect(order(alg3('R U'))).toBe(105);
    expect(order(alg3("R U R' U'"))).toBe(6);
    expect(order(alg3('R U2 D\' B D\''))).toBe(1260); // maximal element order in G
    expect(order(alg3('R2 U2'))).toBe(6);
    expect(order(alg3('M2 E2 S2'))).toBe(2); // pons asinorum (with slices)
    expect(isIdentity(alg3('(R U)105'))).toBe(true);
  });
  it('commutators and conjugates', () => {
    const R = alg3('R'), U = alg3('U');
    expect(equals(commutator(R, U), alg3("R U R' U'"))).toBe(true);
    expect(equals(conjugate(R, U), alg3("U R U'"))).toBe(true);
    // [R,U] moves 7 pieces: support of 3-cycle-ish structure on stickers
    expect(isIdentity(commutator(alg3('R'), alg3('L')))).toBe(true); // R and L commute
  });
  it('opposite faces commute; adjacent ones do not', () => {
    expect(equals(alg3('U D'), alg3('D U'))).toBe(true);
    expect(equals(alg3('R U'), alg3('U R'))).toBe(false);
  });
  it('slice and rotation identities: M = R L\' x\', x = R M\' L\'', () => {
    expect(equals(alg3('M'), alg3("R L' x'"))).toBe(true);
    expect(equals(alg3('x'), alg3("R M' L'"))).toBe(true);
    expect(equals(alg3('y'), alg3("U E' D'"))).toBe(true);
    expect(equals(alg3('z'), alg3("F S B'"))).toBe(true);
  });
  it('sequence metrics', () => {
    const w = parseAlg("R U2 R' x");
    expect(htmLength(w)).toBe(3);
    expect(qtmLength(w)).toBe(4);
    expect(formatAlg(parseAlg("(R U R' U')2"))).toBe("R U R' U' R U R' U'");
  });
});

describe('cubie model', () => {
  it('facelet ↔ cubie is a bijection on reachable states', () => {
    const rng = mulberry32('bij');
    for (let t = 0; t < 100; t++) {
      const s = algToPerm(P3, randomScramble(rng, 30));
      expect(equals(toFacelet(P3, toCubie(P3, s)), s)).toBe(true);
    }
  });
  it('the conversion is a group homomorphism', () => {
    const rng = mulberry32('cubhom');
    for (let t = 0; t < 100; t++) {
      const a = algToPerm(P3, randomScramble(rng, 15));
      const b = algToPerm(P3, randomScramble(rng, 15));
      const lhs = toCubie(P3, compose(a, b));
      expect(cubieEquals(lhs, cubieMultiply(toCubie(P3, a), toCubie(P3, b)))).toBe(true);
      expect(cubieEquals(toCubie(P3, inverse(a)), cubieInverse(toCubie(P3, a)))).toBe(true);
    }
  });
  it('invariants hold on every reachable state', () => {
    const rng = mulberry32('inv');
    for (let t = 0; t < 300; t++) {
      const c = toCubie(P3, algToPerm(P3, randomScramble(rng, 1 + (t % 40))));
      const inv = invariants(c);
      expect(inv.solvable).toBe(true);
    }
  });
  it('single twist / flip / swap are detected as unreachable', () => {
    const twist = cubieSolved(3); twist.co[0] = 1;
    const flip = cubieSolved(3); flip.eo[0] = 1;
    const swap = cubieSolved(3); swap.cp[0] = 1; swap.cp[1] = 0;
    expect(invariants(twist).solvable).toBe(false);
    expect(invariants(flip).solvable).toBe(false);
    expect(invariants(swap).solvable).toBe(false);
    const both = cubieSolved(3); both.cp[0] = 1; both.cp[1] = 0; both.ep[0] = 1; both.ep[1] = 0;
    expect(invariants(both).solvable).toBe(true);
  });
  it('known cubie images: R twists corners as (URF+2 … )', () => {
    const c = toCubie(P3, alg3('R'));
    // Kociemba's R: cp = [DFR, UFL, ULB, URF, DRB, DLF, DBL, UBR], co = [2,0,0,1,1,0,0,2]
    expect([...c.cp]).toEqual([4, 1, 2, 0, 7, 5, 6, 3]);
    expect([...c.co]).toEqual([2, 0, 0, 1, 1, 0, 0, 2]);
    expect([...c.ep]).toEqual([8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0]);
    const f = toCubie(P3, alg3('F'));
    expect([...f.eo]).toEqual([0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0]);
  });
});

describe('2×2×2', () => {
  it('24 stickers, corner tables, and U R F fix DBL', () => {
    expect(P2.size).toBe(24);
    for (const X of ['U', 'R', 'F']) {
      const c = toCubie(P2, alg2(X));
      expect(c.cp[6]).toBe(6);
      expect(c.co[6]).toBe(0);
    }
  });
  it('|⟨U,R,F⟩| = 7!·3⁶ = 3 674 160 and |⟨R,U⟩| = 29 160', () => {
    const gens = (s: string) => s.split(' ').map((m) => P2.moves.get(m)!);
    expect(groupOrder(24, gens('U R F'))).toBe(3674160n);
    expect(groupOrder(24, gens('U R'))).toBe(29160n);
  });
});

describe('symmetries and canonical frame', () => {
  it('24 rotations, 48 symmetries; R conjugated by a reflection is an anticlockwise turn', () => {
    const d = symmetryData(P3);
    expect(d.rotations.length).toBe(24);
    expect(d.symmetries.length).toBe(48);
    expect(formatAlg([conjugateMove(P3, parseAlg('R')[0], d.symmetries[24])])).toBe("L'");
  });
  it('canonical frame solves states containing slices and rotations', () => {
    const rng = mulberry32('frame');
    for (let t = 0; t < 30; t++) {
      const w = randomScramble(rng, 12, ['U', 'R', 'F', 'M', 'E', 'S', 'x', 'y', 'z']);
      const s = algToPerm(P3, w);
      const { rho, t: tc } = canonicalFrame(P3, s);
      // a canonical-frame solution of tc: inverse of tc as word is unknown here, so check algebra:
      // s · ρ = tc  and translating a word conjugates it.
      expect(equals(compose(s, rho), tc)).toBe(true);
      const probe = parseAlg("R U F'");
      const phys = fromCanonicalFrame(P3, rho, probe);
      expect(equals(compose(compose(rho, algToPerm(P3, probe)), inverse(rho)), algToPerm(P3, phys))).toBe(true);
    }
  });
  it('2×2 canonical frame', () => {
    const s = alg2("D L B' x y");
    const { t } = canonicalFrame(P2, s);
    const c = toCubie(P2, t);
    expect(c.cp[6]).toBe(6);
    expect(c.co[6]).toBe(0);
  });
  it('generator stabilizers', () => {
    expect(generatorStabilizer(P3, P3.faceMoves).total).toBe(48);
    // {R,U}: preserved by the reflection swapping R and U axes composed appropriately
    const ru = generatorStabilizer(P3, ['R', 'U']);
    expect(ru.total).toBeGreaterThanOrEqual(2);
  });
  it('isSolvedUpToRotation', () => {
    expect(isSolvedUpToRotation(P3, alg3('x y'))).toBe(true);
    expect(isSolvedUpToRotation(P3, alg3('R'))).toBe(false);
  });
});

describe('Schreier–Sims: group orders (literature values)', () => {
  const gens = (s: string) => s.split(' ').map((m) => P3.moves.get(m)!);
  it('|G| = 43 252 003 274 489 856 000', () => {
    const chain = new StabilizerChain(54, gens('U D R L F B'));
    expect(chain.order()).toBe(43252003274489856000n);
    expect(chain.contains(alg3("R U R' U'"))).toBe(true);
    expect(chain.contains(alg3('M'))).toBe(false); // slices move centres: not in G
  });
  it('subgroup orders', () => {
    expect(groupOrder(54, gens('R U'))).toBe(73483200n);
    expect(groupOrder(54, gens('R2 U2'))).toBe(12n);
    expect(groupOrder(54, gens('U2 D2 R2 L2 F2 B2'))).toBe(663552n);
    expect(groupOrder(54, gens('U D R2 L2 F2 B2'))).toBe(19508428800n); // Kociemba's H
  });
});
