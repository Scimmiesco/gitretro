
import { AzureApiCommitItem } from '../types';

export interface AzureRepoConfig {
  org: string;
  project: string;
  repo: string;
}

export const parseAzureUrl = (url: string): AzureRepoConfig | null => {
  // SSH: git@ssh.dev.azure.com:v3/Org/Project/Repo
  const sshRegex = /v3\/([^/]+)\/([^/]+)\/([^/]+)/;
  const sshMatch = url.match(sshRegex);
  if (sshMatch) {
    console.log(`[Azure Parser] Detectado SSH: Org=${sshMatch[1]}, Project=${sshMatch[2]}, Repo=${sshMatch[3]}`);
    return {
      org: sshMatch[1],
      project: sshMatch[2],
      repo: sshMatch[3].replace('.git', '')
    };
  }

  // HTTPS: https://dev.azure.com/Org/Project/_git/Repo
  const httpsRegex = /dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)/;
  const httpsMatch = url.match(httpsRegex);
  if (httpsMatch) {
    const config = {
      org: httpsMatch[1],
      project: httpsMatch[2],
      repo: httpsMatch[3].replace('.git', '')
    };
    console.log(`[Azure Parser] Config Extraída:`, config);
    return config;
  }

  // PROXY: /azure-api/Org/Project/_git/Repo
  const proxyRegex = /\/azure-api\/([^/]+)\/([^/]+)\/_git\/([^/]+)/;
  const proxyMatch = url.match(proxyRegex);
  if (proxyMatch) {
    const config = {
      org: proxyMatch[1],
      project: proxyMatch[2],
      repo: proxyMatch[3].replace('.git', '')
    };
    console.log(`[Azure Parser] Config Proxy Extraída:`, config);
    return config;
  }

  return null;
};

// Verifica se o commit/PR pertence a um dos aliases do usuário
const matchIdentity = (name: string | undefined, email: string | undefined, aliases: string[]): boolean => {
  const normalizedAliases = aliases.map(a => a.toLowerCase().trim());

  const hasNameMatch = name && normalizedAliases.some(alias => name.toLowerCase().includes(alias));
  const hasEmailMatch = email && normalizedAliases.some(alias => email.toLowerCase().includes(alias));

  return !!(hasNameMatch || hasEmailMatch);
};

// --- WORK ITEM FETCHING ---
const fetchWorkItemsForPR = async (
  org: string,
  project: string,
  repoId: string,
  prId: number,
  headers: HeadersInit
): Promise<any | undefined> => {
  try {
    // 1. Get Work Item Refs associated with PR
    const refsUrl = `/azure-api/${org}/${project}/_apis/git/repositories/${repoId}/pullrequests/${prId}/workitems?api-version=7.0`;
    const refsRes = await fetch(refsUrl, { headers });
    if (!refsRes.ok) return undefined;

    const refsData = await refsRes.json();
    const workItems = refsData.value || [];
    if (workItems.length === 0) return undefined;

    // 2. Fetch Details for the first Work Item (assuming it's the main PBI)
    // We could handle multiple, but UI only asks for "the PBI"
    const targetId = workItems[0].id;
    const wiUrl = `/azure-api/${org}/${project}/_apis/wit/workitems/${targetId}?api-version=7.0`;
    const wiRes = await fetch(wiUrl, { headers });
    if (!wiRes.ok) return undefined;

    const wiData = await wiRes.json();

    // 3. Find Parent (Hierarchy-Reverse)
    let parentDetails = undefined;
    const parentLink = wiData.relations?.find((r: any) => r.rel === 'System.LinkTypes.Hierarchy-Reverse');

    if (parentLink) {
      try {
        const parentRes = await fetch(parentLink.url, { headers });
        if (parentRes.ok) {
          const parentData = await parentRes.json();
          parentDetails = {
            id: String(parentData.id),
            title: parentData.fields['System.Title'],
            type: parentData.fields['System.WorkItemType']
          };
        }
      } catch (e) {
        console.warn(`[Azure] Failed to fetch parent for WI ${targetId}`, e);
      }
    }

    return {
      id: String(wiData.id),
      title: wiData.fields['System.Title'],
      description: wiData.fields['System.Description'] || '',
      createdBy: wiData.fields['System.CreatedBy']?.displayName || 'Unknown',
      sprint: wiData.fields['System.IterationPath']?.split('\\').pop() || 'Backlog',
      url: wiData._links?.html?.href,
      type: wiData.fields['System.WorkItemType'],
      parent: parentDetails
    };

  } catch (error) {
    console.warn(`[Azure] Failed to fetch work items for PR ${prId}`, error);
    return undefined;
  }
};

