import "server-only";

/**
 * Minimal GitHub REST client for filing RFCs as Issues (`lib/assistant/tools.ts`
 * `create_rfc`). Auth is a fine-grained PAT with `Issues: write` on the target
 * repo only — no OAuth flow, no other GitHub scope. Server-only env vars.
 */

const GITHUB_API_URL = "https://api.github.com";

export function isGithubConfigured(): boolean {
  return Boolean(process.env.GITHUB_PAT && process.env.GITHUB_REPO);
}

export type GithubIssueInput = {
  title: string;
  body: string;
  labels?: string[];
};

export type GithubIssueResult = {
  number: number;
  url: string;
};

export async function createGithubIssue(
  input: GithubIssueInput
): Promise<GithubIssueResult> {
  const token = process.env.GITHUB_PAT;
  const repo = process.env.GITHUB_REPO; // "owner/name"
  if (!token || !repo) {
    throw new Error("GitHub no está configurado (GITHUB_PAT / GITHUB_REPO).");
  }

  const res = await fetch(`${GITHUB_API_URL}/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      labels: input.labels,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GitHub API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as { number: number; html_url: string };
  return { number: data.number, url: data.html_url };
}
