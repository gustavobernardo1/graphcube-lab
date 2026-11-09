import { useState } from 'react';
import { solverWorker } from '../workers/client';
import { toCSV, type ExperimentOutput, type ExperimentId, type Row } from '../experiments/protocols';
import { LineChart, type Series } from './Charts';
import { Badge, Info } from './Info';

const DESCRIPTIONS: Record<ExperimentId, { title: string; question: string; measures: string; cost: string }> = {
  E0: {
    title: 'E0 · Validação contra a literatura',
    question: 'O núcleo reproduz resultados conhecidos?',
    measures: 'Ordens de 7 grupos (Schreier–Sims) e distribuição completa de distâncias do 2×2×2 em HTM e QTM, comparadas a valores publicados.',
    cost: '≈ 5 s',
  },
  E1: {
    title: 'E1 · Crescimento do espaço de busca',
    question: 'Como o esforço cresce com o comprimento L do embaralhamento e com a distância real d*?',
    measures: 'Para L = 0…20, embaralhamentos aleatórios com semente: d* (tabela exata), nós expandidos/gerados por BFS e BFS bidirecional. Distingue L (procedimento) de d* (propriedade do estado).',
    cost: 'rápido: ≈ 10 s · completo: alguns minutos',
  },
  E2: {
    title: 'E2 · Comparação de algoritmos',
    question: 'Qual o custo de BFS, bidirecional, A* e IDA* em função de d*?',
    measures: 'Estados amostrados uniformemente em cada camada {s : d*(s) = d}; tempo, nós, pico de memória (estados armazenados), sucesso e otimalidade.',
    cost: 'rápido: ≈ 2 s · completo: ≈ 1–3 min',
  },
  E3: {
    title: 'E3 · Heurísticas',
    question: 'Quanto heurísticas admissíveis mais informativas reduzem a busca?',
    measures: 'A* e IDA* com h₀, contagem de peças, PDB de orientação, PDB de permutação, máximo das PDBs e a distância exata (oráculo).',
    cost: 'rápido: ≈ 10 s · completo: vários minutos',
  },
  E3b: {
    title: 'E3b · 3×3×3: ótimo vs. duas fases',
    question: 'Quando a solução ótima é viável no 3×3×3, e quão longe dela fica o método de duas fases?',
    measures: 'IDA* (h_PDB e h_pec) em embaralhamentos curtos; duas fases nos mesmos estados e em estados uniformemente aleatórios de G.',
    cost: 'rápido: ≈ 5 s (+1,2 s de tabelas)',
  },
  E4: {
    title: 'E4 · Estrutura dos grafos de Cayley',
    question: 'Como o conjunto de geradores altera ordem, diâmetro, esferas, cintura e simetrias?',
    measures: '17 conjuntos de geradores (2×2×2 completos; 3×3×3 até o limite de vértices).',
    cost: 'rápido: ≈ 15 s · completo: alguns minutos',
  },
};

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
}

function seriesBy(rows: Row[], x: string, y: string, key: (r: Row) => string, filter: (r: Row) => boolean = () => true): Series[] {
  const groups = new Map<string, Map<number, number[]>>();
  for (const r of rows) {
    if (!filter(r) || r[x] === null || r[y] === null || r[x] === undefined) continue;
    const k = key(r);
    if (!groups.has(k)) groups.set(k, new Map());
    const g = groups.get(k)!;
    const xv = Number(r[x]);
    if (!g.has(xv)) g.set(xv, []);
    g.get(xv)!.push(Number(r[y]));
  }
  return [...groups].map(([name, g]) => ({ name, points: [...g].map(([xv, ys]) => [xv, mean(ys)] as [number, number]).sort((a, b) => a[0] - b[0]) }));
}

