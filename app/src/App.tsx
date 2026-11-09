import { useEffect, useState } from 'react';
import { LabProvider, useLab, type Mode } from './ui/lab';
import { CubeView, MovePad, SequenceBar, HistoryBar, useKeyboardMoves } from './ui/CubePanel';
import { StructuralView } from './ui/StructuralView';
import { StateGraphView } from './ui/StateGraphView';
import { CayleyView } from './ui/CayleyView';
import { MathPanel } from './ui/MathPanel';
import { SolvePanel } from './ui/SolvePanel';
import { InvestigatePanel } from './ui/InvestigatePanel';

type GraphTab = 'structural' | 'states' | 'cayley';

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="11" cy="20" r="9" fill="none" stroke="var(--axis-x)" strokeWidth="2.2" />
      <circle cx="16" cy="11" r="9" fill="none" stroke="var(--axis-y)" strokeWidth="2.2" />
      <circle cx="21" cy="20" r="9" fill="none" stroke="var(--axis-z)" strokeWidth="2.2" />
      <circle cx="16" cy="17" r="2.6" fill="var(--text)" />
    </svg>
  );
}

function Header({ onAbout }: { onAbout: () => void }) {
  const lab = useLab();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return (localStorage.getItem('gcl-theme') as 'dark' | 'light') ?? 'dark';
    } catch {
      return 'dark';
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('gcl-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const modes: [Mode, string, string][] = [
    ['explore', 'Explorar', 'Manipular o cubo e as representações matemáticas'],
    ['solve', 'Resolver', 'Executar e visualizar algoritmos de busca'],
    ['investigate', 'Investigar', 'Experimentos, métricas e exportação'],
  ];
  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <span className="brand-name">GraphCube <b>Lab</b></span>
      </div>
      <nav className="modes" role="tablist" aria-label="Modo">
        {modes.map(([m, label, title]) => (
          <button key={m} role="tab" aria-selected={lab.mode === m} className={`mode ${lab.mode === m ? 'on' : ''}`} onClick={() => lab.setMode(m)} title={title}>
            {label}
          </button>
        ))}
      </nav>
      <div className="top-right">
        <div className="segmented" role="group" aria-label="Tamanho do cubo">
          {([2, 3] as const).map((n) => (
            <button key={n} className={lab.n === n ? 'on' : ''} aria-pressed={lab.n === n} onClick={() => lab.setN(n)}>
              {n}×{n}×{n}
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Alternar tema claro/escuro" title="Tema">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <button className="icon-btn" onClick={onAbout} aria-label="Sobre o GraphCube Lab" title="Sobre">
          i
        </button>
      </div>
    </header>
  );
}

function GraphCard() {
  const [tab, setTab] = useState<GraphTab>('structural');
  const tabs: [GraphTab, string, string][] = [
    ['structural', 'A · Estrutural', 'posições de adesivos × camadas'],
    ['states', 'B · Estados', 'configurações × movimentos'],
    ['cayley', 'C · Cayley', 'elementos de ⟨S⟩ × geradores'],
  ];
  return (
    <section className="card graph-card" aria-label="Representações em grafo">
      <div className="tabs" role="tablist">
        {tabs.map(([t, label, sub]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            <span>{label}</span>
            <span className="tab-sub">{sub}</span>
          </button>
        ))}
      </div>
      {tab === 'structural' && <StructuralView />}
      {tab === 'states' && <StateGraphView />}
      {tab === 'cayley' && <CayleyView />}
    </section>
  );
}

function CubeCard() {
  const lab = useLab();
  return (
    <section className="card cube-card" aria-label="Cubo">
      <div className="card-head">
        <h2>Cubo {lab.n}×{lab.n}×{lab.n}</h2>
        <span className="muted small">{lab.n === 3 ? '|G| = 43 252 003 274 489 856 000' : '|G₂| = 3 674 160 (módulo rotações)'}</span>
      </div>
      <CubeView />
      <MovePad />
      <SequenceBar />
      <HistoryBar />
    </section>
  );
}

function About({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal card" role="dialog" aria-modal="true" aria-label="Sobre" onClick={(e) => e.stopPropagation()}>
        <h2>GraphCube Lab</h2>
        <p>Plataforma para explorar o cubo mágico com teoria dos grupos, teoria dos grafos e algoritmos de busca. Três representações, matematicamente distintas:</p>
        <ol>
          <li><b>Estrutural</b> — vértices são as <i>posições de adesivos</i>; círculos são as camadas. Um estado é uma coloração do diagrama.</li>
          <li><b>Estados</b> — vértices são <i>configurações completas</i>; arestas são movimentos. Explorado implicitamente a partir do estado atual.</li>
          <li><b>Cayley</b> — vértices são <i>elementos</i> do subgrupo ⟨S⟩; arestas são multiplicações por geradores. Centrado na identidade.</li>
        </ol>
        <p>Convenção: um estado é a permutação s (posição → adesivo); aplicar o movimento m resulta em s·m e palavras são lidas da esquerda para a direita.</p>
        <p className="small muted">O diagrama estrutural é inspirado no <a href="https://github.com/DorianLaguna/GraphCube" target="_blank" rel="noreferrer">GraphCube</a> de Dorian Laguna; nenhum código ou recurso dele foi reutilizado (o repositório não declara licença). GraphCube Lab v{__APP_VERSION__} — licença MIT.</p>
        <button className="btn primary" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}

function Shell() {
  const lab = useLab();
  const [about, setAbout] = useState(false);
  useKeyboardMoves();
  return (
    <div className="app">
      <Header onAbout={() => setAbout(true)} />
      <main className={`main mode-${lab.mode}`}>
        {lab.mode !== 'investigate' ? (
          <div className="workspace">
            <CubeCard />
            <div className="right-col">
              {lab.mode === 'explore' ? (
                <>
                  <GraphCard />
                  <section className="card" aria-label="Informações matemáticas">
                    <div className="card-head"><h2>Estado como elemento do grupo</h2></div>
                    <MathPanel />
                  </section>
                </>
              ) : (
                <section className="card" aria-label="Resolver">
                  <div className="card-head"><h2>Busca de caminhos até o estado resolvido</h2></div>
                  <SolvePanel />
                </section>
              )}
            </div>
          </div>
        ) : (
          <InvestigatePanel />
        )}
      </main>
      <footer className="footer small muted">
        GraphCube Lab v{__APP_VERSION__} · núcleo matemático testado (Schreier–Sims: |G| = 43 252 003 274 489 856 000) · inspirado no GraphCube de D. Laguna
      </footer>
      {about && <About onClose={() => setAbout(false)} />}
      {lab.toastMsg && <div className="toast" role="status">{lab.toastMsg}</div>}
    </div>
  );
}

export default function App() {
  return (
    <LabProvider>
      <Shell />
    </LabProvider>
  );
}
