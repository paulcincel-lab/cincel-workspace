import { describe, expect, it } from "vitest";

import { qk, STALE } from "@/lib/query/keys";
import { parseShellProjects, shellProjectsOptions } from "@/lib/query/options/shell";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("qk.shell.projects()", () => {
  it("is its own key with the shell stale time", () => {
    const options = shellProjectsOptions();
    expect(options.queryKey).toEqual(["shell", "projects"]);
    expect(options.queryKey).toEqual(qk.shell.projects());
    expect(options.staleTime).toBe(STALE.shellProjects);
  });

  it("parses rows and drops the ones without id or name", async () => {
    const rows = await parseShellProjects(
      json([
        { id: "a", name: "Casa", status: "pausado", colorVar: "var(--chart-2)" },
        { id: "b", name: "", status: "activo", colorVar: "x" },
        { name: "Sin id" },
        { id: "c", name: "Torre", status: "raro" },
      ]),
    );
    expect(rows).toEqual([
      { id: "a", name: "Casa", status: "pausado", colorVar: "var(--chart-2)" },
      { id: "c", name: "Torre", status: "activo", colorVar: "var(--muted-foreground)" },
    ]);
  });

  it("throws the error code of a failed answer", async () => {
    await expect(parseShellProjects(json({ error: "FORBIDDEN" }, 403))).rejects.toThrow("FORBIDDEN");
  });
});
