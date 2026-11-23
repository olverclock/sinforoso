# 📋 Plano de Implementação: [Nome da Tarefa]

> **Instrução para a IA**: Duplique este arquivo para `docs/ai_context/active_plan.md` e preencha-o ANTES de começar a codificar. Não pule etapas.

## 1. Descrição & Objetivo
Descreva o que será feito.
*Exemplo: "Implementar suporte a OpenAI para respostas inteligentes no chat."*

**Restrições (Conforme `ANTI_HALLUCINATION_GUIDE.md`)**:
- [ ] Não remover código existente sem confirmação.
- [ ] Não simplificar lógica de negócios.
- [ ] Manter compatibilidade com TypeScript Estrito.

## 2. Análise de Impacto
Quais arquivos serão tocados?
- `src/arquivoA.ts`: [Breve descrição da mudança]
- `src/arquivoB.ts`: [Breve descrição da mudança]

## 3. Plano Passo-a-Passo

### Fase 1: Preparação & Segurança
- [ ] Verificar se as chaves de API necessárias estão no `.env`.
- [ ] Criar backup dos arquivos críticos (se necessário).

### Fase 2: Codificação (Modo Robusto)
- [ ] **Passo 1**: [Detalhe técnico explícito]
- [ ] **Passo 2**: [Detalhe técnico explícito]

### Fase 3: Verificação & Blindagem
- [ ] Executar build (`npm run build`).
- [ ] (Se aplicável) Testar a rota/comando manualmente.
- [ ] Atualizar `PROJECT_MEMORY.md`.

## 4. Rollback Plan
Se tudo der errado, como voltar ao estado anterior?
*Exemplo: "Reverter commit git ou restaurar arquivos da pasta backup."*
