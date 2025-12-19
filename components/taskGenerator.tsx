import React, { useState, useEffect } from "react";
import { Provider, UserContext, AzureRepository } from "../types";
import { fetchAreaPaths, fetchRecentCommitsForRepo } from "../services/azure";
import {
  fetchGitHubCommitDiff,
  fetchAzureCommitDiff,
  refineTaskWithAI,
} from "../services/taskGenerator";
import {
  Download,
  Play,
  RefreshCcw,
  Loader2,
  Save,
  Trash2,
  Search,
  RotateCcw,
  Wand2,
  FileText,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GitCommit,
} from "lucide-react";

interface TaskGeneratorProps {
  provider: Provider;
  token?: string;
  username: string;
  userContext: UserContext;
  // New Data Props
  azureConfig?: { org: string; token: string; aliases: string[] } | null;
  selectedRepos?: AzureRepository[];
}

// --- INTEFACES ---
interface Task {
  taskId: string;
  customTitle: string;
  coherentDescription: string;
  complexity: "baixa" | "media" | "alta" | "unica";
  ustPoints: number;
  estimateMade: number;
  source: string;
  kbIndex: number;
}

interface RepoMeta {
  org?: string;
  proj?: string;
  repo?: string;
}

// --- KNOWLEDGE BASE ---
// Mapeamento estático baseado no user request
const KNOWLEDGE_BASE = [
  {
    id: "10",
    name: "Análise de Sistema Legado",
    complexities: { baixa: 3, media: 9, alta: 15 },
  },
  {
    id: "65",
    name: "Supervisão técnica (Codigo/Analise/Auxilio)",
    complexities: { unica: 10 },
  },
  {
    id: "17",
    name: "Implementação de novo Recurso (backend ou frontend)",
    complexities: { baixa: 8, media: 24, alta: 40 },
  },
  {
    id: "25",
    name: "Execução de Testes Funcionais (Manuais)",
    complexities: { unica: 5 },
  },
  { id: "38", name: "Elaboração de script", complexities: { unica: 5 } },
  {
    id: "14",
    name: "Implementação de Funcionalidade Relatório",
    complexities: { baixa: 11, media: 33, alta: 55 },
  },
  {
    id: "36",
    name: "Executar Merge em caso de conflitos",
    complexities: { unica: 1 },
  },
  {
    id: "34",
    name: "Implantação (Deployment) de aplicação",
    complexities: { unica: 1 },
  },
];

