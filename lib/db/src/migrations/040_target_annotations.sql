-- Adds the missing behavior_target_annotations and program_target_annotations
-- tables declared in lib/db/src/schema/behaviorTargetAnnotations.ts and
-- lib/db/src/schema/programTargetAnnotations.ts. Without these tables the
-- boot-time assertSchemaColumnsPresent() check (lib/db/src/migrate.ts) refuses
-- to start the api-server because the Drizzle schema declares tables that do
-- not exist in the live database.
CREATE TABLE IF NOT EXISTS behavior_target_annotations (
  id SERIAL PRIMARY KEY,
  behavior_target_id INTEGER NOT NULL REFERENCES behavior_targets(id) ON DELETE CASCADE,
  annotation_date TEXT NOT NULL,
  label TEXT NOT NULL,
  created_by INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bta_target_date_idx
  ON behavior_target_annotations (behavior_target_id, annotation_date);

CREATE TABLE IF NOT EXISTS program_target_annotations (
  id SERIAL PRIMARY KEY,
  program_target_id INTEGER NOT NULL REFERENCES program_targets(id) ON DELETE CASCADE,
  annotation_date TEXT NOT NULL,
  label TEXT NOT NULL,
  created_by INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pta_target_date_idx
  ON program_target_annotations (program_target_id, annotation_date);
