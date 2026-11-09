import { useEffect, useRef, useState } from 'react';
import { CubeRenderer } from '../viz3d/CubeRenderer';
import { useLab } from './lab';
import { formatMove, parseAlg, type Move } from '../core/notation';
import { Info } from './Info';

export function CubeView() {
  const host = useRef<HTMLDivElement>(null);
  const lab = useLab();
  useEffect(() => {
    const r = new CubeRenderer(host.current!);
    lab.rendererRef.current = r;
    r.setPuzzle(lab.n);
    r.paint(lab.state);
    const ro = new ResizeObserver(() => r.resize());
    ro.observe(host.current!);
    return () => {
      ro.disconnect();
      r.dispose();
      lab.rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const r = lab.rendererRef.current;
    if (r) r.onMoveRequest = (m) => lab.doMove(m);
  }, [lab.doMove, lab.rendererRef]);
  return (
    <div className="cube-view">
      <div ref={host} className="cube-host" />
      <button className="icon-btn cube-recenter" title="Recentralizar câmera" aria-label="Recentralizar câmera" onClick={() => lab.rendererRef.current?.resetCamera()}>
        ⟲
      </button>
      <div className="cube-hint">arraste um adesivo para girar · arraste o fundo para orbitar</div>
    </div>
  );
}

const FACE_KEYS: Record<string, string> = { u: 'U', d: 'D', r: 'R', l: 'L', f: 'F', b: 'B', m: 'M', e: 'E', s: 'S', x: 'x', y: 'y', z: 'z' };

export function useKeyboardMoves() {
  const lab = useLab();
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) lab.redo();
        else lab.undo();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') {
        ev.preventDefault();
        lab.redo();
        return;
      }
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const base = FACE_KEYS[ev.key.toLowerCase()];
      if (!base) return;
      if (lab.n === 2 && 'MES'.includes(base)) return;
      ev.preventDefault();
      lab.doMove({ base, amount: ev.shiftKey ? 3 : 1 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lab]);
}

export function MovePad() {
  const lab = useLab();
  const groups = lab.n === 3 ? ['U', 'D', 'R', 'L', 'F', 'B', 'M', 'E', 'S', 'x', 'y', 'z'] : ['U', 'D', 'R', 'L', 'F', 'B', 'x', 'y', 'z'];
  return (
    <div className="movepad" role="group" aria-label="Movimentos">
      {groups.map((b) => (
        <div key={b} className={`movecol ${'xyz'.includes(b) ? 'rot' : 'MES'.includes(b) ? 'slice' : ''}`}>
          {[1, 3, 2].map((a) => {
            const m: Move = { base: b, amount: a as 1 | 2 | 3 };
            const name = formatMove(m);
            return (
              <button
                key={a}
                className="move-btn"
                onClick={() => lab.doMove(m)}
                onMouseEnter={() => lab.setHoverMove(name)}
                onMouseLeave={() => lab.setHoverMove(null)}
                onFocus={() => lab.setHoverMove(name)}
                onBlur={() => lab.setHoverMove(null)}
                title={`Executar ${name}`}
              >
                {name}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function SequenceBar() {
  const lab = useLab();
  const [text, setText] = useState("R U R' U'");
  const [err, setErr] = useState<string | null>(null);
  const [seed, setSeed] = useState('');
  const run = (ev?: React.FormEvent) => {
    ev?.preventDefault();
    try {
      lab.doAlg(text);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <div className="seqbar">
      <form onSubmit={run} className="row">
        <label className="sr-only" htmlFor="alg">Sequência de movimentos</label>
        <input
          id="alg"
          className="input mono grow"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            try {
              parseAlg(e.target.value);
              setErr(null);
            } catch (x) {
              setErr((x as Error).message);
            }
          }}
          placeholder="ex.: (R U R' U')6"
          spellCheck={false}
        />
        <button className="btn primary" type="submit" disabled={!!err}>Executar</button>
        <Info title="Notação">
          <p>Notação de Singmaster: <code>X</code> = quarto de volta horário olhando para a face X; <code>X'</code> = anti-horário (X⁻¹ = X³); <code>X2</code> = meia-volta.</p>
          <p>Faces <code>U D R L F B</code>; fatias <code>M E S</code> (3×3×3; seguem L, D, F); rotações <code>x y z</code> (seguem R, U, F).</p>
          <p>Grupos com expoente: <code>(R U R' U')6</code>, <code>(R U)^105</code>. Teclado: letra = horário, Shift+letra = anti-horário, Ctrl+Z / Ctrl+Y.</p>
        </Info>
      </form>
      {err && <div className="error" role="alert">{err}</div>}
      <div className="row wrap gap">
        <button className="btn" onClick={lab.undo} disabled={lab.cursor === 0} title="Desfazer (Ctrl+Z)">↶ Desfazer</button>
        <button className="btn" onClick={lab.redo} disabled={lab.cursor >= lab.history.length} title="Refazer (Ctrl+Y)">↷ Refazer</button>
        <button className="btn" onClick={lab.reset}>Reiniciar</button>
        <span className="row gap-s">
          <input className="input mono seed" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="semente" aria-label="Semente do embaralhamento" />
          <button className="btn" onClick={() => lab.scramble(undefined, seed || undefined)}>Embaralhar</button>
        </span>
        <label className="row gap-s speed">
          <span className="muted">Velocidade</span>
          <input type="range" min={0} max={600} step={20} value={600 - lab.speed} onChange={(e) => lab.setSpeed(600 - Number(e.target.value))} aria-label="Velocidade das animações" />
        </label>
      </div>
      {lab.lastScramble && (
        <div className="muted small mono">
          Embaralhamento (semente <b>{lab.lastScramble.seed}</b>): {lab.lastScramble.text}
        </div>
      )}
    </div>
  );
}

export function HistoryBar() {
  const lab = useLab();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ left: box.current.scrollWidth, behavior: 'smooth' });
  }, [lab.history.length]);
  return (
    <div className="history" aria-label="Histórico de movimentos">
      <span className="muted small">Histórico</span>
      <div className="history-moves mono" ref={box}>
        {lab.history.length === 0 && <span className="muted">—</span>}
        {lab.history.map((m, i) => (
          <span key={i} className={`hm ${i < lab.cursor ? '' : 'undone'}`}>{formatMove(m)}</span>
        ))}
      </div>
      <span className="muted small">{lab.cursor} mov.</span>
    </div>
  );
}