const TaskGenerator: React.FC<TaskGeneratorProps> = ({
  provider,
  token,
  username,
  userContext,
  azureConfig,
  selectedRepos,
}) => {
  // --- STATE ---
  const [config, setConfig] = useState({
    assignedTo: username || "",
    iterationPath: "",
    areaPath: "",
    ghRepo: "",
    ghCommit: "",
    azUrl: "",
    azCommit: "",
    azToken: token || "",
  });

  // Connected State
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [areaPaths, setAreaPaths] = useState<string[]>([]);
  const [recentCommits, setRecentCommits] = useState<any[]>([]);
  const [selectedCommitId, setSelectedCommitId] = useState<string>("");

  const [descInput, setDescInput] = useState("");
  const [diffInput, setDiffInput] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    msg: string;
    type: "success" | "error" | "neutral";
  } | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [viewConfig, setViewConfig] = useState(true);

  // Load Config on Mount
  useEffect(() => {
    const load = (key: string) => localStorage.getItem("tg_" + key) || "";
    setConfig((prev) => ({
      ...prev,
      assignedTo: load("assignedTo") || prev.assignedTo,
      iterationPath: load("iterationPath"),
      areaPath: load("areaPath"),
      ghRepo: load("ghRepo"),
      azUrl: load("azUrl"),
      // Token de API geralmente não salvamos ou salvamos com cuidado.
      // O user snippet salvava, então manteremos a consistencia se desejado,
      // mas aqui optei por usar o props 'token' como default se disponivel.
    }));
  }, []);

  // Set default repo if available
  useEffect(() => {
    if (selectedRepos && selectedRepos.length > 0 && !selectedRepoId) {
      setSelectedRepoId(selectedRepos[0].id);
    }
  }, [selectedRepos]);

  // Fetch live data when Repo changes
  useEffect(() => {
    if (!selectedRepoId || !azureConfig || !selectedRepos) return;

    const repo = selectedRepos.find((r) => r.id === selectedRepoId);
    if (!repo) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // 1. Fetch Area Paths (Project Level)
        const paths = await fetchAreaPaths(
          azureConfig.org,
          repo.project.name,
          azureConfig.token
        );
        setAreaPaths(paths);

        // 2. Fetch Recent Commits
        const commits = await fetchRecentCommitsForRepo(
          azureConfig.org,
          repo.project.name,
          repo.id,
          azureConfig.token
        );
        setRecentCommits(commits);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedRepoId, azureConfig, selectedRepos, reloadTrigger]);

  const saveConfig = () => {
    Object.entries(config).forEach(([k, v]) => {
      if (v && k !== "azToken" && k !== "ghCommit" && k !== "azCommit") {
        // Avoid saving specifics
        localStorage.setItem("tg_" + k, v);
      }
    });
  };

  // Auto-fill legacy config when a commit is selected from dropdown
  const handleCommitSelect = (commitId: string) => {
    setSelectedCommitId(commitId);
    if (!selectedRepos || !azureConfig) return;

    const repo = selectedRepos.find((r) => r.id === selectedRepoId);
    if (!repo) return;

    // Construct URL for the legacy fetcher to work
    const cloneUrl = `https://dev.azure.com/${azureConfig.org}/${repo.project.name}/_git/${repo.name}`;

    setConfig((prev) => ({
      ...prev,
      azUrl: cloneUrl,
      azCommit: commitId,
    }));
  };

  // --- REPO API ---

  const fetchGitHub = async () => {
    if (!config.ghRepo || !config.ghCommit)
      return setStatusMsg({ msg: "Preencha Repo e Commit", type: "error" });
    setLoading(true);
    setStatusMsg({ msg: "Buscando GitHub...", type: "neutral" });
    try {
      const data = await fetchGitHubCommitDiff(
        config.ghRepo,
        config.ghCommit,
        config.azToken
      ); // Assuming token reuse or add ghToken prop

      setDiffInput(data.diff);
      setDescInput(data.description);
      setStatusMsg({ msg: "Diff carregado via GitHub", type: "success" });
      saveConfig();
    } catch (e: any) {
      setStatusMsg({ msg: e.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const fetchAzure = async () => {
    if (!config.azUrl || !config.azCommit || !config.azToken)
      return setStatusMsg({
        msg: "Preencha URL, Commit e Token",
        type: "error",
      });

    setLoading(true);
    setStatusMsg({ msg: "Buscando Azure...", type: "neutral" });
    try {
      debugger;
      const data = await fetchAzureCommitDiff(
        config.azUrl,
        config.azCommit,
        config.azToken
      );

      setDiffInput(data.diff);
      setDescInput(data.description);
      setStatusMsg({ msg: "Diff carregado via Azure", type: "success" });
      saveConfig();
    } catch (e: any) {
      setStatusMsg({ msg: e.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // --- HEURISTIC ENGINE ---
  const classifyComplexity = (
    filesCount: number,
    text: string,
    domain: string
  ): { complexity: "baixa" | "media" | "alta" | "unica"; taskId: string } => {
    // Regras Portadas
    const textLower = text.toLowerCase();

    // 1. Task ID Logic
    if (textLower.includes("merge"))
      return { taskId: "36", complexity: "unica" };
    if (textLower.includes("deploy") || textLower.includes("implantação"))
      return { taskId: "34", complexity: "unica" };
    if (textLower.includes("relatorio") || textLower.includes("relatório")) {
      // Relatorio Rules
      let comp: "baixa" | "media" | "alta" = "baixa";
      if (filesCount > 5) comp = "media";
      if (filesCount > 10) comp = "alta";
      return { taskId: "14", complexity: comp };
    }
    if (textLower.includes("script") || domain === "Database") {
      if (textLower.includes("criar") || textLower.includes("create"))
        return { taskId: "38", complexity: "unica" };
      // analise
      return { taskId: "10", complexity: "baixa" };
    }
    if (domain === "Test") return { taskId: "25", complexity: "unica" };
    if (domain === "Meeting") return { taskId: "65", complexity: "unica" };

    // Default: Implementação (17)
    let score = 1;
    if (filesCount > 10) score = 3;
    else if (filesCount >= 4) score = 2;

    if (
      textLower.match(
        /(complexo|grande|refatoração total|migração|arquitetura|integração)/
      )
    )
      score = Math.max(score, 3);
    else if (
      textLower.match(
        /(novo|nova|criar|implementar|feature|recurso|desenvolver)/
      )
    )
      score = Math.max(score, 2);

    let complexity: "baixa" | "media" | "alta" = "baixa";
    if (score >= 3) complexity = "alta";
    else if (score === 2) complexity = "media";

    return { taskId: "17", complexity };
  };

  const processHeuristic = () => {
    saveConfig();
    if (!descInput && !diffInput)
      return setStatusMsg({ msg: "Sem dados para processar", type: "error" });

    const newTasks: Task[] = [];

    // Split functionality based on diff files
    const files = diffInput.match(
      /[-*] (\[.*?\])?\s?([a-zA-Z0-9_/\\.-]+)/g
    ) || [""];

    // Group by Domain
    const domains: Record<string, number> = {
      Frontend: 0,
      Backend: 0,
      Database: 0,
      Test: 0,
      Config: 0,
    };

    files.forEach((f) => {
      const path = f.toLowerCase();
      if (
        path.includes(".tsx") ||
        path.includes(".css") ||
        path.includes(".html") ||
        path.includes("clientapp")
      )
        domains.Frontend++;
      else if (
        path.includes(".cs") ||
        path.includes("controller") ||
        path.includes("service") ||
        path.includes("api")
      )
        domains.Backend++;
      else if (path.includes(".sql")) domains.Database++;
      else if (path.includes("test") || path.includes("spec")) domains.Test++;
      else domains.Config++;
    });

    const activeDomains = Object.entries(domains).filter(
      ([_, count]) => count > 0
    );

    // If no file heuristic (manual entry usually), treat as single generic
    if (activeDomains.length === 0) activeDomains.push(["Geral", 1]);

    activeDomains.forEach(([domain, count]) => {
      const rules = classifyComplexity(count, descInput, domain);

      // Find KB
      let kbIndex = KNOWLEDGE_BASE.findIndex((k) => k.id === rules.taskId);
      if (kbIndex === -1) kbIndex = 2; // Default to Impl

      const kb = KNOWLEDGE_BASE[kbIndex];
      // Safe access complexity points
      const points =
        (kb.complexities as any)[rules.complexity] ||
        Object.values(kb.complexities)[0];

      newTasks.push({
        taskId: kb.id,
        kbIndex,
        complexity: rules.complexity,
        ustPoints: points,
        estimateMade: 0,
        customTitle: titleFromDomain(domain, descInput),
        coherentDescription:
          descInput || "Alterações realizadas nos arquivos do sistema.",
        source: "Heurística (Auto)",
      });
    });

    setTasks(newTasks);
    setStatusMsg({
      msg: `Gerado: ${newTasks.length} tarefas via regras.`,
      type: "success",
    });
    setViewConfig(false); // Collapse config to show results
  };

  const titleFromDomain = (domain: string, desc: string): string => {
    const cleanDesc = desc.split("\n")[0].substring(0, 50);
    if (domain === "Geral") return cleanDesc || "Nova Tarefa";
    return `${domain} - ${cleanDesc}`;
  };

  // --- AI REFINEMENT ---
  const refineWithAI = async () => {
    setLoadingAi(true);
    try {
      const aiItems = await refineTaskWithAI(descInput, diffInput);

      // Convert AI items to Heuristic Tasks
      const convertedTasks = aiItems.map((item: any) => {
        // Re-run classifier on AI output
        const rules = classifyComplexity(
          1,
          item.summary + " " + item.description,
          "Geral"
        );
        let kbIndex = KNOWLEDGE_BASE.findIndex((k) => k.id === rules.taskId);
        if (kbIndex === -1) kbIndex = 2;
        const kb = KNOWLEDGE_BASE[kbIndex];
        const points =
          (kb.complexities as any)[rules.complexity] ||
          Object.values(kb.complexities)[0];

        return {
          taskId: kb.id,
          kbIndex,
          complexity: rules.complexity,
          ustPoints: points,
          estimateMade: 0,
          customTitle: item.summary,
          coherentDescription: item.description,
          source: "IA Refinada (DeepSeek)",
        };
      });

      setTasks(convertedTasks);
      setStatusMsg({ msg: "Tarefas refinadas com IA!", type: "success" });
    } catch (e: any) {
      setStatusMsg({ msg: "Erro IA: " + e.message, type: "error" });
    } finally {
      setLoadingAi(false);
    }
  };

  // --- EXPORT ---
  const exportCsv = () => {
    if (tasks.length === 0) return;

    let csv =
      "ID,Work Item Type,Title,Assigned To,State,ID SPF,Effort,UST,Activity,Complexidade,Area Path,Iteration Path,Description\n";

    const area = config.areaPath || "Area\\Path";
    // Logic for full iteration path based on snippet
    let fullIter = config.iterationPath;
    if (config.areaPath.includes("Refatoração"))
      fullIter = `SPF-SIAFIC\\Refatoração\\Refatoração - ${config.iterationPath}`;
    else if (config.areaPath.includes("Fábrica"))
      fullIter = `SPF-SIAFIC\\SPF Fábrica\\SPF - ${config.iterationPath}`;

    tasks.forEach((t) => {
      const tit = `"${t.customTitle.replace(/"/g, '""')}"`;
      const desc = `"${t.coherentDescription.replace(/"/g, '""')}"`;
      let comp =
        t.complexity === "unica" ? "ÚNICA" : t.complexity.toUpperCase();

      csv += `
      ,"Task"
      ,${tit}
      ,"${config.assignedTo}"
      ,"To Do"
      ,"${t.taskId}"
      ,"${t.estimateMade}"
      ,"${t.estimateMade}" //efort
      ,"${t.ustPoints}"
      ,"Development"
      ,"${comp}"
      ,"${area}"
      ,"${fullIter}"
      ,${desc}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `tasks_${Date.now()}.csv`;
    link.click();
  };

  // --- UI HELPERS ---
  const updateTask = (index: number, field: keyof Task, value: any) => {
    const newTasks = [...tasks];
    const task = newTasks[index];
    (task as any)[field] = value;

    // Update derivatives
    if (field === "kbIndex") {
      const kb = KNOWLEDGE_BASE[value];
      task.taskId = kb.id;
      // Reset complexity to first available
      const firstComp = Object.keys(kb.complexities)[0] as any;
      task.complexity = firstComp;
      task.ustPoints = (kb.complexities as any)[firstComp];
    } else if (field === "complexity") {
      const kb = KNOWLEDGE_BASE[task.kbIndex];
      task.ustPoints = (kb.complexities as any)[value] || 0;
    }

    setTasks(newTasks);
  };

  const removeTask = (index: number) => {
    setTasks(tasks.filter((_, i) => i !== index));
  };

  const badgeColor = (c: string) => {
    if (c === "baixa")
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    if (c === "media")
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    if (c === "alta") return "bg-red-500/20 text-red-400 border-red-500/30";
    return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  };

  return (
    <div className="space-y-6">
      {/* CONFIGURATION PANEL */}
      <div className="border-2 border-accent-light rounded-xl overflow-hidden shadow-sm">
        <button
          onClick={() => setViewConfig(!viewConfig)}
          className="w-full flex items-center justify-between p-2 bg-surface hover:bg-surface-muted transition-colors cursor-pointer"
        >
          <h3 className="font-bold text-yellow-50 flex items-center gap-2">
            Configuração & Origem
          </h3>
          {viewConfig ? (
            <ChevronUp className="text-accent-light" size={24} />
          ) : (
            <ChevronDown className="text-accent-light" size={24} />
          )}
        </button>

        {viewConfig && (
          <div className="p-2 space-y-2 animate-in slide-in-from-top-2 duration-200">
            {/* 1. Global Fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold uppercase text-yellow-100/70 mb-1 block">
                  Assigned To
                </label>
                <input
                  type="text"
                  className="w-full bg-gray950 border border-gray800 rounded p-2 text-sm"
                  value={config.assignedTo}
                  onChange={(e) =>
                    setConfig({ ...config, assignedTo: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-yellow-100/70 mb-1 block">
                  Iteration Path
                </label>
                <input
                  type="text"
                  className="w-full bg-gray950 border border-gray800 rounded p-2 text-sm"
                  placeholder="ex: 35"
                  value={config.iterationPath}
                  onChange={(e) =>
                    setConfig({ ...config, iterationPath: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-yellow-100/70 mb-1 block">
                  Area Path
                </label>
                {azureConfig && selectedRepos ? (
                  <select
                    className="w-full bg-gray950 border border-gray800 rounded p-2 text-sm text-yellow-50 outline-none"
                    value={config.areaPath}
                    onChange={(e) =>
                      setConfig({ ...config, areaPath: e.target.value })
                    }
                  >
                    <option value="">Selecione Area Path...</option>
                    {areaPaths.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    className="w-full bg-gray-50 border border-gray800 rounded p-2 text-sm"
                    value={config.areaPath}
                    onChange={(e) =>
                      setConfig({ ...config, areaPath: e.target.value })
                    }
                  >
                    <option value="">Selecione...</option>
                    <option value="SPF-SIAFIC\Refatoração">Refatoração</option>
                    <option value="SPF-SIAFIC\SPF Fábrica">Fábrica</option>
                  </select>
                )}
              </div>
            </div>

            {/* 2. Source Selection */}
            <div className=" p-2 rounded-md">
              {azureConfig && selectedRepos && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center gap-2 text-yellow-400 font-bold text-sm">
                    <div className="flex justify-end align-center w-full">
                      <button
                        onClick={() => setReloadTrigger((prev) => prev + 1)}
                        className="flex gap-2 items-center p-2 bg-surface self-end rounded-lg hover:text-accent-light transition-colors cursor-pointer"
                        title="Atualizar commits"
                        disabled={
                          loading ||
                          (!selectedCommitId && recentCommits.length === 0)
                        }
                      >
                        {loading ? (
                          <div className="flex gap-2 min-w-fit flex-nowrap text-center items-center">
                            Atualizando commits
                            <Loader2 size={16} className="animate-spin" />
                          </div>
                        ) : (
                          <div className="flex gap-2 min-w-fit flex-nowrap text-center items-center">
                            Atualizar commits <RefreshCcw size={16} />
                          </div>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex w-full gap-2">
                    <div className="flex flex-col flex-1">
                      <label className="text-[10px] font-bold uppercase text-yellow-100/70 mb-1 block">
                        Repositório Selecionado
                      </label>
                      <select
                        className="w-full bg-gray900 border border-gray700 rounded p-2 text-xs text-white focus:border-yellow-500 outline-none"
                        value={selectedRepoId}
                        onChange={(e) => setSelectedRepoId(e.target.value)}
                      >
                        {selectedRepos.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.project.name})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col flex-1">
                      <label className="text-[10px] font-bold uppercase text-yellow-100/70 mb-1 block">
                        Repositório Selecionado
                      </label>

                      <select
                        className=""
                        value={
                          selectedCommitId ||
                          (recentCommits.length > 0
                            ? recentCommits[recentCommits.length - 1].commitId
                            : "")
                        }
                        onChange={(e) => handleCommitSelect(e.target.value)}
                        disabled={loading}
                      >
                        <option value="">Selecione um commit...</option>
                        {recentCommits.map((c) => (
                          <option key={c.commitId} value={c.commitId}>
                            {c.comment.substring(0, 50)}... (
                            {new Date(c.date).toLocaleDateString()})
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={async () => {
                        const commitToFetch =
                          selectedCommitId ||
                          (recentCommits.length > 0
                            ? recentCommits[recentCommits.length - 1].commitId
                            : "");
                        if (!commitToFetch || !selectedRepoId || !azureConfig)
                          return;

                        setLoading(true);
                        try {
                          const repo = selectedRepos!.find(
                            (r) => r.id === selectedRepoId
                          );
                          if (!repo) return;
                          const cloneUrl = `https://dev.azure.com/${azureConfig.org}/${repo.project.name}/_git/${repo.name}`;
                          const data = await fetchAzureCommitDiff(
                            cloneUrl,
                            commitToFetch,
                            azureConfig.token
                          );
                          setDiffInput(data.diff);
                          setDescInput(data.description);
                          setStatusMsg({
                            msg: "Dados do commit carregados!",
                            type: "success",
                          });
                        } catch (e: any) {
                          setStatusMsg({
                            msg: "Erro ao carregar commit: " + e.message,
                            type: "error",
                          });
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={
                        loading ||
                        (!selectedCommitId && recentCommits.length === 0)
                      }
                      className="
                      cursor-pointer bg-accent self-end h-fit text-surface p-2 rounded-md disabled:opacity-50 flex gap-2 hover:bg-accent-hover items-center justify-center transition-colors"
                      title="Carregar Detalhes do Commit"
                    >
                      Buscar Diffs
                      <Download size={24} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Status Message */}
            {statusMsg && (
              <div
                className={`p-3 rounded text-xs font-bold flex items-center gap-2 ${
                  statusMsg.type === "error"
                    ? "bg-red-500/10 text-red-400"
                    : statusMsg.type === "success"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-gray800 text-yellow-100/70"
                }`}
              >
                {statusMsg.msg}
              </div>
            )}
          </div>
        )}
      </div>

      {/* INPUT AREA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-yellow-100/70">
            Descrição Técnica
          </label>
          <textarea
            className="w-full h-32 bg-gray950 border border-gray800 rounded-lg p-3 text-sm focus:ring-2 focus:ring-yellow-500/50 outline-none resize-none"
            placeholder="Descreva o que foi feito..."
            value={descInput}
            onChange={(e) => setDescInput(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-yellow-100/70">
            Diff / Arquivos Afetados
          </label>
          <textarea
            className="w-full h-32  rounded-lg p-3 text-sm font-mono text-yellow-100/70 focus:ring-2 focus:ring-yellow-500/50 outline-none resize-none"
            placeholder="Cole o diff ou lista de arquivos..."
            value={diffInput}
            onChange={(e) => setDiffInput(e.target.value)}
          />
        </div>
      </div>

      {/* ACTION BAR */}
      <div className="flex items-center gap-4">
        <button
          onClick={processHeuristic}
          className="flex-1 py-3 bg-yellow-600 hover:bg-yellow-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-yellow-900/20 active:scale-95 flex items-center justify-center gap-2"
        >
          <Play size={18} /> Gerar Tarefas (Rápido)
        </button>
        <button
          onClick={refineWithAI}
          disabled={loadingAi}
          className="px-6 py-3 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loadingAi ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Wand2 size={18} />
          )}
          IA Magic
        </button>
      </div>

      {/* RESULTS AREA */}
      {tasks.length > 0 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between border-b border-gray800 pb-2 mb-4">
            <h3 className="font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="text-emerald-500" size={18} />
              Tarefas Geradas{" "}
              <span className="text-xs bg-gray800 px-2 py-0.5 rounded-full text-yellow-100/70">
                {tasks.length}
              </span>
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setTasks([])}
                className="p-2 text-yellow-100/70 hover:text-red-400 transition-colors"
              >
                <Trash2 size={16} />
              </button>
              <button
                onClick={exportCsv}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-emerald-900/20 transition-all"
              >
                <FileText size={16} /> Exportar CSV
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {tasks.map((task, idx) => (
              <div
                key={idx}
                className="bg-gray900 border border-gray800 rounded-xl p-4 shadow-sm hover:border-gray700 transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1 p-2 bg-gray950 rounded text-yellow-100/70 font-mono text-xs border border-gray800">
                    #{task.taskId}
                  </div>

                  <div className="flex-1 space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 bg-transparent border-b border-transparent hover:border-gray700 focus:border-yellow-500 outline-none text-white font-semibold placeholder-gray600 transition-colors"
                        value={task.customTitle}
                        onChange={(e) =>
                          updateTask(idx, "customTitle", e.target.value)
                        }
                      />
                      <span className="text-[10px] uppercase font-bold text-yellow-100/70 tracking-wider self-center">
                        {task.source}
                      </span>
                    </div>

                    <textarea
                      className="w-full bg-gray950/50 rounded p-2 text-sm text-yellow-50 outline-none border border-transparent focus:border-gray700 resize-none"
                      rows={2}
                      value={task.coherentDescription}
                      onChange={(e) =>
                        updateTask(idx, "coherentDescription", e.target.value)
                      }
                    />

                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase text-yellow-100/70">
                          Categoria
                        </label>
                        <select
                          className="bg-gray950 border border-gray800 rounded px-2 py-1 text-xs text-yellow-50 outline-none"
                          value={task.kbIndex}
                          onChange={(e) =>
                            updateTask(idx, "kbIndex", parseInt(e.target.value))
                          }
                        >
                          {KNOWLEDGE_BASE.map((k, i) => (
                            <option key={k.id} value={i}>
                              {k.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase text-yellow-100/70">
                          Complexidade
                        </label>
                        <select
                          className={`bg-gray950 border border-gray800 rounded px-2 py-1 text-xs outline-none font-bold ${
                            task.complexity === "alta"
                              ? "text-red-400"
                              : task.complexity === "media"
                              ? "text-yellow-400"
                              : "text-emerald-400"
                          }`}
                          value={task.complexity}
                          onChange={(e) =>
                            updateTask(idx, "complexity", e.target.value)
                          }
                        >
                          {Object.keys(
                            KNOWLEDGE_BASE[task.kbIndex].complexities
                          ).map((c) => (
                            <option key={c} value={c}>
                              {c.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase text-yellow-100/70">
                          UST
                        </label>
                        <div
                          className={`px-2 py-1 rounded text-xs font-mono font-bold border ${badgeColor(
                            task.complexity
                          )}`}
                        >
                          {task.ustPoints}
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase text-yellow-100/70">
                          Horas
                        </label>
                        <input
                          type="number"
                          className="w-16 bg-gray950 border border-gray800 rounded px-2 py-1 text-xs text-center text-white"
                          value={task.estimateMade}
                          onChange={(e) =>
                            updateTask(
                              idx,
                              "estimateMade",
                              parseFloat(e.target.value)
                            )
                          }
                        />
                      </div>

                      <button
                        onClick={() => removeTask(idx)}
                        className="ml-auto text-yellow-100/70 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskGenerator;
