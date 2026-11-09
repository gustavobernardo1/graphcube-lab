import { useEffect, useMemo, useState } from 'react';
import { ForceGraph, type FGLink, type FGNode } from '../vizgraph/ForceGraph';
import type { SearchEvent, Key } from '../search/types';
import { distColor } from './StateGraphView';
import { CubeNet } from './CubeNet';
import { faceletsFromIndex2 } from '../search/cube2';
import { toFacelet } from '../core/cubie';
import { getPuzzle } from '../core/geometry';
import { Badge } from './Info';

interface NodeInfo {
  g: number;
  h?: number;
  f?: number;
  expanded: number;
  side?: 'f' | 'b';
  order: number;
}

export function decodeKey(n: 2 | 3, id: string): Uint8Array {
  if (n === 2) return faceletsFromIndex2(Number(id));
  const c = Array.from(id, (ch) => ch.charCodeAt(0));
  return toFacelet(getPuzzle(3), { cp: Uint8Array.from(c.slice(0, 8)), co: Uint8Array.from(c.slice(8, 16)), ep: Uint8Array.from(c.slice(16, 28)), eo: Uint8Array.from(c.slice(28, 40)) });
}

const sk = (k: Key) => String(k);

export function SearchReplay({ n, trace, truncated, pathKeys, algorithm, totalExpanded }: { n: 2 | 3; trace: SearchEvent[]; truncated: boolean; pathKeys?: Key[]; algorithm: string; totalExpanded: number }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(12);
  const [colorBy, setColorBy] = useState<'state' | 'f' | 'g'>('state');
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    setStep(0);
    setPlaying(true);
  }, [trace]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setStep((s) => {
        const next = Math.min(trace.length, s + rate);
        if (next >= trace.length) setPlaying(false);
        return next;
      });
    }, 60);
    return () => window.clearInterval(id);
  }, [playing, rate, trace.length]);

  const built = useMemo(() => {
    const nodes = new Map<string, NodeInfo>();
    const edges = new Map<string, { a: string; b: string; side?: 'f' | 'b' }>();
    let bound: number | null = null;
    let last: SearchEvent | null = null;
    let expandedCount = 0;
    let meet: string | null = null;
    for (let i = 0; i < step; i++) {
      const e = trace[i];
      last = e;
      if (e.t === 'discover') {
        const id = sk(e.id);
        const ex = nodes.get(id);
        if (!ex) nodes.set(id, { g: e.g, h: e.h, f: e.h !== undefined ? e.g + e.h : undefined, expanded: 0, side: e.side, order: nodes.size });
        else if (e.g < ex.g) ex.g = e.g;
        if (e.parent !== null) {
          const p = sk(e.parent);
          const ek = p < id ? p + '|' + id : id + '|' + p;
          if (!edges.has(ek)) edges.set(ek, { a: p, b: id, side: e.side });
        }
      } else if (e.t === 'expand') {
        const id = sk(e.id);
        const nd = nodes.get(id) ?? { g: e.g, expanded: 0, order: nodes.size };
        nd.expanded++;
        nd.h = e.h ?? nd.h;
        nd.f = e.f ?? nd.f;
        nodes.set(id, nd);
        expandedCount++;
      } else if (e.t === 'bound') bound = e.bound;
      else if (e.t === 'meet') meet = sk(e.id);
    }
    return { nodes, edges, bound, last, expandedCount, meet };
  }, [trace, step]);

  const done = step >= trace.length;
  const path = useMemo(() => new Set(done && pathKeys ? pathKeys.map(sk) : []), [done, pathKeys]);
  const startId = trace.length && trace[0].t === 'discover' ? sk(trace[0].id) : null;

  const { nodes, links } = useMemo(() => {
    const nodes: FGNode[] = [];
    for (const [id, nd] of built.nodes) {
      const frontier = nd.expanded === 0;
      let color: string;
      if (path.has(id)) color = '#2fd27a';
      else if (colorBy === 'f' && nd.f !== undefined) color = distColor(nd.f);
      else if (colorBy === 'g') color = distColor(nd.g);
      else color = frontier ? '#ffb547' : nd.side === 'b' ? '#2bb3c0' : '#7c5cff';
      nodes.push({
        id,
        color,
        r: id === startId ? 8 : path.has(id) ? 6 : frontier ? 3.2 : 4.2,
        stroke: id === startId ? 'var(--text)' : id === built.meet ? '#ff5ca8' : nd.expanded > 1 ? '#ffd23f' : undefined,
        label: id === startId ? 'início' : undefined,
      });
    }
    const links: FGLink[] = [...built.edges.values()].map((e) => ({
      source: e.a,
      target: e.b,
      color: path.has(e.a) && path.has(e.b) ? '#2fd27a' : undefined,
      width: path.has(e.a) && path.has(e.b) ? 3 : 0.8,
    }));
    return { nodes, links };
  }, [built, path, colorBy, startId]);

  const frontierSize = [...built.nodes.values()].filter((x) => x.expanded === 0).length;
  const hoverInfo = hover ? built.nodes.get(hover) : null;
  const ev = built.last;
  const isIda = algorithm.startsWith('IDA');
  return (
    <div className="replay">
      <div className="row between wrap gap-s">
        <div className="row gap-s wrap">
          <Badge kind={truncated ? 'partial' : 'exact'}>{truncated ? `log truncado: ${trace.length} eventos` : `log completo: ${trace.length} eventos`}</Badge>
          <span className="small muted">replay do registro real da execução ({totalExpanded} expansões no total)</span>
        </div>
        <label className="row gap-s small">
          cor
          <select className="input" value={colorBy} onChange={(e) => setColorBy(e.target.value as 'state')}>
            <option value="state">estado da busca</option>
            <option value="g">g (profundidade)</option>
            <option value="f">f = g + h</option>
          </select>
        </label>
      </div>
      <ForceGraph nodes={nodes} links={links} height={340} ariaLabel="Replay da árvore/grafo de busca" onHover={setHover} charge={-25} linkDistance={16} />
      <div className="row gap-s wrap replay-controls">
        <button className="btn small" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pausar' : 'Reproduzir'}>{playing ? '❚❚' : '▶'}</button>
        <button className="btn small" onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }} aria-label="Evento anterior">◀ 1</button>
        <button className="btn small" onClick={() => { setPlaying(false); setStep((s) => Math.min(trace.length, s + 1)); }} aria-label="Próximo evento">1 ▶</button>
        <input type="range" className="grow" min={0} max={trace.length} value={step} onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }} aria-label="Posição no log de eventos" />
        <span className="mono small">{step}/{trace.length}</span>
        <label className="row gap-s small">ritmo <input type="range" min={1} max={80} value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Eventos por quadro" /></label>
      </div>
      <div className="legend-row small">
        <span><i className="dot" style={{ background: '#7c5cff' }} /> expandido{algorithm.includes('bidirecional') && ' (frente)'}</span>
        {algorithm.includes('bidirecional') && <span><i className="dot" style={{ background: '#2bb3c0' }} /> expandido (trás)</span>}
        <span><i className="dot" style={{ background: '#ffb547' }} /> fronteira (descoberto, não expandido)</span>
        <span><i className="dot" style={{ background: '#2fd27a' }} /> caminho encontrado</span>
        {isIda && <span><i className="dot ring" style={{ borderColor: '#ffd23f' }} /> reexpandido (outra iteração)</span>}
      </div>
      <div className="kv-grid small">
        <div className="kv"><span className="k">descobertos (no replay)</span><span className="v mono">{built.nodes.size}</span></div>
        <div className="kv"><span className="k">expandidos</span><span className="v mono">{built.expandedCount}</span></div>
        <div className="kv"><span className="k">fronteira</span><span className="v mono">{frontierSize}</span></div>
        {built.bound !== null && <div className="kv"><span className="k">limiar f (iteração IDA*)</span><span className="v mono">{built.bound}</span></div>}
        <div className="kv">
          <span className="k">evento atual</span>
          <span className="v mono">
            {ev ? (ev.t === 'expand' ? `expande g=${ev.g}${ev.h !== undefined ? ` h=${ev.h} f=${ev.f}` : ''}` : ev.t === 'discover' ? `descobre g=${ev.g}${ev.h !== undefined ? ` h=${ev.h}` : ''}` : ev.t === 'bound' ? `novo limiar ${ev.bound}` : ev.t === 'meet' ? 'fronteiras se encontram' : 'objetivo alcançado') : '—'}
          </span>
        </div>
      </div>
      {hoverInfo && hover && (
        <div className="hover-card">
          <CubeNet n={n} state={decodeKey(n, hover)} />
          <div className="small mono">
            g = {hoverInfo.g}
            {hoverInfo.h !== undefined && <> · h = {hoverInfo.h} · f = g + h = {hoverInfo.g + hoverInfo.h}</>} · expansões: {hoverInfo.expanded}
          </div>
        </div>
      )}
    </div>
  );
}
