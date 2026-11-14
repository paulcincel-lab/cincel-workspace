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

export type GithubIssueState = {
  number: number;
  state: "open" | "closed";
  stateReason: "completed" | "not_planned" | "reopened" | null;
  labels: string[];
  /** A linked pull request is open. */
  hasOpenPullRequest: boolean;
  /** A linked pull request was merged. */
  hasMergedPullRequest: boolean;
};

/** A GitHub call failed: `status` is the HTTP status; `rateLimited` on 403/429. */
export class GithubApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "GithubApiError";
  }

  get rateLimited(): boolean {
    return this.status === 403 || this.status === 429;
  }
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

type RawIssue = {
  number: number;
  state: string;
  state_reason?: string | null;
  labels?: (string | { name?: string | null })[];
};

type RawTimelineEvent = {
  event?: string;
  source?: { issue?: { state?: string; pull_request?: { merged_at?: string | null } } };
};

/**
 * Reads one issue for the Soporte status sync: state, reason, labels and the
 * linked pull requests (cross-references on the timeline). Null when the issue
 * does not exist; throws `GithubApiError` on any other failure (403/429 set
 * `rateLimited`).
 */
export async function getGithubIssue(number: number): Promise<GithubIssueState | null> {
  const token = process.env.GITHUB_PAT;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) {
    throw new Error("GitHub no está configurado (GITHUB_PAT / GITHUB_REPO).");
  }
  const base = `${GITHUB_API_URL}/repos/${repo}/issues/${number}`;

  const issueRes = await fetch(base, { headers: githubHeaders(token), cache: "no-store" });
  if (issueRes.status === 404) return null;
  if (!issueRes.ok) {
    const detail = await issueRes.text().catch(() => "");
    throw new GithubApiError(issueRes.status, `GitHub API error ${issueRes.status}: ${detail.slice(0, 300)}`);
  }
  const issue = (await issueRes.json()) as RawIssue;

  const timelineRes = await fetch(`${base}/timeline?per_page=100`, { headers: githubHeaders(token), cache: "no-store" });
  if (!timelineRes.ok) {
    const detail = await timelineRes.text().catch(() => "");
    throw new GithubApiError(timelineRes.status, `GitHub API error ${timelineRes.status}: ${detail.slice(0, 300)}`);
  }
  const timeline = (await timelineRes.json()) as RawTimelineEvent[];

  let hasOpenPullRequest = false;
  let hasMergedPullRequest = false;
  for (const ev of Array.isArray(timeline) ? timeline : []) {
    const pr = ev.event === "cross-referenced" ? ev.source?.issue : undefined;
    if (!pr?.pull_request) continue;
    if (pr.pull_request.merged_at) hasMergedPullRequest = true;
    else if (pr.state === "open") hasOpenPullRequest = true;
  }

  const reason = issue.state_reason;
  return {
    number: issue.number,
    state: issue.state === "closed" ? "closed" : "open",
    stateReason: reason === "completed" || reason === "not_planned" || reason === "reopened" ? reason : null,
    labels: (issue.labels ?? []).map((l) => (typeof l === "string" ? l : (l.name ?? ""))).filter(Boolean),
    hasOpenPullRequest,
    hasMergedPullRequest,
  };
}
