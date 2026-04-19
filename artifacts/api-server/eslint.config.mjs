import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    files: ["src/routes/**/*.ts"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      /**
       * Register the plugin so that existing inline `// eslint-disable-next-line
       * @typescript-eslint/<rule>` comments in route files are recognised and
       * don't cause "Definition for rule not found" errors.
       */
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      /**
       * Route handler early-exit convention
       * ─────────────────────────────────────────────────────────────────────
       * All Express route handlers in this project declare `Promise<void>` as
       * their return type.  Returning a non-void value (e.g. the Response object
       * produced by `res.json()`) causes TS2322 / TS7030 type errors, and using
       * `return void res.json()` silently discards the return value in a way
       * TypeScript cannot reason about cleanly.
       *
       * CANONICAL pattern — the ONLY acceptable early-exit style:
       *
       *   res.status(403).json({ error: "..." });
       *   return;
       *
       * FORBIDDEN patterns:
       *
       *   return res.json({ ... });             // ✗ returns Response, not void
       *   return void res.json({ ... });        // ✗ obscures intent, not standard
       *
       * Two `no-restricted-syntax` selectors enforce this:
       *   1. Bans `return <CallExpression ending in .json/.send/.end>(...)`.
       *   2. Bans `return void <anything>` — the void-cast shorthand.
       */
      "@typescript-eslint/no-explicit-any": "warn",

      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ReturnStatement[argument.type='CallExpression'][argument.callee.property.name=/^(json|send|end)$/]",
          message:
            "Do not return res.json()/res.send() directly. " +
            "Use the two-statement form: `res.json({...}); return;`",
        },
        {
          selector:
            "ReturnStatement[argument.type='UnaryExpression'][argument.operator='void']",
          message:
            "Do not use `return void expr` in route handlers. " +
            "Use the two-statement form: `res.json({...}); return;`",
        },
      ],
    },
  },
];
