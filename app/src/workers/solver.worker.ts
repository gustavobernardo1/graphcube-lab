/// <reference lib="webworker" />
/**
 * Web Worker running every computationally intensive task off the UI thread:
 * searches, two-phase solving, Cayley explorations and experiments.
 */
import { cube2, METRIC_MOVES, type Heuristic2Name, type Metric } from '../search/cube2';
import { bfs, bidirectionalBfs, astar, idaStar } from '../search/algorithms';
import { space3, heuristic3, cube3Tables, type Heuristic3Name } from '../search/cube3';
import { solveTwoPhase } from '../search/twophase';
import { exploreCayley, type CayleySpec } from '../graph/cayley';
import { EXPERIMENTS, type ExperimentId } from '../experiments/protocols';
import type { CubieState } from '../core/cubie';
import type { SearchLimits } from '../search/types';

export type AlgorithmId = 'bfs' | 'bibfs' | 'astar' | 'idastar' | 'table' | 'twophase';

export interface SolveRequest {
  n: 2 | 3;
  algorithm: AlgorithmId;
  heuristic?: string;
  metric?: Metric;
  /** n = 2: canonical index; n = 3: cubie arrays. */
  index?: number;
  cubie?: { cp: number[]; co: number[]; ep: number[]; eo: number[] };
  limits?: SearchLimits;
  twoPhase?: { maxLength: number; timeLimitMs: number };
}

type Req =
  | { id: number; type: 'solve'; payload: SolveRequest }
  | { id: number; type: 'cayley'; payload: CayleySpec }
  | { id: number; type: 'experiment'; payload: { id: ExperimentId; params: Record<string, unknown> } }
  | { id: number; type: 'exact2'; payload: { metric: Metric } }
  | { id: number; type: 'bounds3'; payload: { cubies: CubieState[] } }
  | { id: number; type: 'warmup'; payload: { n: 2 | 3 } };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const reply = (id: number, type: 'result' | 'progress' | 'error', data: unknown, transfer: Transferable[] = []) =>
  ctx.postMessage({ id, type, data }, transfer);

const toCubie = (c: SolveRequest['cubie']): CubieState => ({
  cp: Uint8Array.from(c!.cp),
  co: Uint8Array.from(c!.co),
  ep: Uint8Array.from(c!.ep),
  eo: Uint8Array.from(c!.eo),
});

function solve(req: SolveRequest) {
  const limits = req.limits ?? {};
  if (req.n === 2) {
    const M = cube2();
    const metric = req.metric ?? 'HTM';
    const space = M.space(req.index!, METRIC_MOVES[metric]);
    const h = req.heuristic ? M.heuristic(req.heuristic as Heuristic2Name, metric) : M.heuristic('zero', metric);
    const exact = M.exactTable(metric)[req.index!];
    let result;
    switch (req.algorithm) {
      case 'bfs': result = bfs(space, limits); break;
      case 'bibfs': result = bidirectionalBfs(space, limits); break;
      case 'astar': result = astar(space, h, req.heuristic, limits); break;
      case 'idastar': result = idaStar(space, h, req.heuristic, limits); break;
      case 'table': {
        const t0 = performance.now();
        const names = M.solveOptimal(req.index!, metric);
        result = {
          algorithm: 'Tabela exata (descida em d*)', success: true, status: 'solved', solution: [], solutionNames: names,
          length: names.length, optimalityGuaranteed: true, expanded: names.length, generated: names.length * METRIC_MOVES[metric].length,
          discovered: names.length + 1, peakStored: 3674160, maxDepth: names.length, timeMs: performance.now() - t0,
        };
        break;
      }
      default: throw new Error('algoritmo indisponível para 2×2×2');
    }
    return { result, exactDistance: exact };
  }
  const c = toCubie(req.cubie);
  if (req.algorithm === 'twophase') {
    const r = solveTwoPhase(c, req.twoPhase ?? { maxLength: 20, timeLimitMs: 2000 });
    return {
      result: {
        algorithm: 'Duas fases (Kociemba)', success: true, status: 'solved', solution: [], solutionNames: r.solution,
        length: r.length, optimalityGuaranteed: false, expanded: r.nodes, generated: r.nodes, discovered: r.nodes,
        peakStored: 0, maxDepth: r.length, timeMs: r.timeMs,
      },
      twoPhase: r,
    };
  }
  const space = space3(c);
  const h = heuristic3((req.heuristic as Heuristic3Name) ?? 'zero');
  let result;
  switch (req.algorithm) {
    case 'bfs': result = bfs(space, limits); break;
    case 'bibfs': result = bidirectionalBfs(space, limits); break;
    case 'astar': result = astar(space, h, req.heuristic, limits); break;
    case 'idastar': result = idaStar(space, h, req.heuristic, limits); break;
    default: throw new Error('algoritmo indisponível');
  }
  return { result, lowerBound: heuristic3('pdb')(c) };
}

ctx.onmessage = (ev: MessageEvent<Req>) => {
  const { id, type } = ev.data;
  try {
    switch (type) {
      case 'warmup':
        if (ev.data.payload.n === 2) cube2().exactTable('HTM');
        else cube3Tables();
        reply(id, 'result', true);
        break;
      case 'solve':
        reply(id, 'result', solve(ev.data.payload));
        break;
      case 'cayley':
        reply(id, 'result', exploreCayley(ev.data.payload));
        break;
      case 'exact2': {
        const t = cube2().exactTable(ev.data.payload.metric).slice();
        reply(id, 'result', t, [t.buffer]);
        break;
      }
      case 'bounds3': {
        const h = heuristic3('pdb');
        reply(id, 'result', ev.data.payload.cubies.map((c) => h(c)));
        break;
      }
      case 'experiment': {
        const exp = EXPERIMENTS[ev.data.payload.id];
        const out = exp.run(
          { ...ev.data.payload.params, environment: `browser; ${navigator.userAgent}` } as never,
          (f: number, msg: string) => reply(id, 'progress', { f, msg }),
        );
        reply(id, 'result', out);
        break;
      }
    }
  } catch (e) {
    reply(id, 'error', e instanceof Error ? e.message : String(e));
  }
};
