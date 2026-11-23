# 🛡️ Padrões de Fluxo de Trabalho (Workflow Standards)

Este documento define as regras de desenvolvimento para Agentes de Elite no projeto Sinforoso Bot.

## 🚀 O Ciclo de Vida da Elite

Toda alteração deve obrigatoriamente seguir estas fases:

### 1. Memory Check (Sincronização)
- **Ação**: Ler `docs/ai_context/PROJECT_MEMORY.md`.
- **Objetivo**: Entender o estado atual e evitar a repetição de erros passados.

### 2. Spec Driven Planning (Planejamento)
- **Ação**: Criar um arquivo de plano de implementação.
- **Objetivo**: Definir exatamente *o que* será feito e *como* será testado antes de escrever código.
- **Regra**: Nenhuma execução começa sem aprovação do plano.

### 3. One-Shot Execution (Precisão)
- **Ação**: Aplicar as mudanças de uma vez só com base no plano aprovado.
- **Ferramenta**: Usar `write_to_file` ou `replace_file_content` de forma assertiva.

### 4. Auto-Verification (Blindagem)
- **Ação**: Rodar build e validações no WSL.
- **Comando**: `wsl npm run build`.
- **Objetivo**: Garantir que o código é funcional e não quebra o sistema.

### 5. Memory Update (Persistência)
- **Ação**: Atualizar `PROJECT_MEMORY.md` e o `task.md` da sessão.
- **Objetivo**: Registrar a nova decisão técnica para o próximo agente.

## 💡 Economia Inteligente de Tokens
- **Modularidade**: Mantenha arquivos de contexto pequenos (máx. 5k tokens).
- **Ranges**: Use `view_file` com ranges específicos (ex: L10-L50) para economizar contexto.
- **Bash Direct**: Use `!` ou comandos diretos via `run_command` para inspeção rápida.

---
*Este padrão é inspirado nas metodologias de Boris Cherny (Claude Code) e adaptado para a realidade do Gravity.*
