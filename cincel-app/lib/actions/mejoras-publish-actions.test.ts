// @vitest-environment node
/**
 * Publishing a solicitud to GitHub (#1116): permission, the mandatory
 * checklist, one publication per solicitud, inline errors and the rate limit.
 * The GitHub client and the repositories are mocked: nothing here reaches the
 * network or a database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ID = "3f2b8c1e-1a2b-4c3d-8e9f-0123456789ab";
const session = vi.hoisted(() => ({ access: "Administrador" as string }));
const github = vi.hoisted(() => ({
  createGithubIssue: vi.fn(),
  isGithubConfigured: vi.fn(() => true),
}));
const publish = vi.hoisted(() => ({
  getPublishableTicket: vi.fn(),
  loadRedactionContext: vi.fn(),
}));
const repository = vi.hoisted(() => ({ recordPublished: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Admin",
      role: "Dirección",
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "admin@cincel.example",
    access: session.access,
  })),
}));
vi.mock("@/lib/github/client", () => github);
vi.mock("@/lib/repositories/support-publish", () => publish);
vi.mock("@/lib/repositories/support-repository", () => repository);
vi.mock("@/lib/soporte/flags", () => ({
  SOPORTE_ENABLED: true,
  MEJORAS_ENABLED: true,
  SOPORTE_GITHUB_ENABLED: true,
}));

import { getPublishDraftAction, publishTicketAction } from "@/lib/actions/mejoras-actions";

const input = { title: "Falla al guardar", body: "## Problema\n\nNo guarda.", labels: ["rfc", "error"], confirmedRedaction: true };

const ticket = {
  id: ID,
  code: "SOL-0001",
  kind: "error",
  title: "Falla al guardar",
  description: "No guarda.",
  steps: null,
  area: "tareas",
  context: { path: "/tareas", estilo: "", theme: "", viewport: "", userAgent: "", appVersion: "0.1.0", occurredAt: "2026-11-13T10:00:00Z" },
  status: "nuevo",
  githubIssueNumber: null,
  githubIssueUrl: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  session.access = "Administrador";
  github.isGithubConfigured.mockReturnValue(true);
  github.createGithubIssue.mockResolvedValue({ number: 42, url: "https://github.com/o/r/issues/42" });
  publish.getPublishableTicket.mockResolvedValue({ ...ticket });
  publish.loadRedactionContext.mockResolvedValue({ staffNames: [], contactNames: [], clientNames: [], projectNames: [] });
  repository.recordPublished.mockResolvedValue({ ok: true, data: null });
});

describe("publishTicketAction", () => {
  it("creates the issue, records it and returns number and url", async () => {
    const result = await publishTicketAction(ID, input);
    expect(result).toEqual({ ok: true, data: { number: 42, url: "https://github.com/o/r/issues/42" } });
    expect(github.createGithubIssue).toHaveBeenCalledWith({ title: input.title, body: input.body, labels: ["rfc", "error"] });
    expect(repository.recordPublished).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      ID,
      { number: 42, url: "https://github.com/o/r/issues/42" },
      expect.objectContaining({ title: input.title }),
    );
  });

  it("always adds the rfc label", async () => {
    await publishTicketAction(ID, { ...input, labels: ["mejora"] });
    expect(github.createGithubIssue).toHaveBeenCalledWith(expect.objectContaining({ labels: ["rfc", "mejora"] }));
  });

  it("sends nothing without the checklist ticked", async () => {
    for (const confirmed of [undefined, false]) {
      const result = await publishTicketAction(ID, { ...input, confirmedRedaction: confirmed });
      expect(result).toEqual({ ok: false, error: "CONFIRM_REQUIRED" });
    }
    expect(github.createGithubIssue).not.toHaveBeenCalled();
    expect(repository.recordPublished).not.toHaveBeenCalled();
  });

  it("is only for canManageSupport", async () => {
    session.access = "Colaborador";
    const result = await publishTicketAction(ID, input);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/^FORBIDDEN/);
    expect(github.createGithubIssue).not.toHaveBeenCalled();
    expect(publish.getPublishableTicket).not.toHaveBeenCalled();
  });

  it("refuses a solicitud that is already published", async () => {
    publish.getPublishableTicket.mockResolvedValue({ ...ticket, githubIssueNumber: 7, githubIssueUrl: "https://github.com/o/r/issues/7" });
    expect(await publishTicketAction(ID, input)).toEqual({ ok: false, error: "ALREADY_PUBLISHED" });
    expect(github.createGithubIssue).not.toHaveBeenCalled();
  });

  it("refuses when the record says it was published in the meantime", async () => {
    repository.recordPublished.mockResolvedValue({ ok: false, error: "ALREADY_PUBLISHED" });
    expect(await publishTicketAction(ID, input)).toEqual({ ok: false, error: "ALREADY_PUBLISHED" });
  });

  it("says GitHub is not configured and calls nothing", async () => {
    github.isGithubConfigured.mockReturnValue(false);
    expect(await publishTicketAction(ID, input)).toEqual({ ok: false, error: "GITHUB_NOT_CONFIGURED" });
    expect(github.createGithubIssue).not.toHaveBeenCalled();
  });

  it("stores nothing and hides the API detail when GitHub fails", async () => {
    github.createGithubIssue.mockRejectedValue(new Error("GitHub API error 422: body with Juan Pérez"));
    expect(await publishTicketAction(ID, input)).toEqual({ ok: false, error: "GITHUB_ERROR" });
    expect(repository.recordPublished).not.toHaveBeenCalled();
  });

  it("validates the input", async () => {
    expect(await publishTicketAction("no-uuid", input)).toEqual({ ok: false, error: "INVALID" });
    expect(await publishTicketAction(ID, { ...input, title: "ab" })).toEqual({ ok: false, error: "INVALID" });
    expect(await publishTicketAction(ID, { ...input, body: "  " })).toEqual({ ok: false, error: "INVALID" });
  });

  it("is NOT_FOUND for a missing solicitud", async () => {
    publish.getPublishableTicket.mockResolvedValue(null);
    expect(await publishTicketAction(ID, input)).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("rate limits to 10 publications per hour per admin", async () => {
    // A fresh module: its own limiter state.
    vi.resetModules();
    const fresh = await import("@/lib/actions/mejoras-actions");
    let last: unknown;
    for (let i = 0; i < 11; i += 1) last = await fresh.publishTicketAction(ID, input);
    expect(last).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(github.createGithubIssue).toHaveBeenCalledTimes(10);
  });
});

describe("getPublishDraftAction", () => {
  it("returns the redacted template with rfc and the kind", async () => {
    const result = await getPublishDraftAction(ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.labels).toEqual(["rfc", "error"]);
    expect(result.data.body).toContain("## Contexto técnico");
    expect(result.data.configured).toBe(true);
    expect(result.data.published).toBeNull();
  });

  it("reports an existing publication", async () => {
    publish.getPublishableTicket.mockResolvedValue({ ...ticket, githubIssueNumber: 7, githubIssueUrl: "https://github.com/o/r/issues/7" });
    const result = await getPublishDraftAction(ID);
    expect(result.ok && result.data.published).toEqual({ number: 7, url: "https://github.com/o/r/issues/7" });
  });

  it("is only for canManageSupport", async () => {
    session.access = "Colaborador";
    const result = await getPublishDraftAction(ID);
    expect(!result.ok && result.error).toMatch(/^FORBIDDEN/);
    expect(publish.loadRedactionContext).not.toHaveBeenCalled();
  });
});
