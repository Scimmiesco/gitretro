import { GitHubApiCommitItem } from '../types';

const mockMessages = [
  "feat(auth): implement OAuth2 login flow",
  "fix(ui): correct padding on dashboard widgets",
  "refactor(api): optimize database queries for user fetch",
  "chore(deps): bump react to 18.2.0",
  "feat(dashboard): add charts for user activity",
  "fix(auth): handle expired token edge case",
  "style(header): update navigation bar colors to match brand",
  "test(utils): add unit tests for date formatting",
  "docs(readme): update setup instructions",
  "feat(settings): allow user to change theme preference"
];

const mockRepos = [
  "frontend-webapp",
  "backend-api",
  "auth-service",
  "design-system"
];

export const fetchMockCommits = async (startDate: Date, endDate: Date): Promise<GitHubApiCommitItem[]> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const commits: GitHubApiCommitItem[] = [];
      const numCommits = 45; // Generate some random number of commits
      const timeDiff = endDate.getTime() - startDate.getTime();

      for (let i = 0; i < numCommits; i++) {
        // Random date between start and end
        const randomTime = startDate.getTime() + Math.random() * timeDiff;
        const commitDate = new Date(randomTime).toISOString();
        
        const sha = Math.random().toString(36).substring(2, 15);
        const msg = mockMessages[Math.floor(Math.random() * mockMessages.length)];
        const repo = mockRepos[Math.floor(Math.random() * mockRepos.length)];

        commits.push({
          sha,
          commit: {
            message: msg,
            committer: {
              date: commitDate
            }
          },
          repository: {
            name: repo
          },
          html_url: `https://github.com/mock-org/${repo}/commit/${sha}`
        });
      }
      
      // Sort by date descending
      commits.sort((a, b) => new Date(b.commit.committer.date).getTime() - new Date(a.commit.committer.date).getTime());

      resolve(commits);
    }, 800); // simulate network delay
  });
};
