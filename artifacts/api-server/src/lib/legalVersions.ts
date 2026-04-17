/**
 * Legal document version manifest.
 *
 * Bump a version string here to force all staff users to re-accept
 * that document on next login. Use ISO date format: YYYY-MM-DD.
 *
 * Documents:
 *  - tos  → Terms of Service (artifacts/trellis/public/docs/legal/terms-of-service.md)
 *  - dpa  → Data Processing Agreement (artifacts/trellis/public/docs/legal/dpa-template.md)
 */
export const LEGAL_VERSIONS: Record<string, string> = {
  tos: "2025-01-01",
  dpa: "2025-01-01",
} as const;

export type LegalDocType = keyof typeof LEGAL_VERSIONS;

export const LEGAL_DOC_LABELS: Record<string, string> = {
  tos: "Terms of Service",
  dpa: "Data Processing Agreement",
};
