/**
 * Geometric model of the n×n×n cube (n = 2, 3), the single source of truth of
 * GraphCube Lab.
 *
 * Axes: x → R (right), y → U (up), z → F (front). Cubie centres have integer
 * coordinates in {−(n−1), −(n−3), …, n−1}. A sticker (facelet) is a pair
 * (p, u): the cubie centre p on the outer layer of a face and that face's
 * outward unit normal u.
 *
 * Facelets are indexed in the conventional URFDLB order, each face read row by
 * row as seen from outside, with the standard "net" orientation (identical to
 * the facelet order used by Kociemba's two-phase program for n = 3). Every
 * permutation of moves is computed by rotating the stickers; nothing is typed
 * by hand.
 */
import { identity, compose, inverse } from './perm';

export type Vec3 = readonly [number, number, number];
export type FaceName = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export const FACES: readonly FaceName[] = ['U', 'R', 'F', 'D', 'L', 'B'];

interface Frame {
  normal: Vec3;
  right: Vec3; // column direction as seen from outside
  down: Vec3; // row direction as seen from outside
}

export const FACE_FRAME: Record<FaceName, Frame> = {
  U: { normal: [0, 1, 0], right: [1, 0, 0], down: [0, 0, 1] },
  R: { normal: [1, 0, 0], right: [0, 0, -1], down: [0, -1, 0] },
  F: { normal: [0, 0, 1], right: [1, 0, 0], down: [0, -1, 0] },
  D: { normal: [0, -1, 0], right: [1, 0, 0], down: [0, 0, -1] },
  L: { normal: [-1, 0, 0], right: [0, 0, 1], down: [0, -1, 0] },
  B: { normal: [0, 0, -1], right: [-1, 0, 0], down: [0, -1, 0] },
};

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const det3 = (a: Vec3, b: Vec3, c: Vec3): number => dot(a, cross(b, c));
export const vecEq = (a: Vec3, b: Vec3): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/**
 * Rotation by −90° (clockwise when seen from the tip of the unit axis vector a,
 * looking towards the origin). Rodrigues with θ = −π/2:  v ↦ −(a×v) + a(a·v).
 */
export function rotateCW(v: Vec3, a: Vec3): Vec3 {
  const c = cross(a, v);
  const d = dot(a, v);
  return [-c[0] + a[0] * d, -c[1] + a[1] * d, -c[2] + a[2] * d];
}

/** Reflection through the plane perpendicular to the coordinate axis k. */
export function reflect(v: Vec3, k: 0 | 1 | 2): Vec3 {
  const r: [number, number, number] = [v[0], v[1], v[2]];
  r[k] = -r[k];
  return r;
}

export interface Sticker {
  index: number;
  face: FaceName;
  row: number;
  col: number;
  pos: Vec3;
  normal: Vec3;
}

export type MoveKind = 'face' | 'slice' | 'rotation';

/** A primitive (quarter-turn, clockwise) move. Powers are derived from it. */
export interface BaseMove {
  name: string;
  kind: MoveKind;
  /** Rotation axis: outward normal of the reference face (e.g. L for M). */
  axis: Vec3;
  /** Coordinate index (0,1,2) of the axis. */
  axisIndex: 0 | 1 | 2;
  /** Layer coordinates (along axisIndex) that turn. */
  layers: number[];
  /** σ: σ(i) = position to which the sticker at position i is carried. */
  sigma: Uint8Array;
  /** Group element in position→sticker convention: m = σ⁻¹, so s·m = s∘σ⁻¹. */
  perm: Uint8Array;
}

export interface Puzzle {
  n: 2 | 3;
  stickers: Sticker[];
  size: number;
  base: Map<string, BaseMove>;
  /** All named moves with powers: "R", "R2", "R'" … mapped to group elements. */
  moves: Map<string, Uint8Array>;
  /** Names of face moves (HTM generators) in canonical order. */
  faceMoves: string[];
  stickerAt(pos: Vec3, normal: Vec3): number;
}

const faceIndex = (f: FaceName) => FACES.indexOf(f);

