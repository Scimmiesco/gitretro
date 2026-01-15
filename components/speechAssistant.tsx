import {
  BrainCircuit,
  Coffee,
  Zap,
  Users,
  CalendarCheck,
  MessageSquareText,
  Check,
  Copy,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { ContextSelector } from "./ContextSelector";
import {
  CategorizedCommit,
  CategoryType,
  Provider,
  UserContext,
  YearStats,
} from "@/types";
import { buildPrompt } from "@/utils/ai-prompts";
import { generateSpeechWithAI } from "@/services/speech";
import {
  fetchAzureCommitDiff,
  fetchGitHubCommitDiff,
} from "@/services/taskGenerator";

interface SpeechAssistantProps {
  username: string;
  stats: YearStats;
  provider: Provider;
  token?: string; // Added token prop
  userContext: UserContext;
  setUserContext: (ctx: UserContext) => void;
}

type ViewMode = "daily" | "sprint" | "semester" | "year";
export const SpeechAssistant: React.FC<SpeechAssistantProps> = ({
  userContext,
  setUserContext,
  provider,
  token,
  stats,
  username,
}) => {
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("sprint"); // Controls AI Context

  // --- Actions ---

  const copyToClipboard = () => {
    if (aiSummary) {
      navigator.clipboard.writeText(aiSummary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const aiContextCommits = useMemo(() => {
    const today = new Date();
    const commits = [...stats.categorizedCommits].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    switch (viewMode) {
      case "daily":
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 2);
        return commits.filter((c) => new Date(c.date) > yesterday);
      case "sprint":
        const sprintStart = new Date();
        sprintStart.setDate(today.getDate() - 15);
        return commits.filter((c) => new Date(c.date) > sprintStart);
      case "semester":
        const semesterStart = new Date();
        semesterStart.setMonth(today.getMonth() - 6);
        return commits.filter((c) => new Date(c.date) > semesterStart);
      case "year":
      default:
        return commits;
    }
  }, [viewMode, stats.categorizedCommits]);

  const generateAiSummary = async () => {
    setGeneratingAi(true);
    try {
      // Group commits for the prompt
      const promptGroups: Record<string, CategorizedCommit[]> = {};

      // Enrich commits with details
      const enrichedCommits: CategorizedCommit[] = [];

      // Helper to process commits in chunks to avoid rate limits
      const processCommit = async (c: CategorizedCommit) => {
        let details = c.body || "";
        try {
          // Use prop token
          if (c.url.includes("azure") && token) {
            const data = await fetchAzureCommitDiff(c.url, c.sha, token);
            details = `[Full Message]: ${data.description
              }\n[Diff Summary]:\n${data.diff.substring(0, 500)}`;
          } else if (c.url.includes("github")) {
            const data = await fetchGitHubCommitDiff(c.repo, c.sha, token);
            details = `[Full Message]: ${data.description
              }\n[Diff Summary]:\n${data.diff.substring(0, 500)}`;
          }
        } catch (err) {
          console.warn(`Failed to fetch details for ${c.sha}`, err);
        }

        return { ...c, body: details };
      };

      // Process all selected context commits
      for (const c of aiContextCommits) {
        const enriched = await processCommit(c);
        enrichedCommits.push(enriched);

        // Grouping logic remains the same but uses enriched data
        if (!promptGroups[enriched.repo]) {
          promptGroups[enriched.repo] = [];
        }
        promptGroups[enriched.repo].push(enriched);
      }

      const prompt = buildPrompt(
        userContext,
        viewMode,
        username,
        enrichedCommits,
        stats.byCategory,
        promptGroups
      );

      console.log("🤖 [AI] Prompt Gerado:", prompt);

      const response = await generateSpeechWithAI(prompt);

      console.log("🤖 [AI] Resposta DeepSeek:", response);
      setAiSummary(response.content);
    } catch (e: any) {
      console.error(e);
      setAiSummary(`Erro ao gerar resumo: ${e.message}`);
    } finally {
      setGeneratingAi(false);
    }
  };

  return (
    /* --- Assistant View --- */
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Left Panel: Context & Settings */}
      <div className="lg:col-span-1 space-y-6">
        {/* Integrated Context Selector */}
        <ContextSelector context={userContext} onChange={setUserContext} />

        {/* AI Controls */}
        <div className=" container-destacado">
          <div className="absolute -top-20 right-0 w-64 h-48 bg-primary/10 rounded-full blur-2xl -mr-8 -mt-8"></div>
          <div className="flex justify-between p-2  ">
            <h3 className="flex items-center gap-2 font-bold text-accent-light p-2">
              <BrainCircuit className="text-accent" size="24" /> Gerar Discurso
            </h3>
            <button
              onClick={generateAiSummary}
              disabled={generatingAi}
              className={`botao-primario text-align ${generatingAi
                ? "cursor-not-allowed"
                : ""
                }`}
            >
              {generatingAi ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Criando Roteiro...</span>
                </>
              ) : (
                <>
                  <MessageSquareText size={20} />
                  Gerar Roteiro{" "}
                  {userContext.isHRMode ? "de Avaliação" : "de Fala"}
                </>
              )}
            </button>
          </div>
          {userContext.isHRMode && (
            <div className="mt-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs text-purple-300 flex items-start gap-2">
              <Users size={14} className="mt-0.5 shrink-0" />
              Modo RH Ativo: O relatório será gerado na terceira pessoa,
              focado em avaliação de performance.
            </div>
          )}   <div className="space-y-2">
            <label
              className={`container-destacado block p-2 rounded-md border cursor-pointer transition-all group ${viewMode === "daily"
                ? "bg-yellow-600/10 border-yellow-500/50"
                : "bg-gray950/50 border-gray800 hover:border-gray600"
                }`}
            >
              <div className="absolute -top-20 right-0 w-64 h-48 bg-primary/10 rounded-full blur-2xl -mr-8 -mt-8"></div>

              <div className="flex items-center gap-3 mb-2">
                <input
                  type="radio"
                  name="aiMode"
                  className="hidden"
                  checked={viewMode === "daily"}
                  onChange={() => setViewMode("daily")}
                />
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${viewMode === "daily"
                    ? "border-yellow-500"
                    : "border-gray600 group-hover:border-gray400"
                    }`}
                >
                  {viewMode === "daily" && (
                    <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                  )}
                </div>
                <div className="flex items-center gap-2 font-bold text-yellow-50">
                  <Coffee size={16} className="text-orange-500" /> Daily
                  Stand-up
                </div>
              </div>
              <p className="text-xs text-yellow-100/70 ml-7">
                Foco: Ontem vs Hoje. O que foi feito e impedimentos.
              </p>
            </label>

            <label
              className={`block p-3 rounded-lg border cursor-pointer transition-all group ${viewMode === "sprint"
                ? "bg-purple-600/10 border-purple-500/50"
                : "bg-gray950/50 border-gray800 hover:border-gray600"
                }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <input
                  type="radio"
                  name="aiMode"
                  className="hidden"
                  checked={viewMode === "sprint"}
                  onChange={() => setViewMode("sprint")}
                />
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${viewMode === "sprint"
                    ? "border-purple-500"
                    : "border-gray600 group-hover:border-gray400"
                    }`}
                >
                  {viewMode === "sprint" && (
                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                  )}
                </div>
                <div className="flex items-center gap-2 font-bold text-yellow-50">
                  <Zap size={16} className="text-yellow-500" /> Review da Sprint
                </div>
              </div>
              <p className="text-xs text-yellow-100/70 ml-7">
                Foco: Entregas de valor, funcionalidades e dematadas.
              </p>
            </label>

            <label
              className={`block p-3 rounded-lg border cursor-pointer transition-all group ${viewMode === "semester"
                ? "bg-green-600/10 border-green-500/50"
                : "bg-gray950/50 border-gray800 hover:border-gray600"
                }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <input
                  type="radio"
                  name="aiMode"
                  className="hidden"
                  checked={viewMode === "semester"}
                  onChange={() => setViewMode("semester")}
                />
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${viewMode === "semester"
                    ? "border-green-500"
                    : "border-gray600 group-hover:border-gray400"
                    }`}
                >
                  {viewMode === "semester" && (
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  )}
                </div>
                <div className="flex items-center gap-2 font-bold text-yellow-50">
                  <Users size={16} className="text-green-500" /> Feedback 1:1
                </div>
              </div>
              <p className="text-xs text-yellow-100/70 ml-7">
                Foco: Evolução semestral, projetos e colaboração.
              </p>
            </label>

            <label
              className={`block p-3 rounded-lg border cursor-pointer transition-all group ${viewMode === "year"
                ? "bg-yellow-600/10 border-yellow-500/50"
                : "bg-gray950/50 border-gray800 hover:border-gray600"
                }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <input
                  type="radio"
                  name="aiMode"
                  className="hidden"
                  checked={viewMode === "year"}
                  onChange={() => setViewMode("year")}
                />
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${viewMode === "year"
                    ? "border-yellow-500"
                    : "border-gray600 group-hover:border-gray400"
                    }`}
                >
                  {viewMode === "year" && (
                    <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                  )}
                </div>
                <div className="flex items-center gap-2 font-bold text-yellow-50">
                  <CalendarCheck size={16} className="text-yellow-500" />{" "}
                  Retrospectiva Anual
                </div>
              </div>
              <p className="text-xs text-yellow-100/70 ml-7">
                Foco: Visão holística do ano, constância e marcos.
              </p>
            </label>

          </div>
        </div>
      </div>

      {/* Right Panel: AI Output */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-gray900 rounded-xl border border-gray800 p-8 shadow-lg min-h-[500px] relative animate-fade-in">
          {aiSummary ? (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between border-b border-gray800 pb-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <span className="text-2xl">✨</span> Roteiro Sugerido
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={copyToClipboard}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${copied
                      ? "bg-green-500/20 text-green-400"
                      : "bg-gray800 text-yellow-100/70 hover:bg-gray700 hover:text-white"
                      }`}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Copiado!" : "Copiar"}
                  </button>
                </div>
              </div>

              <div className="prose prose-invert max-w-none prose-p:text-yellow-50 prose-headings:text-white prose-strong:text-yellow-400 prose-ul:text-yellow-50">
                {/* Split summary by lines and render delicately */}
                {aiSummary.split("\n").map((line, i) => (
                  <p
                    key={i}
                    className={`mb-2 leading-relaxed ${line.startsWith("#")
                      ? "text-lg font-bold text-white mt-4"
                      : line.startsWith("-")
                        ? "ml-4"
                        : ""
                      }`}
                  >
                    {line.replaceAll("#", "").trim()}
                  </p>
                ))}
              </div>

              <div className="mt-8 pt-6 border-t border-gray800">
                <p className="text-xs text-yellow-100/70 italic text-center">
                  Gerado por IA (DeepSeek Reasoner) • Revisão recomendada antes
                  de falar.
                </p>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-yellow-100/70 p-8 text-center opacity-60">
              <div className="w-24 h-24 bg-gray800 rounded-full flex items-center justify-center mb-6 animate-pulse">
                <BrainCircuit size={48} className="text-yellow-100/70" />
              </div>
              <h3 className="text-xl font-bold text-yellow-100/70 mb-2">
                Aguardando geração
              </h3>
              <p className="max-w-md">
                Configure o seu contexto ao lado e clique em "Gerar Roteiro"
                para criar um discurso personalizado para sua Daily ou Review.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
