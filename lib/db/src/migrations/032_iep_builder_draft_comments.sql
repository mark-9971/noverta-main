CREATE TABLE IF NOT EXISTS "iep_builder_draft_comments" (
  "id" serial PRIMARY KEY NOT NULL,
  "student_id" integer NOT NULL,
  "wizard_step" integer NOT NULL,
  "staff_id" integer,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "iep_builder_draft_comments"
    ADD CONSTRAINT "iep_builder_draft_comments_student_id_students_id_fk"
    FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "iep_builder_draft_comments"
    ADD CONSTRAINT "iep_builder_draft_comments_staff_id_staff_id_fk"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "iep_draft_comment_student_idx"
  ON "iep_builder_draft_comments" ("student_id");
CREATE INDEX IF NOT EXISTS "iep_draft_comment_student_step_idx"
  ON "iep_builder_draft_comments" ("student_id", "wizard_step");
