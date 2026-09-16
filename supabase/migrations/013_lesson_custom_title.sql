-- Allow custom lesson title on create (default remains "Buổi {n}")
DROP FUNCTION IF EXISTS public.create_classroom_lesson(UUID);

CREATE OR REPLACE FUNCTION public.create_classroom_lesson(
  p_classroom_id UUID,
  p_title TEXT DEFAULT NULL
)
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

  v_title := NULLIF(BTRIM(p_title), '');
  IF v_title IS NULL THEN
    v_title := 'Buổi ' || v_next::text;
  ELSE
    v_title := LEFT(v_title, 200);
  END IF;

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

GRANT EXECUTE ON FUNCTION public.create_classroom_lesson(UUID, TEXT) TO authenticated;
