# 🧠 Memória do Projeto (Project Memory)

> **PROPÓSITO**: Este arquivo atua como a "memória de longo prazo" do projeto para IAs. Toda vez que um agente terminar uma sessão, ele deve atualizar este arquivo com o estado atual, decisões tomadas e dívidas técnicas deixadas. **O próximo agente deve LER este arquivo primeiro.**

---

## 📍 Estado Atual da Arquitetura
*Última atualização: 2026-01-06*

- **Core**: Node.js + TypeScript (ESM).
- **WhatsApp**: Baileys (Library) v7.
- **Banco de Dados**: NeDB (@seald-io/nedb) com Singleton Pattern para evitar conflitos.
- **Estrutura**: MVC Modular (Controllers, Services, Helpers, Workflows).

## 📝 Registro de Decisões Técnicas (ADR Simplificado)

| Data | Decisão | Motivo | Status |
| :--- | :--- | :--- | :--- |
| 05/01/2026 | **Singleton DB Pattern** | Resolver erro de `ENOENT/rename` durante compactação NeDB no Windows/WSL. | ✅ Implementado |
| 05/01/2026 | **Weighted Gacha & XP** | Implementar economia de cartas com raridades (D, C, B, A, S, SS) e bônus de streak. | ✅ Implementado |
| 05/01/2026 | **Triple Confirmation Admin** | Prevenir limpeza acidental de sessão com alertas de 3 níveis. | ✅ Implementado |
| 02/01/2026 | **Correção Comando !ddd** | Inversão de prioridade (args > reply) e sanitização de JID. | ✅ Corrigido |
| 02/01/2026 | **Correção Comando !animes** | Migração para `animesonlinecc.to` usando `curl` (bypass anti-bot). | ✅ Corrigido/Robustecido |

## 🚧 Roadmap & Dívida Técnica

- [ ] **Segurança**: Mover chaves de API "hardcoded" (TMDb, WeatherAPI) para `.env`.
- [ ] **Estabilidade**: Criar wrappers para os scrapers web que falham se o HTML mudar.
- [ ] **Refatoração**: Migrar o carregamento de comandos manual para dinâmico (ler pasta `commands/`).

## 📚 Glossário & Padrões

- **`commandInvoker`**: O roteador central. Se criar um novo comando, deve ser registrado aqui (até que o loader dinâmico seja feito).
- **`BotController`**: Gerencia configurações globais do bot.

---
*Ao finalizar sua tarefa, adicione uma nova linha na tabela de Decisões ou atualize o Roadmap.*
