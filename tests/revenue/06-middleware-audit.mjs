/**
 * Static-analysis regression test: router.use() middleware must always be
 * path-scoped inside sub-route modules.
 *
 * A bare `router.use(mw)` in a sub-router applies the middleware to *every*
 * subsequent request entering that router — not just the intended paths. The
 * fix (applied in Week 1) was to add an explicit path argument:
 *   router.use("/some-path", mw)
 *
 * This test walks every .ts file under artifacts/api-server/src/routes/
 * (excluding ONLY the root index.ts, which intentionally mounts global
 * middleware) and fails if any `router.use(` call does not use a path scope
 * or mount a sub-router.
 *
 * Detection is path-first and default-deny: any bare router.use(arg) where
 * arg is not a path string, not a path array, and not a sub-router reference
 * is flagged — regardless of the argument's name.
 *
 * ALLOW-LIST: add  // allow-bare-mw: <reason>  within 5 lines before the
 * router.use() call for cases that are intentionally bare (e.g., a router
 * where 100% of routes share the same tenant guard and the entire router is
 * mounted on a single path in index.ts).
 */

import { readFile, readdir } from "fs/promises";
import { join, relative } from "path";
import { fileURLToPath } from "url";
import { Suite } from "./_harness.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROUTES_DIR = join(__dirname, "../../artifacts/api-server/src/routes");

// Only the application root router (src/routes/index.ts) is exempt — it
// intentionally mounts global middleware (requireAuth, requireDistrictScope,
// etc.) that applies to every incoming request.  All OTHER index.ts files
// inside sub-directories are regular route modules subject to the same rule.
const ROOT_INDEX_PATH = join(ROUTES_DIR, "index.ts");

/**
 * Extract the first top-level argument from the raw args string
 * (handles nested parens/brackets/strings).
 */
function extractFirstArg(argsStr) {
  const s = argsStr.trim();
  let depth = 0;
  let inStr = false;
  let strChar = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === strChar && s[i - 1] !== "\\") inStr = false;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      inStr = true; strChar = ch;
    } else if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
    } else if (ch === "," && depth === 0) {
      return s.slice(0, i).trim();
    }
  }
  return s.trim();
}

/**
 * Returns true when the router.use() call is acceptable WITHOUT a path scope:
 *   1. First arg is a path string   → router.use("/path", mw)
 *   2. First arg is array of paths  → router.use(["/a", "/b"], mw)
 *   3. Single arg is a sub-router   → router.use(historyRouter) / router.use(routes)
 *
 * Detection is path-first and default-deny — everything else is flagged and
 * must have an explicit // allow-bare-mw: comment to be exempt.
 */
function isAcceptableUse(argsContent) {
  const trimmed = argsContent.trim();

  // 1. Path string as first arg
  if (/^["'`]/.test(trimmed)) return true;

  // 2. Array where the first element looks like a path string
  if (trimmed.startsWith("[")) {
    const inner = trimmed.slice(1).trimStart();
    if (/^["'`]/.test(inner)) return true;
  }

  // 3. Sub-router / route-collection reference: a simple identifier (no call
  //    parens) that ends in Router, router, Routes, or routes — these mount
  //    another express.Router() instance and do not cause middleware leaks.
  //    e.g. router.use(historyRouter), router.use(routes), router.use(csvRoutes)
  const firstArg = extractFirstArg(trimmed);
  if (/([Rr]outer|[Rr]outes)$/.test(firstArg.trim()) && !/[([{]/.test(firstArg)) return true;

  return false;
}

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
  const s = new Suite("middleware-audit");

  const files = await collectTsFiles(ROUTES_DIR);
  const violations = [];

  for (const filePath of files) {
    // Only the root routes/index.ts is exempt — nested index.ts files are not.
    if (filePath === ROOT_INDEX_PATH) continue;

    const source = await readFile(filePath, "utf8");
    const lines = source.split("\n");

    const pattern = /\brouter\.use\s*\(/g;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      // Extract balanced parenthesised args
      const start = match.index + match[0].length;
      let depth = 1, i = start;
      while (i < source.length && depth > 0) {
        if (source[i] === "(") depth++;
        else if (source[i] === ")") depth--;
        i++;
      }
      const argsContent = source.slice(start, i - 1);
      const lineNo = source.slice(0, match.index).split("\n").length;

      // Skip matches that appear inside a line comment (// ...) — the regex
      // can fire on "router.use(" text inside explanatory comments.
      const lineText = lines[lineNo - 1] || "";
      const commentPos = lineText.indexOf("//");
      const matchColInLine = match.index - source.slice(0, match.index).lastIndexOf("\n") - 1;
      if (commentPos !== -1 && commentPos < matchColInLine) continue;

      if (isAcceptableUse(argsContent)) continue;

      // Check for allow-bare-mw comment within 5 lines before the call
      // (allows for multi-line block comments before router.use)
      const prevLines = lines.slice(Math.max(0, lineNo - 5), lineNo).join("\n");
      if (/\/\/\s*allow-bare-mw:/i.test(prevLines)) continue;

      const relPath = relative(ROUTES_DIR, filePath);
      violations.push(`${relPath}:${lineNo} — bare router.use(${argsContent.slice(0, 60).replace(/\n/g, " ").trim()}…)`);
    }
  }

  if (violations.length === 0) {
    s.pass("all router.use() calls in routes/ are path-scoped or allow-listed");
  } else {
    for (const v of violations) {
      s.fail(`bare middleware leak: ${v}`);
    }
  }

  return s.summary();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(r => process.exit(r.failed ? 1 : 0));
}
