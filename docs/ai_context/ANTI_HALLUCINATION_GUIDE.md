# 🔰 Guia de Blindagem Anti-Alucinação (AI Shield)

> **PROPÓSITO**: Este documento serve como a "Constituição do Projeto" para qualquer Agente de IA. Ele define regras inegociáveis para garantir que o código evolua de forma robusta, sem regressões, simplificações indevidas ou "alucinações" (inventar arquivos/funções que não existem).

---

## 🚫 1. Regras de Ouro (Inegociáveis)

1.  **NUNCA Remova Código Funcional**: A menos que explicitamente solicitado para "refatorar e limpar", nunca remova lógica de negócios, tipos ou verificações de erro existentes.
2.  **NUNCA Simplifique para "Caber"**: Se uma solução parece complexa, implemente-a completamente. Não use placeholders como `// ... rest of code` ou `// TODO: implement later` em arquivos finais.
3.  **Verifique Antes de Editar**: Antes de editar qualquer arquivo, LER o arquivo inteiro (`view_file`). Nunca assuma o conteúdo com base apenas no nome do arquivo.
4.  **Respeite a Pilha Tecnológica**: Não sugira trocar bibliotecas principais (ex: trocar `axios` por `fetch` ou `baileys` por outra lib) a menos que seja o objetivo da tarefa. Mantenha a consistência.
5.  **Caminhos Absolutos Sempre**: Ao usar ferramentas de arquivo, sempre use caminhos absolutos para evitar erros de "arquivo não encontrado".

## 🔍 2. Protocolo de Verificação (O "Checklist")

Todo agente deve seguir este fluxo mental antes de confirmar uma tarefa:

-   [ ] **Análise de Dependências**: As importações que adicionei realmente existem no `package.json`?
-   [ ] **Segurança de Tipos**: O código TypeScript compila? Os tipos estão definidos corretamente ou estou abusando de `any`?
-   [ ] **Integridade do Arquivo**: Eu acidentalmente cortei o final do arquivo ao usar `replace_file_content`?
-   [ ] **Contexto do Projeto**: Minha mudança respeita a arquitetura existente (ex: não colocar lógica de banco de dados na View/Controller)?

## 🛠 3. Configuração de Ambiente Padrão

O ambiente de execução é **Linux (via WSL)**.
-   Todos os comandos de terminal devem ser executados via `wsl` (ex: `wsl npm run build`).
-   O código deve ser compatível com Linux (caminhos, case sensitivity).
-   Se estiver no Powershell, prefixe com `wsl`.

## 💾 4. Procedimento de Evolução

Ao "evoluir" o código:
1.  **Entenda o Fluxo Atual**: Mapeie como os dados fluem.
2.  **Estenda, Não Substitua**: Adicione novas capacidades via extensão (novas funções, novos arquivos) em vez de reescrever núcleos estáveis, a menos que necessário.
3.  **Documente a Mudança**: Atualize o `PROJECT_MEMORY.md` com o que foi feito.

---
*Copie este arquivo para `docs/ai_context/` de qualquer novo projeto para "imunizá-lo" contra erros comuns de IA.*
