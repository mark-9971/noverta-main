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

## Recent reconciliation of marketing surfaces

- **Pricing page** (`artifacts/trellis/src/pages/pricing.tsx`): the SIS Integrations bullet no longer claims Aspen as a connector; non-CSV providers are now labeled "in pilot."
- **Setup wizard** (`artifacts/trellis/src/pages/setup/constants.ts`): non-CSV providers are tagged `inPilot: true` and `SisStep.tsx` renders a "Pilot" badge.
- **Removed claims**: nothing else in the user-facing surface claims Aspen / Synergy / Genesis as live API connectors. They remain importable via CSV.

## What's needed to graduate any of {powerschool, infinite_campus, skyward} from pilot to GA

1. Get a sandbox tenant from the vendor (or a friendly pilot district).
2. Run `runSync` against it, capture the response shapes.
3. Reconcile field mapping; add unit tests in `tests/sis/` covering the happy path and the top 3 failure modes.
4. Fill in `fetchStaff` (currently partial for all three).
5. Update the matrix above and remove the "Pilot only" caveat from `pricing.tsx` and `constants.ts`.
