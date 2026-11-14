# Hospedagem do GraphCube Lab

Este repositório contém um aplicativo **estático Vite** em `app/`, sem necessidade de servidor de aplicação para a interface. O build produz `app/dist/`.

## GitHub Pages

O workflow [`deploy-pages.yml`](../.github/workflows/deploy-pages.yml) instala dependências, verifica tipos, executa os testes, compila e publica a aplicação após alteração em `app/` na branch `main`. Também é possível acioná-lo manualmente em **Actions**.

**Configuração necessária pelo responsável do repositório:**

1. Abra **Settings → Pages** do repositório `gustavobernardo1/graphcube-lab`.
2. Em **Build and deployment → Source**, selecione **GitHub Actions**.
3. Integre o PR que adiciona o workflow à branch `main`.
4. Abra **Actions → Deploy GraphCube Lab to GitHub Pages** e use **Run workflow** se nenhuma alteração em `app/` acionar automaticamente a publicação.
5. Confirme que o workflow terminou com sucesso e abra a URL exibida no job `github-pages`.

**Endereço esperado após publicação bem-sucedida:** `https://gustavobernardo1.github.io/graphcube-lab/`. Este endereço não deve ser tratado como site operacional até a execução e conferência do deploy.

O arquivo `app/vite.config.ts` já utiliza `base: './'`, de modo que os assets compilados tenham caminhos relativos compatíveis com a subpasta do GitHub Pages. Esta mudança não modifica a lógica de resolução dos cubos.

### Se o deploy falhar

- **Pages não configurado:** selecione GitHub Actions em Settings → Pages.
- **Permissões do workflow:** valide em Settings → Actions → General se as políticas do repositório/organização permitem a publicação e o uso de actions oficiais.
- **Testes ou build com falha:** inspecione os logs; não marque o site como publicado enquanto houver erro.
- **Página 404:** verifique o deploy concluído e a URL emitida pelo GitHub Pages.
