import { useMemo, useState } from 'react';
import { useLab } from './lab';
import { Info, Badge } from './Info';
import { ForceGraph, type FGLink, type FGNode } from '../vizgraph/ForceGraph';
import { LineChart, SERIES_COLORS } from './Charts';
import { distColor } from './StateGraphView';
import { solverWorker } from '../workers/client';
import type { CayleyReport } from '../graph/cayley';

const PRESETS: Record<2 | 3, { label: string; gens: string[] }[]> = {
  3: [
    { label: '⟨R,U⟩', gens: ['R', 'U'] },
    { label: '⟨R,U,F⟩', gens: ['R', 'U', 'F'] },
    { label: '⟨R2,U2⟩', gens: ['R2', 'U2'] },
    { label: '⟨R,L⟩', gens: ['R', 'L'] },
    { label: '⟨R,U2⟩', gens: ['R', 'U2'] },
    { label: 'quadrados', gens: ['U2', 'D2', 'R2', 'L2', 'F2', 'B2'] },
    { label: 'H (Kociemba)', gens: ['U', 'D', 'R2', 'L2', 'F2', 'B2'] },
    { label: 'G (QTM)', gens: ['U', 'D', 'R', 'L', 'F', 'B'] },
  ],
  2: [
    { label: '⟨R,U⟩', gens: ['R', 'U'] },
    { label: '⟨R2,U2⟩', gens: ['R2', 'U2'] },
    { label: '⟨R,U2⟩', gens: ['R', 'U2'] },
    { label: '⟨R2,U2,F2⟩', gens: ['R2', 'U2', 'F2'] },
    { label: 'G₂ (QTM)', gens: ['U', 'R', 'F'] },
    { label: 'G₂ (HTM)', gens: ['U', 'U2', 'R', 'R2', 'F', 'F2'] },
  ],
};

