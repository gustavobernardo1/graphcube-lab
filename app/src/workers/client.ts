/** Promise-based client for the solver worker. One worker per task kind keeps the UI responsive. */
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; progress?: (p: { f: number; msg: string }) => void };

export class WorkerClient {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker = this.spawn();
  }

  private spawn(): Worker {
    const w = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev) => {
      const { id, type, data } = ev.data;
      const p = this.pending.get(id);
      if (!p) return;
      if (type === 'progress') p.progress?.(data);
      else {
        this.pending.delete(id);
        if (type === 'error') p.reject(new Error(data));
        else p.resolve(data);
      }
    };
    return w;
  }

  call<T>(type: string, payload: unknown, progress?: Pending['progress']): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, progress });
      this.worker.postMessage({ id, type, payload });
    });
  }

  /** Aborts all running tasks by terminating and respawning the worker. */
  cancel(): void {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new Error('cancelado'));
    this.pending.clear();
    this.worker = this.spawn();
  }
}

let solver: WorkerClient | null = null;
let aux: WorkerClient | null = null;
/** Worker for searches / experiments (may be cancelled). */
export const solverWorker = (): WorkerClient => (solver ??= new WorkerClient());
/** Worker for small background queries (tables, bounds). */
export const auxWorker = (): WorkerClient => (aux ??= new WorkerClient());
