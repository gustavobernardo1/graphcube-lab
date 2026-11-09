import { getPuzzle } from '../core/geometry';
import { FACE_COLORS } from '../viz3d/CubeRenderer';

/** Unfolded net (cross layout) of a facelet state — used in tooltips and tables. */
export function CubeNet({ n, state, size = 7 }: { n: 2 | 3; state: Uint8Array; size?: number }) {
  const P = getPuzzle(n);
  const off: Record<string, [number, number]> = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
  const cells = [];
  for (let i = 0; i < P.size; i++) {
    const s = P.stickers[i];
    const [ox, oy] = off[s.face];
    const face = P.stickers[state[i]].face;
    cells.push(<rect key={i} x={(ox * n + s.col) * size} y={(oy * n + s.row) * size} width={size - 1} height={size - 1} rx={1.2} fill={FACE_COLORS[face]} />);
  }
  return (
    <svg width={4 * n * size} height={3 * n * size} className="cubenet" aria-hidden="true">
      {cells}
    </svg>
  );
}
