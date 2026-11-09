/**
 * Deterministic Schreier–Sims algorithm (Sims 1970; see Seress 2003, Holt et al. 2005).
 *
 * Computes a base and strong generating set (BSGS) of G = ⟨gens⟩ ≤ Sym(n) and
 * hence the exact order |G| = Π |β_i^{G^{(i)}}| (product of fundamental orbit
 * lengths), plus a membership test by sifting. Used to verify computationally
 * that ⟨U,D,R,L,F,B⟩ has order 43 252 003 274 489 856 000 and to compute the
 * orders of the subgroups explored in Cayley mode.
 *
 * Internally a permutation acts on points as a function: p ↦ g[p];
 * "apply a then b" is then(a,b) = b∘a.
 */
type P = Uint8Array;

const then = (a: P, b: P): P => {
  const r = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) r[i] = b[a[i]];
  return r;
};
const inv = (a: P): P => {
  const r = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) r[a[i]] = i;
  return r;
};
const isId = (a: P): boolean => {
  for (let i = 0; i < a.length; i++) if (a[i] !== i) return false;
  return true;
};

interface Level {
  beta: number;
  gens: P[];
  /** trans[x] = u_x with u_x(β) = x, or null if x ∉ orbit. */
  trans: (P | null)[];
  orbit: number[];
}

export class StabilizerChain {
  readonly n: number;
  readonly levels: Level[] = [];

  constructor(n: number, gens: Iterable<ArrayLike<number>>) {
    this.n = n;
    for (const g of gens) {
      const p = Uint8Array.from(g);
      if (!this.contains(p)) this.addGenerator(0, p);
    }
  }

  private newLevel(g: P): Level {
    let beta = 0;
    while (g[beta] === beta) beta++;
    const id = new Uint8Array(this.n);
    for (let i = 0; i < this.n; i++) id[i] = i;
    const trans: (P | null)[] = new Array(this.n).fill(null);
    trans[beta] = id;
    return { beta, gens: [], trans, orbit: [beta] };
  }

  /** Sifts h through levels ≥ k. Returns the residue (identity iff h ∈ G^{(k)}). */
  sift(h: P, k = 0): P {
    for (let j = k; j < this.levels.length; j++) {
      const L = this.levels[j];
      const x = h[L.beta];
      const u = L.trans[x];
      if (!u) return h;
      h = then(h, inv(u));
    }
    return h;
  }

  contains(h: ArrayLike<number>): boolean {
    return isId(this.sift(Uint8Array.from(h)));
  }

  private addGenerator(i: number, g: P): void {
    if (i === this.levels.length) this.levels.push(this.newLevel(g));
    const L = this.levels[i];
    L.gens.push(g);
    const queue: Array<[number, P]> = L.orbit.map((x) => [x, g]);
    while (queue.length) {
      const [x, s] = queue.pop()!;
      const ux = L.trans[x]!;
      const y = s[x];
      const uxs = then(ux, s);
      if (!L.trans[y]) {
        L.trans[y] = uxs;
        L.orbit.push(y);
        for (const t of L.gens) queue.push([y, t]);
      } else {
        const schreierGen = then(uxs, inv(L.trans[y]!));
        const r = this.sift(schreierGen, i + 1);
        if (!isId(r)) this.addGenerator(i + 1, r);
      }
    }
  }

  /** |G| as a BigInt. */
  order(): bigint {
    return this.levels.reduce((acc, L) => acc * BigInt(L.orbit.length), 1n);
  }

  base(): number[] {
    return this.levels.map((L) => L.beta);
  }

  orbitLengths(): number[] {
    return this.levels.map((L) => L.orbit.length);
  }
}

export function groupOrder(n: number, gens: Iterable<ArrayLike<number>>): bigint {
  return new StabilizerChain(n, gens).order();
}
