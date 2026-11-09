import { useEffect, useMemo, useState } from 'react';
import { ForceGraph, type FGLink, type FGNode } from '../vizgraph/ForceGraph';
import { useLab } from './lab';
import { Info, Badge } from './Info';
import { getExact2, exact2Sync } from './MathPanel';
import { encodeCubie2 } from '../search/cube2';
import { toCubie } from '../core/cubie';
import { canonicalFrame, conjugateMove } from '../core/symmetry';
import { parseMove, invertMove, formatMove } from '../core/notation';
import { auxWorker } from '../workers/client';
import { CubeNet } from './CubeNet';

export const DIST_COLORS = ['#2fd27a', '#5fd38d', '#8bd48f', '#b3d27f', '#d3c56b', '#e7ad5a', '#ef8f53', '#ec6e5a', '#dc5470', '#c0478a', '#9a46a0', '#7547ad', '#5a4aa8', '#46519c', '#3a5a8f'];
export const distColor = (d: number | undefined | null): string => (d === undefined || d === null ? '#8a8fa3' : DIST_COLORS[Math.min(d, DIST_COLORS.length - 1)]);

const ORDER_3 = '43 252 003 274 489 856 000';
const ORDER_2 = '3 674 160';

export function StateGraphView() {
  const lab = useLab();
  const g = lab.graph;
  const [tableReady, setTableReady] = useState(!!exact2Sync());
  const [bounds, setBounds] = useState<Map<string, number>>(new Map());
  const [hover, setHover] = useState<string | null>(null);
  const [labels, setLabels] = useState(true);
  const [localVer, setLocalVer] = useState(0);
  const force = (_f: (x: number) => number) => setLocalVer(g.version);

  useEffect(() => {
    if (lab.n === 2 && !tableReady) getExact2().then(() => setTableReady(true));
  }, [lab.n, tableReady]);

  // lower bounds for 3×3×3 nodes (batched in the aux worker)
  useEffect(() => {
    if (lab.n !== 3) return;
    const missing = [...g.nodes.values()].filter((nd) => !bounds.has(nd.key));
    if (!missing.length) return;
    const cubies = missing.map((nd) => toCubie(g.P, nd.state));
    let alive = true;
    auxWorker()
      .call<number[]>('bounds3', { cubies })
      .then((hs) => {
        if (!alive) return;
        setBounds((old) => {
          const m = new Map(old);
          missing.forEach((nd, i) => m.set(nd.key, hs[i]));
          return m;
        });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lab.graphVersion, localVer, lab.n, g]);

  const distOf = (key: string): number | undefined => {
    const nd = g.nodes.get(key);
    if (!nd) return undefined;
    if (lab.n === 2) {
      const t = exact2Sync();
      return t ? t[encodeCubie2(toCubie(g.P, nd.state))] : undefined;
    }
    return bounds.get(key);
  };

  const { nodes, links } = useMemo(() => {
    const path = new Set(g.path);
    const nodes: FGNode[] = [...g.nodes.values()].map((nd) => {
      const d = distOf(nd.key);
      const isCur = nd.key === g.current;
      const isSolved = d === 0;
      return {
        id: nd.key,
        color: distColor(d),
        r: isCur ? 10 : nd.onHistory ? 6.5 : 4.5,
        stroke: isCur ? 'var(--text)' : path.has(nd.key) ? '#ffd23f' : nd.visits > 1 ? '#ff5ca8' : nd.onHistory ? 'var(--accent)' : undefined,
        strokeWidth: isCur ? 3 : 2,
        label: labels ? (isCur ? 'atual' : isSolved ? 'e' : nd.visits > 1 ? `×${nd.visits}` : undefined) : undefined,
      };
    });
    const pathEdges = new Set<string>();
    for (let i = 0; i + 1 < g.path.length; i++) pathEdges.add([g.path[i], g.path[i + 1]].sort().join('|'));
    const links: FGLink[] = [...g.edges.values()].map((e) => {
      const onPath = pathEdges.has([e.a, e.b].sort().join('|'));
      return {
        source: e.a,
        target: e.b,
        color: onPath ? '#ffd23f' : e.history ? 'var(--accent)' : undefined,
        width: onPath ? 3 : e.history ? 2.2 : 1,
      };
    });
    return { nodes, links };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lab.graphVersion, localVer, bounds, tableReady, labels, g]);

  /** Physical moves realising the canonical word from the current state. */
  const goTo = (target: string) => {
    if (target === g.current) return;
    // BFS on the explored subgraph
    const adj = new Map<string, { to: string; move: string }[]>();
    for (const e of g.edges.values()) {
      if (!adj.has(e.a)) adj.set(e.a, []);
      if (!adj.has(e.b)) adj.set(e.b, []);
      adj.get(e.a)!.push({ to: e.b, move: e.move });
      adj.get(e.b)!.push({ to: e.a, move: formatMove(invertMove(parseMove(e.move))) });
    }
    const prev = new Map<string, { from: string; move: string }>();
    const q = [g.current];
    const seen = new Set(q);
    while (q.length) {
      const x = q.shift()!;
      if (x === target) break;
      for (const { to, move } of adj.get(x) ?? []) {
        if (seen.has(to)) continue;
        seen.add(to);
        prev.set(to, { from: x, move });
        q.push(to);
      }
    }
    if (!prev.has(target)) {
      lab.toast('Vértice não conectado ao estado atual no subgrafo explorado.');
      return;
    }
    const word: string[] = [];
    for (let x = target; x !== g.current; x = prev.get(x)!.from) word.push(prev.get(x)!.move);
    word.reverse();
    const { rho } = canonicalFrame(g.P, lab.state);
    lab.doAlg(word.map((w) => conjugateMove(g.P, parseMove(w), rho)));
  };

  const hoverNode = hover ? g.nodes.get(hover) : null;
  const total = lab.n === 3 ? ORDER_3 : ORDER_2;
  const realCycles = g.cycles.filter((c) => c.length > 2).slice(-4).reverse();

  return (
    <div className="panel-body">
      <div className="row between wrap gap-s">
        <div className="row gap-s wrap">
          <Badge kind="partial">visualização parcial: {g.nodes.size} de {total} vértices</Badge>
          <Info title="Grafo de estados">
            <p><b>Vértice:</b> uma configuração completa do cubo, normalizada por rotação global ({lab.n === 3 ? 'centros fixos' : 'canto DBL fixo'}). <b>Aresta:</b> um movimento ({lab.n === 3 ? '18 giros de face, HTM' : '9 giros de U, R, F, HTM'}).</p>
            <p>O grafo é <b>implícito</b>: só os vértices visitados ou expandidos são gerados. Cor = {lab.n === 2 ? 'distância exata d* ao resolvido' : 'limite inferior de d* (PDB)'}.</p>
            <p>Clique num vértice para expandir seus vizinhos; duplo clique para ir até ele (pelo subgrafo explorado). Contorno rosa = estado repetido no histórico.</p>
            <p>Este grafo é isomorfo ao grafo de Cayley Cay(G,S) pela bijeção g ↦ (resolvido)·g; aqui ele é centrado no estado atual e acompanha a sua trajetória.</p>
          </Info>
        </div>
        <div className="row gap-s">
          <button className="btn small" onClick={() => { g.expand(g.current); force((x) => x + 1); lab.toast('Vizinhos do estado atual adicionados.'); }}>Expandir atual</button>
          <button
            className="btn small"
            onClick={() => {
              g.expand(g.current);
              for (const e of [...g.edges.values()]) if (e.a === g.current || e.b === g.current) g.expand(e.a === g.current ? e.b : e.a);
              force((x) => x + 1);
            }}
          >
            Raio 2
          </button>
          <button className="btn small" onClick={() => { g.reset(lab.state); force((x) => x + 1); }}>Limpar</button>
          <label className="row gap-s small"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> rótulos</label>
        </div>
      </div>
      <ForceGraph
        nodes={nodes}
        links={links}
        height={380}
        ariaLabel="Grafo de estados explorado localmente"
        onNodeClick={(id) => { g.expand(id); force((x) => x + 1); }}
        onNodeDoubleClick={goTo}
        onHover={setHover}
      />
      <div className="row between wrap small">
        <span className="muted">
          {g.edges.size} arestas · histórico {g.history.length - 1} passos · {g.repeatedStates()} estados repetidos
        </span>
        <span className="legend">
          {DIST_COLORS.slice(0, lab.n === 2 ? 12 : 13).map((c, i) => (
            <span key={i} className="legend-swatch" style={{ background: c }} title={`d${lab.n === 3 ? ' ≥ ' : ' = '}${i}`} />
          ))}
          <span className="muted">&nbsp;{lab.n === 2 ? 'd* = 0 … 11' : 'h ≥ 0 …'}</span>
        </span>
      </div>
      {hoverNode && (
        <div className="hover-card">
          <CubeNet n={lab.n} state={hoverNode.state} />
          <div className="small mono">
            {lab.n === 2 ? 'd* = ' : 'd* ≥ '}
            {distOf(hoverNode.key) ?? '…'} · visitas: {hoverNode.visits} · {hoverNode.expanded ? 'expandido' : 'não expandido'}
          </div>
        </div>
      )}
      {lab.lastCycle && lab.lastCycle.length > 2 && (
        <div className="callout">
          <b>Ciclo fechado</b> de comprimento {lab.lastCycle.length}: a palavra <span className="mono">{lab.lastCycle.word.join(' ')}</span> é uma
          <b> relação</b> do grupo (seu produto é a identidade). Ciclos no grafo de estados ↔ relações entre geradores.
        </div>
      )}
      {realCycles.length > 1 && (
        <details className="small">
          <summary>Ciclos detectados ({g.cycles.filter((c) => c.length > 2).length})</summary>
          <ul className="mono">
            {realCycles.map((c, i) => (
              <li key={i}>
                comprimento {c.length}: {c.word.join(' ')}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
