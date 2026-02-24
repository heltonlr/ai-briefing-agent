import { useState } from "react";

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const PROMPTS = {
  generate: (input) => `Você é um AI Product Specialist sênior. Dado o input abaixo, gere um briefing estruturado.

Retorne APENAS um JSON válido (sem markdown, sem \`\`\`json) com exatamente estes campos:
{
  "objetivo_de_negocio": "string ou null",
  "usuario_alvo": "string ou null",
  "problema_core": "string ou null",
  "hipotese_de_solucao": "string ou null",
  "metricas_l1": "string ou null",
  "metricas_l2": "string ou null",
  "riscos_identificados": "string ou null",
  "lacunas_de_informacao": ["array de strings com lacunas identificadas"]
}

Se não houver informação suficiente para um campo, use null. Seja específico e objetivo.

INPUT DO STAKEHOLDER:
"${input}"`,

  critic: (briefingJson) => `Você é um revisor crítico especializado em briefings de produto de IA.

Analise o briefing JSON abaixo e para cada campo (exceto lacunas_de_informacao) atribua:
- "APROVADO": informação suficiente, específica e acionável
- "FRACO": presente mas superficial ou genérico demais
- "AUSENTE": null ou sem sentido prático

Para campos FRACOS, reescreva-os tornando-os mais específicos e acionáveis.
Não invente dados — sinalize o que requer confirmação do stakeholder.

Retorne APENAS um JSON válido (sem markdown) com esta estrutura:
{
  "avaliacoes": {
    "objetivo_de_negocio": {"status": "APROVADO|FRACO|AUSENTE", "versao_melhorada": "string ou null"},
    "usuario_alvo": {"status": "APROVADO|FRACO|AUSENTE", "versao_melhorada": "string ou null"},
    "problema_core": {"status": "APROVADO|FRACO|AUSENTE", "versao_melhorada": "string ou null"},
    "hipotese_de_solucao": {"status": "APROVADO|FRACO|AUSENTE", "versao_melhorada": "string ou null"},
    "metricas_l1": {"status": "APROVADO|FRACO|AUSENTE", "versao_melhorada": "string ou null"},
    "metricas_l2": {"status": "APROVADO|FRACO|AUSENTE", "versao_melhorada": "string ou null"},
    "riscos_identificados": {"status": "APROVADO|FRACO|AUSENTE", "versao_melhorada": "string ou null"}
  },
  "score_geral": "número de 0 a 100",
  "resumo_critico": "2-3 frases sobre os principais problemas encontrados"
}

BRIEFING PARA REVISAR:
${briefingJson}`,

  consolidate: (briefingJson, criticJson) => `Você é um AI Product Specialist. Consolide o briefing original com as melhorias do revisor crítico.

Regras:
- Para campos APROVADO: use o valor original
- Para campos FRACO: use a versao_melhorada do revisor
- Para campos AUSENTE: marque como "⚠ Requer definição com stakeholder"
- Gere as "proximas_perguntas": máximo 3 perguntas priorizadas para o stakeholder, focando nas lacunas mais críticas

Retorne APENAS um JSON válido (sem markdown) com esta estrutura:
{
  "titulo": "título curto e direto para o briefing",
  "objetivo_de_negocio": "string",
  "usuario_alvo": "string",
  "problema_core": "string",
  "hipotese_de_solucao": "string",
  "metricas_l1": "string",
  "metricas_l2": "string",
  "riscos_identificados": "string",
  "proximas_perguntas": ["pergunta 1", "pergunta 2", "pergunta 3"],
  "confianca_geral": "ALTA|MEDIA|BAIXA"
}

BRIEFING ORIGINAL:
${briefingJson}

REVISÃO CRÍTICA:
${criticJson}`,
};

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function callClaude(prompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: import.meta.env.VITE_ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.map((b) => b.text || "").join("") || "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { id: "generate", label: "Geração", desc: "Estrutura o briefing" },
  { id: "critic", label: "Self-Critic", desc: "Avalia e melhora" },
  { id: "consolidate", label: "Consolidação", desc: "Output final" },
];