// --- ESTRATÉGIA 1: PR-FIRST (Contexto Rico) ---
const fetchCommitsViaPRs = async (
  org: string,
  project: string,
  repoId: string,
  targetAuthors: string[],
  start: Date,
  end: Date,
  commonHeaders: HeadersInit
): Promise<AzureApiCommitItem[]> => {

  const commitsMap = new Map<string, AzureApiCommitItem>();
  const prsUrl = `/azure-api/${org}/${project}/_apis/git/repositories/${repoId}/pullrequests`;

  // 1. Buscar PRs COMPLETADOS no período.
  const prParams = new URLSearchParams({
    'searchCriteria.status': 'completed',
    'searchCriteria.minTime': start.toISOString(),
    'searchCriteria.maxTime': end.toISOString(),
    'api-version': '7.0',
    '$top': '1000'
  });

  try {
    const prResponse = await fetch(`${prsUrl}?${prParams.toString()}`, { headers: commonHeaders });
    if (!prResponse.ok) return [];

    const prData = await prResponse.json();
    console.log(`[Azure] Raw PR Data (First Item):`, prData.value?.[0]);

    // Filtrar: Apenas PRs criados por um dos aliases do usuário (Corp ou Pessoal)
    const myPrs = (prData.value || []).filter((pr: any) => {
      return matchIdentity(pr.createdBy?.displayName, pr.createdBy?.uniqueName, targetAuthors);
    });

    console.log(`[Azure] Meus PRs Filtrados (${myPrs.length}):`, myPrs.map((p: any) => ({ id: p.pullRequestId, title: p.title })));

    // 2. Para CADA PR, buscar os commits que estão dentro dele
    // Paralelismo limitado para não estourar rate limit
    const CHUNK_SIZE = 5;
    for (let i = 0; i < myPrs.length; i += CHUNK_SIZE) {
      const chunk = myPrs.slice(i, i + CHUNK_SIZE);

      await Promise.all(chunk.map(async (pr: any) => {
        // Fetch Task Info concurrently with commits
        const [commitsRes, taskInfo] = await Promise.all([
          fetch(`/azure-api/${org}/${project}/_apis/git/repositories/${repoId}/pullrequests/${pr.pullRequestId}/commits`, { headers: commonHeaders }),
          fetchWorkItemsForPR(org, project, repoId, pr.pullRequestId, commonHeaders)
        ]);

        if (!commitsRes.ok) return;

        const data = await commitsRes.json();
        const branchName = pr.sourceRefName.replace('refs/heads/', '');
        const prTitle = pr.title;

        (data.value || []).forEach((commit: any) => {
          // 3. Filtrar: Só queremos os SEUS commits dentro desse PR
          if (matchIdentity(commit.author?.name, commit.author?.email, targetAuthors)) {

            commitsMap.set(commit.commitId, {
              commitId: commit.commitId,
              comment: commit.comment,
              author: commit.author,
              remoteUrl: `https://dev.azure.com/${org}/${project}/_git/${repoId}/commit/${commit.commitId}?refName=${pr.sourceRefName}`,
              branch: branchName, // O PR nos dá a branch exata!
              context: prTitle,    // O título do PR é o contexto da feature
              taskInfo: taskInfo   // Anexamos as informações do PBI/Sprint
            });
          }
        });
      }));
    }

    return Array.from(commitsMap.values());

  } catch (e) {
    console.warn(`[Azure] Falha ao buscar PRs para ${repoId}`, e);
    return [];
  }
};

