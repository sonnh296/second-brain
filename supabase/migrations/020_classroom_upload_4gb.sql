-- Raise classroom upload limits from 500MB to 4GB.
-- 4294967296 = 4 * 1024 * 1024 * 1024

ALTER TABLE public.assignments
  ALTER COLUMN max_file_bytes SET DEFAULT 4294967296;

-- Bump legacy caps (100MB / 500MB defaults) to 4GB.
UPDATE public.assignments
SET max_file_bytes = 4294967296
WHERE max_file_bytes IN (104857600, 524288000);