const FIELD_LABELS = {
  objetivo_de_negocio: "Objetivo de negócio",
  usuario_alvo: "Usuário-alvo",
  problema_core: "Problema core",
  hipotese_de_solucao: "Hipótese de solução",
  metricas_l1: "Métricas L1",
  metricas_l2: "Métricas L2",
  riscos_identificados: "Riscos identificados",
};

const STATUS_COLOR = { APROVADO: "#22c55e", FRACO: "#f59e0b", AUSENTE: "#ef4444" };
const STATUS_BG    = { APROVADO: "#052e16", FRACO: "#1c1007", AUSENTE: "#1c0505" };
const CONFIDENCE_COLOR = { ALTA: "#22c55e", MEDIA: "#f59e0b", BAIXA: "#ef4444" };

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function BriefingAgent() {
  const [input, setInput]       = useState("");
  const [phase, setPhase]       = useState("idle"); // idle | running | done | error
  const [activeStep, setActiveStep] = useState(-1);
  const [results, setResults]   = useState({ generate: null, critic: null, consolidate: null });
  const [error, setError]       = useState("");
  const [activeTab, setActiveTab] = useState("consolidate");

  async function runAgent() {
    if (!input.trim()) return;

    setPhase("running");
    setError("");
    setResults({ generate: null, critic: null, consolidate: null });

    try {
      setActiveStep(0);
      const generated = await callClaude(PROMPTS.generate(input));
      setResults((r) => ({ ...r, generate: generated }));

      setActiveStep(1);
      const critiqued = await callClaude(PROMPTS.critic(JSON.stringify(generated, null, 2)));
      setResults((r) => ({ ...r, critic: critiqued }));

      setActiveStep(2);
      const consolidated = await callClaude(
        PROMPTS.consolidate(JSON.stringify(generated, null, 2), JSON.stringify(critiqued, null, 2))
      );
      setResults((r) => ({ ...r, consolidate: consolidated }));

      setActiveStep(-1);
      setPhase("done");
      setActiveTab("consolidate");
    } catch (e) {
      setError("Erro ao processar: " + e.message);
      setPhase("error");
      setActiveStep(-1);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080c10",
      fontFamily: "'Courier New', Courier, monospace",
      color: "#c9d1d9",
      padding: "32px 24px",
    }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 10, height: 10, borderRadius: "50%",
              background: phase === "running" ? "#22c55e" : "#3b82f6",
              boxShadow: phase === "running" ? "0 0 12px #22c55e" : "0 0 8px #3b82f6",
              animation: phase === "running" ? "pulse 1s infinite" : "none",
            }} />
            <span style={{ color: "#7d8590", fontSize: 11, letterSpacing: 3, textTransform: "uppercase" }}>
              Self-Critic Prompt Pipeline
            </span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e6edf3", margin: 0, letterSpacing: -0.5 }}>
            Estruturador de Demandas
          </h1>
        </div>

        {/* Input */}
        <div style={{ marginBottom: 24 }}>
          <label style={{
            display: "block", fontSize: 11, color: "#7d8590",
            letterSpacing: 2, textTransform: "uppercase", marginBottom: 8,
          }}>
            Demanda do stakeholder
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ex: Preciso de uma feature de IA pra ajudar o time de CS a responder clientes mais rápido..."
            disabled={phase === "running"}
            style={{
              width: "100%", height: 96, background: "#0d1117",
              border: "1px solid #21262d", borderRadius: 6,
              padding: "12px 14px", color: "#c9d1d9",
              fontFamily: "inherit", fontSize: 13,
              resize: "vertical", outline: "none",
              boxSizing: "border-box", lineHeight: 1.6,
            }}
          />
        </div>

        {/* Pipeline + Run button */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, alignItems: "center" }}>
          {STEPS.map((step, i) => (
            <div key={step.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 12px", borderRadius: 4, fontSize: 12,
                background: activeStep === i ? "#1c2d3a" : results[step.id] ? "#0d2010" : "#0d1117",
                border: `1px solid ${activeStep === i ? "#3b82f6" : results[step.id] ? "#22c55e44" : "#21262d"}`,
                color: activeStep === i ? "#93c5fd" : results[step.id] ? "#22c55e" : "#7d8590",
                transition: "all 0.3s",
              }}>
                <span>{results[step.id] ? "✓" : activeStep === i ? "●" : "○"}</span>
                <span>{step.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <span style={{ color: "#21262d", fontSize: 10 }}>──→</span>
              )}
            </div>
          ))}

          <div style={{ flex: 1 }} />

          <button
            onClick={runAgent}
            disabled={phase === "running" || !input.trim()}
            style={{
              padding: "8px 20px", borderRadius: 4, fontSize: 12,
              fontFamily: "inherit", fontWeight: 700, letterSpacing: 1,
              background: phase === "running" ? "#0d1117" : "#1f6feb",
              color: phase === "running" ? "#7d8590" : "#fff",
              border: `1px solid ${phase === "running" ? "#21262d" : "#388bfd"}`,
              cursor: phase === "running" || !input.trim() ? "not-allowed" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {phase === "running" ? "processando..." : "→ executar"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: 12, marginBottom: 16, borderRadius: 6,
            background: "#1c0505", border: "1px solid #f8514966",
            color: "#f85149", fontSize: 12,
          }}>
            {error}
          </div>
        )}

        {/* Results */}
        {(results.generate || results.critic || results.consolidate) && (
          <div>
            <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "1px solid #21262d" }}>
              {[
                { key: "consolidate", label: "Output Final",  available: !!results.consolidate },
                { key: "critic",      label: "Self-Critic",   available: !!results.critic },
                { key: "generate",    label: "Rascunho",      available: !!results.generate },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => tab.available && setActiveTab(tab.key)}
                  style={{
                    padding: "6px 16px 10px", fontSize: 12, fontFamily: "inherit",
                    background: "transparent", border: "none",
                    borderBottom: activeTab === tab.key ? "2px solid #1f6feb" : "2px solid transparent",
                    color: !tab.available ? "#3b4048" : activeTab === tab.key ? "#e6edf3" : "#7d8590",
                    cursor: tab.available ? "pointer" : "not-allowed",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "generate" && results.generate && (
              <Panel title="Briefing Inicial (pré-revisão)">
                <div style={{ display: "grid", gap: 8 }}>
                  {Object.entries(FIELD_LABELS).map(([key, label]) => (
                    <FieldRow key={key} label={label} value={results.generate[key]} />
                  ))}
                  {results.generate.lacunas_de_informacao?.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: "#7d8590", letterSpacing: 1, marginBottom: 6 }}>
                        LACUNAS IDENTIFICADAS
                      </div>
                      {results.generate.lacunas_de_informacao.map((l, i) => (
                        <div key={i} style={{
                          fontSize: 12, color: "#f59e0b",
                          padding: "4px 0", borderBottom: "1px solid #1c1007",
                        }}>
                          ⚠ {l}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>
            )}

            {activeTab === "critic" && results.critic && (
              <Panel title={`Revisão Crítica · Score: ${results.critic.score_geral}/100`}>
                <div style={{
                  padding: 10, marginBottom: 16, borderRadius: 4,
                  background: "#0d1117", fontSize: 12, color: "#8b949e", lineHeight: 1.6,
                }}>
                  {results.critic.resumo_critico}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {Object.entries(FIELD_LABELS).map(([key, label]) => {
                    const av = results.critic.avaliacoes?.[key];
                    if (!av) return null;
                    return (
                      <div key={key} style={{
                        padding: "10px 12px", borderRadius: 4,
                        background: STATUS_BG[av.status] || "#0d1117",
                        border: `1px solid ${STATUS_COLOR[av.status]}22`,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: av.versao_melhorada ? 6 : 0 }}>
                          <span style={{ fontSize: 11, color: "#7d8590", letterSpacing: 1 }}>
                            {label.toUpperCase()}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: STATUS_COLOR[av.status] }}>
                            {av.status}
                          </span>
                        </div>
                        {av.versao_melhorada && (
                          <div style={{ fontSize: 12, color: "#c9d1d9", lineHeight: 1.5 }}>
                            {av.versao_melhorada}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}

            {activeTab === "consolidate" && results.consolidate && (
              <Panel title={results.consolidate.titulo || "Briefing Consolidado"}>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: 2, padding: "3px 8px", borderRadius: 3,
                    color: CONFIDENCE_COLOR[results.consolidate.confianca_geral] || "#7d8590",
                    border: `1px solid ${CONFIDENCE_COLOR[results.consolidate.confianca_geral]}44`,
                  }}>
                    CONFIANÇA {results.consolidate.confianca_geral}
                  </span>
                </div>

                <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
                  {Object.entries(FIELD_LABELS).map(([key, label]) => (
                    <FieldRow key={key} label={label} value={results.consolidate[key]} />
                  ))}
                </div>

                {results.consolidate.proximas_perguntas?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: "#7d8590", letterSpacing: 2, marginBottom: 10 }}>
                      PRÓXIMAS PERGUNTAS PARA O STAKEHOLDER
                    </div>
                    {results.consolidate.proximas_perguntas.map((q, i) => (
                      <div key={i} style={{
                        display: "flex", gap: 10, padding: "10px 12px", marginBottom: 6,
                        background: "#0d1117", border: "1px solid #21262d", borderRadius: 4,
                      }}>
                        <span style={{ color: "#1f6feb", fontWeight: 700, fontSize: 12, minWidth: 16 }}>{i + 1}.</span>
                        <span style={{ fontSize: 12, color: "#c9d1d9", lineHeight: 1.5 }}>{q}</span>
                      </div>
                    ))}
                  </div>
                )}

                <CopyButton data={results.consolidate} />
              </Panel>
            )}
          </div>
        )}

        {/* Empty state */}
        {phase === "idle" && (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#3b4048" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⬡</div>
            <div style={{ fontSize: 12, letterSpacing: 2 }}>INSIRA UMA DEMANDA E EXECUTE O AGENTE</div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        textarea:focus { border-color: #3b82f6 !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0d1117; }
        ::-webkit-scrollbar-thumb { background: #21262d; }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Panel({ title, children }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 6, padding: 20 }}>
      <div style={{ fontSize: 11, color: "#7d8590", letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function FieldRow({ label, value }) {
  const isEmpty = !value || value === "null";
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "160px 1fr", gap: 12,
      padding: "8px 0", borderBottom: "1px solid #161b22",
    }}>
      <span style={{ fontSize: 11, color: "#7d8590", letterSpacing: 1, paddingTop: 2 }}>
        {label.toUpperCase()}
      </span>
      <span style={{
        fontSize: 12, lineHeight: 1.5,
        color: isEmpty ? "#3b4048" : "#c9d1d9",
        fontStyle: isEmpty ? "italic" : "normal",
      }}>
        {isEmpty ? "—" : value}
      </span>
    </div>
  );
}

function CopyButton({ data }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const fields = Object.entries({
      "Objetivo de Negócio": data.objetivo_de_negocio,
      "Usuário-alvo":        data.usuario_alvo,
      "Problema Core":       data.problema_core,
      "Hipótese de Solução": data.hipotese_de_solucao,
      "Métricas L1":         data.metricas_l1,
      "Métricas L2":         data.metricas_l2,
      "Riscos":              data.riscos_identificados,
    }).map(([k, v]) => `**${k}:** ${v}`).join("\n");

    const questions = data.proximas_perguntas
      ?.map((q, i) => `${i + 1}. ${q}`)
      .join("\n") || "";

    navigator.clipboard.writeText(`${fields}\n\n**Próximas perguntas:**\n${questions}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      style={{
        marginTop: 16, padding: "8px 16px", fontSize: 11,
        fontFamily: "inherit", letterSpacing: 1,
        background: "transparent", border: "1px solid #21262d", borderRadius: 4,
        color: copied ? "#22c55e" : "#7d8590",
        cursor: "pointer", transition: "all 0.2s",
      }}
    >
      {copied ? "✓ copiado" : "copiar markdown"}
    </button>
  );
}
