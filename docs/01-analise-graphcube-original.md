# 1. Análise do projeto de referência: GraphCube (Dorian Laguna)

> Data da análise: 2026-11-09. Commit analisado: `46f3da5` (18/10/2024), branch `main`
> de <https://github.com/DorianLaguna/GraphCube>.

## 1.1 Fontes consultadas e limitações da análise

| Fonte | Acesso | Observação |
|---|---|---|
| Repositório GitHub (código-fonte completo, `README.md`, `GraphCube.png`) | **Sim** (clonado) | Evidência primária desta análise. |
| Aplicação publicada (`rubikgraph.dev-dorian-laguna.com`) | **Não** | Bloqueada pela política de rede do ambiente de desenvolvimento. |
| Discussão no fórum Three.js (`discourse.threejs.org/t/.../91778`) | **Não** | Idem. |

Toda afirmação abaixo sobre o comportamento do GraphCube é derivada da leitura do
código e da captura de tela incluída no repositório. Não foi possível verificar se a
versão publicada difere do commit analisado.

## 1.2 Licença e condições de reutilização

O repositório **não contém arquivo de licença** (`LICENSE`, `COPYING` ou campo
`license` no `package.json`; este último declara `"private": true`). Na ausência de
licença explícita, aplica-se o regime padrão de direitos autorais: o código não pode
ser copiado, modificado ou redistribuído sem autorização do autor.

**Decisão:** o GraphCube Lab **não reutiliza nenhuma linha de código, modelo 3D
(`public/models/*.glb`) ou recurso gráfico** do GraphCube. Apenas a *ideia*
conceitual (representar o cubo por famílias de círculos concêntricos cujas
interseções são adesivos) é tomada como inspiração, com atribuição explícita no
README e no artigo. Toda a geometria do GraphCube Lab é gerada
programaticamente a partir de primeiros princípios (ver `docs/03-fundamentacao-matematica.md`).

## 1.3 Tecnologias e arquitetura

* **Stack:** Vue 3 + Pinia + Vue Router, Vite 5, Tailwind CSS, Three.js 0.166.
* **Módulos (`src/stores`)**:
  * `canva.js` — desenho em `<canvas>` 2D (1200×1200 px fixos) e eventos de arraste;
  * `orbs.js` — os 54 "orbes" (adesivos), coordenadas em pixels **codificadas
    manualmente**, lógica de reordenação após um giro;
  * `maths.js` — geometria plana (ângulos, distâncias), tabelas manuais que
    associam cada círculo a uma camada do cubo 3D;
  * `scene.js` — rotação animada de grupos de cubinhos na cena Three.js;
  * `cube.js` — *store* vazia (não há modelo de estado do cubo).
* **`intersection.json`** — para cada um dos 54 orbes, o par `(cir1, cir2)` de
  círculos aos quais ele pertence.
* **3D:** 26 arquivos `.glb` (um por cubinho), carregados individualmente e
  coloridos por nome de malha.

## 1.4 O que os vértices e as arestas representam (resposta precisa)

O desenho do GraphCube é composto por:

* **9 círculos** = 3 centros × 3 raios concêntricos (`radiusOrbita = 410, 350, 290`).
  Cada centro corresponde a um **eixo** do cubo e cada raio a uma **camada (fatia)**
  perpendicular a esse eixo. Os círculos 1–3 (centro direito) correspondem às
  camadas de eixo *x*; 4–6 (centro esquerdo) ao eixo *y*; 7–9 (centro superior) ao
  eixo *z* (cf. `getLocationCube`). Os círculos 2, 5 e 8 são as **fatias centrais**
  (movimentos M, E, S na notação usual).
* **54 pontos coloridos ("orbes")** = as 54 **posições de adesivos (facelets)**,
  incluindo os 6 centros. A cor de cada orbe é a cor do adesivo que ocupa a posição.

Cada adesivo pertence a exatamente duas camadas não paralelas à sua face, e
`intersection.json` registra exatamente esse par. Geometricamente, o adesivo é
desenhado (aproximadamente) num dos dois pontos de interseção dos dois círculos.
Arrastar um orbe ao longo de um círculo e soltá-lo próximo de outro trio de
posições executa uma rotação de ¼, ½ ou ¾ de volta daquela camada: os 12 adesivos
do "anel" da camada são permutados ao longo do círculo e, para camadas externas
(círculos 1, 3, 4, 6, 7, 9), os 8 adesivos da face girada também são permutados
(`rotateSecundaryOrbs`).

