// @vitest-environment node
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import {
  parseEnvValue,
  promptHidden,
  resolveMondayToken,
} from "@/scripts/monday/token";

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.secret-token-value";

describe("resolveMondayToken", () => {
  it("uses MONDAY_TOKEN from the environment first", async () => {
    const readFile = vi.fn(() => `MONDAY_TOKEN=from-file`);
    const prompt = vi.fn(async () => "from-prompt");
    const result = await resolveMondayToken({ env: { MONDAY_TOKEN: TOKEN }, readFile, prompt });
    expect(result).toEqual({ token: TOKEN, source: "env" });
    expect(readFile).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });

  it("falls back to .env.monday when the environment has none", async () => {
    const readFile = vi.fn(() => `# monday\nOTHER=1\nMONDAY_TOKEN="${TOKEN}"\n`);
    const prompt = vi.fn(async () => "from-prompt");
    const result = await resolveMondayToken({
      env: { MONDAY_TOKEN: "  " },
      readFile,
      filePath: "/x/.env.monday",
      prompt,
    });
    expect(result).toEqual({ token: TOKEN, source: "file" });
    expect(readFile).toHaveBeenCalledWith("/x/.env.monday");
    expect(prompt).not.toHaveBeenCalled();
  });

  it("prompts when neither the environment nor the file has a token", async () => {
    const prompt = vi.fn(async () => `  ${TOKEN}\n`);
    const result = await resolveMondayToken({ env: {}, readFile: () => null, prompt });
    expect(result).toEqual({ token: TOKEN, source: "prompt" });
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("prompts when the file exists but has no MONDAY_TOKEN", async () => {
    const prompt = vi.fn(async () => TOKEN);
    const result = await resolveMondayToken({ env: {}, readFile: () => "OTHER=1\n", prompt });
    expect(result.source).toBe("prompt");
  });

  it("rejects an empty prompt answer", async () => {
    await expect(
      resolveMondayToken({ env: {}, readFile: () => null, prompt: async () => "" }),
    ).rejects.toThrow("No monday token entered.");
  });

  it("never writes the token to stdout, stderr or the console", async () => {
    const writes: string[] = [];
    const out = vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      writes.push(String(c));
      return true;
    });
    const err = vi.spyOn(process.stderr, "write").mockImplementation((c) => {
      writes.push(String(c));
      return true;
    });
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...a) => writes.push(a.join(" "))),
    );
    try {
      await resolveMondayToken({ env: { MONDAY_TOKEN: TOKEN } });
      await resolveMondayToken({ env: {}, readFile: () => `MONDAY_TOKEN=${TOKEN}` });
      await resolveMondayToken({ env: {}, readFile: () => null, prompt: async () => TOKEN });
    } finally {
      out.mockRestore();
      err.mockRestore();
      logs.forEach((s) => s.mockRestore());
    }
    expect(writes.join("")).not.toContain(TOKEN);
  });
});

describe("promptHidden", () => {
  it("shows the question but does not echo the typed token", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let shown = "";
    output.on("data", (c) => (shown += String(c)));

    const answer = promptHidden("Token: ", input, output);
    input.write(`${TOKEN}\n`);
    await expect(answer).resolves.toBe(TOKEN);

    expect(shown).toContain("Token: ");
    expect(shown).not.toContain(TOKEN);
  });

  it("rejects when input closes without an answer", async () => {
    const input = new PassThrough();
    const answer = promptHidden("Token: ", input, new PassThrough());
    input.end();
    await expect(answer).rejects.toThrow("No monday token entered.");
  });
});

describe("parseEnvValue", () => {
  it("reads plain, quoted, exported and commented values; last one wins", () => {
    expect(parseEnvValue("MONDAY_TOKEN=abc", "MONDAY_TOKEN")).toBe("abc");
    expect(parseEnvValue("MONDAY_TOKEN='a b'", "MONDAY_TOKEN")).toBe("a b");
    expect(parseEnvValue("export MONDAY_TOKEN=abc # note", "MONDAY_TOKEN")).toBe("abc");
    expect(parseEnvValue("MONDAY_TOKEN=a\nMONDAY_TOKEN=b", "MONDAY_TOKEN")).toBe("b");
    expect(parseEnvValue("# MONDAY_TOKEN=abc\nX=1", "MONDAY_TOKEN")).toBeUndefined();
  });
});
