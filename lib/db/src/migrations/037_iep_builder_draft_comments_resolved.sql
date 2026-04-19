ALTER TABLE "iep_builder_draft_comments"
  ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;

ALTER TABLE "iep_builder_draft_comments"
  ADD COLUMN IF NOT EXISTS "resolved_by_staff_id" integer;

DO $$ BEGIN
  ALTER TABLE "iep_builder_draft_comments"
    ADD CONSTRAINT "iep_builder_draft_comments_resolved_by_staff_id_staff_id_fk"
    FOREIGN KEY ("resolved_by_staff_id") REFERENCES "staff"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
