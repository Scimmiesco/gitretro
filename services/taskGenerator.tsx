import { parseAzureUrl } from './azure';

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
    if (!res.ok) throw new Error(`Erro ${res.status}: Verifique token/permissões`);
    const data = await res.json();

    let diff = `[Azure Commit] ${commitSha}\nFiles:\n`;
    if (data.changes) data.changes.forEach((c: any) => diff += `- [${c.changeType}] ${c.item.path}\n`);

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