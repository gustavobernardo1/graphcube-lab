import { useEffect, useState } from 'react';
import { useLab } from './lab';
import { Info, Badge } from './Info';
import { getPuzzle } from '../core/geometry';
import { canonicalFrame, fromCanonicalFrame } from '../core/symmetry';
import { toCubie } from '../core/cubie';
import { encodeCubie2, HEURISTICS2, type Metric } from '../search/cube2';
import { HEURISTICS3 } from '../search/cube3';
import { parseMove, formatAlg, applyAlg, type Move } from '../core/notation';
import { equals } from '../core/perm';
import { effectiveBranchingFactor } from '../search/algorithms';
import type { SearchResult } from '../search/types';
import type { AlgorithmId } from '../workers/solver.worker';
import { solverWorker } from '../workers/client';
import { SearchReplay } from './SearchReplay';
import { LineChart } from './Charts';

interface SolveOutput {
  result: SearchResult;
  exactDistance?: number;
  lowerBound?: number;
  twoPhase?: { phase1: string[]; phase2: string[]; improvements: { length: number; atMs: number }[] };
}

const ALGOS: Record<2 | 3, { id: AlgorithmId; label: string; informed: boolean; optimal: boolean }[]> = {
  2: [
    { id: 'bfs', label: 'BFS', informed: false, optimal: true },
    { id: 'bibfs', label: 'BFS bidirecional', informed: false, optimal: true },
    { id: 'astar', label: 'A*', informed: true, optimal: true },
    { id: 'idastar', label: 'IDA*', informed: true, optimal: true },
    { id: 'table', label: 'Tabela exata (d*)', informed: false, optimal: true },
  ],
  3: [
    { id: 'twophase', label: 'Duas fases (Kociemba)', informed: true, optimal: false },
    { id: 'idastar', label: 'IDA*', informed: true, optimal: true },
    { id: 'astar', label: 'A*', informed: true, optimal: true },
    { id: 'bibfs', label: 'BFS bidirecional', informed: false, optimal: true },
    { id: 'bfs', label: 'BFS', informed: false, optimal: true },
  ],
};

