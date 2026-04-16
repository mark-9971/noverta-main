CREATE TABLE IF NOT EXISTS "meeting_prep_items" (
  "id" serial PRIMARY KEY,
  "meeting_id" integer NOT NULL REFERENCES "team_meetings"("id") ON DELETE CASCADE,
  "item_type" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "required" boolean NOT NULL DEFAULT true,
  "auto_detected" boolean NOT NULL DEFAULT false,
  "manually_unchecked" boolean NOT NULL DEFAULT false,
  "completed_at" timestamp with time zone,
  "completed_by_staff_id" integer REFERENCES "staff"("id"),
  "notes" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "mpi_meeting_idx" ON "meeting_prep_items" ("meeting_id");
CREATE UNIQUE INDEX IF NOT EXISTS "mpi_meeting_item_type_unique" ON "meeting_prep_items" ("meeting_id", "item_type");
