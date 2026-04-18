create table if not exists medicaid_report_snapshots (
  id serial primary key,
  district_id integer not null,
  report_type text not null,
  label text,
  date_from text,
  date_to text,
  saved_by_clerk_id text not null,
  saved_by_name text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists mrs_district_idx on medicaid_report_snapshots (district_id);
create index if not exists mrs_report_type_idx on medicaid_report_snapshots (report_type);
