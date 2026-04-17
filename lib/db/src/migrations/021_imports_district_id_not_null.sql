-- Migration 021: Enforce NOT NULL on imports.district_id
--
-- Strategy for existing NULL rows
-- ================================
-- The imports table has no FK column that can reliably identify which district
-- an orphaned row belongs to (no student_id, staff_id, or school_id FK).
-- Attempting a heuristic backfill (e.g. file_name pattern match) was evaluated
-- and rejected: the file_name column carries no enforced format, so any pattern
-- match would silently mis-attribute rows to the wrong tenant — a worse outcome
-- than deletion.
--
-- Explicit fallback: delete orphaned rows.
-- These rows are import *metadata* only (row counts, file name, status).
-- They carry no student PII and were previously visible only to platform admins
-- via /api/support/imports/recent. Deletion eliminates the orphan without
-- creating cross-tenant attribution risk.
--
-- After deletion, every remaining row has a non-null district_id, so the NOT
-- NULL constraint is safe to apply immediately.

-- Step 1: Remove rows that cannot be attributed to a district.
DELETE FROM imports WHERE district_id IS NULL;

-- Step 2: Enforce the constraint at the schema level.
-- The BEFORE INSERT trigger from migration 020 remains as belt-and-suspenders,
-- but this column-level constraint is the primary enforcement mechanism.
ALTER TABLE imports ALTER COLUMN district_id SET NOT NULL;
