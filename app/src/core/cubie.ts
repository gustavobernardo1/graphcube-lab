/**
 * Cubie-level representation (permutation + orientation of corners and edges),
 * derived from the facelet model.
 *
 * Positions follow Kociemba's ordering:
 *   corners  URF UFL ULB UBR DFR DLF DBL DRB
 *   edges    UR UF UL UB DR DF DL DB FR FL BL BR
 *
 * cp[i] = corner cubie at position i, co[i] ∈ ℤ₃ its twist;
 * ep[i] = edge cubie at position i, eo[i] ∈ ℤ₂ its flip.
 * Orientation reference sticker: U/D sticker for corners; for edges the U/D
 * sticker, or the F/B sticker for the four middle-layer edges.
 * Product (same convention as perm.ts):
 *   (a·b).cp[i] = a.cp[b.cp[i]],  (a·b).co[i] = a.co[b.cp[i]] + b.co[i]  (mod 3)
 */
import { FACE_FRAME, det3, scale, type FaceName, type Puzzle, type Vec3 } from './geometry';
import { parityOf } from './perm';

export const CORNER_NAMES = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'] as const;
export const EDGE_NAMES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'] as const;

export interface CubieState {
  cp: Uint8Array;
  co: Uint8Array;
  ep: Uint8Array;
  eo: Uint8Array;
}

const N = (f: FaceName) => FACE_FRAME[f].normal;

/** Direction (unit vector sum) of a named cubie, e.g. "URF" → (1,1,1). */
function dirOf(name: string): Vec3 {
  let v: [number, number, number] = [0, 0, 0];
  for (const ch of name) {
    const u = N(ch as FaceName);
    v = [v[0] + u[0], v[1] + u[1], v[2] + u[2]];
  }
  return v;
}

export interface CubieTables {
  /** Facelet indices of each corner position, ordered [U/D, then clockwise]. */
  cornerFacelets: number[][];
  /** Facelet indices of each edge position, ordered [reference, other]. */
  edgeFacelets: number[][];
  /** For a sticker index: [corner index, slot] or undefined. */
  stickerCorner: Array<[number, number] | undefined>;
  stickerEdge: Array<[number, number] | undefined>;
}

const tablesCache = new Map<number, CubieTables>();

export function cubieTables(p: Puzzle): CubieTables {
  const hit = tablesCache.get(p.n);
  if (hit) return hit;
  const k = p.n - 1;
  const cornerFacelets: number[][] = [];
  for (const name of CORNER_NAMES) {
    const pos = scale(dirOf(name), k);
    const faces = name.split('') as FaceName[];
    // reference: U or D face; then order the other two so that det = −1 (clockwise seen from outside)
    const ref = faces.find((f) => f === 'U' || f === 'D')!;
    const others = faces.filter((f) => f !== ref);
    let [b, c] = others;
    if (det3(N(ref), N(b), N(c)) !== -1) [b, c] = [c, b];
    cornerFacelets.push([ref, b, c].map((f) => p.stickerAt(pos, N(f))));
  }
  const edgeFacelets: number[][] = [];
  if (p.n === 3) {
    for (const name of EDGE_NAMES) {
      const pos = scale(dirOf(name), k);
      const faces = name.split('') as FaceName[];
      const ref =
        faces.find((f) => f === 'U' || f === 'D') ?? faces.find((f) => f === 'F' || f === 'B')!;
      const other = faces.find((f) => f !== ref)!;
      edgeFacelets.push([p.stickerAt(pos, N(ref)), p.stickerAt(pos, N(other))]);
    }
  }
  const stickerCorner: Array<[number, number] | undefined> = new Array(p.size).fill(undefined);
  const stickerEdge: Array<[number, number] | undefined> = new Array(p.size).fill(undefined);
  cornerFacelets.forEach((fs, i) => fs.forEach((f, slot) => (stickerCorner[f] = [i, slot])));
  edgeFacelets.forEach((fs, i) => fs.forEach((f, slot) => (stickerEdge[f] = [i, slot])));
  const t = { cornerFacelets, edgeFacelets, stickerCorner, stickerEdge };
  tablesCache.set(p.n, t);
  return t;
}

/**
 * Facelet state (position → original sticker) to cubie state. Requires centres
 * in place (n = 3); throws otherwise. For n = 2 any state is accepted.
 */
export function toCubie(p: Puzzle, s: ArrayLike<number>): CubieState {
  const t = cubieTables(p);
  if (p.n === 3) {
    for (let f = 0; f < 6; f++) if (s[f * 9 + 4] !== f * 9 + 4) throw new Error('centros fora do lugar');
  }
  const cp = new Uint8Array(8);
  const co = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    const fs = t.cornerFacelets[i];
    let found = false;
    for (let slot = 0; slot < 3; slot++) {
      const info = t.stickerCorner[s[fs[slot]]];
      if (!info) throw new Error('adesivo inválido em posição de canto');
      if (info[1] === 0) {
        cp[i] = info[0];
        co[i] = slot;
        found = true;
      }
    }
    if (!found) throw new Error('canto sem adesivo de referência');
  }
  const ne = p.n === 3 ? 12 : 0;
  const ep = new Uint8Array(ne);
  const eo = new Uint8Array(ne);
  for (let i = 0; i < ne; i++) {
    const fs = t.edgeFacelets[i];
    for (let slot = 0; slot < 2; slot++) {
      const info = t.stickerEdge[s[fs[slot]]];
      if (!info) throw new Error('adesivo inválido em posição de aresta');
      if (info[1] === 0) {
        ep[i] = info[0];
        eo[i] = slot;
      }
    }
  }
  return { cp, co, ep, eo };
}

