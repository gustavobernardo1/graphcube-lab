/**
 * Canvas force-directed graph (d3-force). Purely presentational: it receives
 * nodes/links already carrying their visual encoding and reports interactions.
 * Node positions persist across updates, so incremental growth (expansions,
 * search replays) is stable.
 */
import { useEffect, useRef } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type Simulation, type SimulationNodeDatum } from 'd3-force';

export interface FGNode {
  id: string;
  color: string;
  r?: number;
  stroke?: string;
  strokeWidth?: number;
  label?: string;
  /** Optional radial target (e.g. distance from a root) for layered layouts. */
  layer?: number;
}
export interface FGLink {
  source: string;
  target: string;
  color?: string;
  width?: number;
  dashed?: boolean;
}
interface SimNode extends SimulationNodeDatum {
  id: string;
  data: FGNode;
}
interface SimLink {
  source: SimNode | string;
  target: SimNode | string;
  data: FGLink;
}

export interface ForceGraphProps {
  nodes: FGNode[];
  links: FGLink[];
  height?: number | string;
  onNodeClick?: (id: string, ev: MouseEvent) => void;
  onNodeDoubleClick?: (id: string) => void;
  onHover?: (id: string | null) => void;
  focusId?: string | null;
  layered?: boolean;
  ariaLabel: string;
  charge?: number;
  linkDistance?: number;
}

