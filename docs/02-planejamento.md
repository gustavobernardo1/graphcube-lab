# 2. Planejamento científico e computacional

## 2.1 Questões que o projeto investiga

* **Q1 (modelagem).** Como representar estados e movimentos do cubo de forma que a
  implementação seja verificável contra resultados conhecidos da teoria de grupos
  (ordem do grupo, invariantes de paridade e orientação)?
* **Q2 (representações).** Quais as relações precisas entre o diagrama estrutural
  (adesivos/camadas), o grafo de estados e os grafos de Cayley de subgrupos?
* **Q3 (algoritmos).** Como BFS, BFS bidirecional, A\* e IDA\* se comparam, em tempo,
  memória e nós expandidos, em função da **distância mínima real** d\*(s) — e não
  do comprimento do embaralhamento?
* **Q4 (heurísticas).** Qual o efeito de heurísticas admissíveis/consistentes de
  diferentes informatividades (contagem de peças, *pattern databases*) sobre o
  esforço de busca?
* **Q5 (estrutura).** Como o conjunto de geradores S altera crescimento de esferas,
  diâmetro, distribuição de distâncias, cintura (girth) e simetrias de Cay(⟨S⟩, S)?

## 2.2 Decisões matemáticas centrais (registradas também em `DECISIONS.md`)

1. **Fonte única de verdade geométrica.** Adesivos são pares (posição p ∈ ℤ³, normal
   u). Um giro é uma rotação de 90° aplicada aos adesivos de uma camada. Todas as
   permutações de movimentos, tabelas de cantos/arestas e o diagrama estrutural são
   **derivados** dessa geometria — nada é digitado à mão. As tabelas padrão de
   Kociemba são usadas apenas como *oráculo* nos testes.
2. **Convenção de estado.** Um estado é uma bijeção s: Ω → Ω, *posição → adesivo
   original*. Produto (g·h)[i] = g[h[i]]. Aplicar o movimento m ao estado s produz
   s·m. Assim, palavras são lidas da esquerda para a direita (ordem de execução)
   e w ↦ s_w é um homomorfismo do monoide livre de palavras para Sym(Ω).
3. **Grupo do 3×3×3:** G = ⟨U, D, R, L, F, B⟩ com centros fixos.
   Fatias (M, E, S) e rotações (x, y, z) são suportadas na interface, e o estado é
   normalizado por uma rotação global antes da resolução.
4. **Grupo do 2×2×2:** G₂ = ⟨U, R, F⟩, que fixa o canto DBL; cada estado físico
   corresponde a exatamente um elemento de G₂ módulo as 24 rotações do cubo.
   |G₂| = 7!·3⁶ = 3 674 160.
5. **Métricas:** HTM (meia-volta conta 1) e QTM (apenas quartos de volta); a métrica
   é sempre registrada nos experimentos.

## 2.3 Arquitetura

```
app/src/
  core/          núcleo matemático puro (sem DOM): permutações, geometria, notação,
                 modelo de cubinhos, coordenadas, legalidade, Schreier–Sims, PRNG
  search/        espaços de estados, BFS, BFS bidirecional, A*, IDA*, heurísticas,
                 pattern databases, solucionador ótimo 2×2, duas fases (3×3)
  graph/         grafo estrutural (geometria do diagrama), explorador de estados,
                 explorador de Cayley (esferas, cintura, simetrias)
  experiments/   protocolos de experimentos (compartilhados por UI e CLI)
  workers/       Web Worker que executa buscas e experimentos fora da thread de UI
  viz3d/         cubo Three.js (renderização e animação, sem lógica de estado)
  vizgraph/      renderização em canvas + layout por forças (d3-force)
  ui/            componentes React (modos Explorar, Resolver, Investigar)
app/tests/       testes Vitest (propriedades matemáticas e algoritmos)
app/scripts/     CLI Node (experimentos, verificação de grupo)
experiments/     resultados brutos (JSON/CSV), análise Python, figuras
paper/           artigo LaTeX (BibLaTeX/biber)
```

Regra de dependência: `core` ← `search` ← `graph`/`experiments` ← `workers`/`ui`.
`viz3d` e `vizgraph` recebem apenas dados (estados, listas de nós/arestas) e nunca
importam lógica de busca. Os **mesmos módulos TypeScript** são executados no
navegador e na CLI Node — garantindo que o artigo descreva exatamente o software.

## 2.4 Fases e critérios de aceitação

| Fase | Entregáveis | Critério de aceitação |
|---|---|---|
| 1 Investigação | `docs/01`, `docs/02`, estrutura do repositório | análise baseada no código; licença verificada |
| 2 Núcleo | permutações, geometria, movimentos, cubinhos, legalidade, Schreier–Sims | testes: identidade, inversos, ordens (R⁴=e, (RU)¹⁰⁵=e, sexy⁶=e), invariantes, |G| = 43 252 003 274 489 856 000, |G₂| = 3 674 160 |
| 3 Interface | cubo 3D, diagrama estrutural, grafo de estados, Cayley | sincronização por estado único; verificação manual + build |
| 4 Algoritmos | BFS, bidirecional, A\*, IDA\*, heurísticas, PDBs, duas fases | soluções verificadas aplicando-as ao estado; otimalidade conferida contra tabela exata do 2×2 |
| 5 Experimentos | CLI reprodutível, JSON/CSV com metadados, análise Python | rodadas reais com semente; distribuição de distâncias do 2×2 conferida com a literatura |
| 6 Artigo | `paper/` compilável + PDF | toda tabela/figura gerada a partir de `experiments/results` |
| 7 Revisão | consistência código ↔ artigo ↔ README | checklist em `docs/` |

## 2.5 Riscos e mitigação

* **Espaço do 3×3×3 (≈4,3·10¹⁹)** — nunca enumerado; buscas ótimas no 3×3 limitadas a
  instâncias curtas com orçamento de nós/tempo explícito; para estados arbitrários
  usa-se o método de duas fases (solução válida, **não necessariamente ótima**).
* **Custo de memória das buscas sem heurística** — limites de nós configuráveis;
  falhas por limite são registradas como "sem sucesso" (não descartadas).
* **Visualizações enganosas** — grafos parciais sempre rotulados com |V| exibido / |G|;
  animações de busca são *replays* do log de eventos da execução real.
