/**
 * Move-sequence pruning rules derived from the group structure.
 *
 * allowedAfter(l): forbids m after l when l·m ∈ {e} ∪ S (same layer, the pair
 *   collapses to at most one generator). Safe for graph search with duplicate
 *   detection: a pruned successor x·m = y·(l·m) is at depth ≤ d(x).
 * canonicalAfter(l): additionally forbids the second of two commuting opposite
 *   faces when they appear in non-canonical order (e.g. U after D). Safe for tree
 *   search (IDA*): every element has a minimal word in canonical form.
 */
import { compose, isIdentity, permKey } from '../core/perm';
import { axisOf } from '../core/notation';

export interface PruningTables {
  allowedAfter: number[][]; // index last+1 (0 = no previous move)
  canonicalAfter: number[][];
}

const ORDER = 'UDRLFB';

export function buildPruning(names: readonly string[], perms: readonly Uint8Array[]): PruningTables {
  const keys = new Set(perms.map(permKey));
  const base = (n: string) => n[0];
  const allowedAfter: number[][] = [names.map((_, i) => i)];
  const canonicalAfter: number[][] = [names.map((_, i) => i)];
  for (let l = 0; l < names.length; l++) {
    const a: number[] = [];
    const c: number[] = [];
    for (let m = 0; m < names.length; m++) {
      let ok = true;
      if (base(names[l]) === base(names[m])) {
        const prod = compose(perms[l], perms[m]);
        if (isIdentity(prod) || keys.has(permKey(prod))) ok = false;
      }
      if (ok) a.push(m);
      const bl = base(names[l]);
      const bm = base(names[m]);
      const commuteSwap =
        bl !== bm && ORDER.includes(bl) && ORDER.includes(bm) && axisOf(bl) === axisOf(bm) && ORDER.indexOf(bl) > ORDER.indexOf(bm);
      if (ok && !commuteSwap) c.push(m);
    }
    allowedAfter.push(a);
    canonicalAfter.push(c);
  }
  return { allowedAfter, canonicalAfter };
}

/** Builds the inverse-move index table (−1 if the inverse is not a generator). */
export function inverseTable(perms: readonly Uint8Array[]): number[] {
  return perms.map((p) => {
    const k = perms.findIndex((q) => isIdentity(compose(p, q)));
    return k;
  });
}