/** Cubie state to facelet state (centres fixed). */
export function toFacelet(p: Puzzle, c: CubieState): Uint8Array {
  const t = cubieTables(p);
  const s = new Uint8Array(p.size);
  for (let i = 0; i < p.size; i++) s[i] = i; // centres (and anything not overwritten)
  for (let i = 0; i < 8; i++) {
    for (let slot = 0; slot < 3; slot++) {
      s[t.cornerFacelets[i][(slot + c.co[i]) % 3]] = t.cornerFacelets[c.cp[i]][slot];
    }
  }
  for (let i = 0; i < c.ep.length; i++) {
    for (let slot = 0; slot < 2; slot++) {
      s[t.edgeFacelets[i][(slot + c.eo[i]) % 2]] = t.edgeFacelets[c.ep[i]][slot];
    }
  }
  return s;
}

export function cubieSolved(n: 2 | 3): CubieState {
  const ne = n === 3 ? 12 : 0;
  return {
    cp: Uint8Array.from({ length: 8 }, (_, i) => i),
    co: new Uint8Array(8),
    ep: Uint8Array.from({ length: ne }, (_, i) => i),
    eo: new Uint8Array(ne),
  };
}

export function cubieMultiply(a: CubieState, b: CubieState): CubieState {
  const cp = new Uint8Array(8);
  const co = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    cp[i] = a.cp[b.cp[i]];
    co[i] = (a.co[b.cp[i]] + b.co[i]) % 3;
  }
  const ne = a.ep.length;
  const ep = new Uint8Array(ne);
  const eo = new Uint8Array(ne);
  for (let i = 0; i < ne; i++) {
    ep[i] = a.ep[b.ep[i]];
    eo[i] = (a.eo[b.ep[i]] + b.eo[i]) % 2;
  }
  return { cp, co, ep, eo };
}

export function cubieInverse(a: CubieState): CubieState {
  const cp = new Uint8Array(8);
  const co = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    cp[a.cp[i]] = i;
    co[a.cp[i]] = (3 - a.co[i]) % 3;
  }
  const ne = a.ep.length;
  const ep = new Uint8Array(ne);
  const eo = new Uint8Array(ne);
  for (let i = 0; i < ne; i++) {
    ep[a.ep[i]] = i;
    eo[a.ep[i]] = a.eo[i];
  }
  return { cp, co, ep, eo };
}

export function cubieEquals(a: CubieState, b: CubieState): boolean {
  for (let i = 0; i < 8; i++) if (a.cp[i] !== b.cp[i] || a.co[i] !== b.co[i]) return false;
  for (let i = 0; i < a.ep.length; i++) if (a.ep[i] !== b.ep[i] || a.eo[i] !== b.eo[i]) return false;
  return true;
}

export interface Invariants {
  cornerParity: 0 | 1;
  edgeParity: 0 | 1;
  twistSum: number; // Σ co mod 3
  flipSum: number; // Σ eo mod 2
  /** Reachable from solved by face turns (First Law of Cubology). */
  solvable: boolean;
}

/**
 * Invariants of the cube group. For n = 3 a cubie state is reachable iff
 * sgn(cp) = sgn(ep), Σco ≡ 0 (mod 3) and Σeo ≡ 0 (mod 2).
 * For n = 2 (no edges) the condition is Σco ≡ 0 (mod 3) only.
 */
export function invariants(c: CubieState): Invariants {
  const cornerParity = parityOf(c.cp);
  const edgeParity = c.ep.length ? parityOf(c.ep) : 0;
  const twistSum = c.co.reduce((a, b) => a + b, 0) % 3;
  const flipSum = c.eo.reduce((a, b) => a + b, 0) % 2;
  const solvable =
    twistSum === 0 && (c.ep.length === 0 || (flipSum === 0 && cornerParity === edgeParity));
  return { cornerParity, edgeParity, twistSum, flipSum, solvable };
}

/** Checks structural validity: cp, ep permutations; orientations in range. */
export function isValidCubie(c: CubieState): boolean {
  const isPerm = (a: Uint8Array) => {
    const seen = new Set(a);
    return seen.size === a.length && [...a].every((v) => v < a.length);
  };
  return (
    c.cp.length === 8 &&
    isPerm(c.cp) &&
    c.co.every((v) => v < 3) &&
    isPerm(c.ep) &&
    c.eo.every((v) => v < 2)
  );
}

