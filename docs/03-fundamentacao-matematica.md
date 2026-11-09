# 3. Fundamentação matemática (resumo)

As demonstrações completas estão no artigo (`paper/sections/03-modelagem.tex`). Aqui
fixamos definições, convenções e os resultados efetivamente usados e testados pelo código.
Resultados conhecidos da literatura são marcados **[L]**; resultados verificados
computacionalmente neste projeto, **[V]**; observações próprias do projeto, **[P]**.

## 3.1 Adesivos, estados e movimentos

* **Adesivos.** Para o cubo n×n×n (n ∈ {2,3}), um adesivo é um par (p, u) com p ∈ ℤ³ o
  centro do cubinho (coordenadas em {−(n−1), …, n−1} de 2 em 2) e u ∈ {±e₁, ±e₂, ±e₃} a
  normal externa. Ω = conjunto das 6n² posições, indexadas na ordem URFDLB
  (`core/geometry.ts`). Eixos: x → R, y → U, z → F.
* **Giro.** O giro horário X de uma face com normal u_X é a rotação por −90° em torno de
  u_X (fórmula de Rodrigues: v ↦ −(u×v) + u(u·v)) aplicada às posições com p·u_X = n−1.
  Isso define σ_X ∈ Sym(Ω), σ_X(i) = posição para onde vai o adesivo em i.
* **Estado.** Uma bijeção s: Ω → Ω, s(i) = rótulo (posição original) do adesivo que está
  em i. O resolvido é a identidade e.
* **Convenção de produto.** (g·h)(i) = g(h(i)). Com m_X := σ_X⁻¹ temos
  s ↦ s·m_X = s∘σ_X⁻¹. Logo a palavra w = X₁X₂…X_k (executada da esquerda para a
  direita) leva e a s_w = m_{X₁}·m_{X₂}·…·m_{X_k}, e **w ↦ s_w é um homomorfismo** do
  monoide livre no grupo (Sym(Ω), ·) **[P, testado]**.

**Proposição 1 (estrutura de grupo).** G = ⟨m_U, …, m_B⟩ ≤ Sym(Ω) é um grupo: o produto é
associativo (composição de funções), e = id, inversos m_X⁻¹ = m_X³ (pois σ_X⁴ = id).
**[L]**, verificado por testes de propriedade em permutações aleatórias.

## 3.2 Representação por cubinhos

Para n = 3, com centros fixos, cada g ∈ G é descrito por (σ, x, τ, y): σ ∈ S₈ e τ ∈ S₁₂
permutações de cantos/arestas e x ∈ ℤ₃⁸, y ∈ ℤ₂¹² torções/inversões. O produto é o produto
semidireto (σ,x)·(σ',x') = (σσ', x∘σ' + x'). A conversão adesivos → cubinhos
(`core/cubie.ts`) é derivada da geometria e **reproduz exatamente as tabelas de facelets de
Kociemba [V]**; ela é um homomorfismo injetivo em G **[V, testado]**.

**Teorema 2 (Primeira Lei da Cubologia) [L].** (σ, x, τ, y) é alcançável sse
sgn σ = sgn τ, Σxᵢ ≡ 0 (mod 3) e Σyᵢ ≡ 0 (mod 2). Consequência: |G| = 8!·3⁷·12!·2¹¹/2 =
43 252 003 274 489 856 000. *Necessidade:* cada giro é um 4-ciclo em cantos e em arestas
(sgn = −1 em ambos) e preserva as somas. *Suficiência:* por comutadores que realizam
3-ciclos e torções/inversões de pares (Joyner 2008, cap. 11).
No projeto: necessidade testada em 300 estados; suficiência **amostrada** (estados legais
uniformes resolvidos pelo método de duas fases) e a ordem |G| **verificada por
Schreier–Sims [V]**.

**2×2×2.** Sem centros, fixamos o canto DBL: G₂ = ⟨U, R, F⟩, |G₂| = 7!·3⁶ = 3 674 160
**[L, V]**. Todo estado físico é igual, a menos de uma das 24 rotações globais, a exatamente
um elemento de G₂ (`core/symmetry.ts: canonicalFrame`).

## 3.3 Ciclos, ordem, comutadores e conjugação

* Ordem de g = mmc dos comprimentos dos ciclos de g em Ω. Exemplos testados: o(R U) = 105,
  o(R U R' U') = 6, o(R U2 D' B D') = 1260 (ordem máxima em G) **[L, V]**.
* Comutador [a,b] = a·b·a⁻¹·b⁻¹; conjugado b·a·b⁻¹ (preparar, aplicar, desfazer).
  Conjugados têm o mesmo tipo de ciclo **[L]**.

## 3.4 Três grafos distintos

| | vértices | arestas | tamanho |
|---|---|---|---|
| (1) Estrutural (incidência adesivo–camada) | 6n² posições + 3n camadas | pertença | 54+9 (n=3) |
| (2) Grafo de estados Γ(S) | configurações alcançáveis | s — s·m, m ∈ S | |G| |
| (3) Cayley Cay(H, S) | elementos de H = ⟨S⟩ | g — g·s | |H| |

**Proposição 3 [L].** Para S = S⁻¹ gerando G, g ↦ e·g é um isomorfismo Cay(G,S) ≅ Γ(S). A
distinção é de *ponto de vista*: no grafo de estados navegamos a partir do estado atual e
normalizamos por rotações globais (vértice = configuração física); no grafo de Cayley
escolhemos S livremente e estudamos o subgrupo ⟨S⟩ a partir de e.

**Proposição 4 [L].** Cay(H,S) é vértice-transitivo (h ↦ h'h⁻¹·h é automorfismo).
Consequências usadas no código: a distância d(g,h) = d(e, g⁻¹h); a cintura (girth) é o
comprimento do menor ciclo por e, i.e., da menor **relação** não trivial entre geradores;
uma BFS a partir de e basta.

**Simetrias.** O grupo O_h (48 simetrias) age por conjugação nos movimentos (reflexões
levam R a L'). Cada simetria que preserva S∪S⁻¹ induz um automorfismo de Cay(⟨S⟩,S)
que fixa e (`generatorStabilizer`).

## 3.5 Heurísticas admissíveis por projeções

**Proposição 5 [L, Culberson & Schaeffer 1998; Korf 1997].** Seja π: Γ → Γ' um
homomorfismo de grafos que leva arestas a arestas ou laços (projeção em coordenadas, ex.:
só as torções dos cantos). Então h(s) = d_{Γ'}(π(s), π(e)) satisfaz h(s) ≤ d(s,e) e
|h(s) − h(s·m)| ≤ 1: é **admissível e consistente**. O máximo de heurísticas consistentes é
consistente. Implementadas: PDB de orientação (729), de permutação (5040) e seu máximo no
2×2×2; twist×slice (1 082 565), flip×slice (1 013 760) e permutação dos cantos (40 320) no
3×3×3.

**Proposição 6 [P, demonstração elementar].** h_pec(s) = ⌈k(s)/4⌉, com k = número de
cantos (ou arestas) fora de posição ou orientação, é consistente: um giro altera no
máximo 4 cantos e 4 arestas, logo k varia no máximo 4 por movimento.

## 3.6 Poda de sequências (corretude das buscas)

* **Mesma camada** (`allowedAfter`): proibir m após ℓ quando ℓ·m ∈ {e} ∪ S. Seguro em
  busca com detecção de repetidos: o sucessor podado está a distância ≤ g(x).
* **Faces opostas** (`canonicalAfter`): proibir U após D (comutam). Seguro apenas em busca
  em árvore (IDA*), pois todo elemento tem palavra mínima canônica.