function SummaryTable({ rows }: { rows: Row[] }) {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (!('algorithm' in r)) continue;
    const k = `${r.algorithm}${r.heuristic && r.heuristic !== 'none' ? ' · ' + r.heuristic : ''}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  if (!groups.size) return null;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>algoritmo · heurística</th><th>execuções</th><th>sucesso</th><th>ótimas*</th><th>expandidos (média)</th><th>tempo médio (ms)</th></tr>
        </thead>
        <tbody>
          {[...groups].map(([k, rs]) => {
            const ok = rs.filter((r) => r.success);
            const opt = rs.filter((r) => r.optimal === true);
            const withOpt = rs.filter((r) => r.optimal !== undefined && r.optimal !== null);
            return (
              <tr key={k}>
                <td>{k}</td>
                <td className="num">{rs.length}</td>
                <td className="num">{((100 * ok.length) / rs.length).toFixed(0)}%</td>
                <td className="num">{withOpt.length ? `${((100 * opt.length) / withOpt.length).toFixed(0)}%` : '—'}</td>
                <td className="num">{Math.round(mean(ok.map((r) => Number(r.expanded)))).toLocaleString('pt-BR')}</td>
                <td className="num">{mean(ok.map((r) => Number(r.timeMs))).toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="small muted">* fração das soluções encontradas cujo comprimento é igual a d* (quando d* é conhecido). Médias de expandidos/tempo só sobre execuções bem-sucedidas.</div>
    </div>
  );
}

function ExperimentCharts({ out }: { out: ExperimentOutput }) {
  const rows = out.rows;
  switch (out.meta.experiment) {
    case 'E0':
      return (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>verificação</th><th>objeto</th><th>calculado</th><th>literatura</th><th>confere</th><th>ms</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}><td>{String(r.check)}</td><td>{String(r.object)}</td><td className="num mono">{String(r.computed)}</td><td className="num mono">{String(r.literature ?? '—')}</td><td>{r.match ? '✓' : '✗'}</td><td className="num">{r.timeMs ?? ''}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'E1': {
      const bfsRows = rows.filter((r) => r.algorithm === 'BFS');
      const dvsL = seriesBy(bfsRows, 'scrambleLength', 'dstar', () => 'média de d*');
      const maxL = Math.max(...bfsRows.map((r) => Number(r.scrambleLength)));
      return (
        <>
          <LineChart title="Distância real × comprimento do embaralhamento" xLabel="L (movimentos do embaralhamento)" yLabel="d* médio" series={[...dvsL, { name: 'd* = L', points: [[0, 0], [Math.min(11, maxL), Math.min(11, maxL)]], dashed: true, color: '#8a8fa3' }]} />
          <LineChart title="Nós expandidos × distância real" xLabel="d*" yLabel="expandidos (média)" logY series={seriesBy(rows, 'dstar', 'expanded', (r) => String(r.algorithm))} />
          <LineChart title="Nós expandidos × comprimento do embaralhamento" xLabel="L" yLabel="expandidos (média)" logY series={seriesBy(rows, 'scrambleLength', 'expanded', (r) => String(r.algorithm))} />
        </>
      );
    }
    case 'E2':
      return (
        <>
          <LineChart title="Nós expandidos por d*" xLabel="d*" yLabel="expandidos (média)" logY series={seriesBy(rows, 'dstar', 'expanded', (r) => String(r.algorithm), (r) => !!r.success)} />
          <LineChart title="Pico de estados armazenados (memória)" xLabel="d*" yLabel="estados" logY series={seriesBy(rows, 'dstar', 'peakStored', (r) => String(r.algorithm), (r) => !!r.success)} />
          <LineChart title="Tempo" xLabel="d*" yLabel="ms (média)" logY series={seriesBy(rows, 'dstar', 'timeMs', (r) => String(r.algorithm), (r) => !!r.success)} />
          <SummaryTable rows={rows} />
        </>
      );
    case 'E3':
      return (
        <>
          <LineChart title="IDA*: nós expandidos por heurística" xLabel="d*" yLabel="expandidos (média)" logY series={seriesBy(rows, 'dstar', 'expanded', (r) => String(r.heuristic), (r) => r.algorithm === 'IDA*' && !!r.success)} />
          <LineChart title="A*: nós expandidos por heurística" xLabel="d*" yLabel="expandidos (média)" logY series={seriesBy(rows, 'dstar', 'expanded', (r) => String(r.heuristic), (r) => r.algorithm === 'A*' && !!r.success)} />
          <SummaryTable rows={rows} />
        </>
      );
    case 'E3b': {
      const uni = rows.filter((r) => r.kind === 'uniform-random');
      const hist = new Map<string, Map<number, number>>();
      for (const r of uni) {
        const k = String(r.algorithm);
        if (!hist.has(k)) hist.set(k, new Map());
        const h = hist.get(k)!;
        h.set(Number(r.length), (h.get(Number(r.length)) ?? 0) + 1);
      }
      return (
        <>
          <LineChart title="3×3×3: nós expandidos por IDA* (embaralhamentos curtos)" xLabel="d* (encontrado por IDA*)" yLabel="expandidos (média)" logY series={seriesBy(rows, 'dstar', 'expanded', (r) => `IDA* ${r.heuristic}`, (r) => r.algorithm === 'IDA*' && !!r.success)} />
          <LineChart title="Comprimento: ótimo vs. duas fases" xLabel="d*" yLabel="comprimento (média)" series={seriesBy(rows, 'dstar', 'length', (r) => String(r.algorithm), (r) => r.kind === 'scramble' && !!r.success && (r.algorithm !== 'IDA*' || r.heuristic === 'pdb'))} />
          {uni.length > 0 && <LineChart bars title="Estados uniformes de G: comprimento das soluções de duas fases" xLabel="comprimento (HTM)" yLabel="estados" series={[...hist].map(([name, h]) => ({ name, points: [...h] as [number, number][] }))} />}
          <SummaryTable rows={rows} />
        </>
      );
    }
    case 'E4':
      return (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>conjunto</th><th>|⟨S⟩|</th><th>grau</th><th>completo</th><th>diâmetro</th><th>dist. média</th><th>cintura</th><th>simetrias</th><th>esferas</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{String(r.label)}</td><td className="num mono">{String(r.order)}</td><td className="num">{String(r.degree)}</td>
                  <td>{r.complete ? 'sim' : `raio ${r.exploredRadius}`}</td><td className="num">{r.diameter ?? '—'}</td><td className="num">{r.meanDistance ?? '—'}</td>
                  <td className="num">{String(r.girth ?? '—')}</td><td className="num">{String(r.symTotal)}</td>
                  <td className="mono small">{String(r.sphereSizes).split(';').slice(0, 12).join(' ')}{String(r.sphereSizes).split(';').length > 12 ? ' …' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
  return null;
}

function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function InvestigatePanel() {
  const [sel, setSel] = useState<ExperimentId>('E2');
  const [quick, setQuick] = useState(true);
  const [seed, setSeed] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ f: number; msg: string } | null>(null);
  const [results, setResults] = useState<Partial<Record<string, ExperimentOutput>>>({});
  const [err, setErr] = useState<string | null>(null);
  const out = results[sel];

  const run = async () => {
    setBusy(true);
    setErr(null);
    setProgress({ f: 0, msg: 'iniciando' });
    try {
      const o = await solverWorker().call<ExperimentOutput>('experiment', { id: sel, params: { quick, ...(seed ? { seed } : {}) } }, setProgress);
      setResults((r) => ({ ...r, [sel]: o }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const load = async (file: File) => {
    try {
      const o = JSON.parse(await file.text()) as ExperimentOutput;
      if (!o.meta?.experiment || !Array.isArray(o.rows)) throw new Error('arquivo não é uma saída de experimento do GraphCube Lab');
      setResults((r) => ({ ...r, [o.meta.experiment]: o }));
      setSel(o.meta.experiment as ExperimentId);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const d = DESCRIPTIONS[sel];
  return (
    <div className="investigate">
      <aside className="exp-list" aria-label="Experimentos">
        {(Object.keys(DESCRIPTIONS) as ExperimentId[]).map((id) => (
          <button key={id} className={`exp-item ${sel === id ? 'on' : ''}`} onClick={() => setSel(id)} aria-pressed={sel === id}>
            <span className="exp-title">{DESCRIPTIONS[id].title}</span>
            <span className="small muted">{DESCRIPTIONS[id].question}</span>
            {results[id] && <span className="small accent">✓ {results[id]!.rows.length} linhas</span>}
          </button>
        ))}
        <label className="btn ghost file-btn">
          Carregar JSON da CLI…
          <input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        </label>
      </aside>
      <section className="card exp-main">
        <h2>{d.title}</h2>
        <p className="muted">{d.measures}</p>
        <div className="row gap wrap">
          <label className="row gap-s"><input type="radio" checked={quick} onChange={() => setQuick(true)} /> rápido</label>
          <label className="row gap-s"><input type="radio" checked={!quick} onChange={() => setQuick(false)} /> completo (= CLI)</label>
          <label className="row gap-s">semente <input className="input mono seed" value={seed} placeholder="padrão" onChange={(e) => setSeed(e.target.value)} /></label>
          <button className="btn primary" onClick={run} disabled={busy}>{busy ? 'Executando…' : 'Executar no navegador'}</button>
          {busy && <button className="btn" onClick={() => { solverWorker().cancel(); setBusy(false); setProgress(null); }}>Cancelar</button>}
          <span className="small muted">custo: {d.cost}</span>
          <Info title="Reprodutibilidade">
            <p>Cada execução registra experimento, parâmetros, semente, convenção de contagem (HTM/QTM), limites computacionais, versão do software e ambiente. Os mesmos protocolos rodam na CLI: <code>npm run experiments -- --only {sel}{seed ? ` --seed ${seed}` : ''}{quick ? ' --quick' : ''}</code>.</p>
            <p>Sem semente explícita, usa-se a semente padrão do protocolo (a mesma dos resultados do artigo, ex.: "e2"); uma semente digitada substitui a do experimento.</p>
          </Info>
        </div>
        {progress && (
          <div className="progress" role="progressbar" aria-valuenow={Math.round(progress.f * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="bar" style={{ width: `${progress.f * 100}%` }} />
            <span className="small">{Math.round(progress.f * 100)}% — {progress.msg}</span>
          </div>
        )}
        {err && <div className="error">{err}</div>}
        {out && (
          <>
            <div className="meta small mono">
              <Badge kind="info">{out.meta.experiment}</Badge> v{out.meta.softwareVersion} · commit {out.meta.gitCommit ?? 'n/d'} · semente {String(out.meta.seed)} · {out.meta.moveCountConvention} · {out.meta.durationMs} ms · {out.meta.startedAt}
              <div className="muted">limites: {JSON.stringify(out.meta.limits)} · ambiente: {out.meta.environment}</div>
            </div>
            <div className="row gap-s">
              <button className="btn small" onClick={() => download(`${out.meta.experiment}.json`, JSON.stringify(out, null, 1), 'application/json')}>Exportar JSON</button>
              <button className="btn small" onClick={() => download(`${out.meta.experiment}.csv`, toCSV(out.rows), 'text/csv')}>Exportar CSV</button>
            </div>
            <ExperimentCharts out={out} />
          </>
        )}
        {!out && !busy && <p className="muted">Nenhum resultado ainda. Execute o experimento ou carregue um JSON produzido pela CLI (<code>experiments/results/</code>).</p>}
      </section>
    </div>
  );
}
