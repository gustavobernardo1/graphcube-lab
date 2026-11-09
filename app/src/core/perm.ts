/**
 * Permutations of Ω = {0, …, n−1} stored as index arrays.
 *
 * Convention (used throughout GraphCube Lab):
 *   a permutation g is the array [g(0), …, g(n−1)] and the product is
 *   function composition  (g·h)(i) = g(h(i)).
 *
 * For cube *states* we interpret s[i] as "the original sticker currently at
 * position i" (position → piece). With this reading, applying the move m to the
 * state s gives s·m, so a word m₁m₂…m_k (executed left to right) corresponds to
 * the product s_{m₁}·s_{m₂}·…·s_{m_k}. See docs/03-fundamentacao-matematica.md.
 */

export type Perm = Uint8Array | number[];

export function identity(n: number): Uint8Array {
  const p = new Uint8Array(n);
  for (let i = 0; i < n; i++) p[i] = i;
  return p;
}

/** (a·b)(i) = a(b(i)). */
export function compose(a: Perm, b: Perm): Uint8Array {
  const n = a.length;
  if (b.length !== n) throw new Error('compose: degree mismatch');
  const r = new Uint8Array(n);
  for (let i = 0; i < n; i++) r[i] = a[b[i]];
  return r;
}

export function inverse(a: Perm): Uint8Array {
  const r = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) r[a[i]] = i;
  return r;
}

export function power(a: Perm, k: number): Uint8Array {
  let result = identity(a.length);
  let base: Uint8Array = Uint8Array.from(a);
  if (k < 0) {
    base = inverse(base);
    k = -k;
  }
  while (k > 0) {
    if (k & 1) result = compose(result, base);
    base = compose(base, base);
    k >>= 1;
  }
  return result;
}

export function equals(a: Perm, b: Perm): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function isIdentity(a: Perm): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== i) return false;
  return true;
}

/** Checks that `a` is a bijection of {0,…,n−1}. */
export function isPermutation(a: ArrayLike<number>): boolean {
  const seen = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!Number.isInteger(v) || v < 0 || v >= a.length || seen[v]) return false;
    seen[v] = 1;
  }
  return true;
}

/** Disjoint cycle decomposition (fixed points omitted). Each cycle starts at its least element. */
export function cycles(a: Perm): number[][] {
  const n = a.length;
  const seen = new Uint8Array(n);
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (seen[i] || a[i] === i) {
      seen[i] = 1;
      continue;
    }
    const c: number[] = [];
    let j = i;
    while (!seen[j]) {
      seen[j] = 1;
      c.push(j);
      j = a[j];
    }
    out.push(c);
  }
  return out;
}

/** Multiset of cycle lengths ≥ 2, sorted decreasingly. */
export function cycleType(a: Perm): number[] {
  return cycles(a)
    .map((c) => c.length)
    .sort((x, y) => y - x);
}

/** sgn(a) = (−1)^(n − #cycles including fixed points) = (−1)^(Σ (ℓ−1)). */
export function sign(a: Perm): 1 | -1 {
  let transpositions = 0;
  for (const c of cycles(a)) transpositions += c.length - 1;
  return transpositions % 2 === 0 ? 1 : -1;
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

export function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

/** Order of a permutation = lcm of its cycle lengths. */
export function order(a: Perm): number {
  return cycleType(a).reduce(lcm, 1);
}

/** Cycle notation using 1-based labels or custom labels, e.g. "(1 2 3)(4 5)". */
export function cycleString(a: Perm, label: (i: number) => string = (i) => String(i + 1)): string {
  const cs = cycles(a);
  if (cs.length === 0) return 'e';
  return cs.map((c) => '(' + c.map(label).join(' ') + ')').join('');
}

/** [a,b] = a·b·a⁻¹·b⁻¹ (execute a, then b, then undo a, then undo b). */
export function commutator(a: Perm, b: Perm): Uint8Array {
  return compose(compose(compose(a, b), inverse(a)), inverse(b));
}

/** Conjugate of a by the "setup" b: b·a·b⁻¹ (do b, do a, undo b). */
export function conjugate(a: Perm, b: Perm): Uint8Array {
  return compose(compose(b, a), inverse(b));
}

/** Support: points moved by a. */
export function support(a: Perm): number[] {
  const s: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== i) s.push(i);
  return s;
}

/** Stable string key (for hashing permutations of degree ≤ 255). */
export function permKey(a: Perm): string {
  return String.fromCharCode(...a);
}

// ---------------------------------------------------------------------------
// Ranking (Lehmer code) — bijection Sym(n) → {0, …, n!−1}
// ---------------------------------------------------------------------------

const FACT: number[] = [1];
for (let i = 1; i <= 20; i++) FACT[i] = FACT[i - 1] * i;
export const factorial = (n: number): number => FACT[n];

/** Lexicographic rank of a permutation of {0..n−1} (n ≤ 12 keeps it exact & fast). */
export function rankPerm(p: ArrayLike<number>, n = p.length): number {
  let r = 0;
  for (let i = 0; i < n; i++) {
    let smaller = 0;
    for (let j = i + 1; j < n; j++) if (p[j] < p[i]) smaller++;
    r += smaller * FACT[n - 1 - i];
  }
  return r;
}

export function unrankPerm(r: number, n: number): number[] {
  const avail: number[] = [];
  for (let i = 0; i < n; i++) avail.push(i);
  const p: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = FACT[n - 1 - i];
    const q = Math.floor(r / f);
    r -= q * f;
    p.push(avail.splice(q, 1)[0]);
  }
  return p;
}

/** Parity (0 even, 1 odd) of a permutation given as array, via inversion count. */
export function parityOf(p: ArrayLike<number>): 0 | 1 {
  let inv = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[j] < p[i]) inv++;
  return (inv & 1) as 0 | 1;
}
