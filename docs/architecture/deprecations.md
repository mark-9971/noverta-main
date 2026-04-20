# Deprecations

Tracker for fields and behaviors we plan to remove. Each row names the
target removal batch and the trigger that signals the deprecation can
safely complete.

| Surface | Field / Behavior | Replaced by | Target | Trigger to remove |
| --- | --- | --- | --- | --- |
| `service_requirements` | `groupSize` (text) | `deliveryModel` ("individual" \| "group") | Batch 2 | `delivery_model` shown everywhere `groupSize` is shown today (IEP builder, service requirement editor, document generation, session logging). |

## Notes

- Batch 1 (Service Requirement v1) adds `delivery_model` alongside the
  legacy `groupSize` field. `groupSize` remains the source of truth for
  display until the trigger above is met.
- Removing a deprecated field requires: (1) removing every read site,
  (2) shipping a migration that drops the column, (3) deleting the
  Drizzle column declaration and the `// DEPRECATED(batch-1):` comment
  that points back to this file.