export function SolvePanel() {
  const lab = useLab();
  const P = getPuzzle(lab.n);
  const [algo, setAlgo] = useState<AlgorithmId>(lab.n === 2 ? 'astar' : 'twophase');
  const [heur, setHeur] = useState<string>('pdb-max');
  const [heur3, setHeur3] = useState<string>('pdb');
  const [metric, setMetric] = useState<Metric>('HTM');
  const [maxNodes, setMaxNodes] = useState(2_000_000);
  const [timeLimit, setTimeLimit] = useState(30);
  const [traceLimit, setTraceLimit] = useState(2500);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<(SolveOutput & { moves: Move[]; n: 2 | 3; startState: Uint8Array }) | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const algos = ALGOS[lab.n];
  useEffect(() => {
    setAlgo(lab.n === 2 ? 'astar' : 'twophase');
    setOut(null);
  }, [lab.n]);
  const current = algos.find((a) => a.id === algo) ?? algos[0];

  const run = async () => {
    setBusy(true);
    setErr(null);
    setOut(null);
    try {
      const { rho, t } = canonicalFrame(P, lab.state);
      const c = toCubie(P, t);
      const payload =
        lab.n === 2
          ? { n: 2, algorithm: current.id, heuristic: heur, metric, index: encodeCubie2(c), limits: { maxNodes, timeLimitMs: timeLimit * 1000, traceLimit } }
          : {
              n: 3, algorithm: current.id, heuristic: heur3,
              cubie: { cp: [...c.cp], co: [...c.co], ep: [...c.ep], eo: [...c.eo] },
              limits: { maxNodes, timeLimitMs: timeLimit * 1000, traceLimit },
              twoPhase: { maxLength: 20, timeLimitMs: Math.min(timeLimit, 5) * 1000 },
            };
      const r = await solverWorker().call<SolveOutput>('solve', payload);
      const names = r.result.solutionNames ?? [];
      const moves = fromCanonicalFrame(P, rho, names.map(parseMove));
      setOut({ ...r, moves, n: lab.n, startState: lab.state });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const r = out?.result;
  const stale = !!out && (out.n !== lab.n || !equals(out.startState, lab.state));
  const ebf = r && r.success && r.length ? effectiveBranchingFactor(r.generated, r.length) : null;
  return (
    <div className="panel-body">
      <div className="row gap wrap">
        <label className="field">
          <span>Algoritmo</span>
          <select className="input" value={current.id} onChange={(e) => setAlgo(e.target.value as AlgorithmId)}>
            {algos.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        {current.informed && current.id !== 'twophase' && (
          <label className="field">
            <span>Heurística</span>
            {lab.n === 2 ? (
              <select className="input" value={heur} onChange={(e) => setHeur(e.target.value)}>
                {HEURISTICS2.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
              </select>
            ) : (
              <select className="input" value={heur3} onChange={(e) => setHeur3(e.target.value)}>
                {HEURISTICS3.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
              </select>
            )}
          </label>
        )}
        {lab.n === 2 && (
          <label className="field">
            <span>Métrica</span>
            <select className="input" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
              <option value="HTM">HTM (meia-volta = 1)</option>
              <option value="QTM">QTM (só quartos)</option>
            </select>
          </label>
        )}
        <label className="field"><span>Máx. nós</span><input className="input num" type="number" step={100000} min={1000} value={maxNodes} onChange={(e) => setMaxNodes(Number(e.target.value))} /></label>
        <label className="field"><span>Tempo (s)</span><input className="input num" type="number" min={1} max={600} value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} /></label>
        <label className="field"><span>Eventos no log</span><input className="input num" type="number" min={0} max={20000} step={500} value={traceLimit} onChange={(e) => setTraceLimit(Number(e.target.value))} /></label>
      </div>
      <div className="row gap wrap">
        <button className="btn primary" onClick={run} disabled={busy}>{busy ? 'Buscando…' : 'Resolver estado atual'}</button>
        {busy && <button className="btn" onClick={() => { solverWorker().cancel(); setBusy(false); }}>Cancelar</button>}
        <span className="small muted">
          {current.optimal ? <Badge kind="exact">garante caminho mínimo{current.informed && current.id !== 'table' ? ' (h admissível)' : ''}</Badge> : <Badge kind="warn">solução válida, não necessariamente mínima</Badge>}
        </span>
      </div>
      {lab.n === 3 && (current.id === 'bfs' || current.id === 'bibfs' || current.id === 'astar') && (
        <div className="callout warn small">No 3×3×3, BFS e A* armazenam todos os estados gerados: terminam apenas para estados próximos do resolvido (d* ≲ 6–8). O limite de nós é respeitado e a falha é reportada.</div>
      )}
      <FormulaCard algo={current.id} n={lab.n} />
      {err && <div className="error">{err}</div>}
      {r && (
        <div className="result">
          {stale && <div className="callout warn small">O cubo mudou desde esta busca; a solução refere-se ao estado anterior.</div>}
          <div className="kv-grid">
            <div className="kv"><span className="k">Resultado</span><span className="v">{r.success ? <Badge kind="exact">resolvido</Badge> : <Badge kind="warn">{r.status === 'node-limit' ? 'limite de nós' : r.status === 'time-limit' ? 'limite de tempo' : 'falhou'}</Badge>}</span></div>
            <div className="kv"><span className="k">Comprimento</span><span className="v mono">{r.length ?? '—'} {lab.n === 2 ? (metric === 'HTM' ? 'HTM' : 'QTM') : 'HTM'}</span></div>
            {out?.exactDistance !== undefined && (
              <div className="kv"><span className="k">d* (tabela exata)</span><span className="v mono">{out.exactDistance} {r.length !== null && (r.length === out.exactDistance ? <Badge kind="exact">ótima ✓</Badge> : <Badge kind="warn">não ótima</Badge>)}</span></div>
            )}
            {out?.lowerBound !== undefined && <div className="kv"><span className="k">limite inferior h_PDB</span><span className="v mono">{out.lowerBound}</span></div>}
            <div className="kv"><span className="k">Expandidos</span><span className="v mono">{r.expanded.toLocaleString('pt-BR')}</span></div>
            <div className="kv"><span className="k">Gerados</span><span className="v mono">{r.generated.toLocaleString('pt-BR')}</span></div>
            <div className="kv"><span className="k">Pico armazenado</span><span className="v mono">{r.peakStored.toLocaleString('pt-BR')}</span></div>
            <div className="kv"><span className="k">Tempo</span><span className="v mono">{r.timeMs.toFixed(1)} ms</span></div>
            {ebf !== null && Number.isFinite(ebf) && <div className="kv"><span className="k">Fator de ramificação efetivo b*</span><span className="v mono">{ebf.toFixed(3)}</span></div>}
          </div>
          {out?.twoPhase && (
            <div className="small mono">
              fase 1 ({out.twoPhase.phase1.length}): {out.twoPhase.phase1.join(' ')} · fase 2 ({out.twoPhase.phase2.length}): {out.twoPhase.phase2.join(' ')}
              <div className="muted">melhorias: {out.twoPhase.improvements.map((i) => `${i.length} @ ${Math.round(i.atMs)} ms`).join(' → ')}</div>
            </div>
          )}
          {r.success && (
            <div className="solution">
              <div className="mono">{out!.moves.length ? formatAlg(out!.moves) : '(já resolvido)'}</div>
              <div className="row gap-s">
                <button className="btn primary" disabled={!!stale || !out!.moves.length} onClick={() => lab.doAlg(out!.moves)}>Aplicar solução</button>
                <button className="btn" disabled={!!stale || !out!.moves.length} onClick={() => {
                  const first = out!.moves[0];
                  const after = applyAlg(P, lab.state, [first]);
                  lab.doAlg([first]);
                  setOut((o) => (o ? { ...o, moves: o.moves.slice(1), startState: after } : o));
                }}>Próximo movimento</button>
              </div>
              {out!.moves.length > 0 && <div className="small muted">Movimentos convertidos para o referencial físico atual (conjugação pela rotação ρ do referencial canônico).</div>}
            </div>
          )}
          {r.iterations && r.iterations.length > 1 && (
            <LineChart title="IDA*: nós expandidos por iteração" xLabel="limiar f" yLabel="expandidos" logY series={[{ name: 'expandidos', points: r.iterations.map((it) => [it.bound, Math.max(1, it.expanded)]) }]} height={190} />
          )}
          {r.trace && r.trace.length > 0 && (
            <SearchReplay n={lab.n} trace={r.trace} truncated={!!r.traceTruncated} pathKeys={r.pathKeys} algorithm={r.algorithm} totalExpanded={r.expanded} />
          )}
        </div>
      )}
    </div>
  );
}

function FormulaCard({ algo, n }: { algo: AlgorithmId; n: 2 | 3 }) {
  if (algo === 'astar' || algo === 'idastar')
    return (
      <div className="formula">
        <div className="f-big">f(n) = <span className="g">g(n)</span> + <span className="h">h(n)</span></div>
        <div className="small">
          <span className="g">g(n)</span>: movimentos já gastos do início até n · <span className="h">h(n)</span>: estimativa inferior dos movimentos restantes (admissível: h ≤ d*) ·
          {algo === 'astar' ? ' A* expande sempre o nó de menor f; com h consistente nunca reexpande e a primeira solução é mínima.' : ' IDA* faz buscas em profundidade limitadas por f ≤ limiar, aumentando o limiar para o menor f que o excedeu; usa memória O(d).'}
        </div>
        <Info title="Heurísticas disponíveis">
          {n === 2 ? (
            <ul>{HEURISTICS2.map((h) => <li key={h.id}><b>{h.label}</b>: {h.description}</li>)}</ul>
          ) : (
            <ul>{HEURISTICS3.map((h) => <li key={h.id}><b>{h.label}</b>: {h.description}</li>)}</ul>
          )}
          <p>Uma PDB guarda distâncias exatas num quociente do grafo (ex.: só as orientações). Como cada movimento do cubo induz um movimento do quociente, a distância no quociente nunca excede a distância real: a heurística é admissível e consistente.</p>
        </Info>
      </div>
    );
  if (algo === 'twophase')
    return (
      <div className="formula small">
        Fase 1: IDA* até o subgrupo H = ⟨U, D, R2, L2, F2, B2⟩ (orientações corretas e arestas do meio na camada do meio). Fase 2: IDA* dentro de H. Soluções de fase 1 são enumeradas por comprimento crescente enquanto houver tempo, guardando a melhor solução total.
      </div>
    );
  if (algo === 'bibfs')
    return <div className="formula small">Duas BFS — a partir do estado inicial e do resolvido — expandindo sempre a fronteira menor; termina ao completar a camada em que as fronteiras se encontram (garante mínimo). Custo ≈ O(b^(d/2)) em vez de O(b^d).</div>;
  if (algo === 'table') return <div className="formula small">Lê d*(s) na tabela de distâncias de todos os 3 674 160 estados (BFS completa a partir do resolvido) e desce escolhendo a cada passo um vizinho com d* − 1.</div>;
  return <div className="formula small">Explora o grafo por camadas de distância crescente a partir do estado inicial, com detecção de repetidos; a primeira vez que encontra o resolvido, o caminho é mínimo.</div>;
}
