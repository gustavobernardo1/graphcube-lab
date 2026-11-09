/** Binary min-heap keyed by (primary, secondary, insertion order). */
export class MinHeap<T> {
  private a: { p: number; q: number; n: number; v: T }[] = [];
  private seq = 0;
  get size(): number {
    return this.a.length;
  }
  private less(i: number, j: number): boolean {
    const x = this.a[i];
    const y = this.a[j];
    return x.p !== y.p ? x.p < y.p : x.q !== y.q ? x.q < y.q : x.n < y.n;
  }
  push(p: number, q: number, v: T): void {
    this.a.push({ p, q, n: this.seq++, v });
    let i = this.a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      [this.a[i], this.a[parent]] = [this.a[parent], this.a[i]];
      i = parent;
    }
  }
  pop(): T | undefined {
    if (!this.a.length) return undefined;
    const top = this.a[0].v;
    const last = this.a.pop()!;
    if (this.a.length) {
      this.a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.a.length && this.less(l, m)) m = l;
        if (r < this.a.length && this.less(r, m)) m = r;
        if (m === i) break;
        [this.a[i], this.a[m]] = [this.a[m], this.a[i]];
        i = m;
      }
    }
    return top;
  }
}
