import { useEffect, useMemo, useRef, useState } from 'react';
import { structuralLayout, type LayoutCircle } from '../graph/structural';
import { getPuzzle } from '../core/geometry';
import { inverse, cycles } from '../core/perm';
import { parseMove } from '../core/notation';
import { FACE_COLORS } from '../viz3d/CubeRenderer';
import { useLab } from './lab';
import { Info, Badge } from './Info';

const AXIS_COLOR = ['var(--axis-x)', 'var(--axis-y)', 'var(--axis-z)'];

export function StructuralView() {
  const lab = useLab();
  const L = structuralLayout(lab.n);
  const P = getPuzzle(lab.n);
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ sticker: number; circle: LayoutCircle | null; start: { x: number; y: number }; theta: number } | null>(null);
  const [hoverCircle, setHoverCircle] = useState<number | null>(null);
  const [anim, setAnim] = useState<{ from: Map<number, [number, number]>; circle: LayoutCircle | null; t: number } | null>(null);
  const prev = useRef({ state: lab.state, cursor: lab.history.length, n: lab.n });

  const pos = useMemo(() => {
    const m = new Map<number, [number, number]>();
    for (const p of L.points) m.set(p.sticker, [p.x, p.y]);
    return m;
  }, [L]);

  // animate stickers along the circles after a single-layer move
  useEffect(() => {
    const before = prev.current;
    prev.current = { state: lab.state, cursor: lab.history.length, n: lab.n };
    if (before.n !== lab.n || before.state.length !== lab.state.length || lab.speed === 0) return;
    // displacement: position j now holds what was at position i where before[i] = now[j]
    const where = new Map<number, number>();
    before.state.forEach((st, i) => where.set(st, i));
    const from = new Map<number, [number, number]>();
    let changed = 0;
    lab.state.forEach((st, j) => {
      const i = where.get(st)!;
      if (i !== j) {
        from.set(j, pos.get(i)!);
        changed++;
      }
    });
    if (!changed || changed > 6 * lab.n * lab.n * 0.75) return;
    let circle: LayoutCircle | null = null;
    const movedRing = [...from.keys()].filter((j) => L.points[j]);
    for (const c of L.circles) {
      const onC = movedRing.filter((j) => L.points[j].circles.includes(c.id)).length;
      if (onC >= 4 * lab.n) circle = c;
    }
    const t0 = performance.now();
    const dur = Math.max(120, lab.speed * 1.1);
    let raf = 0;
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      setAnim({ from, circle, t });
      if (t < 1) raf = requestAnimationFrame(step);
      else setAnim(null);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lab.state]);

  const hoverCycles = useMemo(() => {
    if (!lab.hoverMove) return null;
    const perm = P.moves.get(lab.hoverMove);
    if (!perm) return null;
    return cycles(inverse(perm)); // σ: position i → σ(i)
  }, [lab.hoverMove, P]);

  const toSvg = (ev: React.PointerEvent | PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: r.x, y: r.y };
  };

  const layerOf = (c: LayoutCircle) => P.stickers.filter((s) => s.pos[c.axis] === c.coord).map((s) => s.index);

  const onDown = (ev: React.PointerEvent, sticker: number) => {
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    setDrag({ sticker, circle: null, start: toSvg(ev), theta: 0 });
  };
  const onMove = (ev: React.PointerEvent) => {
    if (!drag) return;
    const p = toSvg(ev);
    let circle = drag.circle;
    if (!circle) {
      if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < 12) return;
      const pt = L.points[drag.sticker];
      const cands = pt.circles.map((id) => L.circles[id]);
      // the drag direction should be tangent to the chosen circle
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      let best = cands[0];
      let bestScore = -1;
      for (const c of cands) {
        const rx = pt.x - c.cx;
        const ry = pt.y - c.cy;
        const tangent = Math.abs((-ry * dx + rx * dy) / (Math.hypot(rx, ry) * Math.hypot(dx, dy)));
        if (tangent > bestScore) {
          bestScore = tangent;
          best = c;
        }
      }
      circle = best;
    }
    const a0 = Math.atan2(drag.start.y - circle.cy, drag.start.x - circle.cx);
    const a1 = Math.atan2(p.y - circle.cy, p.x - circle.cx);
    let theta = a1 - a0;
    while (theta > Math.PI) theta -= 2 * Math.PI;
    while (theta < -Math.PI) theta += 2 * Math.PI;
    setDrag({ ...drag, circle, theta });
  };
  const onUp = () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.circle) return;
    const base = P.base.get(d.circle.base);
    if (!base) return;
    // where is the dragged sticker now (visually)?
    const [x0, y0] = pos.get(d.sticker)!;
    const vis = rot(x0, y0, d.circle.cx, d.circle.cy, d.theta);
    let bestK = 0;
    let bestD = Math.hypot(vis[0] - x0, vis[1] - y0);
    let cur = d.sticker;
    for (let k = 1; k <= 3; k++) {
      cur = base.sigma[cur];
      const [x, y] = pos.get(cur)!;
      const dd = Math.hypot(vis[0] - x, vis[1] - y);
      if (dd < bestD) {
        bestD = dd;
        bestK = k;
      }
    }
    if (bestK) lab.doMove(parseMove(d.circle.base + (bestK === 1 ? '' : bestK === 2 ? '2' : "'")));
  };

  const dragLayer = drag?.circle ? new Set(layerOf(drag.circle)) : null;
  const faceOfLayer = drag?.circle && P.base.get(drag.circle.base)?.kind === 'face' ? drag.circle.base : null;

  const pointXY = (j: number): [number, number] => {
    const [x, y] = pos.get(j)!;
    if (drag?.circle && dragLayer!.has(j)) {
      const p = L.points[j];
      if (p.circles.includes(drag.circle.id)) return rot(x, y, drag.circle.cx, drag.circle.cy, drag.theta);
      if (faceOfLayer && p.face === faceOfLayer) {
        const c = L.faceCentre[p.face];
        return rot(x, y, c.x, c.y, drag.theta);
      }
    }
    if (anim && anim.from.has(j)) {
      const [fx, fy] = anim.from.get(j)!;
      const e = anim.t < 0.5 ? 2 * anim.t * anim.t : 1 - Math.pow(-2 * anim.t + 2, 2) / 2;
      const c = anim.circle;
      const p = L.points[j];
      if (c && p.circles.includes(c.id)) {
        const a0 = Math.atan2(fy - c.cy, fx - c.cx);
        let da = Math.atan2(y - c.cy, x - c.cx) - a0;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        return [c.cx + c.r * Math.cos(a0 + da * e), c.cy + c.r * Math.sin(a0 + da * e)];
      }
      return [fx + (x - fx) * e, fy + (y - fy) * e];
    }
    return [x, y];
  };

  const r = lab.n === 3 ? 13 : 17;
  const pad = 70;
  const minX = Math.min(...L.circles.map((c) => c.cx - c.r)) - pad;
  const maxX = Math.max(...L.circles.map((c) => c.cx + c.r)) + pad;
  const minY = Math.min(...L.circles.map((c) => c.cy - c.r)) - pad;
  const maxY = Math.max(...L.circles.map((c) => c.cy + c.r)) + pad;
  const moveCircle = lab.hoverMove ? L.circles.find((c) => c.base === lab.hoverMove![0]) ?? null : null;
  return (
    <div className="panel-body">
      <div className="row between">
        <div className="row gap-s">
          <Badge kind="exact">grafo de incidência adesivo–camada</Badge>
          <Info title="O que este diagrama representa">
            <p><b>Vértices (pontos):</b> as {6 * lab.n * lab.n} <i>posições</i> de adesivos. A cor é a do adesivo que ocupa a posição no estado atual.</p>
            <p><b>Círculos:</b> as {3 * lab.n} camadas (n por eixo). Cada adesivo pertence a exatamente duas camadas não paralelas à sua face e é desenhado numa das duas interseções dos respectivos círculos (construção exata).</p>
            <p>Girar uma camada permuta os {4 * lab.n} adesivos do seu anel ao longo do círculo (e, se for uma face, os {lab.n * lab.n} adesivos da face). Passe o mouse sobre um botão de movimento para ver os ciclos dessa permutação.</p>
            <p>Isto <b>não</b> é um grafo de estados nem de Cayley: um estado completo é uma coloração deste diagrama. Inspirado no GraphCube de Dorian Laguna.</p>
          </Info>
        </div>
        <span className="muted small">arraste um adesivo ao longo de um círculo</span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
        className="structural"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        role="img"
        aria-label="Diagrama estrutural: posições de adesivos nas interseções dos círculos das camadas"
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
          </marker>
        </defs>
        {L.circles.map((c) => (
          <circle
            key={c.id}
            cx={c.cx}
            cy={c.cy}
            r={c.r}
            fill="none"
            stroke={AXIS_COLOR[c.axis]}
            strokeOpacity={drag?.circle?.id === c.id || hoverCircle === c.id ? 0.95 : 0.35}
            strokeWidth={drag?.circle?.id === c.id || hoverCircle === c.id ? 7 : 4}
          />
        ))}
        {L.circles.map((c) => {
          // label at the outermost point away from the triangle centre
          const gx = L.circles.reduce((a, q) => a + q.cx, 0) / L.circles.length;
          const gy = L.circles.reduce((a, q) => a + q.cy, 0) / L.circles.length;
          const ang = Math.atan2(c.cy - gy, c.cx - gx) + (c.coord - 0) * 0.07;
          const lx = c.cx + c.r * Math.cos(ang);
          const ly = c.cy + c.r * Math.sin(ang);
          const k = 0;
          return (
            <g
              key={'l' + c.id}
              className="circle-label"
              onMouseEnter={() => {
                setHoverCircle(c.id);
                lab.setHoverMove(c.base);
              }}
              onMouseLeave={() => {
                setHoverCircle(null);
                lab.setHoverMove(null);
              }}
              onClick={(e) => lab.doMove(parseMove(c.base + (e.shiftKey ? "'" : '')))}
              role="button"
              aria-label={`Girar camada ${c.base}`}
            >
              <circle cx={lx + Math.cos(ang) * (16 + k * 30)} cy={ly + Math.sin(ang) * (16 + k * 30)} r={15} fill="var(--surface-2)" stroke={AXIS_COLOR[c.axis]} strokeWidth={2} />
              <text x={lx + Math.cos(ang) * (16 + k * 30)} y={ly + Math.sin(ang) * (16 + k * 30) + 5} textAnchor="middle" className="circle-text">
                {c.base}
              </text>
            </g>
          );
        })}
        {hoverCycles &&
          hoverCycles.flatMap((cyc, ci) =>
            cyc.map((i, k) => {
              const j = cyc[(k + 1) % cyc.length];
              const [x1, y1] = pos.get(i)!;
              const [x2, y2] = pos.get(j)!;
              const c = moveCircle;
              if (c && L.points[i].circles.includes(c.id) && L.points[j].circles.includes(c.id)) {
                let da = Math.atan2(y2 - c.cy, x2 - c.cx) - Math.atan2(y1 - c.cy, x1 - c.cx);
                while (da > Math.PI) da -= 2 * Math.PI;
                while (da < -Math.PI) da += 2 * Math.PI;
                return <path key={`${ci}-${k}`} d={`M ${x1} ${y1} A ${c.r} ${c.r} 0 0 ${da > 0 ? 1 : 0} ${x2} ${y2}`} fill="none" stroke="var(--accent)" strokeWidth={2.4} markerEnd="url(#arrow)" opacity={0.9} />;
              }
              const mx = (x1 + x2) / 2 + (y2 - y1) * 0.18;
              const my = (y1 + y2) / 2 - (x2 - x1) * 0.18;
              return <path key={`${ci}-${k}`} d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`} fill="none" stroke="var(--accent-2)" strokeWidth={2} markerEnd="url(#arrow)" opacity={0.85} />;
            }),
          )}
        {L.points.map((p) => {
          const [x, y] = pointXY(p.sticker);
          const face = P.stickers[lab.state[p.sticker]].face;
          return (
            <circle
              key={p.sticker}
              cx={x}
              cy={y}
              r={r}
              fill={FACE_COLORS[face]}
              stroke="var(--sticker-stroke)"
              strokeWidth={2}
              className="sticker-dot"
              onPointerDown={(e) => onDown(e, p.sticker)}
            >
              <title>{`posição ${P.stickers[p.sticker].face}${P.stickers[p.sticker].row * lab.n + P.stickers[p.sticker].col + 1} — adesivo de ${face}`}</title>
            </circle>
          );
        })}
      </svg>
      {lab.hoverMove && hoverCycles && (
        <div className="small mono cycle-line">
          {lab.hoverMove}: {hoverCycles.length} ciclos de comprimentos {hoverCycles.map((c) => c.length).join(', ')} nas posições de adesivos
        </div>
      )}
    </div>
  );
}

function rot(x: number, y: number, cx: number, cy: number, t: number): [number, number] {
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * Math.cos(t) - dy * Math.sin(t), cy + dx * Math.sin(t) + dy * Math.cos(t)];
}
