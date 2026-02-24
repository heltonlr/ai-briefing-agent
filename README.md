# AI Briefing Agent · Self-Critic Loop


Um agente que transforma demandas vagas de stakeholders em briefings estruturados e acionáveis, usando um pipeline de **3 chamadas encadeadas** à API da Anthropic com padrão de autorrevisão (self-critic).

---

## Como funciona

A maioria dos agentes gera uma resposta e para. Este vai além: depois de gerar o briefing, um segundo prompt age como revisor crítico — avalia cada campo, reescreve os fracos e sinaliza o que precisa de confirmação humana. Só então consolida o output final.

```
Demanda vaga
     │
     ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Prompt 1   │────▶│  Prompt 2   │────▶│  Prompt 3   │
│  Geração    │     │  Self-Critic│     │Consolidação │
│             │     │             │     │             │
│ Estrutura   │     │ Avalia cada │     │ Combina     │
│ os 7 campos │     │ campo:      │     │ original +  │
│ em JSON     │     │ APROVADO    │     │ melhorias + │
│             │     │ FRACO       │     │ 3 perguntas │
│             │     │ AUSENTE     │     │ para o      │
│             │     │             │     │ stakeholder │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        Briefing pronto
                                        para o squad
```

---

## Campos do briefing

| Campo | Descrição |
|---|---|
| `objetivo_de_negocio` | O que a empresa ganha com isso |
| `usuario_alvo` | Quem usa, volume, contexto |
| `problema_core` | O problema real sendo resolvido |
| `hipotese_de_solucao` | Como a IA endereça o problema |
| `metricas_l1` | Métrica primária de sucesso |
| `metricas_l2` | Métricas secundárias de suporte |
| `riscos_identificados` | Riscos técnicos, éticos e de adoção |

---

## Por que Self-Critic?

Sem o loop de revisão, LLMs tendem a preencher campos com respostas genéricas e confiantes — mesmo quando a informação não estava na demanda original. O self-critic resolve isso ao:

- **Separar geração de avaliação** → reduz alucinação confiante
- **Tornar lacunas explícitas** → ao invés de inventar, sinaliza
- **Reescrever só o necessário** → preserva o que já estava bom
- **Gerar perguntas priorizadas** → direciona o próximo passo com o stakeholder

---

## Stack

- **React** (hooks: `useState`)
- **Anthropic API** — modelo `claude-sonnet-4-20250514`
- Sem dependências externas além do React

---

## Setup

### 1. Clone o repositório

```bash
git clone https://github.com/heltonlr/ai-briefing-agent.git
cd ai-briefing-agent
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

Copie o arquivo de exemplo e preencha com sua chave:

```bash
cp .env.example .env.local
```

```bash
# .env.local
VITE_ANTHROPIC_API_KEY=sk-ant-...
VITE_ANTHROPIC_MODEL=claude-sonnet-4-20250514  # opcional, esse é o padrão
```

> ⚠️ **O `.env.local` já está no `.gitignore` — nunca o commite.** Para produção, use um backend intermediário (Next.js API route, Edge Function, etc.) para fazer as chamadas e não expor a chave no cliente.

---

### 4. Rode o projeto

```bash
npm run dev
```

---

## Estrutura dos prompts

Os 3 prompts estão no objeto `PROMPTS` dentro do componente e podem ser ajustados sem alterar a lógica do agente:

```js
const PROMPTS = {
  generate: (input) => `...`,   // Prompt 1: geração inicial
  critic: (briefingJson) => `...`,  // Prompt 2: revisão crítica
  consolidate: (briefingJson, criticJson) => `...`, // Prompt 3: output final
};
```

---

## Exemplo de uso

**Input:**
> "Precisa de uma feature de IA pra ajudar o time de CS a responder clientes mais rápido"

**Output (resumido):**
```
Objetivo de negócio: Reduzir AHT em 40% liberando analistas de CS para casos complexos
Usuário-alvo: Analistas CS tier 1 — ⚠ Requer definição com stakeholder
Problema core: Respostas repetitivas consomem ~60% do tempo operacional
Hipótese: Sugestão automática baseada em histórico de tickets resolve o gargalo principal
Métricas L1: Average Handle Time (AHT)
Métricas L2: Taxa de aceitação da sugestão, CSAT pós-atendimento
Riscos: Respostas inadequadas em casos sensíveis sem guardrail configurado

Próximas perguntas:
1. Qual o volume atual de tickets/dia e qual o target de AHT?
2. Existe base de histórico de atendimentos disponível para contextualizar o modelo?
3. O analista pode editar a sugestão livremente ou precisa de aprovação?
```

