// Applies the Drizzle migrations in lib/db/migrations with drizzle-orm's
// migrator, so the runtime image can migrate without drizzle-kit. Uses the
// same journal table as `drizzle-kit migrate` (drizzle.__drizzle_migrations),
// so either one can run against the same database. Safe to repeat.
// Then creates or updates the bootstrap admin (scripts/bootstrap-admin.mjs)
// when BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are set, unless
// AUTH_PASSWORD_ENABLED=false (then it is skipped and logged), and creates
// the default workflows (scripts/default-workflows.mjs) when core.workflows is
// empty, so a fresh install can create projects without running the seed,
// then their default fases, templates and puestos (scripts/default-catalog.mjs).
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { ensureDefaultCatalog } from "./default-catalog.mjs";
import { ensureDefaultWorkflows } from "./default-workflows.mjs";
import { bootstrapAdminFromEnv, ensureBootstrapAdmin, passwordAuthEnabledFromEnv } from "./bootstrap-admin.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

let admin;
try {
  admin = bootstrapAdminFromEnv();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const migrationsFolder = fileURLToPath(new URL("../lib/db/migrations", import.meta.url));
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder });
  console.log("migrations applied");
  const created = await ensureDefaultWorkflows(sql);
  console.log(created ? `default workflows: created ${created}` : "default workflows: already present");
  const catalog = await ensureDefaultCatalog(sql);
  console.log(
    Object.values(catalog).some((n) => n > 0)
      ? `default catalog: created ${catalog.phases} fases, ${catalog.templates} templates, ${catalog.positions} puestos, ${catalog.positionPhases} puesto fases, ${catalog.statuses} statuses`
      : "default catalog: already present"
  );
  if (admin) {
    const changes = await ensureBootstrapAdmin(sql, admin, { passwordEnabled: passwordAuthEnabledFromEnv() });
    console.log(`bootstrap admin ${admin.email}: ${changes.length ? changes.join(", ") : "up to date"}`);
  }
} finally {
  await sql.end();
}