// --- ESTRATÉGIA 2: Commits Soltos (Fallback) ---
// Busca commits que podem não estar em PRs (hotfixes direto na main ou PRs de outros)
const fetchCommitsDirectly = async (
  org: string,
  project: string,
  repoId: string,
  targetAuthors: string[],
  start: Date,
  end: Date,
  commonHeaders: HeadersInit
): Promise<AzureApiCommitItem[]> => {
  const commitsUrl = `/azure-api/${org}/${project}/_apis/git/repositories/${repoId}/commits`;
  let allDirectCommits: AzureApiCommitItem[] = [];

  const fromDate = start.toISOString(); // e.g., 2025-12-01T00:00:00.000Z
  const toDate = end.toISOString();

  const searchPromises = targetAuthors.map(async (alias) => {
    const params = new URLSearchParams({
      'searchCriteria.author': alias,
      'searchCriteria.fromDate': fromDate,
      'searchCriteria.toDate': toDate,
      'api-version': '7.0',
      '$top': '500'
    });

    const res = await fetch(`${commitsUrl}?${params.toString()}`, { headers: commonHeaders });
    if (!res.ok) return [];

    const data = await res.json();
    return (data.value || []).map((c: any) => ({
      commitId: c.commitId,
      comment: c.comment,
      author: c.author,
      remoteUrl: c.remoteUrl,
      branch: 'Geral',
      context: undefined
    }));
  });

  const results = await Promise.all(searchPromises);
  results.forEach(arr => allDirectCommits.push(...arr));

  return allDirectCommits;
};

// --- ORQUESTRADOR ---
export const fetchAzureCommits = async (
  repoUrl: string,
  aliases: string[],
  start: Date,
  end: Date,
  token: string
): Promise<AzureApiCommitItem[]> => {
  const config = parseAzureUrl(repoUrl);
  if (!config) throw new Error("URL do repositório Azure inválida.");

  const { org, project, repo } = config;
  const headers = {
    'Authorization': 'Basic ' + btoa(':' + token),
    'Content-Type': 'application/json'
  };

  // 1. Buscar via PRs (Alta qualidade de dados, prioridade)
  const prCommits = await fetchCommitsViaPRs(org, project, repo, aliases, start, end, headers);

  // 2. Buscar Direto (Fallback para commits orfãos)
  const directCommits = await fetchCommitsDirectly(org, project, repo, aliases, start, end, headers);

  // 3. Unificar com Map para remover duplicatas
  // A ordem de inserção importa: inserimos os diretos primeiro, depois os de PR.
  // Se houver conflito (mesmo ID), o commit do PR sobrescreve, pois tem mais metadados (branch/context).
  const unifiedMap = new Map<string, AzureApiCommitItem>();

  directCommits.forEach(c => unifiedMap.set(c.commitId, c));
  prCommits.forEach(c => unifiedMap.set(c.commitId, c)); // Sobrescreve com dados ricos

  console.log(`[Azure ${repo}] PR Commits: ${prCommits.length}, Direct: ${directCommits.length}, Total Unique: ${unifiedMap.size}`);

  return Array.from(unifiedMap.values());
};

