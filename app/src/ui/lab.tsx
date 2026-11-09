/**
 * Application store. The single source of truth is the logical facelet state
 * `state` (a permutation of Ω). The 3D renderer, the structural diagram and
 * the state graph are all *views* of it; none of them owns state.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getPuzzle } from '../core/geometry';
import { identity } from '../core/perm';
import { applyMove, invertMove, parseAlg, type Move } from '../core/notation';
import { mulberry32, randomScramble } from '../core/random';
import { StateGraph, type CycleInfo } from '../graph/stateGraph';
import type { CubeRenderer } from '../viz3d/CubeRenderer';
import { freeReduce } from '../core/notation';

export type Mode = 'explore' | 'solve' | 'investigate';

export interface LabApi {
  n: 2 | 3;
  setN: (n: 2 | 3) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  state: Uint8Array;
  history: Move[];
  cursor: number;
  speed: number;
  setSpeed: (ms: number) => void;
  doMove: (m: Move, opts?: { animate?: boolean }) => void;
  doAlg: (text: string | Move[], opts?: { animate?: boolean; record?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  scramble: (length?: number, seed?: string) => string;
  setState: (s: Uint8Array) => void;
  graph: StateGraph;
  graphVersion: number;
  lastCycle: CycleInfo | null;
  rendererRef: React.MutableRefObject<CubeRenderer | null>;
  hoverMove: string | null;
  setHoverMove: (m: string | null) => void;
  lastScramble: { text: string; seed: string } | null;
  toast: (msg: string) => void;
  toastMsg: string | null;
}

const Ctx = createContext<LabApi | null>(null);
export const useLab = (): LabApi => {
  const v = useContext(Ctx);
  if (!v) throw new Error('LabProvider ausente');
  return v;
};

export function LabProvider({ children }: { children: ReactNode }) {
  const [n, setNState] = useState<2 | 3>(3);
  const [mode, setMode] = useState<Mode>('explore');
  const [state, setStateRaw] = useState<Uint8Array>(() => identity(54));
  const [history, setHistory] = useState<Move[]>([]);
  const [cursor, setCursor] = useState(0);
  const [speed, setSpeed] = useState(220);
  const [graphVersion, setGraphVersion] = useState(0);
  const [lastCycle, setLastCycle] = useState<CycleInfo | null>(null);
  const [hoverMove, setHoverMove] = useState<string | null>(null);
  const [lastScramble, setLastScramble] = useState<{ text: string; seed: string } | null>(null);
  const [toastMsg, setToast] = useState<string | null>(null);
  const rendererRef = useRef<CubeRenderer | null>(null);
  const graphs = useRef<Record<number, StateGraph>>({});
  const live = useRef({ state, history, cursor, n, speed });
  live.current = { state, history, cursor, n, speed };

  const graph = useMemo(() => {
    if (!graphs.current[n]) {
      graphs.current[n] = new StateGraph(n);
      graphs.current[n].reset(identity(getPuzzle(n).size));
    }
    return graphs.current[n];
  }, [n]);

  const toast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3200);
  }, []);

  /** Applies moves to the logical state, queues animations, updates graph & history. */
  const applyMoves = useCallback(
    (moves: Move[], opts: { animate?: boolean; record?: 'push' | 'undo' | 'redo' | 'none' } = {}) => {
      const { n: nn, speed: sp } = live.current;
      let s = live.current.state;
      const P = getPuzzle(nn);
      const r = rendererRef.current;
      const g = graphs.current[nn];
      let cycle: CycleInfo | null = null;
      for (const m of moves) {
        if (!P.moves.has(m.base)) throw new Error(`"${m.base}" não existe no ${nn}×${nn}×${nn}`);
        s = applyMove(P, s, m);
        if (r && opts.animate !== false) r.animate(m, s, sp);
        const c = g.recordMove(s);
        if (c && freeReduce(c.word.map((w) => parseAlg(w)[0])).length > 0) cycle = c;
      }
      r?.paint(s);
      live.current.state = s;
      setStateRaw(s);
      setGraphVersion(g.version);
      if (cycle) setLastCycle(cycle);
      const rec = opts.record ?? 'push';
      if (rec === 'push') {
        const h = live.current.history.slice(0, live.current.cursor).concat(moves);
        live.current.history = h;
        live.current.cursor = h.length;
        setHistory(h);
        setCursor(h.length);
      }
    },
    [],
  );

  const doMove = useCallback((m: Move, opts?: { animate?: boolean }) => applyMoves([m], opts), [applyMoves]);
  const doAlg = useCallback(
    (text: string | Move[], opts?: { animate?: boolean; record?: boolean }) => {
      const ms = typeof text === 'string' ? parseAlg(text) : text;
      applyMoves(ms, { animate: opts?.animate, record: opts?.record === false ? 'none' : 'push' });
    },
    [applyMoves],
  );
  const undo = useCallback(() => {
    const { history: h, cursor: c } = live.current;
    if (c === 0) return;
    applyMoves([invertMove(h[c - 1])], { record: 'undo' });
    live.current.cursor = c - 1;
    setCursor(c - 1);
  }, [applyMoves]);
  const redo = useCallback(() => {
    const { history: h, cursor: c } = live.current;
    if (c >= h.length) return;
    applyMoves([h[c]], { record: 'redo' });
    live.current.cursor = c + 1;
    setCursor(c + 1);
  }, [applyMoves]);

  const setState = useCallback((s: Uint8Array) => {
    const g = graphs.current[live.current.n];
    rendererRef.current?.clearQueue();
    rendererRef.current?.paint(s);
    live.current.state = s;
    setStateRaw(s);
    g.reset(s);
    setGraphVersion(g.version);
    setHistory([]);
    setCursor(0);
    live.current.history = [];
    live.current.cursor = 0;
    setLastCycle(null);
  }, []);

  const reset = useCallback(() => {
    setState(identity(getPuzzle(live.current.n).size));
    setLastScramble(null);
  }, [setState]);

  const scramble = useCallback(
    (length?: number, seed?: string) => {
      const nn = live.current.n;
      const sd = seed ?? Math.random().toString(36).slice(2, 8);
      const L = length ?? (nn === 3 ? 25 : 11);
      const w = randomScramble(mulberry32(sd), L, nn === 3 ? ['U', 'D', 'R', 'L', 'F', 'B'] : ['U', 'R', 'F']);
      const text = w.map((m) => m.base + (m.amount === 1 ? '' : m.amount === 2 ? '2' : "'")).join(' ');
      let s = identity(getPuzzle(nn).size);
      for (const m of w) s = applyMove(getPuzzle(nn), s, m);
      setState(s);
      setLastScramble({ text, seed: sd });
      return text;
    },
    [setState],
  );

  const setN = useCallback(
    (nn: 2 | 3) => {
      if (nn === live.current.n) return;
      rendererRef.current?.clearQueue();
      live.current.n = nn;
      setNState(nn);
      const s = identity(getPuzzle(nn).size);
      live.current.state = s;
      setStateRaw(s);
      setHistory([]);
      setCursor(0);
      live.current.history = [];
      live.current.cursor = 0;
      setLastCycle(null);
      setLastScramble(null);
      if (!graphs.current[nn]) graphs.current[nn] = new StateGraph(nn);
      graphs.current[nn].reset(s);
      setGraphVersion(graphs.current[nn].version);
    },
    [],
  );

  useEffect(() => {
    rendererRef.current?.setPuzzle(n);
    rendererRef.current?.paint(live.current.state);
  }, [n]);

  const api: LabApi = {
    n, setN, mode, setMode, state, history, cursor, speed, setSpeed, doMove, doAlg, undo, redo, reset, scramble, setState,
    graph, graphVersion, lastCycle, rendererRef, hoverMove, setHoverMove, lastScramble, toast, toastMsg,
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
