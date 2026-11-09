# 6. Revisão final: consistência entre software, dados e artigo

Data: 2026-11-09. Commit dos resultados: `8585968` (árvore limpa).

## 6.1 Verificações executadas

| Verificação | Comando | Resultado |
|---|---|---|
| Tipos | `npm run typecheck` | sem erros |
| Testes | `npm test` | 55/55 passam |
| Build | `npm run build` | ok (chunks: app 136 kB, react 141 kB, three 491 kB, worker 39 kB) |
| Experimentos | `npm run experiments` | E0–E4, 4 052 linhas, ≈ 10,7 min |
| Análise | `python3 experiments/analysis/analyze.py` | 6 figuras, 6 tabelas, 80 macros |
| Artigo | `make -C paper` | 20 páginas, sem referências indefinidas nem *overfull boxes* |
| Interface | Playwright (desktop 1500×1000 e mobile 390×844) | fluxos Explorar/Resolver/Investigar ok; sem rolagem horizontal no mobile; solução de duas fases aplicada leva a 0/54 adesivos fora do lugar |

## 6.2 Afirmações do artigo × evidência

| Afirmação | Evidência |
|---|---|
| Permutações derivadas da geometria reproduzem as tabelas de Kociemba | `tests/core.test.ts` "reproduces the standard facelet tables" |
| Palavras ↦ produtos é homomorfismo | testes "homomorphism", "w · w⁻¹ = e" |
| Ordens 105, 6, 1260 | teste "classical element orders" |
| Conversão adesivos↔cubinhos é bijeção e homomorfismo (100 pares) | testes "facelet ↔ cubie", "group homomorphism" |
| Invariantes em 300 estados | teste "invariants hold on every reachable state" |
| \|G\| e ordens de subgrupos | E0 + testes Schreier–Sims |
| Distribuição do 2×2×2 | E0 + teste "full BFS reproduces…" |
| Heurísticas admissíveis/consistentes | teste "heuristics (2×2×2)" (5000 estados × 6 heurísticas × 2 métricas) e admissibilidade de h_PDB no 3×3×3 |
| BFS/bidirecional/A\*/IDA\* ótimos | teste contra a tabela exata; E2/E3: 100% das soluções = d\* |
| Replay corresponde à execução | teste "trace is a faithful log" |
| Duas fases: válido, não ótimo | testes de validade; E3b: 97% ótimas em embaralhamentos curtos, excesso até 8 |
| Diagrama estrutural exato | teste "every sticker lies exactly on its two layer circles" (erro < 1e-9) |
| Esferas do 3×3×3 = OEIS | E4 + teste "HTM generators create triangles…" |
| Ciclos ↔ relações (R⁴, sexy⁶) | testes "state graph" |
| 55 testes | saída do Vitest |

## 6.3 Problemas encontrados e corrigidos durante a revisão

1. **Metadado de semente incorreto** na primeira execução dos experimentos (registrava a
   semente padrão da função de metadados). Dados idênticos; corrigido e reexecutado.
2. **Ciclo R⁴ não era anunciado** no grafo de estados: a trivialidade de um ciclo era
   testada com redução módulo X⁴ = e, que considera R⁴ trivial. Substituída pela redução no
   grupo livre (cancelar só g·g⁻¹), com teste.
3. Frases imprecisas no rascunho do artigo corrigidas a partir dos dados (porcentagem de
   estados a distância 8–9 no 2×2×2 é 75%, não 88%; razão h_pec/h_PDB no 3×3×3 é 50–90×).
4. Algoritmo padrão no modo Resolver não era redefinido ao trocar de cubo (A\* era usado no
   3×3×3 embaralhado); agora volta ao padrão (duas fases no 3×3×3).

## 6.4 Pendências conhecidas (não bloqueantes)

* Sem estudo de usabilidade com usuários.
* Tempos medidos em um único ambiente, sem repetições independentes por instância.
* Acessibilidade: controles têm rótulos ARIA e foco visível; o cubo 3D e os grafos em canvas
  têm descrição textual, mas a exploração de grafos não é navegável por teclado.
