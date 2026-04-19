import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Exclude internal tables managed by the SQL migration runner
  // (lib/db/src/migrate.ts) — these are not part of the application schema
  // and must not appear in drizzle-kit diffs.
  tablesFilter: ["!_app_migrations"],
});
