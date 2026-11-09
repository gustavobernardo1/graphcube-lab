/**
 * Structural (sticker–layer incidence) diagram, inspired by GraphCube
 * (D. Laguna) but constructed exactly from the geometry.
 *
 * For each axis a ∈ {x,y,z} there is a family of n concentric circles centred
 * at C_a, one per layer. A sticker with normal along axis c lies in exactly one
 * layer of each of the two other axes a, b, and it is drawn at one of the two
 * intersection points of those two circles: the point on the inner side of the
 * line C_aC_b for faces U, R, F, on the outer side for D, L, B. For n = 3 every
 * pair of circles from different families meets in exactly two points carrying
 * the two stickers (one on each opposite face) that share those two layers.
 *
 * Mathematical object: the bipartite incidence graph between the 6n² sticker
 * positions and the 3n layers (each sticker has degree 2), drawn with layers as
 * curves. A move permutes the positions; its cycles are drawn as arrows.
 */
import { getPuzzle, type FaceName } from '../core/geometry';

export interface LayoutCircle {
  id: number;
  axis: 0 | 1 | 2;
  coord: number;
  cx: number;
  cy: number;
  r: number;
  /** Move letter turning this layer (R, L, M, …). */
  base: string;
}

export interface LayoutPoint {
  sticker: number;
  x: number;
  y: number;
  circles: [number, number];
  face: FaceName;
}

export interface StructuralLayout {
  n: 2 | 3;
  width: number;
  height: number;
  circles: LayoutCircle[];
  points: LayoutPoint[];
  /** Centroid of each face's cluster (for rotating face stickers). */
  faceCentre: Record<FaceName, { x: number; y: number }>;
}

const LETTERS: string[][] = [
  ['L', 'M', 'R'],
  ['D', 'E', 'U'],
  ['B', 'S', 'F'],
];

function intersect(c1: LayoutCircle, c2: LayoutCircle): [number, number][] {
  const dx = c2.cx - c1.cx;
  const dy = c2.cy - c1.cy;
  const d = Math.hypot(dx, dy);
  const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a));
  const mx = c1.cx + (a * dx) / d;
  const my = c1.cy + (a * dy) / d;
  return [
    [mx + (h * -dy) / d, my + (h * dx) / d],
    [mx - (h * -dy) / d, my - (h * dx) / d],
  ];
}

const cache = new Map<number, StructuralLayout>();

export function structuralLayout(n: 2 | 3): StructuralLayout {
  const hit = cache.get(n);
  if (hit) return hit;
  const P = getPuzzle(n);
  const width = 1000;
  const height = 1000;
  const side = 360;
  const gx = width / 2;
  const gy = height / 2 + 20;
  const R = side / Math.sqrt(3); // circumradius of the triangle of centres
  // axis 1 (y, U/D) on top; axis 0 (x, R/L) bottom-left; axis 2 (z, F/B) bottom-right
  const centre: [number, number][] = [
    [gx + R * Math.cos((210 * Math.PI) / 180), gy - R * Math.sin((210 * Math.PI) / 180)],
    [gx, gy - R],
    [gx + R * Math.cos((-30 * Math.PI) / 180), gy - R * Math.sin((-30 * Math.PI) / 180)],
  ];
  const radii = n === 3 ? [290, 350, 410] : [305, 385];
  const circles: LayoutCircle[] = [];
  const circleOf = new Map<string, LayoutCircle>();
  for (const axis of [0, 1, 2] as const) {
    for (let k = 0; k < n; k++) {
      const coord = 2 * k - (n - 1);
      const letter = n === 3 ? LETTERS[axis][k] : LETTERS[axis][k === 0 ? 0 : 2];
      const c: LayoutCircle = { id: circles.length, axis, coord, cx: centre[axis][0], cy: centre[axis][1], r: radii[k], base: letter };
      circles.push(c);
      circleOf.set(`${axis}:${coord}`, c);
    }
  }
  const points: LayoutPoint[] = [];
  for (const s of P.stickers) {
    const c = s.normal.findIndex((v) => v !== 0);
    const [a, b] = [0, 1, 2].filter((x) => x !== c) as (0 | 1 | 2)[];
    const ca = circleOf.get(`${a}:${s.pos[a]}`)!;
    const cb = circleOf.get(`${b}:${s.pos[b]}`)!;
    const [p1, p2] = intersect(ca, cb);
    // inner side = closer to the third centre
    const third = centre[c];
    const d1 = Math.hypot(p1[0] - third[0], p1[1] - third[1]);
    const d2 = Math.hypot(p2[0] - third[0], p2[1] - third[1]);
    const inner = d1 < d2 ? p1 : p2;
    const outer = d1 < d2 ? p2 : p1;
    const positive = s.normal[c] > 0;
    const [x, y] = positive ? inner : outer;
    points.push({ sticker: s.index, x, y, circles: [ca.id, cb.id], face: s.face });
  }
  const faceCentre = {} as Record<FaceName, { x: number; y: number }>;
  for (const f of ['U', 'R', 'F', 'D', 'L', 'B'] as FaceName[]) {
    const ps = points.filter((p) => p.face === f);
    faceCentre[f] = { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
  }
  const layout = { n, width, height, circles, points, faceCentre };
  cache.set(n, layout);
  return layout;
}

/** Stickers moved by turning a layer: those incident to its circle, plus the face for outer layers. */
export function layerStickers(n: 2 | 3, circle: LayoutCircle): number[] {
  const P = getPuzzle(n);
  const out: number[] = [];
  for (const s of P.stickers) if (s.pos[circle.axis] === circle.coord) out.push(s.index);
  return out;
}
