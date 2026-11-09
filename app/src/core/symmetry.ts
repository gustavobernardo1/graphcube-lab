/**
 * Spatial symmetries of the cube acting on facelet states.
 *
 *  • R₂₄ — the 24 proper rotations (closure of x, y, z);
 *  • O_h — the 48 symmetries = R₂₄ ∪ R₂₄·τ, τ the reflection x ↦ −x.
 *
 * A symmetry g acts on moves by conjugation m ↦ g·m·g⁻¹; a reflection sends a
 * clockwise turn to a counter-clockwise turn of the mirrored layer (R ↦ L').
 */
import { compose, inverse, permKey, identity } from './perm';
import { reflect, type Puzzle } from './geometry';
import { toCubie } from './cubie';
import { parseMove, formatMove, type Move } from './notation';

interface SymmetryData {
  rotations: Uint8Array[];
  symmetries: Uint8Array[]; // first 24 are rotations
  moveByKey: Map<string, string>;
}

const cache = new Map<number, SymmetryData>();

export function symmetryData(p: Puzzle): SymmetryData {
  const hit = cache.get(p.n);
  if (hit) return hit;
  const gens = ['x', 'y', 'z'].map((m) => p.moves.get(m)!);
  const seen = new Map<string, Uint8Array>();
  const id = identity(p.size);
  seen.set(permKey(id), id);
  const queue = [id];
  while (queue.length) {
    const g = queue.shift()!;
    for (const s of gens) {
      const h = compose(g, s);
      const k = permKey(h);
      if (!seen.has(k)) {
        seen.set(k, h);
        queue.push(h);
      }
    }
  }
  const rotations = [...seen.values()];
  if (rotations.length !== 24) throw new Error('rotation group must have order 24');
  const tau = new Uint8Array(p.size);
  for (const s of p.stickers) tau[s.index] = p.stickerAt(reflect(s.pos, 0), reflect(s.normal, 0));
  const symmetries = [...rotations, ...rotations.map((r) => compose(r, tau))];
  const moveByKey = new Map<string, string>();
  for (const [name, perm] of p.moves) {
    const k = permKey(perm);
    if (!moveByKey.has(k)) moveByKey.set(k, name);
  }
  const data = { rotations, symmetries, moveByKey };
  cache.set(p.n, data);
  return data;
}

/** Name of the move g·m·g⁻¹ (throws if it is not a named move). */
export function conjugateMove(p: Puzzle, m: Move, g: Uint8Array): Move {
  const { moveByKey } = symmetryData(p);
  const perm = p.moves.get(formatMove(m))!;
  const c = compose(compose(g, perm), inverse(g));
  const name = moveByKey.get(permKey(c));
  if (!name) throw new Error('conjugado não é um movimento nomeado');
  return parseMove(name);
}

/**
 * Finds a rotation ρ such that t = s·ρ is in the "canonical frame":
 *  n = 3: all centres in place, so t ∈ G = ⟨U,D,R,L,F,B⟩;
 *  n = 2: corner DBL in place with twist 0, so t ∈ G₂ = ⟨U,R,F⟩.
 * Solving t by a word w gives the physical solution ρ·w·ρ⁻¹ for s.
 */
export function canonicalFrame(p: Puzzle, s: Uint8Array): { rho: Uint8Array; t: Uint8Array } {
  const { rotations } = symmetryData(p);
  for (const rho of rotations) {
    const t = compose(s, rho);
    if (p.n === 3) {
      let ok = true;
      for (let f = 0; f < 6; f++) if (t[f * 9 + 4] !== f * 9 + 4) ok = false;
      if (ok) return { rho, t };
    } else {
      const c = toCubie(p, t);
      if (c.cp[6] === 6 && c.co[6] === 0) return { rho, t };
    }
  }
  throw new Error('estado sem referencial canônico (estado ilegal?)');
}

/** Translates a word found in the canonical frame back to physical moves: m ↦ ρ·m·ρ⁻¹. */
export function fromCanonicalFrame(p: Puzzle, rho: Uint8Array, ms: readonly Move[]): Move[] {
  return ms.map((m) => conjugateMove(p, m, rho));
}

/**
 * Symmetries g ∈ O_h that preserve the symmetric generating set S ∪ S⁻¹ under
 * conjugation. Each induces an automorphism of Cay(⟨S⟩, S∪S⁻¹) fixing e.
 */
export function generatorStabilizer(p: Puzzle, moveNames: string[]): { rotations: number; total: number } {
  const { symmetries } = symmetryData(p);
  const set = new Set<string>();
  for (const name of moveNames) {
    const perm = p.moves.get(name)!;
    set.add(permKey(perm));
    set.add(permKey(inverse(perm)));
  }
  let rotations = 0;
  let total = 0;
  symmetries.forEach((g, idx) => {
    const gi = inverse(g);
    for (const k of set) {
      const perm = Uint8Array.from(k, (c) => c.charCodeAt(0));
      if (!set.has(permKey(compose(compose(g, perm), gi)))) return;
    }
    total++;
    if (idx < 24) rotations++;
  });
  return { rotations, total };
}
