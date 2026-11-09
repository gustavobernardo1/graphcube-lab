/**
 * Experimental protocols, shared verbatim by the Node CLI (scripts/) and the
 * in-browser "Investigar" mode (via the Web Worker). Every output carries the
 * metadata needed to reproduce it. No result is ever synthesised: rows are
 * produced only by running the algorithms.
 */
import { getPuzzle } from '../core/geometry';
import { toCubie, cubieSolved, type CubieState } from '../core/cubie';
import { algToPerm, formatAlg } from '../core/notation';
import { groupOrder } from '../core/schreier';
import { mulberry32, randInt, randomScramble, type RNG } from '../core/random';
import { unrankPerm, parityOf } from '../core/perm';
import { cube2, METRIC_MOVES, N_STATES2, MOVES2, HEURISTICS2, type Heuristic2Name, type Metric } from '../search/cube2';
import { space3, heuristic3, cube3Tables, MOVES18 } from '../search/cube3';
import { solveTwoPhase } from '../search/twophase';
import { bfs, bidirectionalBfs, astar, idaStar, effectiveBranchingFactor } from '../search/algorithms';
import type { SearchResult } from '../search/types';
import { exploreCayley } from '../graph/cayley';

export const SOFTWARE_VERSION = '0.1.0';

export type Row = Record<string, string | number | boolean | null>;
export interface ExperimentMeta {
  experiment: string;
  title: string;
  softwareVersion: string;
  gitCommit: string | null;
  startedAt: string;
  durationMs: number;
  seed: string | number;
  params: Record<string, unknown>;
  moveCountConvention: string;
  limits: Record<string, number>;
  environment: string;
}
export interface ExperimentOutput {
  meta: ExperimentMeta;
  rows: Row[];
}
export type Progress = (fraction: number, message: string) => void;

export interface CommonParams {
  seed?: string | number;
  quick?: boolean;
  gitCommit?: string | null;
  environment?: string;
}

