// @vitest-environment node
/** The demo seed (npm run db:seed:demo) runs only against local databases and never in production. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { assertDemoSeedAllowed, databaseHost, DEFAULT_DEMO_DATABASE_URL } from "@/scripts/seed-demo-guard";

const APP_ROOT = join(__dirname, "..", "..");

describe("databaseHost", () => {
  it("reads the host of a postgres URL", () => {
    expect(databaseHost("postgres://u:p@LocalHost:5433/cincel")).toBe("localhost");
    expect(databaseHost("postgres://u:p@[::1]:5432/cincel")).toBe("::1");
    expect(databaseHost("postgres://u:p@db.example.com:5432/cincel")).toBe("db.example.com");
  });

  it("treats a unix socket as local", () => {
    expect(databaseHost("postgres://u@/cincel?host=/var/run/postgresql")).toBe("");
  });

  it("flags an unparsable string", () => {
    expect(databaseHost("not a url")).toBe("invalid");
  });
});

describe("assertDemoSeedAllowed", () => {
  it("allows local hosts", () => {
    for (const url of [
      "postgres://cincel:cincel@localhost:5432/cincel",
      "postgres://cincel:cincel@127.0.0.1:5433/cincel",
      "postgres://cincel:cincel@[::1]:5432/cincel",
      "postgres://cincel:cincel@db:5432/cincel",
    ]) {
      expect(assertDemoSeedAllowed({ DATABASE_URL: url, NODE_ENV: "development" })).toBe(url);
    }
  });

  it("falls back to the local default URL", () => {
    expect(assertDemoSeedAllowed({})).toBe(DEFAULT_DEMO_DATABASE_URL);
  });

  it("refuses NODE_ENV=production, even on localhost", () => {
    expect(() =>
      assertDemoSeedAllowed({ NODE_ENV: "production", DATABASE_URL: "postgres://u:p@localhost:5432/cincel" })
    ).toThrow(/NODE_ENV is production/);
    expect(() => assertDemoSeedAllowed({ NODE_ENV: " Production " })).toThrow(/production/);
  });

  it("refuses a non-local host", () => {
    for (const url of [
      "postgres://u:p@10.0.0.5:5432/cincel",
      "postgres://u:p@cincel-db.cloudketer.dev:5432/cincel",
      "postgres://u:p@localhost.evil.com:5432/cincel",
    ]) {
      expect(() => assertDemoSeedAllowed({ DATABASE_URL: url })).toThrow(/not a local host/);
    }
  });

  it("refuses an invalid connection string", () => {
    expect(() => assertDemoSeedAllowed({ DATABASE_URL: "garbage" })).toThrow(/not a valid/);
  });
});

describe("seed-demo wiring", () => {
  it("is exposed as npm run db:seed:demo", () => {
    const pkg = JSON.parse(readFileSync(join(APP_ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["db:seed:demo"]).toBe("tsx scripts/seed-demo.ts");
  });

  it("checks the guard before opening a connection", () => {
    const source = readFileSync(join(APP_ROOT, "scripts", "seed-demo.ts"), "utf8");
    const guard = source.indexOf("assertDemoSeedAllowed(process.env)");
    const connect = source.indexOf("postgres(");
    expect(guard).toBeGreaterThan(-1);
    expect(connect).toBeGreaterThan(guard);
  });
});