export const fetchAzureCommit = async (
  repoUrl: string,
  commitId: string,
  token: string
): Promise<any> => {
  const config = parseAzureUrl(repoUrl);
  if (!config) throw new Error("URL do repositório Azure inválida.");

  const { org, project, repo } = config;
  const url = `/azure-api/${org}/${project}/_apis/git/repositories/${repo}/commits/${commitId}?api-version=7.0`;

  console.log(`🔍 [Azure Service] Fetch Single Commit URL: ${url}`);

  const headers = {
    'Authorization': 'Basic ' + btoa(':' + token),
    'Content-Type': 'application/json'
  };

  const response = await fetch(url, { headers });
  console.log(`📬 [Azure Service] Single Commit Status: ${response.status}`);

  if (!response.ok) {
    throw new Error(`Erro ao buscar detalhes do commit Azure: ${response.statusText}`);
  }

  const data = await response.json();

  // Fetch Changes
  const changesUrl = `/azure-api/${org}/${project}/_apis/git/repositories/${repo}/commits/${commitId}/changes?api-version=7.1`;
  console.log(`� [Azure Service] Fetch Changes URL: ${changesUrl}`);
  const changesResponse = await fetch(changesUrl, { headers });
  let changes = [];

  if (changesResponse.ok) {
    const changesData = await changesResponse.json();
    changes = changesData.changes.map((c: any) => ({
      fileName: c.item.path,
      status: c.changeType, // 'add', 'edit', 'delete' maps loosely to our types
      url: c.item.url
    }));
    console.log(`📂 [Azure Service] Found ${changes.length} changes.`);
  } else {
    console.warn(`⚠️[Azure Service] Failed to fetch changes: ${changesResponse.statusText} `);
  }

  const fullData = { ...data, changes };
  console.log(`📦[Azure Service] Single Commit Data(with changes): `, fullData);
  return fullData;
};

// --- ESTRATÉGIA GLOBAL: FETCH ALL ORG COMMITS ---
// 1. Fetch Projects -> 2. Fetch Repos -> 3. Fetch Commits

import { AzureProject, AzureRepository } from '../types';

const fetchProjects = async (org: string, token: string): Promise<AzureProject[]> => {
  const url = `/azure-api/${org}/_apis/projects?api-version=7.0`;
  const headers = { 'Authorization': 'Basic ' + btoa(':' + token) };

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed to fetch projects: ${res.statusText}`);
    const data = await res.json();
    return (data.value || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      url: p.url
    }));
  } catch (e) {
    console.error(`[Azure Global] Error fetching projects for ${org}`, e);
    return [];
  }
};

const fetchRepositories = async (org: string, project: string, token: string): Promise<AzureRepository[]> => {
  const url = `/azure-api/${org}/${project}/_apis/git/repositories?api-version=7.0`;
  const headers = { 'Authorization': 'Basic ' + btoa(':' + token) };

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return []; // Alguns projetos podem não ter repos configurados
    const data = await res.json();
    return (data.value || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      url: r.webUrl,
      project: {
        id: r.project.id,
        name: r.project.name
      }
    }));
  } catch (e) {
    console.warn(`[Azure Global] Error fetching repos for project ${project}`, e);
    return [];
  }
};

// --- REFACTORED: SPLIT DISCOVERY & FETCH ---

export const discoverRepositories = async (
  org: string,
  token: string
): Promise<AzureRepository[]> => {
  console.log(`🚀 [Azure Service] Discovering Repositories for: ${org}`);
  try {
    const projects = await fetchProjects(org, token);
    console.log(`📂 Found ${projects.length} projects.`);

    let allRepos: AzureRepository[] = [];
    for (const project of projects) {
      const repos = await fetchRepositories(org, project.name, token);
      allRepos.push(...repos);
    }
    console.log(`📚 Found ${allRepos.length} repositories.`);
    return allRepos;
  } catch (error) {
    console.error("Discovery Failed:", error);
    throw error;
  }
};

export const fetchCommitsForRepos = async (
  org: string,
  repos: AzureRepository[],
  aliases: string[],
  start: Date,
  end: Date,
  token: string
): Promise<AzureApiCommitItem[]> => {
  console.log(`⚡ [Azure Service] Fetching commits for ${repos.length} selected repos.`);

  // Process in batches
  const CHUNK_SIZE = 5;
  const allCommitsMap = new Map<string, AzureApiCommitItem>();

  for (let i = 0; i < repos.length; i += CHUNK_SIZE) {
    const chunk = repos.slice(i, i + CHUNK_SIZE);

    const results = await Promise.all(chunk.map(async (repo) => {
      try {
        // Construct PROXY URL for the internal fetcher
        const repoUrl = `/azure-api/${org}/${repo.project.name}/_git/${repo.name}`;
        return await fetchAzureCommits(repoUrl, aliases, start, end, token);
      } catch (e) {
        console.warn(`[Azure Service] Failed to fetch for ${repo.name}`, e);
        return [];
      }
    }));

    results.flat().forEach(commit => {
      allCommitsMap.set(commit.commitId, commit);
    });
  }

  const finalCommits = Array.from(allCommitsMap.values());
  console.log(`✅ [Azure Service] Total Unique Commits: ${finalCommits.length}`);
  return finalCommits;
};


// --- TASK GENERATOR HELPERS ---

export const fetchAreaPaths = async (
  org: string,
  project: string,
  token: string
): Promise<string[]> => {
  const url = `/azure-api/${org}/${project}/_apis/wit/classificationnodes/areas?$depth=5&api-version=7.0`;
  const headers = { 'Authorization': 'Basic ' + btoa(':' + token) };

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed to fetch area paths: ${res.statusText}`);

    const data = await res.json();
    const paths: string[] = [];

    const traverse = (node: any, currentPath: string) => {
      const fullPath = currentPath ? `${currentPath}\\${node.name}` : node.name;
      paths.push(fullPath);
      if (node.children) {
        node.children.forEach((child: any) => traverse(child, fullPath));
      }
    };

    if (data.value) {
      data.value.forEach((node: any) => traverse(node, data.name)); // Adjust root
    } else if (data.name) {
      traverse(data, "");
    }

    // Filter usually relevant paths if needed, or return all
    return paths;
  } catch (e) {
    console.error(`[Azure Service] Error fetching area paths for ${project}`, e);
    return [];
  }
};

