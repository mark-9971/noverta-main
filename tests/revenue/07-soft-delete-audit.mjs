/**
 * Static-analysis regression test: every db.select().from(sessionLogsTable)
 * query must filter out soft-deleted records.
 *
 * Soft-deleted sessions (deletedAt IS NOT NULL) must not appear in any
 * metric, report, or compliance calculation — they were removed from
 * service and must not inflate delivered-minutes counts, compliance rates,
 * or billing figures.
 *
 * This test walks every .ts file under artifacts/api-server/src/ and fails
 * if any `.from(sessionLogsTable)` query does not compose one of the
 * accepted filter forms:
 *   • isNull(sessionLogsTable.deletedAt)          ← drizzle ORM
 *   • ${sessionLogsTable.deletedAt} IS NULL       ← raw SQL template
 *
 * ALLOW-LIST: add  // soft-delete-ok: <reason>  within 10 lines before the
 * `.from(sessionLogsTable)` line for cases that legitimately need soft-deleted
 * rows (e.g., forensic audit views, recently-deleted recovery endpoints,
 * restore operations that must check whether a record IS deleted).
 */

import { readFile, readdir } from "fs/promises";
import { join, resolve, relative } from "path";
import { fileURLToPath } from "url";
import { Suite } from "./_harness.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SRC_DIR = join(__dirname, "../../artifacts/api-server/src");

// How many lines to look BEFORE .from(sessionLogsTable) when searching for
// the soft-delete filter.  Long query builders initialise a `conditions`
// array many lines above the .from(), so we use a generous window.
const WINDOW_BEFORE = 80;
// How many lines to look AFTER .from(sessionLogsTable).
const WINDOW_AFTER = 30;
// How many lines to look BEFORE .from() for an allow-list comment.
const ALLOW_COMMENT_WINDOW = 15;

// Patterns that indicate the soft-delete guard is present in the context.
const FILTER_PATTERNS = [
  /isNull\s*\(\s*sessionLogsTable\.deletedAt\s*\)/,
  /sessionLogsTable\.deletedAt\}\s+IS NULL/i,
  /sessionLogsTable\.deletedAt\s+IS NULL/i,
];

// Allow-list comment pattern.
const ALLOW_COMMENT_PATTERN = /\/\/\s*soft-delete-ok:/i;

async function collectTsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...await collectTsFiles(full));
    else if (e.isFile() && e.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

export async function run() {
  const s = new Suite("soft-delete-audit");

  const files = await collectTsFiles(SRC_DIR);
  const violations = [];

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    if (!source.includes("from(sessionLogsTable)")) continue;

    const lines = source.split("\n");

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      if (!lines[lineIdx].includes("from(sessionLogsTable)")) continue;

      const lineNo = lineIdx + 1; // 1-based

      // Check allow-list comment within ALLOW_COMMENT_WINDOW lines before
      const allowStart = Math.max(0, lineIdx - ALLOW_COMMENT_WINDOW);
      const allowContext = lines.slice(allowStart, lineIdx + 1).join("\n");
      if (ALLOW_COMMENT_PATTERN.test(allowContext)) continue;

      // Build context window for filter check
      const ctxStart = Math.max(0, lineIdx - WINDOW_BEFORE);
      const ctxEnd = Math.min(lines.length, lineIdx + WINDOW_AFTER + 1);
      const context = lines.slice(ctxStart, ctxEnd).join("\n");

      const hasFilter = FILTER_PATTERNS.some(p => p.test(context));
      if (hasFilter) continue;

      const relPath = relative(SRC_DIR, filePath);
      violations.push(`${relPath}:${lineNo}`);
    }
  }

  if (violations.length === 0) {
    s.pass("every .from(sessionLogsTable) query has a soft-delete filter or allow-list comment");
  } else {
    for (const v of violations) {
      s.fail(
        `missing isNull(sessionLogsTable.deletedAt) filter: ${v}`,
        "Add isNull(sessionLogsTable.deletedAt) to the WHERE clause, or add\n" +
        "      // soft-delete-ok: <reason>  within 10 lines before .from(sessionLogsTable)\n" +
        "      if this query legitimately reads soft-deleted records.",
      );
    }
  }

  return s.summary();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(r => process.exit(r.failed ? 1 : 0));
}