function meta(id: string, title: string, p: CommonParams, params: Record<string, unknown>, limits: Record<string, number>, t0: number, startedAt: string, convention: string): ExperimentMeta {
  return {
    experiment: id,
    title,
    softwareVersion: SOFTWARE_VERSION,
    gitCommit: p.gitCommit ?? null,
    startedAt,
    durationMs: Math.round(performance.now() - t0),
    seed: p.seed ?? 'graphcube',
    params,
    moveCountConvention: convention,
    limits,
    environment: p.environment ?? 'unknown',
  };
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

function searchRow(r: SearchResult, extra: Row): Row {
  return {
    ...extra,
    algorithm: r.algorithm,
    heuristic: r.heuristic ?? 'none',
    success: r.success,
    status: r.status,
    length: r.length,
    expanded: r.expanded,
    generated: r.generated,
    discovered: r.discovered,
    peakStored: r.peakStored,
    timeMs: r3(r.timeMs),
    ebf: r.success && r.length ? r3(effectiveBranchingFactor(r.generated, r.length)) : null,
  };
}

/** Uniform sample of states of the 2×2×2 at exact distance d (rejection sampling on uniform indices). */
export function sampleAtDistance2(rng: RNG, d: number, count: number, metric: Metric = 'HTM'): number[] {
  const exact = cube2().exactTable(metric);
  const out: number[] = [];
  let guard = 0;
  while (out.length < count && guard < 50_000_000) {
    guard++;
    const s = randInt(rng, N_STATES2);
    if (exact[s] === d) out.push(s);
  }
  return out;
}

/** Uniformly random element of G (3×3×3) from independent uniform coordinates. */
export function randomCubie3(rng: RNG): CubieState {
  const c = cubieSolved(3);
  c.cp.set(unrankPerm(randInt(rng, 40320), 8));
  c.ep.set(unrankPerm(randInt(rng, 479001600), 12));
  if (parityOf(c.cp) !== parityOf(c.ep)) [c.ep[0], c.ep[1]] = [c.ep[1], c.ep[0]];
  let s = 0;
  for (let i = 0; i < 7; i++) s += c.co[i] = randInt(rng, 3);
  c.co[7] = (3 - (s % 3)) % 3;
  s = 0;
  for (let i = 0; i < 11; i++) s += c.eo[i] = randInt(rng, 2);
  c.eo[11] = s % 2;
  return c;
}

// ---------------------------------------------------------------------------
// E0 — validation against known results
// ---------------------------------------------------------------------------
export function e0Validation(p: CommonParams = {}, progress: Progress = () => {}): ExperimentOutput {
  const t0 = performance.now();
  const startedAt = new Date().toISOString();
  const rows: Row[] = [];
  const P3 = getPuzzle(3);
  const P2 = getPuzzle(2);
  const gens = (P: typeof P3, s: string) => s.split(' ').map((m) => P.moves.get(m)!);
  const groups: [string, typeof P3, string, string, string][] = [
    ['G (3×3×3)', P3, 'U D R L F B', '43252003274489856000', 'Joyner 2008; Rokicki et al. 2014'],
    ['⟨R,U⟩ (3×3×3)', P3, 'R U', '73483200', 'Joyner 2008 / Jaap Scherphuis'],
    ['⟨U2,D2,R2,L2,F2,B2⟩ (3×3×3)', P3, 'U2 D2 R2 L2 F2 B2', '663552', 'Joyner 2008 (squares group)'],
    ['H = ⟨U,D,R2,L2,F2,B2⟩', P3, 'U D R2 L2 F2 B2', '19508428800', 'Kociemba (8!·8!·4!/2)'],
    ['⟨R2,U2⟩ (3×3×3)', P3, 'R2 U2', '12', 'dihedral D₆'],
    ['G₂ = ⟨U,R,F⟩ (2×2×2)', P2, 'U R F', '3674160', '7!·3⁶'],
    ['⟨R,U⟩ (2×2×2)', P2, 'R U', '29160', 'Jaap Scherphuis'],
  ];
  groups.forEach(([name, P, g, lit, src], i) => {
    progress(i / (groups.length + 2), `Schreier–Sims ${name}`);
    const ts = performance.now();
    const order = groupOrder(P.size, gens(P, g)).toString();
    rows.push({ check: 'group-order', object: name, computed: order, literature: lit, source: src, match: order === lit, timeMs: r3(performance.now() - ts) });
  });
  const M = cube2();
  const lit: Record<Metric, number[]> = {
    HTM: [1, 9, 54, 321, 1847, 9992, 50136, 227536, 870072, 1887748, 623800, 2644],
    QTM: [1, 6, 27, 120, 534, 2256, 8969, 33058, 114149, 360508, 930588, 1350852, 782536, 90280, 276],
  };
  for (const metric of ['HTM', 'QTM'] as Metric[]) {
    progress(0.8, `BFS completa 2×2×2 ${metric}`);
    const ts = performance.now();
    const fresh = new (M.constructor as new () => typeof M)();
    const dist = fresh.distanceDistribution(metric);
    const tms = performance.now() - ts;
    dist.forEach((count, d) =>
      rows.push({ check: `distance-distribution-2x2-${metric}`, object: `d=${d}`, computed: count, literature: lit[metric][d] ?? null, source: 'OEIS A079761/A079762; Scherphuis', match: count === lit[metric][d], timeMs: d === 0 ? r3(tms) : null }),
    );
  }
  const ts = performance.now();
  const T = cube3Tables();
  rows.push({ check: 'two-phase-tables', object: 'move+pruning tables (3×3×3)', computed: 'built', literature: null, source: null, match: true, timeMs: r3(T.buildTimeMs || performance.now() - ts) });
  progress(1, 'ok');
  return { meta: meta('E0', 'Validação contra resultados conhecidos', p, {}, {}, t0, startedAt, 'HTM e QTM indicados por linha'), rows };
}

// ---------------------------------------------------------------------------
// E1 — growth of the search space vs scramble length / true distance (2×2×2)
// ---------------------------------------------------------------------------
export function e1Growth(p: CommonParams & { lengths?: number[]; samples?: number } = {}, progress: Progress = () => {}): ExperimentOutput {
  const t0 = performance.now();
  const startedAt = new Date().toISOString();
  const seed = p.seed ?? 'e1';
  const rng = mulberry32(seed);
  const lengths = p.lengths ?? Array.from({ length: p.quick ? 13 : 21 }, (_, i) => i);
  const samples = p.samples ?? (p.quick ? 6 : 30);
  const M = cube2();
  const exact = M.exactTable('HTM');
  const rows: Row[] = [];
  const limits = { maxNodes: 4_000_000, timeLimitMs: 60_000 };
  let done = 0;
  for (const L of lengths) {
    for (let k = 0; k < samples; k++) {
      const w = randomScramble(rng, L, ['U', 'R', 'F']);
      // state = solved · w  (in the canonical frame, U/R/F keep DBL fixed)
      let s = 0;
      for (const m of w) s = M.apply(s, MOVES2.indexOf(formatAlg([m]) as (typeof MOVES2)[number]));
      const dstar = exact[s];
      const base: Row = { sample: k, scrambleLength: L, dstar, scramble: formatAlg(w) };
      rows.push(searchRow(bfs(M.space(s), limits), base));
      rows.push(searchRow(bidirectionalBfs(M.space(s), limits), base));
      done++;
      progress(done / (lengths.length * samples), `L=${L}`);
    }
  }
  return {
    meta: meta('E1', 'Crescimento do espaço de busca (2×2×2, HTM)', p, { lengths, samples, generators: 'U,R,F (HTM, 9 movimentos)', scrambleRule: 'sem face repetida consecutiva' }, limits, t0, startedAt, 'HTM'),
    rows,
  };
}

// ---------------------------------------------------------------------------
// E2 — algorithm comparison on uniform states stratified by d* (2×2×2)
// ---------------------------------------------------------------------------
export function e2Algorithms(p: CommonParams & { depths?: number[]; samples?: number } = {}, progress: Progress = () => {}): ExperimentOutput {
  const t0 = performance.now();
  const startedAt = new Date().toISOString();
  const rng = mulberry32(p.seed ?? 'e2');
  const depths = p.depths ?? (p.quick ? [2, 4, 6, 8] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const samples = p.samples ?? (p.quick ? 4 : 20);
  const M = cube2();
  const h = M.heuristic('pdb-max', 'HTM');
  const limits = { maxNodes: 4_000_000, timeLimitMs: 60_000 };
  const rows: Row[] = [];
  let done = 0;
  for (const d of depths) {
    const states = sampleAtDistance2(rng, d, samples);
    states.forEach((s, k) => {
      const base: Row = { sample: k, state: s, dstar: d };
      const runs = [bfs(M.space(s), limits), bidirectionalBfs(M.space(s), limits), astar(M.space(s), h, 'pdb-max', limits), idaStar(M.space(s), h, 'pdb-max', limits)];
      for (const r of runs) rows.push({ ...searchRow(r, base), optimal: r.success ? r.length === d : null });
      done++;
      progress(done / (depths.length * samples), `d*=${d}`);
    });
  }
  return {
    meta: meta('E2', 'Comparação de algoritmos (2×2×2, HTM, estados uniformes estratificados por d*)', p, { depths, samples, heuristicForInformed: 'pdb-max', sampling: 'uniforme no conjunto {s : d*(s)=d} por rejeição' }, limits, t0, startedAt, 'HTM'),
    rows,
  };
}

// ---------------------------------------------------------------------------
// E3 — heuristics (2×2×2: A*, IDA*), 3×3×3: IDA* (optimal) vs two-phase
// ---------------------------------------------------------------------------
export function e3Heuristics(p: CommonParams & { depths?: number[]; samples?: number } = {}, progress: Progress = () => {}): ExperimentOutput {
  const t0 = performance.now();
  const startedAt = new Date().toISOString();
  const rng = mulberry32(p.seed ?? 'e3');
  const depths = p.depths ?? (p.quick ? [3, 6, 8] : [2, 4, 6, 7, 8, 9, 10, 11]);
  const samples = p.samples ?? (p.quick ? 3 : 15);
  const M = cube2();
  const limits = { maxNodes: 3_000_000, timeLimitMs: 30_000 };
  const rows: Row[] = [];
  let done = 0;
  for (const d of depths) {
    const states = sampleAtDistance2(rng, d, samples);
    states.forEach((s, k) => {
      for (const { id } of HEURISTICS2) {
        const h = M.heuristic(id as Heuristic2Name, 'HTM');
        const base: Row = { puzzle: '2x2x2', sample: k, dstar: d, h0: h(s) };
        for (const r of [idaStar(M.space(s), h, id, limits), astar(M.space(s), h, id, limits)])
          rows.push({ ...searchRow(r, base), optimal: r.success ? r.length === d : null });
      }
      done++;
      progress(done / (depths.length * samples), `2×2×2 d*=${d}`);
    });
  }
  return {
    meta: meta('E3', 'Heurísticas admissíveis (2×2×2, HTM)', p, { depths, samples, heuristics: HEURISTICS2.map((x) => x.id) }, limits, t0, startedAt, 'HTM'),
    rows,
  };
}

export function e3bCube3(p: CommonParams & { lengths?: number[]; samples?: number; randomStates?: number } = {}, progress: Progress = () => {}): ExperimentOutput {
  const t0 = performance.now();
  const startedAt = new Date().toISOString();
  const rng = mulberry32(p.seed ?? 'e3b');
  const lengths = p.lengths ?? (p.quick ? [4, 6, 8] : [2, 4, 6, 7, 8, 9, 10, 11, 12]);
  const samples = p.samples ?? (p.quick ? 2 : 10);
  const randomStates = p.randomStates ?? (p.quick ? 5 : 100);
  const P3 = getPuzzle(3);
  cube3Tables();
  const limits = { maxNodes: 30_000_000, timeLimitMs: 120_000, misplacedMaxLength: 7 };
  const rows: Row[] = [];
  const total = lengths.length * samples + randomStates;
  let done = 0;
  for (const L of lengths) {
    for (let k = 0; k < samples; k++) {
      const w = randomScramble(rng, L);
      const c = toCubie(P3, algToPerm(P3, w));
      const base: Row = { kind: 'scramble', sample: k, scrambleLength: L, scramble: formatAlg(w) };
      const opt = idaStar(space3(c), heuristic3('pdb'), 'pdb', limits);
      rows.push({ ...searchRow(opt, base), dstar: opt.success ? opt.length : null });
      if (L <= limits.misplacedMaxLength) rows.push({ ...searchRow(idaStar(space3(c), heuristic3('misplaced'), 'misplaced', limits), base), dstar: opt.success ? opt.length : null });
      const tp = solveTwoPhase(c, { maxLength: 0, timeLimitMs: 200 });
      rows.push({ ...base, algorithm: 'Duas fases (200 ms)', heuristic: 'h1/h2', success: tp.length > 0 || L === 0, status: 'solved', length: tp.length, expanded: tp.nodes, generated: tp.nodes, discovered: null, peakStored: null, timeMs: r3(tp.timeMs), ebf: null, dstar: opt.success ? opt.length : null });
      done++;
      progress(done / total, `3×3×3 L=${L}`);
    }
  }
  for (let k = 0; k < randomStates; k++) {
    const c = randomCubie3(rng);
    for (const [label, opts] of [
      ['Duas fases (1ª solução)', { maxLength: 99, timeLimitMs: 10_000 }],
      ['Duas fases (alvo ≤ 20 ou 1 s)', { maxLength: 20, timeLimitMs: 1000 }],
    ] as const) {
      const tp = solveTwoPhase(c, opts);
      rows.push({ kind: 'uniform-random', sample: k, scrambleLength: null, scramble: null, algorithm: label, heuristic: 'h1/h2', success: tp.length > 0, status: 'solved', length: tp.length, phase1: tp.phase1.length, phase2: tp.phase2.length, expanded: tp.nodes, generated: tp.nodes, discovered: null, peakStored: null, timeMs: r3(tp.timeMs), ebf: null, dstar: null });
    }
    done++;
    progress(done / total, `3×3×3 aleatório ${k}`);
  }
  return {
    meta: meta('E3b', '3×3×3: IDA* ótimo (h_PDB, h_pec) vs. duas fases', p, { lengths, samples, randomStates, moves: MOVES18.join(' ') }, limits, t0, startedAt, 'HTM'),
    rows,
  };
}

// ---------------------------------------------------------------------------
// E4 — structure of Cayley graphs for several generating sets
// ---------------------------------------------------------------------------
export const E4_SETS: { n: 2 | 3; generators: string[]; label: string }[] = [
  { n: 2, generators: ['U', 'R', 'F'], label: '2×2×2 ⟨U,R,F⟩ QTM' },
  { n: 2, generators: ['U', 'U2', 'R', 'R2', 'F', 'F2'], label: '2×2×2 ⟨U,R,F⟩ HTM' },
  { n: 2, generators: ['R', 'U'], label: '2×2×2 ⟨R,U⟩ QTM' },
  { n: 2, generators: ['R', 'R2', 'U', 'U2'], label: '2×2×2 ⟨R,U⟩ HTM' },
  { n: 2, generators: ['R', 'U2'], label: '2×2×2 ⟨R,U2⟩' },
  { n: 2, generators: ['R2', 'U2', 'F2'], label: '2×2×2 ⟨R2,U2,F2⟩' },
  { n: 2, generators: ['R2', 'U2'], label: '2×2×2 ⟨R2,U2⟩' },
  { n: 3, generators: ['R2', 'U2'], label: '3×3×3 ⟨R2,U2⟩' },
  { n: 3, generators: ['R', 'L'], label: '3×3×3 ⟨R,L⟩' },
  { n: 3, generators: ['R', 'U2'], label: '3×3×3 ⟨R,U2⟩' },
  { n: 3, generators: ['R2', 'U2', 'F2'], label: '3×3×3 ⟨R2,U2,F2⟩' },
  { n: 3, generators: ['U2', 'D2', 'R2', 'L2', 'F2', 'B2'], label: '3×3×3 grupo dos quadrados' },
  { n: 3, generators: ['R', 'U'], label: '3×3×3 ⟨R,U⟩ QTM' },
  { n: 3, generators: ['R', 'U', 'F'], label: '3×3×3 ⟨R,U,F⟩ QTM' },
  { n: 3, generators: ['U', 'D', 'R2', 'L2', 'F2', 'B2'], label: '3×3×3 H (Kociemba)' },
  { n: 3, generators: ['U', 'D', 'R', 'L', 'F', 'B'], label: '3×3×3 G QTM' },
  { n: 3, generators: ['U', 'U2', 'D', 'D2', 'R', 'R2', 'L', 'L2', 'F', 'F2', 'B', 'B2'], label: '3×3×3 G HTM' },
];

export function e4Cayley(p: CommonParams & { maxNodes3?: number } = {}, progress: Progress = () => {}): ExperimentOutput {
  const t0 = performance.now();
  const startedAt = new Date().toISOString();
  const maxNodes3 = p.maxNodes3 ?? (p.quick ? 50_000 : 1_000_000);
  const rows: Row[] = [];
  E4_SETS.forEach((set, i) => {
    progress(i / E4_SETS.length, set.label);
    const r = exploreCayley({ n: set.n, generators: set.generators, maxNodes: set.n === 3 ? maxNodes3 : N_STATES2 + 1, drawLimit: 0 });
    const sum = r.sphereSizes.reduce((a, b) => a + b, 0);
    rows.push({
      label: set.label,
      n: set.n,
      generators: set.generators.join(' '),
      degree: r.symmetric.length,
      order: r.order,
      complete: r.complete,
      exploredRadius: r.sphereSizes.length - 1,
      ballSize: sum,
      diameter: r.diameter,
      antipodes: r.antipodes,
      girth: r.girth,
      relator: r.relator ? r.relator.join(' ') : null,
      symRotations: r.stabilizer.rotations,
      symTotal: r.stabilizer.total,
      sphereSizes: r.sphereSizes.join(';'),
      branchingBound: r.branchingBound.join(';'),
      meanDistance: r.complete ? r3(r.sphereSizes.reduce((a, c, d) => a + c * d, 0) / sum) : null,
      timeMs: r3(r.timeMs),
    });
  });
  progress(1, 'ok');
  return {
    meta: meta('E4', 'Estrutura de grafos de Cayley de subgrupos', p, { sets: E4_SETS, note: 'inversos adicionados automaticamente; |⟨S⟩| por Schreier–Sims' }, { maxNodes3 }, t0, startedAt, 'arestas = geradores de S ∪ S⁻¹ (cada um custa 1)'),
    rows,
  };
}

export const EXPERIMENTS = {
  E0: { run: e0Validation, title: 'Validação (ordens de grupos, distribuição do 2×2×2)' },
  E1: { run: e1Growth, title: 'Crescimento do espaço de busca' },
  E2: { run: e2Algorithms, title: 'Comparação de algoritmos' },
  E3: { run: e3Heuristics, title: 'Heurísticas (2×2×2)' },
  E3b: { run: e3bCube3, title: '3×3×3: IDA* ótimo vs. duas fases' },
  E4: { run: e4Cayley, title: 'Estrutura dos grafos de Cayley' },
} as const;
export type ExperimentId = keyof typeof EXPERIMENTS;

export function toCSV(rows: Row[]): string {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

export { METRIC_MOVES };
