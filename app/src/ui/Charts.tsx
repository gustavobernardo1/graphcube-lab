/** Minimal, dependency-free SVG charts (line / bar) with log scale support. */
export const SERIES_COLORS = ['#7c5cff', '#2fd27a', '#ff9f43', '#38bdf8', '#ff5ca8', '#d6d65a', '#a3a3b8'];

export interface Series {
  name: string;
  points: [number, number][];
  color?: string;
  dashed?: boolean;
}

function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step0 = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = (count * step0) / span;
  const step = step0 * (err <= 0.15 ? 10 : err <= 0.35 ? 5 : err <= 0.75 ? 2 : 1);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

const fmt = (v: number) => (Math.abs(v) >= 1e4 ? v.toExponential(0).replace('+', '') : String(Math.round(v * 100) / 100));

export function LineChart({
  series, logY = false, xLabel, yLabel, height = 240, title, bars = false,
}: { series: Series[]; logY?: boolean; xLabel: string; yLabel: string; height?: number; title?: string; bars?: boolean }) {
  const W = 560;
  const H = height;
  const m = { l: 58, r: 12, t: title ? 26 : 12, b: 40 };
  const pts = series.flatMap((s) => s.points).filter(([, y]) => !logY || y > 0);
  if (!pts.length) return <div className="muted small">sem dados</div>;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => (logY ? Math.log10(p[1]) : p[1]));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  let y0 = Math.min(...ys, logY ? 0 : 0);
  let y1 = Math.max(...ys);
  if (logY) {
    y0 = Math.floor(y0);
    y1 = Math.ceil(y1);
  }
  if (y1 === y0) y1 = y0 + 1;
  const X = (x: number) => m.l + ((x - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);
  const Y = (y: number) => H - m.b - (((logY ? Math.log10(y) : y) - y0) / (y1 - y0)) * (H - m.t - m.b);
  const yt = logY ? Array.from({ length: y1 - y0 + 1 }, (_, i) => Math.pow(10, y0 + i)) : niceTicks(y0, y1);
  const xt = niceTicks(x0, x1, 8).filter((v) => Number.isInteger(v) || x1 - x0 < 5);
  const bw = bars ? Math.max(2, (W - m.l - m.r) / ((x1 - x0 + 1) * Math.max(1, series.length)) - 2) : 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${title ?? ''} ${yLabel} vs ${xLabel}`}>
      {title && <text x={m.l} y={16} className="chart-title">{title}</text>}
      {yt.map((v) => (
        <g key={'y' + v}>
          <line x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} className="grid" />
          <text x={m.l - 6} y={Y(v) + 4} textAnchor="end" className="tick">{logY ? `10${superscript(Math.log10(v))}` : fmt(v)}</text>
        </g>
      ))}
      {xt.map((v) => (
        <text key={'x' + v} x={X(v)} y={H - m.b + 16} textAnchor="middle" className="tick">{fmt(v)}</text>
      ))}
      <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle" className="axis-label">{xLabel}</text>
      <text x={14} y={(m.t + H - m.b) / 2} textAnchor="middle" className="axis-label" transform={`rotate(-90 14 ${(m.t + H - m.b) / 2})`}>{yLabel}</text>
      {series.map((s, si) => {
        const color = s.color ?? SERIES_COLORS[si % SERIES_COLORS.length];
        const p = s.points.filter(([, y]) => !logY || y > 0).sort((a, b) => a[0] - b[0]);
        if (bars)
          return p.map(([x, y], k) => (
            <rect key={si + '-' + k} x={X(x) - (bw * series.length) / 2 + si * bw} y={Y(y)} width={bw} height={Math.max(0, H - m.b - Y(y))} fill={color} opacity={0.85}>
              <title>{`${s.name}: x=${x}, y=${y}`}</title>
            </rect>
          ));
        return (
          <g key={si}>
            <polyline points={p.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} />
            {p.map(([x, y], k) => (
              <circle key={k} cx={X(x)} cy={Y(y)} r={3} fill={color}>
                <title>{`${s.name}: x=${x}, y=${Math.round(y * 1000) / 1000}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
      <g transform={`translate(${m.l + 8}, ${m.t + 6})`}>
        {series.map((s, si) => (
          <g key={si} transform={`translate(0, ${si * 15})`}>
            <rect width={10} height={3} y={4} fill={s.color ?? SERIES_COLORS[si % SERIES_COLORS.length]} />
            <text x={14} y={9} className="legend-text">{s.name}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function superscript(n: number): string {
  const map: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  return String(Math.round(n)).split('').map((c) => map[c] ?? c).join('');
}
