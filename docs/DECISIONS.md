# Registro de decisões (ADR resumido)

| # | Data | Decisão | Motivo / alternativas |
|---|---|---|---|
| 1 | 2026-11-09 | Não reutilizar código nem modelos do GraphCube original | Repositório sem licença ⇒ todos os direitos reservados. Apenas a ideia do diagrama de círculos é usada, com atribuição. |
| 2 | 2026-11-09 | React + TypeScript + Vite; Three.js "puro" (sem react-three-fiber) | Renderizador imperativo isolado da lógica; menos dependências. |
| 3 | 2026-11-09 | Geometria como fonte única de verdade | Permutações de movimentos, tabelas de cubinhos e diagrama estrutural derivados de (posição, normal) e rotações; tabelas de Kociemba usadas só como oráculo de teste. |
| 4 | 2026-11-09 | Convenção posição→adesivo e produto (g·h)(i) = g(h(i)) | Palavras lidas na ordem de execução; coincide com a multiplicação de cubinhos de Kociemba. |
| 5 | 2026-11-09 | 2×2×2 modelado como G₂ = ⟨U,R,F⟩ (DBL fixo) + normalização por rotação | Remove a redundância das 24 orientações; permite tabela exata de 3,67 M estados. |
| 6 | 2026-11-09 | Fatias e rotações apenas na interface; grupos de busca usam giros de face | O grupo clássico (centros fixos) é o objeto da literatura; estados com centros movidos são normalizados por rotação global antes da busca. |
| 7 | 2026-11-09 | Poda "mesma camada" em buscas em grafo, poda canônica só em IDA* | A poda de faces opostas não é segura com detecção de repetidos baseada no último movimento armazenado. |
| 8 | 2026-11-09 | Implementar Schreier–Sims | Verifica |G| e calcula |⟨S⟩| exatamente para qualquer S, o que permite rotular visualizações parciais com o tamanho real do grafo. |
| 9 | 2026-11-09 | Duas fases (Kociemba) como "método específico" do 3×3×3 | Resolve qualquer estado em ~20 movimentos; documentado como **não ótimo**. |
| 10 | 2026-11-09 | Experimentos compartilhados entre navegador e CLI | Garante que o artigo descreve exatamente o software; Python só analisa. |
| 11 | 2026-11-09 | Números do artigo via macros geradas (`paper/generated/numbers.tex`) | Evita divergência entre texto e dados. |
| 12 | 2026-11-09 | Metadado `seed` corrigido e experimentos reexecutados | A 1ª execução registrava a semente padrão da função de metadados em vez da semente efetiva do protocolo (dados idênticos, metadado incorreto). |
| 13 | 2026-11-09 | Site publicado e fórum Three.js não consultados | Bloqueados pela política de rede do ambiente; análise baseada no código-fonte. |
