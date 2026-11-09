/**
 * Singmaster notation: parsing, formatting, inversion and simplification of
 * move sequences.
 *
 *   X   clockwise quarter turn of X (as seen looking at face X)
 *   X'  counter-clockwise quarter turn (X⁻¹ = X³)
 *   X2  half turn (X² = X⁻²)
 *
 * X ∈ {U, D, R, L, F, B} face turns, {M, E, S} slices (3×3×3 only; M follows
 * L, E follows D, S follows F) and {x, y, z} whole-cube rotations (follow R, U, F).
 * Groups with exponents are accepted: "(R U R' U')6" or "(R U)^105".
 */
import { compose, identity } from './perm';
import type { Puzzle } from './geometry';

export interface Move {
  /** Base letter: U D R L F B M E S x y z. */
  base: string;
  /** Clockwise quarter turns modulo 4: 1, 2 or 3. */
  amount: 1 | 2 | 3;
}

export const FACE_LETTERS = ['U', 'D', 'R', 'L', 'F', 'B'] as const;
const VALID = /^[UDRLFBMESxyz]$/;

export function formatMove(m: Move): string {
  return m.base + (m.amount === 1 ? '' : m.amount === 2 ? '2' : "'");
}

export function formatAlg(ms: readonly Move[]): string {
  return ms.map(formatMove).join(' ');
}

export function parseMove(token: string): Move {
  const m = /^([UDRLFBMESxyz])(2'|2|'|’|3)?$/.exec(token.trim());
  if (!m) throw new Error(`Movimento inválido: "${token}"`);
  const suf = m[2] ?? '';
  const amount = suf === '' ? 1 : suf.startsWith('2') ? 2 : 3;
  return { base: m[1], amount: amount as 1 | 2 | 3 };
}

/** Parses a sequence; supports nested groups "( … )k" and "( … )^k". */
export function parseAlg(text: string): Move[] {
  const src = text.replace(/’/g, "'");
  let i = 0;
  const parseSeq = (): Move[] => {
    const out: Move[] = [];
    while (i < src.length) {
      const ch = src[i];
      if (/\s|,/.test(ch)) {
        i++;
      } else if (ch === '(') {
        i++;
        const inner = parseSeq();
        if (src[i] !== ')') throw new Error('Parêntese não fechado');
        i++;
        const em = /^\^?(\d+)/.exec(src.slice(i));
        let k = 1;
        if (em) {
          k = parseInt(em[1], 10);
          i += em[0].length;
        }
        if (k > 10000) throw new Error('Expoente muito grande');
        for (let r = 0; r < k; r++) out.push(...inner);
      } else if (ch === ')') {
        return out;
      } else if (VALID.test(ch)) {
        let j = i + 1;
        if (src[j] === '2') j++;
        if (src[j] === "'") j++;
        else if (src[j] === '3' && src[j - 1] !== '2') j++;
        out.push(parseMove(src.slice(i, j)));
        i = j;
      } else {
        throw new Error(`Símbolo inesperado "${ch}" na posição ${i + 1}`);
      }
    }
    return out;
  };
  const seq = parseSeq();
  if (i < src.length) throw new Error('Parêntese ")" sem correspondente');
  return seq;
}

export const invertMove = (m: Move): Move => ({ base: m.base, amount: (4 - m.amount) as 1 | 2 | 3 });

/** (m₁…m_k)⁻¹ = m_k⁻¹ … m₁⁻¹. */
export const invertAlg = (ms: readonly Move[]): Move[] => ms.slice().reverse().map(invertMove);

/**
 * Free reduction modulo the relations X⁴ = e: merges consecutive turns of the
 * same layer. (Commutation of opposite faces is *not* used here, so the result
 * is a word of the same group element, never longer than the input.)
 */
export function simplifyAlg(ms: readonly Move[]): Move[] {
  const out: Move[] = [];
  for (const m of ms) {
    const last = out[out.length - 1];
    if (last && last.base === m.base) {
      const a = (last.amount + m.amount) % 4;
      out.pop();
      if (a !== 0) out.push({ base: m.base, amount: a as 1 | 2 | 3 });
    } else out.push({ ...m });
  }
  return out;
}

/** Group element (position→sticker permutation) of a move sequence. */
export function algToPerm(p: Puzzle, ms: readonly Move[]): Uint8Array {
  let s = identity(p.size);
  for (const m of ms) s = applyMove(p, s, m);
  return s;
}

export function moveToPerm(p: Puzzle, m: Move): Uint8Array {
  const perm = p.moves.get(formatMove(m));
  if (!perm) throw new Error(`Movimento "${formatMove(m)}" não existe no ${p.n}×${p.n}×${p.n}`);
  return perm;
}

/** s · m. */
export function applyMove(p: Puzzle, s: Uint8Array, m: Move): Uint8Array {
  return compose(s, moveToPerm(p, m));
}

export function applyAlg(p: Puzzle, s: Uint8Array, ms: readonly Move[]): Uint8Array {
  let r = s;
  for (const m of ms) r = applyMove(p, r, m);
  return r;
}

/** Half-turn metric length (face/slice turns count 1, rotations count 0). */
export function htmLength(ms: readonly Move[]): number {
  return ms.filter((m) => !/[xyz]/.test(m.base)).length;
}

/** Quarter-turn metric length (half turns count 2, rotations count 0). */
export function qtmLength(ms: readonly Move[]): number {
  return ms.reduce((acc, m) => acc + (/[xyz]/.test(m.base) ? 0 : m.amount === 2 ? 2 : 1), 0);
}

/** Axis of a face/slice/rotation letter: 0 = x (R,L,M,x), 1 = y (U,D,E,y), 2 = z (F,B,S,z). */
export function axisOf(base: string): 0 | 1 | 2 {
  if ('RLMx'.includes(base)) return 0;
  if ('UDEy'.includes(base)) return 1;
  return 2;
}
