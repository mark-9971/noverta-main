#!/usr/bin/env node
/**
 * Non-interactive wrapper around `drizzle-kit push --force` that drives the
 * create-vs-rename column prompts by feeding a carriage return for every
 * prompt. The default highlighted option is always "create column", which is
 * the correct choice for a test/dev DB drifting behind `lib/db/src/schema/`
 * (we never want to silently rename existing data).
 *
 * Use as a pretest hook so missing-column errors surface as a clear migration
 * step instead of dozens of per-test SQL failures.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "..", "drizzle.config.ts");

const child = spawn(
  "pnpm",
  ["exec", "drizzle-kit", "push", "--force", "--config", configPath],
  { stdio: ["pipe", "inherit", "inherit"] },
);

const interval = setInterval(() => {
  if (!child.stdin.destroyed) {
    child.stdin.write("\r");
  }
}, 400);

child.on("exit", (code) => {
  clearInterval(interval);
  if (!child.stdin.destroyed) child.stdin.end();
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  clearInterval(interval);
  console.error("[sync-test-db] failed to spawn drizzle-kit:", err);
  process.exit(1);
});
