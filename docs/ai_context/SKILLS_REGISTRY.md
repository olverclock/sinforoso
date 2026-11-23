# 🧠 Registro de Skills da IA (Antigravity Workflows)

> **SISTEMA AUTOMÁTICO**: Este projeto utiliza Workflows do Antigravity como "Skills" modulares. Para usar uma skill, consulte o diretório `.agent/workflows/`.

## Skills Disponíveis

| Skill (Workflow) | Descrição | Quando usar |
| :--- | :--- | :--- |
| **`verify_integrity`** | Executa `tsc` e checks de arquivo. | Use APÓS qualquer edição de código e ANTES de finalizar. |
| **`update_memory`** | Guia de atualização do `PROJECT_MEMORY.md`. | Use ao FINAL de cada sessão ou tarefa grande. |
| **`install_brain`** | Copia este setup para outro projeto. | Use para replicar a IA em outros trabalhos. |
| **`refactor_safety`** | Checklist de segurança para refatoração. | Use ANTES de alterar arquivos complexos. |
| **`analyze_impact`** | Busca profunda de onde um código é usado. | Use ANTES de mudar funções/classes core. |
| **`snapshot_safety`** | Cria um commit git `[WIP]` rápido. | Use ANTES de qualquer ação destrutiva. |
| **`optimize_context`** | Identifica arquivos grandes p/ leitura smart. | Use no início da exploração para economizar tokens. |
| **`create_skill`** | Guia para criar novas skills. | Use quando o usuário pedir uma nova automação. |

## Como Criar Novas Skills

1. Crie um arquivo `.md` na pasta `.agent/workflows/`.
2. Adicione o frontmatter YAML no topo:
   ```yaml
   ---
   description: SKILL: Nome da Skill
   ---
   ```
3. Liste os passos executáveis.
4. Use `// turbo` acima de blocos de código para execução automática.

## ⚡ Como Funciona a Automação?

O "segredo" está na anotação `// turbo` dentro do arquivo do workflow.

- **Com `// turbo`**: O Agente executa o comando imediatamente, sem pedir permissão (ex: `tsc`, `lint`), tornando o fluxo fluido.
- **Sem `// turbo`**: O Agente pausa e pede "Posso executar este comando?" (segurança para deploys ou deleções).
- **Gatilho**: O Agente lê este registro e decide autonomamente rodar a skill. Por exemplo, se você pedir "Verifique o projeto", ele buscará `verify_integrity.md` e executará os passos turbinados automaticamente.
