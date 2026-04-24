# SIS Connector Status

What each connector does today and what it still needs before we can put a
district sandbox on it without sales-engineering hand-holding.

| Provider | testConnection | fetchStudents | fetchStaff | Sync engine wired | Sandbox-verified end-to-end | Marketing-ready? |
|---|---|---|---|---|---|---|
| `csv` | n/a (file upload) | yes | yes | yes | yes | **Yes — GA** |
| `powerschool` | yes (OAuth2 client_credentials) | yes (`/ws/v1/district/student`) | partial | yes | **No — never run against a real PowerSchool tenant** | Pilot only |
| `infinite_campus` | yes (Bearer token) | yes (`/api/v1/students`) | partial | yes | **No** | Pilot only |
| `skyward` | yes (X-API-Key/Secret) | yes (`/api/v1/students`) | partial | yes | **No** | Pilot only |
| `sftp` | basic | rosters via CSV-on-SFTP | n/a | yes | **No** | Pilot only |
| `aspen` (Follett) | **not implemented** | — | — | — | — | **Marketing only — accept via CSV** |

## Definition of "marketing-ready"

A connector can be advertised in pricing/landing copy without an asterisk only if **all** of the following hold:

1. `testConnection` returns a sane error message for every credential failure mode (bad URL, bad creds, network timeout, server-side 5xx).
2. `fetchStudents` has been run against a real (or vendor sandbox) tenant of that SIS at least once. The vendor's auth model and pagination behavior are verified, not assumed.
3. `fetchStaff` returns enough fields to populate `staffTable` without manual editing.
4. A full `runSync` cycle has been executed end-to-end and the resulting rows in `studentsTable` / `staffTable` were spot-checked by a human against the vendor UI.
5. We have a documented field-mapping doc (e.g. how PowerSchool's `enroll_status` maps to our `status` enum, what `gradeLevel` strings to expect from Skyward, etc.).
6. There's at least one paying or pilot district willing to be a reference for the connector.

## Recent reconciliation of marketing surfaces (honesty audit #6)

The previous reconciliation left contradictions across surfaces. After audit #6
the unified message is:

- **CSV upload** is GA, fully supported, the recommended path for every district.
- **PowerSchool / Infinite Campus / Skyward / SFTP** are *early pilot*: built but
  not yet validated against a live tenant of those vendors. Setup saves
  credentials and queues a sync, but Noverta support reaches out to verify
  field mappings before relying on it. **No surface should imply self-serve
  automatic sync for these.**
- **Aspen / Synergy / Aeries / Genesis / others** have **no live API
  connector** — only CSV import. Surfaces must say so explicitly.

Surfaces brought into agreement:

- `api-server/src/lib/sis/index.ts` (`SUPPORTED_PROVIDERS`): each provider now
  carries `tier: "ga" | "early_pilot"` plus a description that names the
  status. CSV is listed first.
- `api-server/src/routes/onboarding.ts` (`POST /api/onboarding/sis-connect`):
  no longer returns `Roster sync will begin automatically` for every
  provider. CSV returns a CSV-specific message; pilot providers return a
  message saying support will reach out to schedule a verified first sync.
- `trellis/src/pages/pricing.tsx` (SIS Integrations bullet): names which
  systems have no connector instead of saying "Aspen and others by request."
- `trellis/src/pages/setup/constants.ts`: `SISProvider` adds `sftp`, the
  list adds CSV-first ordering, replaces `inPilot?: boolean` with
  `tier: "ga" | "early_pilot"`, and the step label is "Roster source"
  rather than "Connect SIS."
- `trellis/src/pages/setup/SisStep.tsx`: subtitle and amber banner say CSV
  is the recommended path today, name the early-pilot connectors, and call
  out that Aspen/Synergy/Aeries/Genesis have no live connector.
- `trellis/src/pages/sis-settings.tsx`: page subtitle, "No SIS connected"
  banner, and `NewConnectionForm` provider grid all carry the same wording
  and render `GA` / `Pilot` badges per provider.

The `aspen_students` template in `trellis/src/pages/import-data.tsx` is a CSV
preset (column mapping for the Aspen X2 export format), not a connector, and
is left as-is.

## What's needed to graduate any of {powerschool, infinite_campus, skyward, sftp} from pilot to GA

1. Get a sandbox tenant from the vendor (or a friendly pilot district).
2. Run `runSync` against it, capture the response shapes.
3. Reconcile field mapping; add unit tests in `tests/sis/` covering the happy path and the top 3 failure modes.
4. Fill in `fetchStaff` (currently partial for all three).
5. Flip that provider from `tier: "early_pilot"` to `tier: "ga"` in
   `api-server/src/lib/sis/index.ts` and `trellis/src/pages/setup/constants.ts`,
   then update the pricing/SisStep/sis-settings copy to drop the early-pilot
   caveat for that specific provider.