export const fetchRecentCommitsForRepo = async (
  org: string,
  project: string,
  repoId: string,
  token: string,
  limit: number = 20
): Promise<any[]> => {
  const url = `/azure-api/${org}/${project}/_apis/git/repositories/${repoId}/commits?$top=${limit}&api-version=7.0`;
  const headers = { 'Authorization': 'Basic ' + btoa(':' + token) };

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed to fetch commits: ${res.statusText}`);
    const data = await res.json();
    return (data.value || []).map((c: any) => ({
      commitId: c.commitId,
      comment: c.comment,
      author: c.author.name,
      date: c.author.date
    }));
  } catch (e) {
    console.error(`[Azure Service] Error fetching recent commits`, e);
    return [];
  }
};

export const fetchWorkItemsByType = async (
  org: string,
  project: string,
  workItemSelected: string,
  token: string
): Promise<{ id: string; title: string }[]> => {
  const url = `/azure-api/${org}/${project}/_apis/wit/wiql?api-version=7.0`;
  const headers = {
    Authorization: "Basic " + btoa(":" + token),
    "Content-Type": "application/json",
  };

  const query = `
    SELECT [System.Id], [System.Title]
    FROM WorkItems
    WHERE [System.TeamProject] = @project
      AND [System.WorkItemType] = '${workItemSelected}'
      AND [System.State] <> 'Closed'
      AND [System.State] <> 'Removed'
    ORDER BY [System.ChangedDate] DESC
  `;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
    });

    if (!res.ok) throw new Error(`Failed to fetch work items: ${res.statusText}`);

    const data = await res.json();
    const workItems = data.workItems || [];

    if (workItems.length === 0) return [];

    // Fetch details (titles) for the IDs found
    // Limiting to 50 to avoid huge requests
    const ids = workItems.slice(0, 50).map((wi: any) => wi.id);
    const detailsUrl = `/azure-api/${org}/${project}/_apis/wit/workitems?ids=${ids.join(
      ","
    )}&fields=System.Id,System.Title&api-version=7.0`;

    const detailsRes = await fetch(detailsUrl, { headers });
    if (!detailsRes.ok) return [];

    const detailsData = await detailsRes.json();
    return (detailsData.value || []).map((wi: any) => ({
      id: String(wi.id),
      title: wi.fields["System.Title"],
    }));
  } catch (e) {
    console.error(`[Azure Service] Error fetching work items of type ${workItemSelected}`, e);
    return [];
  }
};
