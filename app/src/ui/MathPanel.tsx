import { useEffect, useMemo, useState } from 'react';
import { getPuzzle } from '../core/geometry';
import { cycles, order, sign, compose, inverse, isIdentity, support } from '../core/perm';
import { canonicalFrame } from '../core/symmetry';
import { toCubie, invariants, CORNER_NAMES, EDGE_NAMES, type CubieState } from '../core/cubie';
import { algToPerm, parseAlg, formatAlg, htmLength, qtmLength, simplifyAlg } from '../core/notation';
import { encodeCubie2 } from '../search/cube2';
import { auxWorker } from '../workers/client';
import { useLab } from './lab';
import { Info, Badge } from './Info';

let exact2: Uint8Array | null = null;
let exact2Promise: Promise<Uint8Array> | null = null;
export function getExact2(): Promise<Uint8Array> {
  if (exact2) return Promise.resolve(exact2);
  exact2Promise ??= auxWorker()
    .call<Uint8Array>('exact2', { metric: 'HTM' })
    .then((t) => (exact2 = t));
  return exact2Promise;
}
export const exact2Sync = (): Uint8Array | null => exact2;

function cubieCycles(c: CubieState) {
  const fmt = (perm: Uint8Array, ori: Uint8Array, names: readonly string[], mod: number) =>
    cycles(perm).map((cy) => {
      const tw = cy.reduce((a, i) => a + ori[i], 0) % mod;
      return { text: '(' + cy.map((i) => names[i]).join(' ') + ')', twist: tw, len: cy.length };
    });
  const fixedTwisted = (perm: Uint8Array, ori: Uint8Array, names: readonly string[]) =>
    [...perm].map((p, i) => (p === i && ori[i] ? { text: names[i], twist: ori[i], len: 1 } : null)).filter(Boolean) as { text: string; twist: number; len: number }[];
  return {
    corners: [...fmt(c.cp, c.co, CORNER_NAMES, 3), ...fixedTwisted(c.cp, c.co, CORNER_NAMES)],
    edges: c.ep.length ? [...fmt(c.ep, c.eo, EDGE_NAMES, 2), ...fixedTwisted(c.ep, c.eo, EDGE_NAMES)] : [],
  };
}

function CycleList({ items, mod }: { items: { text: string; twist: number; len: number }[]; mod: 2 | 3 }) {
  if (!items.length) return <span className="muted">identidade</span>;
  return (
    <span className="mono cycles">
      {items.map((c, i) => (
        <span key={i} className="cyc" title={c.twist ? `torção acumulada ${c.twist} (mod ${mod})` : 'sem torção acumulada'}>
          {c.text}
          {c.twist ? <sub>{mod === 3 ? (c.twist === 1 ? '+' : '−') : '±'}</sub> : null}
        </span>
      ))}
    </span>
  );
}

