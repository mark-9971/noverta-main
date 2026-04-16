CREATE TABLE IF NOT EXISTS "student_notes" (
  "id" serial PRIMARY KEY,
  "student_id" integer NOT NULL REFERENCES "students"("id"),
  "author_staff_id" integer NOT NULL REFERENCES "staff"("id"),
  "content" text NOT NULL,
  "pinned" boolean NOT NULL DEFAULT false,
  "mentions" jsonb DEFAULT '[]',
  "parent_note_id" integer,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sn_student_idx" ON "student_notes" ("student_id");
CREATE INDEX IF NOT EXISTS "sn_author_idx" ON "student_notes" ("author_staff_id");
CREATE INDEX IF NOT EXISTS "sn_student_pinned_idx" ON "student_notes" ("student_id", "pinned");
CREATE INDEX IF NOT EXISTS "sn_parent_note_idx" ON "student_notes" ("parent_note_id");

CREATE TABLE IF NOT EXISTS "student_note_mentions" (
  "id" serial PRIMARY KEY,
  "note_id" integer NOT NULL REFERENCES "student_notes"("id") ON DELETE CASCADE,
  "mentioned_staff_id" integer NOT NULL REFERENCES "staff"("id"),
  "notified" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "snm_note_idx" ON "student_note_mentions" ("note_id");
CREATE INDEX IF NOT EXISTS "snm_staff_idx" ON "student_note_mentions" ("mentioned_staff_id");