function buildStickers(n: number): Sticker[] {
  const out: Sticker[] = [];
  for (const face of FACES) {
    const { normal, right, down } = FACE_FRAME[face];
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const pos = add(
          add(scale(normal, n - 1), scale(right, 2 * col - (n - 1))),
          scale(down, 2 * row - (n - 1)),
        );
        out.push({ index: out.length, face, row, col, pos, normal });
      }
    }
  }
  return out;
}

const cache = new Map<number, Puzzle>();

export function getPuzzle(n: 2 | 3): Puzzle {
  const hit = cache.get(n);
  if (hit) return hit;
  const stickers = buildStickers(n);
  const size = stickers.length;
  const lookup = new Map<string, number>();
  const key = (p: Vec3, u: Vec3) => `${p.join(',')}|${u.join(',')}`;
  for (const s of stickers) lookup.set(key(s.pos, s.normal), s.index);
  const stickerAt = (p: Vec3, u: Vec3): number => {
    const i = lookup.get(key(p, u));
    if (i === undefined) throw new Error(`no sticker at ${p} ${u}`);
    return i;
  };

  const base = new Map<string, BaseMove>();
  const defineMove = (name: string, kind: MoveKind, axis: Vec3, layers: number[]) => {
    const axisIndex = axis.findIndex((c) => c !== 0) as 0 | 1 | 2;
    const sigma = new Uint8Array(size);
    for (const s of stickers) {
      if (layers.includes(s.pos[axisIndex])) {
        sigma[s.index] = stickerAt(rotateCW(s.pos, axis), rotateCW(s.normal, axis));
      } else sigma[s.index] = s.index;
    }
    base.set(name, { name, kind, axis, axisIndex, layers, sigma, perm: inverse(sigma) });
  };

  const outer = n - 1;
  for (const f of FACES) {
    const axis = FACE_FRAME[f].normal;
    const axisIndex = axis.findIndex((c) => c !== 0);
    defineMove(f, 'face', axis, [outer * axis[axisIndex]]);
  }
  const all: number[] = [];
  for (let c = -(n - 1); c <= n - 1; c += 2) all.push(c);
  if (n === 3) {
    defineMove('M', 'slice', FACE_FRAME.L.normal, [0]);
    defineMove('E', 'slice', FACE_FRAME.D.normal, [0]);
    defineMove('S', 'slice', FACE_FRAME.F.normal, [0]);
  }
  defineMove('x', 'rotation', FACE_FRAME.R.normal, all);
  defineMove('y', 'rotation', FACE_FRAME.U.normal, all);
  defineMove('z', 'rotation', FACE_FRAME.F.normal, all);

  const moves = new Map<string, Uint8Array>();
  for (const [name, b] of base) {
    const m1 = b.perm;
    const m2 = compose(m1, m1);
    const m3 = compose(m2, m1);
    moves.set(name, m1);
    moves.set(name + '2', m2);
    moves.set(name + "'", m3);
  }

  const faceMoves: string[] = [];
  for (const f of FACES) faceMoves.push(f, f + '2', f + "'");

  const puzzle: Puzzle = { n: n as 2 | 3, stickers, size, base, moves, faceMoves, stickerAt };
  cache.set(n, puzzle);
  return puzzle;
}

/** The solved state (identity of Sym(Ω)). */
export const solvedState = (p: Puzzle): Uint8Array => identity(p.size);

/** Face colour index (0..5, URFDLB) shown at each position for state s. */
export function stickerColors(p: Puzzle, s: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < p.size; i++) out.push(faceIndex(p.stickers[s[i]].face));
  return out;
}

/** Facelet string ("UUUUUUUUURRR…") of a state, colours named by their solved face. */
export function faceletString(p: Puzzle, s: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < p.size; i++) out += p.stickers[s[i]].face;
  return out;
}

/** True when every face shows one colour (the cube is solved up to a global rotation). */
export function isSolvedUpToRotation(p: Puzzle, s: ArrayLike<number>): boolean {
  const n2 = p.n * p.n;
  for (let f = 0; f < 6; f++) {
    const c = p.stickers[s[f * n2]].face;
    for (let k = 1; k < n2; k++) if (p.stickers[s[f * n2 + k]].face !== c) return false;
  }
  return true;
}
