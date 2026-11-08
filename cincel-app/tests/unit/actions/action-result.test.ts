import { readFileSync } from "node:fs";
import { join } from "node:path";

import { notFound, redirect } from "next/navigation";
import { describe, expect, it } from "vitest";

import { toActionResult, unwrapActionResult } from "@/lib/actions/action-result";
import { RepositoryError } from "@/lib/errors";
import { ACTION_RESULT_MUTATIONS } from "@/tests/helpers/action-result";

describe("toActionResult", () => {
  it("wraps the value in { ok: true, data }", async () => {
    await expect(toActionResult(async () => ({ id: "t1" }))).resolves.toEqual({ ok: true, data: { id: "t1" } });
  });

  it("keeps the data key for a void action", async () => {
    const result = await toActionResult(async () => undefined);
    expect(result).toEqual({ ok: true, data: undefined });
    expect(Object.keys(result)).toEqual(["ok", "data"]);
  });

  it("turns a plain Error into { ok: false, error } with the same code and detail", async () => {
    await expect(
      toActionResult(async () => {
        throw new Error("FORBIDDEN: task edit");
      }),
    ).resolves.toEqual({ ok: false, error: "FORBIDDEN: task edit" });
  });

  it("keeps Spanish copy thrown as a plain Error", async () => {
    await expect(
      toActionResult(async () => {
        throw new Error("El texto no puede estar vacío.");
      }),
    ).resolves.toEqual({ ok: false, error: "El texto no puede estar vacío." });
  });

  it("rethrows other errors so internal messages never reach the client", async () => {
    const typeError = new TypeError("Cannot read properties of undefined");
    await expect(
      toActionResult(async () => {
        throw typeError;
      }),
    ).rejects.toBe(typeError);
    const repoError = new RepositoryError("updateTask", "connection refused");
    await expect(
      toActionResult(async () => {
        throw repoError;
      }),
    ).rejects.toBe(repoError);
  });

  it("rethrows Next's redirect and notFound", async () => {
    await expect(toActionResult(async () => redirect("/login"))).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT/),
    });
    await expect(toActionResult(async () => notFound())).rejects.toMatchObject({
      digest: expect.stringMatching(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/),
    });
  });
});

describe("unwrapActionResult", () => {
  it("returns the data of a success", () => {
    expect(unwrapActionResult({ ok: true, data: { id: "t1" } })).toEqual({ id: "t1" });
  });

  it("throws new Error(error) for a failure, so actionErrorText sees the code", () => {
    expect(() => unwrapActionResult({ ok: false, error: "NOT_FOUND: task" })).toThrow(new Error("NOT_FOUND: task"));
  });

  it("passes any other value through (mocked actions, plain values)", () => {
    const plain = { id: "t1", title: "Plano" };
    expect(unwrapActionResult(plain as never)).toBe(plain);
    expect(unwrapActionResult(undefined as never)).toBeUndefined();
  });
});

describe("shared action files", () => {
  const dir = join(process.cwd(), "lib/actions");
  for (const [file, names] of Object.entries(ACTION_RESULT_MUTATIONS)) {
    it(`${file}.ts wraps each user-facing mutation in an ActionResult`, () => {
      const source = readFileSync(join(dir, `${file}.ts`), "utf8");
      expect(source).toContain('from "@/lib/actions/action-result"');
      for (const name of names) {
        const wrapper = new RegExp(
          `export async function ${name}\\(\\n  \\.\\.\\.args: Parameters<typeof ${name}Impl>\\n\\): Promise<ActionResult<[^\\n]+>> \\{\\n  return (toActionResult|refusalResult)\\(\\(\\) => ${name}Impl\\(\\.\\.\\.args\\)\\);`,
        );
        expect(source, name).toMatch(wrapper);
      }
    });
  }
});
