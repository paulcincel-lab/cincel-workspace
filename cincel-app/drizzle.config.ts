import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  // drizzle-kit loads this file directly (no Next.js env loading); fall back to
  // the local docker-compose default so `npm run db:*` works out of the box.
  process.env.DATABASE_URL = "postgres://cincel:cincel@localhost:5432/cincel";
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema",
  out: "./lib/db/migrations",
  schemaFilter: ["core"],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
