-- Fix classroom create under RLS: atomic SECURITY DEFINER bootstrap.
-- Also allow creators to SELECT their own classrooms before membership exists.

DROP POLICY IF EXISTS "creators_select_own_classrooms" ON classrooms;
CREATE POLICY "creators_select_own_classrooms" ON classrooms
  FOR SELECT USING (created_by = auth.uid());

CREATE OR REPLACE FUNCTION public.create_classroom(p_name TEXT)
RETURNS TABLE (id UUID, name TEXT, join_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_code TEXT;
  v_id UUID;
  v_name TEXT := trim(p_name);
  attempt INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF v_name IS NULL OR length(v_name) = 0 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Invalid classroom name';
  END IF;

  FOR attempt IN 1..8 LOOP
    -- Unambiguous alphabet (no 0/O/1/I) — same as app generateJoinCode
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(
        'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
        1 + (get_byte(gen_random_bytes(1), 0) % 32),
        1
      );
    END LOOP;

    BEGIN
      INSERT INTO classrooms (name, join_code, created_by, settings)
      VALUES (v_name, v_code, v_uid, '{"schema_version":1}'::jsonb)
      RETURNING classrooms.id INTO v_id;

      INSERT INTO classroom_members (classroom_id, user_id, role)
      VALUES (v_id, v_uid, 'teacher');

      INSERT INTO classroom_folders (classroom_id, lesson_id, kind, name)
      VALUES (v_id, NULL, 'shared_pinned', 'Tài liệu chung');

      RETURN QUERY
        SELECT c.id, c.name, c.join_code
        FROM classrooms c
        WHERE c.id = v_id;
      RETURN;
    EXCEPTION
      WHEN unique_violation THEN
        -- retry join_code collision
        NULL;
    END;
  END LOOP;

  RAISE EXCEPTION 'Could not allocate join code';
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_classroom(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_classroom_lesson(p_classroom_id UUID)
RETURNS TABLE (id UUID, lesson_index INT, title TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_next INT;
  v_title TEXT;
  v_lesson_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT public.is_classroom_teacher(p_classroom_id) THEN
    RAISE EXCEPTION 'Teacher only';
  END IF;

  SELECT COALESCE(MAX(cl.lesson_index), 0) + 1
  INTO v_next
  FROM classroom_lessons cl
  WHERE cl.classroom_id = p_classroom_id;

  v_title := 'Buổi ' || v_next::text;

  INSERT INTO classroom_lessons (classroom_id, lesson_index, title)
  VALUES (p_classroom_id, v_next, v_title)
  RETURNING classroom_lessons.id INTO v_lesson_id;

  INSERT INTO classroom_folders (classroom_id, lesson_id, kind, name)
  VALUES (p_classroom_id, v_lesson_id, 'lesson_materials', 'Tài liệu buổi học');

  RETURN QUERY
    SELECT cl.id, cl.lesson_index, cl.title
    FROM classroom_lessons cl
    WHERE cl.id = v_lesson_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_classroom_lesson(UUID) TO authenticated;
