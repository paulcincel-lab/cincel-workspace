// Applies the Drizzle migrations in lib/db/migrations with drizzle-orm's
// migrator, so the runtime image can migrate without drizzle-kit. Uses the
// same journal table as `drizzle-kit migrate` (drizzle.__drizzle_migrations),
// so either one can run against the same database. Safe to repeat.
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const migrationsFolder = fileURLToPath(new URL("../lib/db/migrations", import.meta.url));
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder });
  console.log("migrations applied");
} finally {
  await sql.end();
}
