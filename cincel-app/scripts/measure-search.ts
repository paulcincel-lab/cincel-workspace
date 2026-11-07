/**
 * Workspace search timing (redesign BE §8.9, phase 2 risk "search ranking
 * across five sources can get slow"). Runs `searchWorkspace` as an
 * administrator (the widest scope) and as a collaborator for a few queries
 * and prints p50 / p95 / max in ms per query, plus the result count.
 * Read only: it never writes to the database.
 *
 * Run against a production-sized copy (never the live database):
 *   DATABASE_URL=postgres://… npx tsx --conditions=react-server scripts/measure-search.ts
 * Optional: SEARCH_QUERIES="casa,diseño,plano" SEARCH_RUNS=20 SEARCH_LIMIT=20
 */
import { asc, eq } from "drizzle-orm";

import type { AuthenticatedUser } from "../lib/auth/auth-service";
import type { SystemAccessRole } from "../lib/data/roles";
import { db } from "../lib/db/client";
import { staff } from "../lib/db/schema";
import { searchWorkspace } from "../lib/search/search";

const queries = (process.env.SEARCH_QUERIES ?? "casa,diseño,obra,plano,ana,revisar")
  .split(",")
  .map((q) => q.trim())
  .filter((q) => q.length >= 2);
const runs = Math.max(1, Number(process.env.SEARCH_RUNS ?? 20));
const limit = Math.min(50, Math.max(1, Number(process.env.SEARCH_LIMIT ?? 20)));

function asUser(id: string, access: SystemAccessRole): AuthenticatedUser {
  return {
    member: {
      id,
      name: "",
      role: access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "",
    access,
  } as AuthenticatedUser;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

async function main() {
  const [first] = await db.select({ id: staff.id }).from(staff).where(eq(staff.active, true)).orderBy(asc(staff.name)).limit(1);
  if (!first) throw new Error("No active staff in the database.");

  console.log(`| Viewer | Query | Results | p50 ms | p95 ms | max ms |`);
  console.log(`|---|---|---|---|---|---|`);
  for (const access of ["Administrador", "Colaborador"] as SystemAccessRole[]) {
    const user = asUser(first.id, access);
    for (const query of queries) {
      await searchWorkspace(user, { query, limit }); // warm-up
      const times: number[] = [];
      let count = 0;
      for (let i = 0; i < runs; i++) {
        const start = performance.now();
        count = (await searchWorkspace(user, { query, limit })).length;
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      const fmt = (n: number) => n.toFixed(1);
      console.log(
        `| ${access} | ${query} | ${count} | ${fmt(percentile(times, 50))} | ${fmt(percentile(times, 95))} | ${fmt(times[times.length - 1] ?? 0)} |`
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