export function ForceGraph(props: ForceGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const nodesRef = useRef(new Map<string, SimNode>());
  const linksRef = useRef<SimLink[]>([]);
  const view = useRef({ x: 0, y: 0, k: 1 });
  const hoverRef = useRef<string | null>(null);
  const userView = useRef(false);
  const propsRef = useRef(props);
  propsRef.current = props;
  const drawRef = useRef<() => void>(() => {});

  // setup once
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const sim = forceSimulation<SimNode>([])
      .force('charge', forceManyBody<SimNode>().strength(propsRef.current.charge ?? -60).distanceMax(400))
      .force('link', forceLink<SimNode, SimLink & { source: SimNode; target: SimNode }>([]).id((d) => d.id).distance(propsRef.current.linkDistance ?? 26).strength(0.9))
      .force('center', forceCenter(0, 0).strength(0.05))
      .force('collide', forceCollide<SimNode>((d) => (d.data.r ?? 5) + 2))
      .alphaDecay(0.03);
    simRef.current = sim;

    const cssCache = new Map<string, string>();
    const resolve = (c: string): string => {
      if (!c.startsWith('var(')) return c;
      let v = cssCache.get(c);
      if (v === undefined) {
        v = getComputedStyle(document.documentElement).getPropertyValue(c.slice(4, -1)).trim() || '#888';
        cssCache.set(c, v);
      }
      return v;
    };
    const themeObserver = new MutationObserver(() => cssCache.clear());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const fit = () => {
      if (userView.current) return;
      const ns = [...nodesRef.current.values()].filter((n) => n.x !== undefined);
      if (ns.length < 2) {
        view.current = { x: 0, y: 0, k: 1 };
        return;
      }
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const n of ns) {
        x0 = Math.min(x0, n.x!); x1 = Math.max(x1, n.x!);
        y0 = Math.min(y0, n.y!); y1 = Math.max(y1, n.y!);
      }
      const w = canvas.clientWidth - 40;
      const h = canvas.clientHeight - 40;
      const k = Math.min(2, w / Math.max(1, x1 - x0), h / Math.max(1, y1 - y0));
      const target = { k, x: -((x0 + x1) / 2) * k, y: -((y0 + y1) / 2) * k };
      const v = view.current;
      v.k += (target.k - v.k) * 0.25;
      v.x += (target.x - v.x) * 0.25;
      v.y += (target.y - v.y) * 0.25;
    };
    const draw = () => {
      fit();
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const v = view.current;
      ctx.save();
      ctx.translate(w / 2 + v.x, h / 2 + v.y);
      ctx.scale(v.k, v.k);
      const edgeDefault = resolve('var(--graph-edge)');
      for (const l of linksRef.current) {
        const s = l.source as SimNode;
        const t = l.target as SimNode;
        if (s.x === undefined || t.x === undefined) continue;
        ctx.beginPath();
        ctx.strokeStyle = l.data.color ? resolve(l.data.color) : edgeDefault;
        ctx.lineWidth = (l.data.width ?? 1) / Math.sqrt(v.k);
        ctx.setLineDash(l.data.dashed ? [4, 4] : []);
        ctx.moveTo(s.x, s.y!);
        ctx.lineTo(t.x, t.y!);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      const labelColor = resolve('var(--text)');
      for (const n of nodesRef.current.values()) {
        if (n.x === undefined) continue;
        const r = n.data.r ?? 5;
        ctx.beginPath();
        ctx.arc(n.x, n.y!, r, 0, Math.PI * 2);
        ctx.fillStyle = resolve(n.data.color);
        ctx.fill();
        if (n.data.stroke) {
          ctx.lineWidth = (n.data.strokeWidth ?? 2) / Math.sqrt(v.k);
          ctx.strokeStyle = resolve(n.data.stroke);
          ctx.stroke();
        }
        if (hoverRef.current === n.id) {
          ctx.beginPath();
          ctx.arc(n.x, n.y!, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = labelColor;
          ctx.lineWidth = 1.5 / v.k;
          ctx.stroke();
        }
        if (n.data.label && v.k > 0.6) {
          ctx.fillStyle = labelColor;
          ctx.font = `${11 / Math.sqrt(v.k)}px ui-monospace, monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(n.data.label, n.x, n.y! - r - 4);
        }
      }
      ctx.restore();
    };
    drawRef.current = draw;
    sim.on('tick', draw);

    // interaction: pan / zoom / node drag / click
    let dragNode: SimNode | null = null;
    let panning: { x: number; y: number; vx: number; vy: number } | null = null;
    let moved = false;
    const toWorld = (ev: PointerEvent | MouseEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      const v = view.current;
      return { x: (ev.clientX - rect.left - rect.width / 2 - v.x) / v.k, y: (ev.clientY - rect.top - rect.height / 2 - v.y) / v.k };
    };
    const find = (ev: PointerEvent | MouseEvent) => {
      const p = toWorld(ev);
      let best: SimNode | null = null;
      let bd = Infinity;
      for (const n of nodesRef.current.values()) {
        if (n.x === undefined) continue;
        const d = Math.hypot(n.x - p.x, n.y! - p.y);
        const r = (n.data.r ?? 5) + 5 / view.current.k;
        if (d < r && d < bd) {
          bd = d;
          best = n;
        }
      }
      return best;
    };
    const down = (ev: PointerEvent) => {
      moved = false;
      const n = find(ev);
      canvas.setPointerCapture(ev.pointerId);
      if (n) {
        dragNode = n;
        n.fx = n.x;
        n.fy = n.y;
      } else panning = { x: ev.clientX, y: ev.clientY, vx: view.current.x, vy: view.current.y };
    };
    const move = (ev: PointerEvent) => {
      if (dragNode) {
        const p = toWorld(ev);
        dragNode.fx = p.x;
        dragNode.fy = p.y;
        moved = true;
        sim.alphaTarget(0.2).restart();
      } else if (panning) {
        userView.current = true;
        view.current.x = panning.vx + ev.clientX - panning.x;
        view.current.y = panning.vy + ev.clientY - panning.y;
        moved = true;
        draw();
      } else {
        const n = find(ev);
        const id = n ? n.id : null;
        if (id !== hoverRef.current) {
          hoverRef.current = id;
          canvas.style.cursor = id ? 'pointer' : 'grab';
          propsRef.current.onHover?.(id);
          draw();
        }
      }
    };
    const up = (ev: PointerEvent) => {
      if (dragNode) {
        dragNode.fx = null;
        dragNode.fy = null;
        sim.alphaTarget(0);
        if (!moved) propsRef.current.onNodeClick?.(dragNode.id, ev);
      }
      dragNode = null;
      panning = null;
    };
    const dbl = (ev: MouseEvent) => {
      const n = find(ev);
      if (n) propsRef.current.onNodeDoubleClick?.(n.id);
      else userView.current = false; // double-click on background: re-enable auto-fit
    };
    const wheel = (ev: WheelEvent) => {
      ev.preventDefault();
      userView.current = true;
      const v = view.current;
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left - rect.width / 2;
      const my = ev.clientY - rect.top - rect.height / 2;
      const k2 = Math.min(6, Math.max(0.15, v.k * Math.exp(-ev.deltaY * 0.0015)));
      v.x = mx - ((mx - v.x) * k2) / v.k;
      v.y = my - ((my - v.y) * k2) / v.k;
      v.k = k2;
      draw();
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('dblclick', dbl);
    canvas.addEventListener('wheel', wheel, { passive: false });
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => {
      sim.stop();
      ro.disconnect();
      themeObserver.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('dblclick', dbl);
      canvas.removeEventListener('wheel', wheel);
    };
  }, []);

  // data updates
  useEffect(() => {
    const sim = simRef.current!;
    const map = nodesRef.current;
    const keep = new Set(props.nodes.map((n) => n.id));
    for (const id of [...map.keys()]) if (!keep.has(id)) map.delete(id);
    let added = 0;
    for (const n of props.nodes) {
      const ex = map.get(n.id);
      if (ex) ex.data = n;
      else {
        // spawn near a linked, already placed node
        const link = props.links.find((l) => (l.source === n.id && map.has(l.target)) || (l.target === n.id && map.has(l.source)));
        const anchor = link ? map.get(link.source === n.id ? link.target : link.source) : undefined;
        const a = Math.random() * Math.PI * 2;
        map.set(n.id, {
          id: n.id,
          data: n,
          x: (anchor?.x ?? 0) + Math.cos(a) * 12,
          y: (anchor?.y ?? 0) + Math.sin(a) * 12,
        });
        added++;
      }
    }
    linksRef.current = props.links
      .filter((l) => map.has(l.source) && map.has(l.target))
      .map((l) => ({ source: l.source, target: l.target, data: l }));
    sim.nodes([...map.values()]);
    (sim.force('link') as ReturnType<typeof forceLink>).links(linksRef.current as never);
    sim.alpha(added > 0 ? Math.min(1, 0.3 + added / 50) : 0.15).restart();
    drawRef.current();
  }, [props.nodes, props.links]);

  return (
    <div ref={wrapRef} className="fg-wrap" style={{ height: props.height ?? 360 }}>
      <canvas ref={canvasRef} className="fg-canvas" role="img" aria-label={props.ariaLabel} />
      <div className="fg-hint" aria-hidden="true">
        arraste: mover · roda: zoom · duplo clique no fundo: reenquadrar
      </div>
    </div>
  );
}