export function MathPanel() {
  const lab = useLab();
  const P = getPuzzle(lab.n);
  const [dist, setDist] = useState<number | null>(null);
  const [bound, setBound] = useState<number | null>(null);
  const info = useMemo(() => {
    const { t } = canonicalFrame(P, lab.state);
    const c = toCubie(P, t);
    const inv = invariants(c);
    return { t, c, inv, cyc: cubieCycles(c), ord: order(t), moved: support(t).length };
  }, [lab.state, P]);

  useEffect(() => {
    let alive = true;
    setDist(null);
    setBound(null);
    if (lab.n === 2) {
      const idx = encodeCubie2(info.c);
      getExact2().then((tb) => alive && setDist(tb[idx]));
    } else {
      auxWorker()
        .call<number[]>('bounds3', { cubies: [info.c] })
        .then((b) => alive && setBound(b[0]));
    }
    return () => {
      alive = false;
    };
  }, [info, lab.n]);

  const word = lab.history.slice(0, lab.cursor);
  const reduced = simplifyAlg(word);
  return (
    <div className="panel-body math">
      <div className="kv-grid">
        <div className="kv">
          <span className="k">
            Distância ao resolvido{' '}
            <Info title="Distância">
              <p>d*(s) = comprimento mínimo de uma palavra (HTM) que leva o estado s ao resolvido = distância no grafo de Cayley.</p>
              <p>2×2×2: valor <b>exato</b> lido da tabela de 3 674 160 estados (BFS completa). 3×3×3: apenas um <b>limite inferior</b> admissível (máximo de três pattern databases).</p>
            </Info>
          </span>
          <span className="v">
            {lab.n === 2 ? (dist === null ? '…' : <>d* = {dist} <Badge kind="exact">exato</Badge></>) : info.moved === 0 ? <>d* = 0 <Badge kind="exact">resolvido</Badge></> : bound === null ? '…' : <>d* ≥ {bound} <Badge kind="partial">limite inferior</Badge></>}
          </span>
        </div>
        <div className="kv">
          <span className="k">
            Ordem do elemento{' '}
            <Info title="Ordem">
              <p>Menor k ≥ 1 com g<sup>k</sup> = e. Igual ao mmc dos comprimentos dos ciclos de g sobre os adesivos (ex.: R U tem ordem 105).</p>
            </Info>
          </span>
          <span className="v mono">{info.ord}</span>
        </div>
        <div className="kv">
          <span className="k">Adesivos fora do lugar</span>
          <span className="v mono">{info.moved} / {P.size}</span>
        </div>
        <div className="kv">
          <span className="k">
            Invariantes{' '}
            <Info title="Leis do cubo">
              <p>Um estado de cubinhos (σ, x, τ, y) é alcançável sse sgn(σ) = sgn(τ), Σxᵢ ≡ 0 (mod 3) e Σyᵢ ≡ 0 (mod 2). No 2×2×2 só existe a condição das torções.</p>
              <p>Cada giro de face é um 4-ciclo nos cantos e nas arestas (paridade ímpar em ambos), o que mantém as paridades iguais.</p>
            </Info>
          </span>
          <span className="v mono">
            Σx ≡ {info.inv.twistSum} (3){lab.n === 3 && <> · Σy ≡ {info.inv.flipSum} (2) · sgn σ = {info.inv.cornerParity ? '−1' : '+1'}, sgn τ = {info.inv.edgeParity ? '−1' : '+1'}</>}
            {' '}
            {info.inv.solvable ? <Badge kind="exact">alcançável</Badge> : <Badge kind="warn">ilegal</Badge>}
          </span>
        </div>
      </div>
      <div className="kv block">
        <span className="k">Cantos — ciclos de σ (com torção acumulada)</span>
        <CycleList items={info.cyc.corners} mod={3} />
      </div>
      {lab.n === 3 && (
        <div className="kv block">
          <span className="k">Arestas — ciclos de τ (com inversão acumulada)</span>
          <CycleList items={info.cyc.edges} mod={2} />
        </div>
      )}
      <div className="kv block">
        <span className="k">Palavra executada (desde o último reinício)</span>
        <span className="mono small">
          {word.length ? formatAlg(word) : '—'}{' '}
          {word.length > 0 && (
            <span className="muted">
              ({htmLength(word)} HTM, {qtmLength(word)} QTM; reduzida livremente: {htmLength(reduced)})
            </span>
          )}
        </span>
      </div>
      <OrderCalculator />
    </div>
  );
}

function OrderCalculator() {
  const lab = useLab();
  const [a, setA] = useState("R U R' U'");
  const [b, setB] = useState('');
  const P = getPuzzle(lab.n);
  let out: React.ReactNode;
  try {
    const ga = algToPerm(P, parseAlg(a));
    if (b.trim()) {
      const gb = algToPerm(P, parseAlg(b));
      const comm = compose(compose(compose(ga, gb), inverse(ga)), inverse(gb));
      const conj = compose(compose(gb, ga), inverse(gb));
      out = (
        <div className="mono small">
          <div>[A,B] = A B A⁻¹ B⁻¹: ordem {order(comm)}, move {support(comm).length} adesivos{isIdentity(comm) ? ' (A e B comutam)' : ''}</div>
          <div>B A B⁻¹ (conjugado): ordem {order(conj)}, mesmo tipo de ciclo que A: {String(order(conj) === order(ga))}</div>
        </div>
      );
    } else {
      out = (
        <div className="mono small">
          ordem {order(ga)} · sgn em Ω = {sign(ga) > 0 ? '+1' : '−1'} · move {support(ga).length} adesivos · tipo de ciclo [{cycles(ga).map((c) => c.length).join(',') || '—'}]
        </div>
      );
    }
  } catch (e) {
    out = <div className="error small">{(e as Error).message}</div>;
  }
  return (
    <div className="calc">
      <div className="row gap-s">
        <span className="k">Calculadora de grupo</span>
        <Info title="Comutadores e conjugação">
          <p>Comutador [A,B] = A·B·A⁻¹·B⁻¹ (executado da esquerda para a direita). Se A e B quase comutam, [A,B] move poucas peças — base de muitos algoritmos de resolução.</p>
          <p>Conjugado B·A·B⁻¹: "prepara" com B, aplica A, desfaz B. Tem a mesma estrutura de ciclos de A, em outras posições.</p>
        </Info>
      </div>
      <div className="row gap-s">
        <input className="input mono grow" value={a} onChange={(e) => setA(e.target.value)} aria-label="Sequência A" placeholder="A" />
        <input className="input mono grow" value={b} onChange={(e) => setB(e.target.value)} aria-label="Sequência B (opcional)" placeholder="B (opcional)" />
      </div>
      {out}
    </div>
  );
}
