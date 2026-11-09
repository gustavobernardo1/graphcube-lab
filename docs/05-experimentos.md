# 5. Experimentos computacionais

## 5.1 Como reproduzir

```bash
cd app
npm install
npm run experiments              # E0–E4 completos (≈ 11 min em 4 núcleos Xeon 2,1 GHz)
npm run experiments -- --quick   # versão reduzida (≈ 30 s)
npm run experiments -- --only E2 --seed 123
cd ..
pip install numpy pandas matplotlib scipy
python3 experiments/analysis/analyze.py   # figuras, tabelas LaTeX e macros do artigo
```

Saídas: `experiments/results/E*.json` (metadados + linhas) e `E*.csv` (linhas).
Os mesmos protocolos (`app/src/experiments/protocols.ts`) rodam no navegador (modo
**Investigar**), que também importa os JSON da CLI.

## 5.2 Metadados registrados

experimento, título, versão do software, commit git (`+dirty` se houver alterações não
commitadas), data, duração, **semente efetiva**, parâmetros, convenção de contagem
(HTM/QTM), limites computacionais e ambiente (Node/navegador, SO, CPU, RAM).

## 5.3 Protocolos

| Id | Pergunta | Instâncias | Algoritmos | Semente |
|---|---|---|---|---|
| E0 | O núcleo reproduz a literatura? | 7 grupos; 2×2×2 inteiro (HTM, QTM) | Schreier–Sims; BFS completa | — |
| E1 | Esforço vs. L e vs. d* | 2×2×2: L = 0…20, 30 embaralhamentos por L | BFS, bidirecional | `e1` |
| E2 | Comparação de algoritmos | 2×2×2: 20 estados uniformes em cada camada d* = 1…11 | BFS, bidirecional, A*, IDA* (h_max) | `e2` |
| E3 | Heurísticas | 2×2×2: 15 estados uniformes em d* ∈ {2,4,6,7,8,9,10,11} | A*, IDA* × 6 heurísticas | `e3` |
| E3b | 3×3×3 ótimo vs. duas fases | 10 embaralhamentos por L ∈ {2,4,6,…,12}; 100 estados uniformes de G | IDA* (h_PDB, h_pec ≤ 7), duas fases | `e3b` |
| E4 | Estrutura de grafos de Cayley | 17 conjuntos de geradores | BFS de e + Schreier–Sims | — |

**Amostragem uniforme por camada (E2, E3).** Índices uniformes em [0, 3 674 160) são
sorteados e aceitos se d*(s) = d (rejeição). Como a codificação é uma bijeção, isso produz
amostras uniformes em {s : d*(s) = d}.

**Estados uniformes do 3×3×3 (E3b).** Permutações e orientações sorteadas
independentemente; a paridade é corrigida trocando duas arestas e as últimas orientações
são determinadas pelas somas — distribuição uniforme em G pelo Teorema 2.

## 5.4 Natureza das medidas

| Medida | Natureza |
|---|---|
| |⟨S⟩|, esferas |S(r)| completas, diâmetro, distribuição de distâncias, cintura | **propriedades do grafo** (exatas) |
| d*(s) no 2×2×2 | propriedade do estado (exata, tabela) |
| d*(s) no 3×3×3 | exata apenas quando IDA* termina; senão só limites |
| L (comprimento do embaralhamento) | parâmetro do **procedimento** de amostragem |
| d* médio em função de L | depende do procedimento (passeio aleatório sem repetição de face) |
| nós, tempo, memória | dependem do algoritmo, da implementação e do hardware |
| bola desenhada na interface | **visualização parcial** (limite de vértices) |

## 5.5 Limites

E1/E2: 4·10⁶ nós, 60 s. E3: 3·10⁶ nós, 30 s (execuções que estouram são registradas como
falha por limite, não descartadas). E3b: 3·10⁷ nós, 120 s; duas fases com 200 ms
(embaralhamentos) e "1ª solução" / "alvo ≤ 20 ou 1 s" (estados uniformes). E4: 10⁶
vértices por conjunto no 3×3×3.
