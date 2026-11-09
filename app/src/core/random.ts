/**
 * Seeded pseudo-random generation (reproducibility of scrambles and samples).
 * Generator: mulberry32 (32-bit state). Seeds may be numbers or strings
 * (strings are hashed with FNV-1a).
 */
import type { Move } from './notation';
import { axisOf } from './notation';

export type RNG = () => number; // uniform in [0, 1)

export function hashSeed(seed: number | string): number {
  if (typeof seed === 'number') return seed >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number | string): RNG {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rng: RNG, n: number): number => Math.floor(rng() * n);

/**
 * Random scramble of length L over the given face letters, never turning the
 * same face twice in a row and never turning opposite faces in a non-canonical
 * order (e.g. "D U" is avoided in favour of "U D"), so that the word has no
 * trivial reduction. Note: the minimal distance d*(s) of the result can still
 * be smaller than L.
 */
export function randomScramble(
  rng: RNG,
  length: number,
  faces: readonly string[] = ['U', 'D', 'R', 'L', 'F', 'B'],
  amounts: readonly (1 | 2 | 3)[] = [1, 2, 3],
): Move[] {
  const order = 'UDRLFB';
  const out: Move[] = [];
  while (out.length < length) {
    const base = faces[randInt(rng, faces.length)];
    const last = out[out.length - 1];
    if (last) {
      if (last.base === base) continue;
      if (axisOf(last.base) === axisOf(base) && order.indexOf(last.base) > order.indexOf(base)) continue;
      const prev = out[out.length - 2];
      if (prev && axisOf(prev.base) === axisOf(base) && axisOf(last.base) === axisOf(base)) continue;
    }
    out.push({ base, amount: amounts[randInt(rng, amounts.length)] });
  }
  return out;
}
