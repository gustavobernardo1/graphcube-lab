# 4. Algoritmos

Todos os algoritmos operam sobre um **grafo implícito** (`search/types.ts: SearchSpace`):
vértices são gerados sob demanda por `apply(s, m)`; nada é enumerado previamente (exceto
as tabelas exatas/PDBs, que são buscas em espaços *projetados* de tamanho controlado).

| Algoritmo | Arquivo | Garante mínimo? | Memória | Observações |
|---|---|---|---|---|
| BFS | `search/algorithms.ts` | sim | O(b^d) | camadas; visitados em tabela direta (2×2×2) ou `Map` |
| BFS bidirecional | idem | sim | O(b^{d/2}) | expande a menor fronteira; regra de término por camada completa |
| A* | idem | sim, se h admissível | O(nós gerados) | heap binário, desempate por maior g; reabre nós se h inconsistente |
| IDA* | idem | sim, se h admissível | O(d) | limiar f; poda canônica de sequências |
| Tabela exata (2×2×2) | `search/cube2.ts` | sim | 3,6 MB | BFS completa do grupo; descida gulosa em d* |
| Duas fases (3×3×3) | `search/twophase.ts` | **não** | ~8 MB | Kociemba: G → H → e |

## 4.1 Regra de término da BFS bidirecional

Expande-se uma camada inteira do lado de menor fronteira. Se após completar a camada
k_f+1 houver encontros, todos têm comprimento k_f+1+k_b e esse comprimento é mínimo: antes
desta camada não havia encontro, logo d > k_f + k_b; e todo encontro tem comprimento
≤ k_f+1+k_b. (Terminar no *primeiro* encontro sem completar a camada também daria o
mínimo neste caso de custos unitários e camadas completas do outro lado; completar a
camada torna o argumento direto.)

## 4.2 Instrumentação

Cada execução devolve `SearchResult`: expandidos (nós cujos sucessores foram gerados),
gerados (aplicações de movimento), descobertos (estados distintos armazenados),
pico armazenado (proxy de memória), profundidade máxima, tempo, iterações de IDA* e,
opcionalmente, o **log de eventos** (`discover`, `expand`, `bound`, `meet`, `goal`) na ordem
exata da execução, truncado após N eventos com indicação explícita. A interface apenas
*reproduz* esse log.

**Observação sobre memória.** No 2×2×2, BFS e BFS bidirecional usam tabelas de
endereçamento direto de tamanho fixo (3 674 160 entradas × 6 bytes); a memória física é
constante e o "pico armazenado" mede o número de estados que uma implementação com
tabela hash precisaria guardar. IDA* armazena apenas o caminho corrente (pico = d+1).

## 4.3 Heurísticas

2×2×2: `zero`, `misplaced` (⌈k/4⌉), `pdb-ori` (729), `pdb-perm` (5040), `pdb-max`,
`exact` (oráculo — usado só como referência). 3×3×3: `zero`, `misplaced`
(max(⌈cantos/4⌉, ⌈arestas/4⌉)), `pdb` (max de twist×slice, flip×slice, permutação de cantos).
Admissibilidade e consistência são **testadas** em amostras contra a distância exata
(`tests/search.test.ts`).

## 4.4 Duas fases (Kociemba)

Coordenadas: twist (2187), flip (2048), slice (495) na fase 1; permutação de cantos
(40 320), permutação das 8 arestas U/D (40 320) e das 4 arestas do meio (24) na fase 2.
Tabelas de movimento são geradas aplicando a multiplicação de cubinhos a representantes de
cada coordenada; tabelas de poda por BFS nos espaços produto. Fase 1 enumera soluções por
comprimento crescente (descartando as que terminam com movimento de H); cada uma é
completada por IDA* ótimo na fase 2 limitado pelo melhor total encontrado. Para quando
encontra solução ≤ alvo ou estoura o tempo. Validade de toda solução é testada aplicando-a
ao estado.

## 4.5 Limitações conhecidas

* Busca ótima no 3×3×3 só é viável para estados próximos (IDA* com h_PDB: d* ≤ 12 em
  segundos neste hardware); o ótimo para estados aleatórios (≈18 HTM) exigiria PDBs muito
  maiores (Korf 1997) ou o método de Rokicki et al. (2014).
* A* no 3×3×3 sem heurística forte esgota a memória rapidamente — o limite de nós é
  respeitado e a falha é reportada como tal.
* A tabela exata do 2×2×2 é construída no Web Worker (~0,4 s em Node; algo mais no navegador).