const fmtBig = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function CayleyView() {
  const lab = useLab();
  const all = lab.n === 3 ? ['U', 'U2', 'D', 'D2', 'R', 'R2', 'L', 'L2', 'F', 'F2', 'B', 'B2'] : ['U', 'U2', 'R', 'R2', 'F', 'F2'];
  const [gens, setGens] = useState<string[]>(['R', 'U']);
  const [radius, setRadius] = useState(lab.n === 3 ? 7 : 30);
  const [drawLimit, setDrawLimit] = useState(400);
  const [report, setReport] = useState<CayleyReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = gens.filter((g) => all.includes(g));

  const run = async (g = valid) => {
    if (!g.length) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await solverWorker().call<CayleyReport>('cayley', { n: lab.n, generators: g, maxRadius: radius, maxNodes: lab.n === 3 ? 600_000 : 3_700_000, drawLimit });
      setReport(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const graph = useMemo(() => {
    if (!report || report.n !== lab.n) return { nodes: [] as FGNode[], links: [] as FGLink[] };
    const nodes: FGNode[] = report.draw.nodes.map((nd) => ({ id: String(nd.id), color: distColor(nd.d), r: nd.id === 0 ? 8 : 4, stroke: nd.id === 0 ? 'var(--text)' : undefined, label: nd.id === 0 ? 'e' : undefined }));
    const genColor = (g: number) => SERIES_COLORS[g % SERIES_COLORS.length];
    // generator index in the symmetric set; a generator and its inverse share a colour
    const base = report.symmetric.map((s) => s.replace("'", ''));
    const uniq = [...new Set(base)];
    const links: FGLink[] = report.draw.edges.map((e) => ({ source: String(e.a), target: String(e.b), color: genColor(uniq.indexOf(base[e.g])), width: 1.3 }));
    return { nodes, links };
  }, [report, lab.n]);

  const spheres = report?.sphereSizes ?? [];
  return (
    <div className="panel-body">
      <div className="row gap-s wrap">
        <span className="k">Geradores S</span>
        <Info title="Grafo de Cayley">
          <p>Cay(⟨S⟩, S∪S⁻¹): vértices = elementos do subgrupo gerado por S; aresta g — g·s para cada gerador s (os inversos são incluídos automaticamente, tornando o grafo não orientado).</p>
          <p>Todo grafo de Cayley é <b>vértice-transitivo</b>: a vizinhança de qualquer vértice é isomorfa à da identidade e. Por isso a cintura medida a partir de e é a cintura do grafo, e os ciclos por e correspondem a <b>relações</b> entre geradores.</p>
          <p>|⟨S⟩| é calculado exatamente pelo algoritmo de Schreier–Sims. As esferas |S(r)| são exatas para os raios totalmente explorados; diâmetro e distribuição de distâncias só são exatos se a BFS terminar.</p>
        </Info>
      </div>
      <div className="chips" role="group" aria-label="Escolha dos geradores">
        {all.map((g) => (
          <button key={g} className={`chip ${valid.includes(g) ? 'on' : ''}`} aria-pressed={valid.includes(g)} onClick={() => setGens(valid.includes(g) ? valid.filter((x) => x !== g) : [...valid, g])}>
            {g}
          </button>
        ))}
      </div>
      <div className="row gap-s wrap">
        {PRESETS[lab.n].map((p) => (
          <button key={p.label} className="btn small ghost" onClick={() => { setGens(p.gens); run(p.gens); }}>{p.label}</button>
        ))}
      </div>
      <div className="row gap wrap">
        <label className="row gap-s small">raio máx. <input className="input num" type="number" min={1} max={60} value={radius} onChange={(e) => setRadius(Number(e.target.value))} /></label>
        <label className="row gap-s small">vértices desenhados <input className="input num" type="number" min={10} max={2000} step={50} value={drawLimit} onChange={(e) => setDrawLimit(Number(e.target.value))} /></label>
        <button className="btn primary" disabled={busy || !valid.length} onClick={() => run()}>{busy ? 'Calculando…' : 'Explorar'}</button>
        {busy && <button className="btn" onClick={() => { solverWorker().cancel(); setBusy(false); }}>Cancelar</button>}
      </div>
      {err && <div className="error">{err}</div>}
      {report && report.n === lab.n && (
        <>
          <div className="kv-grid">
            <div className="kv"><span className="k">|⟨S⟩| (Schreier–Sims)</span><span className="v mono">{fmtBig(report.order)} <Badge kind="exact">exato</Badge></span></div>
            <div className="kv"><span className="k">Grau |S∪S⁻¹|</span><span className="v mono">{report.symmetric.length} ({report.symmetric.join(' ')})</span></div>
            <div className="kv">
              <span className="k">Explorado</span>
              <span className="v mono">
                {fmtBig(String(report.ballSize))} vértices, raio {spheres.length - 1}{' '}
                {report.complete ? <Badge kind="exact">grafo completo</Badge> : <Badge kind="partial">bola parcial B(e,{spheres.length - 1})</Badge>}
              </span>
            </div>
            <div className="kv"><span className="k">Diâmetro</span><span className="v mono">{report.diameter ?? `> ${spheres.length - 1} (desconhecido)`}{report.antipodes !== null && ` · ${report.antipodes} antípodas`}</span></div>
            <div className="kv"><span className="k">Cintura (girth)</span><span className="v mono">{report.girth ?? `> ${2 * (spheres.length - 1)}`}{report.relator && <> · relação <span className="accent">{report.relator.join(' ')}</span> = e</>}</span></div>
            <div className="kv">
              <span className="k">
                Simetrias que preservam S{' '}
                <Info title="Simetrias">
                  <p>Número de simetrias do cubo (24 rotações; 48 incluindo reflexões) cuja conjugação preserva S∪S⁻¹. Cada uma induz um automorfismo do grafo que fixa e. Somando a vértice-transitividade, o grupo de automorfismos tem ordem ≥ |⟨S⟩| × este número (quando a ação é fiel).</p>
                </Info>
              </span>
              <span className="v mono">{report.stabilizer.rotations} rotações · {report.stabilizer.total} com reflexões</span>
            </div>
          </div>
          <LineChart
            title="Crescimento das esferas |S(r)|"
            xLabel="raio r"
            yLabel="vértices"
            logY
            series={[
              { name: '|S(r)| (exato)', points: spheres.map((s, r) => [r, s]) },
              { name: 'cota |S|(|S|−1)^(r−1)', points: report.branchingBound.map((s, r) => [r, s]), dashed: true, color: '#8a8fa3' },
            ]}
          />
          <div className="row between small">
            <span className="muted">Desenho: {report.draw.nodes.length} vértices (cor = distância a e; aresta = gerador)</span>
            {report.draw.truncated && <Badge kind="partial">visualização parcial</Badge>}
          </div>
          <ForceGraph nodes={graph.nodes} links={graph.links} height={360} ariaLabel="Bola do grafo de Cayley em torno da identidade" charge={-30} linkDistance={18} />
          <div className="small muted">Tempo: {Math.round(report.timeMs)} ms (Web Worker).</div>
        </>
      )}
    </div>
  );
}
