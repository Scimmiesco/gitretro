import { parseAzureUrl } from './azure';
import * as Diff from 'diff';

const fetchAzureBlob = async (org: string, project: string, repo: string, sha: string, auth: string) => {
    if (!sha) return "";
    const url = `https://dev.azure.com/${org}/${project}/_apis/git/repositories/${repo}/blobs/${sha}?api-version=7.0`;
    try {
        const res = await fetch(url, { headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'text/plain' } });
        if (!res.ok) return "";
        return await res.text();
    } catch {
        return "";
    }
};

// --- GITHUB ---
export const fetchGitHubCommitDiff = async (repo: string, commit: string, token?: string) => {
    const headers: any = {};
    if (token) headers['Authorization'] = `token ${token}`;

    const res = await fetch(`https://api.github.com/repos/${repo}/commits/${commit}`, { headers });
    if (!res.ok) throw new Error("Erro GitHub API");
    const data = await res.json();

    let diff = `[GitHub Commit] ${data.commit.message}\nFiles:\n`;
    if (data.files) data.files.forEach((f: any) => diff += `- ${f.filename} (${f.status})\n`);

    return {
        description: data.commit.message,
        diff: diff // Formatted specifically for the inputs
    };
};

// --- AZURE ---
export const fetchAzureCommitDiff = async (repoUrl: string, commitSha: string, token: string) => {
    const meta = parseAzureUrl(repoUrl);
    if (!meta) throw new Error("URL Azure inválida");

    const auth = btoa(":" + token);
    const changesUrl = `https://dev.azure.com/${meta.org}/${meta.project}/_apis/git/repositories/${meta.repo}/commits/${commitSha}/changes?api-version=7.0`;

    // Fetch Changes
    const res = await fetch(changesUrl, { headers: { 'Authorization': `Basic ${auth}` } });
    if (res.status === 401 || res.status === 403) {
        throw new Error(`Acesso negado (${res.status}): O Token do Azure é inválido ou expirou. Verifique suas credenciais.`);
    }
    if (!res.ok) throw new Error(`Erro ${res.status}: Verifique token/permissões`);
    const data = await res.json();

    let rootDiff = `[Azure Commit] ${commitSha}\nFiles Alterados:\n`;
    if (data.changes) data.changes.forEach((c: any) => rootDiff += `- [${c.changeType}] ${c.item.path}\n`);

    // Fetch line-by-line diffs for each file
    let diffLines = "";
    if (data.changes) {
        // limit to 15 to avoid overloading browser requests
        const changesToProcess = Math.min(data.changes.length, 15);
        for (let i = 0; i < changesToProcess; i++) {
            const c = data.changes[i];

            // se o arquivo nao for adicionar ou deletar, e for muito grande, criar o diff pode pesar?
            // o ai aceita melhor os codigos
            let oldContent = "";
            let newContent = "";

            if (c.changeType !== "add" && c.item.originalObjectId) {
                oldContent = await fetchAzureBlob(meta.org, meta.project, meta.repo, c.item.originalObjectId, auth);
            }
            if (c.changeType !== "delete" && c.item.objectId) {
                newContent = await fetchAzureBlob(meta.org, meta.project, meta.repo, c.item.objectId, auth);
            }

            const filePatch = Diff.createPatch(c.item.path, oldContent, newContent);
            diffLines += `\n\n--- Arquivo: ${c.item.path} ---\n${filePatch}\n`;
        }

        if (data.changes.length > 15) {
            diffLines += `\n... mais ${data.changes.length - 15} arquivos omitidos por limite de carga ...\n`;
        }
    }

    let diff = rootDiff + diffLines;

    // Try fetching message (commit details)
    let description = "";
    try {
        const msgUrl = `https://dev.azure.com/${meta.org}/${meta.project}/_apis/git/repositories/${meta.repo}/commits/${commitSha}?api-version=7.0`;
        const msgRes = await fetch(msgUrl, { headers: { 'Authorization': `Basic ${auth}` } });
        if (msgRes.ok) {
            const msgData = await msgRes.json();
            description = msgData.comment;
            diff = `Msg: ${msgData.comment}\n` + diff;
        }
    } catch (ign) {
        // Ignore failure to get message
    }

    return {
        description,
        diff
    };
};

// --- AI REFINEMENT ---
export const refineTaskWithAI = async (description: string, diffSummary: string) => {
    // Check for key in likely places
    const apiKey = (import.meta as any).env?.VITE_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;

    if (!apiKey) throw new Error("API Key (VITE_DEEPSEEK_API_KEY) não configurada.");

    const prompt = `
        Aja como Tech Lead. Quebre o trabalho a seguir em tarefas faturáveis.
        DESCRIÇÃO: ${description}
        DIFF SUMMARY: ${diffSummary.substring(0, 5000)}
        
        REGRAS:
        - Separe Frontend, Backend, Banco de Dados.
        - Retorne um OBJETO JSON com a propriedade "tasks".
        - "tasks" deve ser um array de objetos: { "summary": "titulo curto", "description": "descrição detalhada técnica" }
    `;

    try {
        // Using the proxy setup in vite.config.ts -> /deepseek-api -> https://api.deepseek.com
        const response = await fetch('/deepseek-api/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: "system", content: "You are a helpful assistant that outputs JSON." },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" },
                stream: false
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`DeepSeek API Error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;

        const parsed = JSON.parse(content);

        // Robustness: handle if it returned tasks array directly or wrapped
        if (Array.isArray(parsed)) return parsed;
        if (parsed.tasks && Array.isArray(parsed.tasks)) return parsed.tasks;

        // Fallback if structure is unexpected but valid JSON
        console.warn("Unexpected JSON structure:", parsed);
        return [];

    } catch (e: any) {
        console.error("AI Request Failed:", e);
        throw new Error("Erro na IA: " + e.message);
    }
};