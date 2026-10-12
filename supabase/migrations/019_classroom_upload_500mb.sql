-- Raise classroom upload limits from 100MB to 500MB.
-- 524288000 = 500 * 1024 * 1024

ALTER TABLE public.assignments
  ALTER COLUMN max_file_bytes SET DEFAULT 524288000;

-- Existing assignments still store the old 100MB cap; bump those to 500MB.
UPDATE public.assignments
SET max_file_bytes = 524288000
WHERE max_file_bytes = 104857600;
