# Security scans — hourly cadence

The dependency audit, SAST scan, and HoundDog privacy/dataflow scan are
**JavaScript tool callbacks** exposed inside the agent's code-execution
sandbox. They are NOT shell commands, so they cannot be wired into a
`bash`-based validation step that runs on every edit.

## Cadence

Run all three in parallel, roughly **once an hour** during active
development, and always before:

- proposing a buyer-pack security disclosure refresh
- publishing a pilot tenant
- closing a tenant-isolation remediation task

## How to invoke

From the agent's `code_execution` environment:

```javascript
const [depResult, sastResult, hounddogResult] = await Promise.allSettled([
  runDependencyAudit(),
  runSastScan(),
  runHoundDogScan(),
]);
```

See `.local/skills/security_scan/SKILL.md` for the full response shape and
the recommended summarisation format.

## Why not in `quick` checks

These scanners take 30–120 seconds each and produce a lot of output that's
only actionable in batch. Running them per-edit would dominate the inner
loop and train the team to ignore the output. Hourly is the right tempo:
slow enough to be cheap, frequent enough that critical/high findings
surface within one work-session of the regression that introduced them.

## What to do with findings

1. **Critical / High** → file an immediate fix-it task; block buyer-pack
   refresh until resolved.
2. **Moderate** → triage at the daily standup; queue for the current
   sprint.
3. **Low / Info** → roll into the next dependency-bump PR.

Findings against `node_modules` transitive deps without a fix path get
recorded in `artifacts/trellis/buyer-pack/SECURITY-AUDIT.md` under a
"Known transitive vulnerabilities" section so the buyer's diligence team
sees them attributed and contextualised, not surfaced cold.
