/**
 * Three.js renderer of the n×n×n cube. It holds NO logical state: it is told the
 * facelet state to display and the moves to animate. After each animation the
 * cubies return to their home positions and every sticker is recoloured from
 * the logical state — so no floating-point drift can ever accumulate.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getPuzzle, type Puzzle, type Vec3 } from '../core/geometry';
import { parseMove, type Move } from '../core/notation';

export const FACE_COLORS: Record<string, string> = {
  U: '#f4f4ef',
  R: '#d0263a',
  F: '#0f9d58',
  D: '#ffd23f',
  L: '#ff7a1a',
  B: '#1f5fd1',
};

interface Cubie {
  group: THREE.Group;
  pos: Vec3; // integer coordinates
}

export type MoveRequest = (m: Move) => void;

function roundedRectShape(w: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const h = w / 2;
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  return s;
}

export class CubeRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private puzzle!: Puzzle;
  private cubies: Cubie[] = [];
  private stickerMeshes: THREE.Mesh[] = [];
  private root = new THREE.Group();
  private materials: Record<string, THREE.MeshStandardMaterial> = {};
  private queue: { move: Move; after: Uint8Array; duration: number; done: () => void }[] = [];
  private anim: { pivot: THREE.Group; axis: THREE.Vector3; angle: number; t0: number; duration: number; done: () => void; members: Cubie[]; after: Uint8Array } | null = null;
  /** Latest logical state (shown once all queued animations have finished). */
  private state: Uint8Array | null = null;
  private raf = 0;
  private ray = new THREE.Raycaster();
  private drag: { sticker: number; x: number; y: number } | null = null;
  onMoveRequest: MoveRequest | null = null;
  highlight: Set<number> = new Set();

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('aria-label', 'Cubo mágico 3D interativo');
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 16;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 2.2));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(5, 8, 6);
    this.scene.add(dir);
    this.scene.add(this.root);
    for (const [f, c] of Object.entries(FACE_COLORS))
      this.materials[f] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0.0, side: THREE.DoubleSide });
    this.materials.hl = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#7c5cff', emissiveIntensity: 0.6 });
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    this.resize();
    this.loop();
  }

  setPuzzle(n: 2 | 3): void {
    this.queue = [];
    if (this.anim) this.finishAnim();
    this.puzzle = getPuzzle(n);
    this.root.clear();
    this.cubies = [];
    this.stickerMeshes = [];
    const unit = 1; // distance between neighbouring cubie centres
    const k = unit / 2;
    const body = new THREE.MeshStandardMaterial({ color: '#101114', roughness: 0.6 });
    const boxGeo = new THREE.BoxGeometry(0.97 * unit, 0.97 * unit, 0.97 * unit);
    const stickerGeo = new THREE.ShapeGeometry(roundedRectShape(0.84 * unit, 0.12));
    const centres = new Map<string, Cubie>();
    for (const s of this.puzzle.stickers) {
      const key = s.pos.join(',');
      let cubie = centres.get(key);
      if (!cubie) {
        const group = new THREE.Group();
        group.position.set(s.pos[0] * k, s.pos[1] * k, s.pos[2] * k);
        group.add(new THREE.Mesh(boxGeo, body));
        cubie = { group, pos: s.pos };
        centres.set(key, cubie);
        this.cubies.push(cubie);
        this.root.add(group);
      }
      const mesh = new THREE.Mesh(stickerGeo, this.materials[s.face]);
      const nrm = new THREE.Vector3(...s.normal);
      mesh.position.copy(nrm.clone().multiplyScalar(0.487 * unit));
      mesh.lookAt(nrm.clone().multiplyScalar(2));
      mesh.userData.sticker = s.index;
      cubie.group.add(mesh);
      this.stickerMeshes[s.index] = mesh;
    }
    const dist = n === 3 ? 9.2 : 7.2;
    this.camera.position.set(dist * 0.55, dist * 0.5, dist * 0.68);
    this.camera.lookAt(0, 0, 0);
    this.controls.update();
    if (this.state && this.state.length === this.puzzle.size) this.paint(this.state);
    else this.paint(Uint8Array.from({ length: this.puzzle.size }, (_, i) => i));
  }

  /** Sets the logical state; it is displayed immediately unless animations are pending. */
  paint(state: Uint8Array): void {
    this.state = state;
    if (this.anim || this.queue.length) return;
    this.applyColors(state);
  }

  private applyColors(state: Uint8Array): void {
    if (state.length !== this.puzzle.size) return;
    for (let i = 0; i < this.puzzle.size; i++) {
      const face = this.puzzle.stickers[state[i]].face;
      this.stickerMeshes[i].material = this.highlight.has(i) ? this.materials.hl : this.materials[face];
    }
  }

  /** Queues an animated move whose result is `after`; `done` is called when it ends. */
  animate(move: Move, after: Uint8Array, durationMs: number, done: () => void = () => {}): void {
    this.queue.push({ move, after, duration: durationMs, done });
  }

  get busy(): boolean {
    return !!this.anim || this.queue.length > 0;
  }

  clearQueue(): void {
    for (const q of this.queue) q.done();
    this.queue = [];
    if (this.anim) this.finishAnim();
  }

  private startNext(): void {
    const next = this.queue.shift();
    if (!next) return;
    const base = this.puzzle.base.get(next.move.base);
    if (!base || next.duration <= 0) {
      this.applyColors(next.after);
      next.done();
      if (!this.queue.length && this.state) this.applyColors(this.state);
      return;
    }
    const members = this.cubies.filter((c) => base.layers.includes(c.pos[base.axisIndex]));
    const pivot = new THREE.Group();
    this.root.add(pivot);
    for (const c of members) pivot.attach(c.group);
    const quarter = next.move.amount === 3 ? -1 : next.move.amount; // X' animates +90°
    this.anim = {
      pivot,
      axis: new THREE.Vector3(...base.axis),
      angle: (-quarter * Math.PI) / 2,
      t0: performance.now(),
      duration: next.duration * (next.move.amount === 2 ? 1.35 : 1),
      done: next.done,
      members,
      after: next.after,
    };
  }

  private finishAnim(): void {
    const a = this.anim!;
    const k = 0.5;
    for (const c of a.members) {
      this.root.attach(c.group);
      c.group.position.set(c.pos[0] * k, c.pos[1] * k, c.pos[2] * k);
      c.group.rotation.set(0, 0, 0);
    }
    this.root.remove(a.pivot);
    this.anim = null;
    this.applyColors(this.queue.length || !this.state ? a.after : this.state);
    a.done();
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.anim && this.queue.length) this.startNext();
    if (this.anim) {
      const a = this.anim;
      const t = Math.min(1, (performance.now() - a.t0) / a.duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // ease-in-out cubic
      a.pivot.setRotationFromAxisAngle(a.axis, a.angle * e);
      if (t >= 1) this.finishAnim();
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  resize(): void {
    const w = this.host.clientWidth || 300;
    const h = this.host.clientHeight || 300;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  resetCamera(): void {
    const dist = this.puzzle?.n === 2 ? 7.2 : 9.2;
    this.camera.position.set(dist * 0.55, dist * 0.5, dist * 0.68);
    this.controls.update();
  }

  // ------------------------------------------------------------- direct manipulation
  private pick(ev: PointerEvent): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObjects(this.stickerMeshes, false);
    return hits.length ? (hits[0].object.userData.sticker as number) : null;
  }

  private onDown = (ev: PointerEvent): void => {
    const s = this.pick(ev);
    if (s === null) return;
    this.drag = { sticker: s, x: ev.clientX, y: ev.clientY };
    this.controls.enabled = false;
  };

  private onMove = (ev: PointerEvent): void => {
    if (!this.drag) return;
    const dx = ev.clientX - this.drag.x;
    const dy = ev.clientY - this.drag.y;
    if (Math.hypot(dx, dy) < 18) return;
    const sticker = this.puzzle.stickers[this.drag.sticker];
    this.drag = null;
    this.controls.enabled = true;
    if (this.busy && this.queue.length > 2) return;
    const move = this.moveFromDrag(sticker.pos, sticker.normal, dx, dy);
    if (move) this.onMoveRequest?.(move);
  };

  private onUp = (): void => {
    this.drag = null;
    this.controls.enabled = true;
  };

  /**
   * Chooses the layer rotation whose screen-space velocity at the touched
   * sticker best matches the drag vector. Rotation axes are the two coordinate
   * axes perpendicular to the sticker normal.
   */
  private moveFromDrag(pos: Vec3, normal: Vec3, dx: number, dy: number): Move | null {
    const k = 0.5;
    const p = new THREE.Vector3(pos[0] * k + normal[0] * 0.5, pos[1] * k + normal[1] * 0.5, pos[2] * k + normal[2] * 0.5);
    const project = (v: THREE.Vector3) => {
      const q = v.clone().project(this.camera);
      return new THREE.Vector2(q.x, -q.y);
    };
    const p0 = project(p);
    const drag = new THREE.Vector2(dx, dy).normalize();
    let best: { axis: 0 | 1 | 2; sign: number; score: number } | null = null;
    for (const axis of [0, 1, 2] as const) {
      if (normal[axis] !== 0) continue;
      const a = new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0);
      const v = a.clone().cross(p).multiplyScalar(0.05); // velocity of a positive (CCW) rotation
      const sv = project(p.clone().add(v)).sub(p0).normalize();
      const score = sv.dot(drag);
      for (const sign of [1, -1]) if (!best || score * sign > best.score) best = { axis, sign, score: score * sign };
    }
    if (!best) return null;
    const coord = pos[best.axis];
    for (const [name, b] of this.puzzle.base) {
      if (b.kind === 'rotation' || b.axisIndex !== best.axis || !b.layers.includes(coord)) continue;
      // b turns clockwise about b.axis = ±e_axis; a CCW turn about +e_axis is b' if b.axis = +e_axis, else b.
      const positive = b.axis[best.axis] > 0;
      const ccw = best.sign > 0;
      const amount = positive === ccw ? 3 : 1;
      return parseMove(name + (amount === 3 ? "'" : ''));
    }
    return null;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('pointerup', this.onUp);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