**Conclusão matemática.** O objeto desenhado **não é um grafo de estados nem um
grafo de Cayley**. É um *diagrama de incidência adesivo–camada*: formalmente, uma
estrutura de incidência (ou grafo bipartido) entre o conjunto Ω de 54 posições de
adesivos e o conjunto de 9 camadas, desenhada com as camadas como curvas fechadas
e as posições como pontos de interseção. Não há arestas explícitas no sentido de
teoria dos grafos: as "arestas" implícitas são os arcos de círculo que ligam
posições consecutivas de um mesmo anel, isto é, os ciclos da permutação induzida
em Ω por um giro de camada. Um **estado completo** do cubo corresponde a uma
*coloração* dos 54 pontos, não a um vértice. Portanto:

| Representação | Vértices | Arestas | No GraphCube? |
|---|---|---|---|
| (1) Grafo estrutural / de peças | posições de adesivos (54) | pertença comum a uma camada / ciclos de um giro | **Sim** (é o que o GraphCube desenha) |
| (2) Grafo de estados | configurações completas (≈4,3·10¹⁹ no 3×3×3) | movimentos | Não |
| (3) Grafo de Cayley Cay(G, S) | elementos do grupo G | multiplicação à direita por geradores s ∈ S | Não |

## 1.5 Funcionalidades existentes

* Manipulação do cubo **exclusivamente pelo diagrama 2D** (arrastar orbes); o cubo
  3D apenas reflete o giro e pode ser orbitado com `OrbitControls`.
* Suporte a giros de faces externas e de fatias centrais (9 camadas), ¼, ½ e ¾ de volta.
* Animação dos orbes e dos cubinhos.
* Responsividade básica (canvas escalado por CSS, eventos de toque).

## 1.6 Limitações identificadas

**Matemáticas / de modelagem**
1. Não existe modelo de estado independente da visualização: o estado é a posição
   em pixels de cada orbe (`xOrig`, `yOrig`) e a posição de objetos Three.js;
   a identificação de posições usa comparação de ponto flutuante
   (`item.xOrig === ubication.x`; tolerância `0.02` na cena 3D).
2. Não há notação de movimentos, composição, inverso, ordem, paridade,
   orientação de peças, legalidade de estados, nem qualquer noção de grupo.
3. A geometria do diagrama é ajustada à mão (coordenadas dos 54 orbes digitadas),
   de modo que os adesivos ficam apenas *aproximadamente* nas interseções.
4. Generalização impossível sem reescrita (apenas 3×3×3, apenas um tamanho de canvas).

**Técnicas**
5. `renderer.render(scene.clone(), camera)` **clona a cena inteira a cada quadro**
   (custo O(n) alocações por frame).
6. Animações por laços `while` com `await delay(1)` (espera ativa), e chamadas
   assíncronas não aguardadas (`rotateCube`, `rotateSecundaryOrbs`), sujeitas a
   condições de corrida se o usuário agir durante a animação.
7. Lógica de domínio misturada a *stores* de UI; *store* `cube.js` vazia; nenhum teste automatizado.
8. 26 modelos `.glb` separados para cubinhos idênticos (27 requisições de rede).

**Usabilidade**
9. Sem histórico, desfazer/refazer, embaralhar, resolver, sequências ou controle de velocidade.
10. Sem manipulação direta do cubo 3D nem teclado; nenhum rótulo explica o que o
    diagrama representa; acessibilidade não considerada (cores apenas, sem texto alternativo).

## 1.7 O que preservar e o que expandir no GraphCube Lab

| Aspecto do original | Tratamento no GraphCube Lab |
|---|---|
| Diagrama de círculos concêntricos com adesivos nas interseções | **Preservado e formalizado**: gerado por construção geométrica exata (interseção de círculos), para *n* = 2 e 3; documentado como diagrama de incidência adesivo–camada. |
| Girar camadas arrastando sobre o diagrama | **Preservado** (arraste ao longo do círculo) e complementado por botões, teclado e arraste no cubo 3D. |
| Sincronização diagrama ↔ cubo 3D | **Preservada**, agora mediada por um estado matemático único (permutação de Ω). |
| Animação | Reimplementada com `requestAnimationFrame`, fila de movimentos e velocidade ajustável. |
| — | **Novo:** grafo de estados implícito, grafos de Cayley de subgrupos, Schreier–Sims, algoritmos de busca com heurísticas admissíveis, experimentos reprodutíveis, artigo. |
