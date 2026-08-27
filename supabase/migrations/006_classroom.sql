-- =============================================================
-- Classroom product — extensible schema (hub + class + materials +
-- review + assignments + grading). Apply after 001–005.
-- =============================================================

-- ---------------------------------------------------------------
-- Core
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS classrooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  join_code   TEXT NOT NULL UNIQUE,
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_classrooms_created_by ON classrooms(created_by);
CREATE INDEX IF NOT EXISTS idx_classrooms_join_code ON classrooms(join_code);

CREATE TABLE IF NOT EXISTS classroom_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id  UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (classroom_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_classroom_members_user ON classroom_members(user_id);
CREATE INDEX IF NOT EXISTS idx_classroom_members_class ON classroom_members(classroom_id);

CREATE OR REPLACE FUNCTION public.is_classroom_member(p_classroom_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classroom_members
    WHERE classroom_id = p_classroom_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_classroom_teacher(p_classroom_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classroom_members
    WHERE classroom_id = p_classroom_id
      AND user_id = auth.uid()
      AND role = 'teacher'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE TABLE IF NOT EXISTS classroom_lessons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id  UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  lesson_index  INTEGER NOT NULL,
  title         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (classroom_id, lesson_index)
);

CREATE INDEX IF NOT EXISTS idx_classroom_lessons_class ON classroom_lessons(classroom_id, lesson_index DESC);

CREATE TABLE IF NOT EXISTS classroom_folders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id  UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  lesson_id     UUID REFERENCES classroom_lessons(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('shared_pinned', 'lesson_materials')),
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT classroom_folders_root_shared CHECK (
    (kind = 'shared_pinned' AND lesson_id IS NULL)
    OR (kind = 'lesson_materials' AND lesson_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_classroom_folders_shared_one
  ON classroom_folders (classroom_id)
  WHERE kind = 'shared_pinned';

CREATE UNIQUE INDEX IF NOT EXISTS idx_classroom_folders_lesson_one
  ON classroom_folders (lesson_id)
  WHERE kind = 'lesson_materials';

CREATE TABLE IF NOT EXISTS classroom_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id     UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  folder_id        UUID NOT NULL REFERENCES classroom_folders(id) ON DELETE CASCADE,
  uploaded_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename         TEXT NOT NULL,
  file_type        TEXT NOT NULL,
  r2_key           TEXT NOT NULL,
  file_size_bytes  BIGINT NOT NULL DEFAULT 0,
  chunk_count      INTEGER DEFAULT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  error_message    TEXT,
  content_hash     TEXT,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_classroom_documents_class ON classroom_documents(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_documents_folder ON classroom_documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_classroom_documents_status ON classroom_documents(classroom_id, status);

CREATE TABLE IF NOT EXISTS classroom_document_chunks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      UUID NOT NULL REFERENCES classroom_documents(id) ON DELETE CASCADE,
  classroom_id     UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  chunk_text       TEXT NOT NULL,
  chunk_index      INTEGER NOT NULL,
  qdrant_point_id  UUID NOT NULL,
  page             INTEGER,
  search_vector    tsvector,
  search_vector_norm tsvector,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cdc_document ON classroom_document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_cdc_classroom ON classroom_document_chunks(classroom_id);
CREATE INDEX IF NOT EXISTS idx_cdc_search ON classroom_document_chunks USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_cdc_search_norm ON classroom_document_chunks USING gin(search_vector_norm);

CREATE OR REPLACE FUNCTION classroom_document_chunks_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', COALESCE(NEW.chunk_text, ''));
  NEW.search_vector_norm := to_tsvector('simple', normalize_vi_search_text(NEW.chunk_text));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_classroom_document_chunks_search_vector ON classroom_document_chunks;
CREATE TRIGGER trg_classroom_document_chunks_search_vector
  BEFORE INSERT OR UPDATE OF chunk_text ON classroom_document_chunks
  FOR EACH ROW EXECUTE FUNCTION classroom_document_chunks_search_vector_update();

CREATE OR REPLACE FUNCTION search_classroom_document_chunks(
  p_classroom_id UUID,
  p_query TEXT,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  document_id UUID,
  chunk_index INT,
  chunk_text TEXT,
  filename TEXT,
  rank REAL
) AS $$
DECLARE
  tsq_original tsquery;
  tsq_normalized tsquery;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_classroom_member(p_classroom_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF trim(COALESCE(p_query, '')) = '' THEN
    RETURN;
  END IF;

  tsq_original := plainto_tsquery('simple', trim(p_query));
  tsq_normalized := plainto_tsquery('simple', normalize_vi_search_text(p_query));

  RETURN QUERY
  SELECT
    dc.document_id,
    dc.chunk_index,
    dc.chunk_text,
    d.filename,
    GREATEST(
      ts_rank(dc.search_vector, tsq_original),
      ts_rank(dc.search_vector_norm, tsq_normalized)
    ) AS rank
  FROM classroom_document_chunks dc
  JOIN classroom_documents d ON d.id = dc.document_id
  WHERE dc.classroom_id = p_classroom_id
    AND d.deleted_at IS NULL
    AND (
      dc.search_vector @@ tsq_original
      OR dc.search_vector_norm @@ tsq_normalized
    )
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION search_classroom_document_chunks_internal(
  p_classroom_id UUID,
  p_query TEXT,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  document_id UUID,
  chunk_index INT,
  chunk_text TEXT,
  filename TEXT,
  rank REAL
) AS $$
DECLARE
  tsq_original tsquery;
  tsq_normalized tsquery;
BEGIN
  IF trim(COALESCE(p_query, '')) = '' THEN
    RETURN;
  END IF;

  tsq_original := plainto_tsquery('simple', trim(p_query));
  tsq_normalized := plainto_tsquery('simple', normalize_vi_search_text(p_query));

  RETURN QUERY
  SELECT
    dc.document_id,
    dc.chunk_index,
    dc.chunk_text,
    d.filename,
    GREATEST(
      ts_rank(dc.search_vector, tsq_original),
      ts_rank(dc.search_vector_norm, tsq_normalized)
    ) AS rank
  FROM classroom_document_chunks dc
  JOIN classroom_documents d ON d.id = dc.document_id
  WHERE dc.classroom_id = p_classroom_id
    AND d.deleted_at IS NULL
    AND (
      dc.search_vector @@ tsq_original
      OR dc.search_vector_norm @@ tsq_normalized
    )
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION search_classroom_document_chunks_internal(UUID, TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION search_classroom_document_chunks_internal(UUID, TEXT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION search_classroom_document_chunks_internal(UUID, TEXT, INT) FROM authenticated;

-- ---------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS classroom_chat_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id  UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT 'New Chat',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccs_class_user ON classroom_chat_sessions(classroom_id, user_id);

CREATE TABLE IF NOT EXISTS classroom_chat_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES classroom_chat_sessions(id) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content        TEXT NOT NULL,
  cited_sources  JSONB DEFAULT '[]',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccm_session ON classroom_chat_messages(session_id);

-- ---------------------------------------------------------------
-- Review (ôn tập)
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS review_sets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id  UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  set_type      TEXT NOT NULL DEFAULT 'flashcard'
                  CHECK (set_type IN ('flashcard', 'quiz')),
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'published', 'archived')),
  metadata      JSONB NOT NULL DEFAULT '{"schema_version":1}'::jsonb,
  created_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_sets_class ON review_sets(classroom_id);

CREATE TABLE IF NOT EXISTS review_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_set_id UUID NOT NULL REFERENCES review_sets(id) ON DELETE CASCADE,
  item_type     TEXT NOT NULL CHECK (item_type IN (
    'flashcard', 'mcq', 'written'
  )),
  prompt        TEXT NOT NULL DEFAULT '',
  payload       JSONB NOT NULL DEFAULT '{"schema_version":1}'::jsonb,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_items_set ON review_items(review_set_id, sort_order);

CREATE TABLE IF NOT EXISTS review_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_set_id   UUID NOT NULL REFERENCES review_sets(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answers         JSONB NOT NULL DEFAULT '{}'::jsonb,
  score           NUMERIC(6,2),
  max_score       NUMERIC(6,2),
  tab_blur_count  INTEGER NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress', 'submitted', 'graded'))
);

CREATE INDEX IF NOT EXISTS idx_review_attempts_set_student
  ON review_attempts(review_set_id, student_id);

CREATE TABLE IF NOT EXISTS review_import_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id  UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  review_set_id UUID REFERENCES review_sets(id) ON DELETE SET NULL,
  created_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  r2_key        TEXT,
  filename      TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  raw_text      TEXT,
  result        JSONB,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_review_import_jobs_class ON review_import_jobs(classroom_id);

-- ---------------------------------------------------------------
-- Assignments + grading
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id     UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  lesson_id        UUID NOT NULL REFERENCES classroom_lessons(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  due_at           TIMESTAMPTZ,
  max_file_bytes   BIGINT NOT NULL DEFAULT 104857600,
  max_score        NUMERIC(6,2) NOT NULL DEFAULT 10,
  created_by       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(classroom_id);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  files          JSONB NOT NULL DEFAULT '[]'::jsonb,
  status         TEXT NOT NULL DEFAULT 'submitted'
                   CHECK (status IN ('draft', 'submitted', 'graded')),
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment
  ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student
  ON assignment_submissions(student_id);

CREATE TABLE IF NOT EXISTS grading_rubrics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id  UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  criteria      JSONB NOT NULL DEFAULT '{"schema_version":1,"items":[]}'::jsonb,
  created_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (classroom_id, name)
);

CREATE INDEX IF NOT EXISTS idx_grading_rubrics_class ON grading_rubrics(classroom_id);

CREATE TABLE IF NOT EXISTS grades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID NOT NULL UNIQUE REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  score           NUMERIC(6,2) NOT NULL,
  comment         TEXT,
  graded_by       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method          TEXT NOT NULL DEFAULT 'manual'
                    CHECK (method IN ('manual', 'ai')),
  rubric_id       UUID REFERENCES grading_rubrics(id) ON DELETE SET NULL,
  ai_suggestion   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grade_rubric_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id    UUID NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  criterion_id TEXT NOT NULL,
  score       NUMERIC(6,2),
  max_score   NUMERIC(6,2),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grade_rubric_results_grade ON grade_rubric_results(grade_id);

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------

ALTER TABLE classrooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members_select_classrooms" ON classrooms;
CREATE POLICY "members_select_classrooms" ON classrooms
  FOR SELECT USING (public.is_classroom_member(id));
DROP POLICY IF EXISTS "teachers_update_classrooms" ON classrooms;
CREATE POLICY "teachers_update_classrooms" ON classrooms
  FOR UPDATE USING (public.is_classroom_teacher(id));
DROP POLICY IF EXISTS "auth_insert_classrooms" ON classrooms;
CREATE POLICY "auth_insert_classrooms" ON classrooms
  FOR INSERT WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS "teachers_delete_classrooms" ON classrooms;
CREATE POLICY "teachers_delete_classrooms" ON classrooms
  FOR DELETE USING (public.is_classroom_teacher(id));

ALTER TABLE classroom_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members_select_members" ON classroom_members;
CREATE POLICY "members_select_members" ON classroom_members
  FOR SELECT USING (public.is_classroom_member(classroom_id));
DROP POLICY IF EXISTS "teachers_manage_members" ON classroom_members;
CREATE POLICY "teachers_manage_members" ON classroom_members
  FOR ALL USING (public.is_classroom_teacher(classroom_id));
-- Students join only via join_classroom_by_code (SECURITY DEFINER) — no self-insert.
DROP POLICY IF EXISTS "users_insert_self_student" ON classroom_members;
DROP POLICY IF EXISTS "creator_insert_self_teacher" ON classroom_members;
CREATE POLICY "creator_insert_self_teacher" ON classroom_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND role = 'teacher'
    AND EXISTS (
      SELECT 1 FROM classrooms c
      WHERE c.id = classroom_id AND c.created_by = auth.uid()
    )
  );
DROP POLICY IF EXISTS "users_delete_self_member" ON classroom_members;
CREATE POLICY "users_delete_self_member" ON classroom_members
  FOR DELETE USING (user_id = auth.uid());

-- Join by code (bypasses SELECT-on-classroom membership gate)
CREATE OR REPLACE FUNCTION public.join_classroom_by_code(p_code TEXT)
RETURNS UUID AS $$
DECLARE
  cid UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id INTO cid
  FROM classrooms
  WHERE upper(trim(join_code)) = upper(trim(p_code))
    AND archived_at IS NULL;

  IF cid IS NULL THEN
    RAISE EXCEPTION 'Invalid join code';
  END IF;

  IF public.is_classroom_member(cid) THEN
    RETURN cid;
  END IF;

  INSERT INTO classroom_members (classroom_id, user_id, role)
  VALUES (cid, auth.uid(), 'student')
  ON CONFLICT (classroom_id, user_id) DO NOTHING;

  RETURN cid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.join_classroom_by_code(TEXT) TO authenticated;

ALTER TABLE classroom_lessons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members_select_lessons" ON classroom_lessons;
CREATE POLICY "members_select_lessons" ON classroom_lessons
  FOR SELECT USING (public.is_classroom_member(classroom_id));
DROP POLICY IF EXISTS "teachers_manage_lessons" ON classroom_lessons;
CREATE POLICY "teachers_manage_lessons" ON classroom_lessons
  FOR ALL USING (public.is_classroom_teacher(classroom_id));

ALTER TABLE classroom_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members_select_folders" ON classroom_folders;
CREATE POLICY "members_select_folders" ON classroom_folders
  FOR SELECT USING (public.is_classroom_member(classroom_id));
DROP POLICY IF EXISTS "teachers_manage_folders" ON classroom_folders;
CREATE POLICY "teachers_manage_folders" ON classroom_folders
  FOR ALL USING (public.is_classroom_teacher(classroom_id));

ALTER TABLE classroom_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members_select_class_docs" ON classroom_documents;
CREATE POLICY "members_select_class_docs" ON classroom_documents
  FOR SELECT USING (
    public.is_classroom_member(classroom_id) AND deleted_at IS NULL
  );
DROP POLICY IF EXISTS "teachers_manage_class_docs" ON classroom_documents;
CREATE POLICY "teachers_manage_class_docs" ON classroom_documents
  FOR ALL USING (public.is_classroom_teacher(classroom_id));

ALTER TABLE classroom_document_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members_select_class_chunks" ON classroom_document_chunks;
CREATE POLICY "members_select_class_chunks" ON classroom_document_chunks
  FOR SELECT USING (public.is_classroom_member(classroom_id));
DROP POLICY IF EXISTS "teachers_manage_class_chunks" ON classroom_document_chunks;
CREATE POLICY "teachers_manage_class_chunks" ON classroom_document_chunks
  FOR ALL USING (public.is_classroom_teacher(classroom_id));

ALTER TABLE classroom_chat_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_class_chat_sessions" ON classroom_chat_sessions;
CREATE POLICY "own_class_chat_sessions" ON classroom_chat_sessions
  FOR ALL USING (
    user_id = auth.uid() AND public.is_classroom_member(classroom_id)
  );

ALTER TABLE classroom_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_class_chat_messages" ON classroom_chat_messages;
CREATE POLICY "own_class_chat_messages" ON classroom_chat_messages
  FOR ALL USING (
    session_id IN (
      SELECT id FROM classroom_chat_sessions WHERE user_id = auth.uid()
    )
  );

ALTER TABLE review_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members_select_review_sets" ON review_sets;
CREATE POLICY "members_select_review_sets" ON review_sets
  FOR SELECT USING (
    public.is_classroom_member(classroom_id)
    AND (
      status = 'published'
      OR public.is_classroom_teacher(classroom_id)
    )
  );
DROP POLICY IF EXISTS "teachers_manage_review_sets" ON review_sets;
CREATE POLICY "teachers_manage_review_sets" ON review_sets
  FOR ALL USING (public.is_classroom_teacher(classroom_id));

ALTER TABLE review_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members_select_review_items" ON review_items;
CREATE POLICY "members_select_review_items" ON review_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM review_sets rs
      WHERE rs.id = review_set_id
        AND public.is_classroom_member(rs.classroom_id)
        AND (rs.status = 'published' OR public.is_classroom_teacher(rs.classroom_id))
    )
  );
DROP POLICY IF EXISTS "teachers_manage_review_items" ON review_items;
CREATE POLICY "teachers_manage_review_items" ON review_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM review_sets rs
      WHERE rs.id = review_set_id
        AND public.is_classroom_teacher(rs.classroom_id)
    )
  );

ALTER TABLE review_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "students_own_attempts" ON review_attempts;
DROP POLICY IF EXISTS "attempts_select_own" ON review_attempts;
DROP POLICY IF EXISTS "attempts_select_teacher" ON review_attempts;
DROP POLICY IF EXISTS "students_insert_attempts" ON review_attempts;
DROP POLICY IF EXISTS "students_update_in_progress_attempts" ON review_attempts;
CREATE POLICY "attempts_select_own" ON review_attempts
  FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "attempts_select_teacher" ON review_attempts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM review_sets rs
      WHERE rs.id = review_set_id
        AND public.is_classroom_teacher(rs.classroom_id)
    )
  );
CREATE POLICY "students_insert_attempts" ON review_attempts
  FOR INSERT WITH CHECK (
    student_id = auth.uid()
    AND status = 'in_progress'
    AND EXISTS (
      SELECT 1 FROM review_sets rs
      WHERE rs.id = review_set_id
        AND public.is_classroom_member(rs.classroom_id)
        AND rs.status = 'published'
    )
  );
CREATE POLICY "students_update_in_progress_attempts" ON review_attempts
  FOR UPDATE
  USING (student_id = auth.uid() AND status = 'in_progress')
  WITH CHECK (student_id = auth.uid());

ALTER TABLE review_import_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "teachers_manage_import_jobs" ON review_import_jobs;
CREATE POLICY "teachers_manage_import_jobs" ON review_import_jobs
  FOR ALL USING (public.is_classroom_teacher(classroom_id));

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members_select_assignments" ON assignments;
CREATE POLICY "members_select_assignments" ON assignments
  FOR SELECT USING (public.is_classroom_member(classroom_id));
DROP POLICY IF EXISTS "teachers_manage_assignments" ON assignments;
CREATE POLICY "teachers_manage_assignments" ON assignments
  FOR ALL USING (public.is_classroom_teacher(classroom_id));

ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "submission_access" ON assignment_submissions;
CREATE POLICY "submission_access" ON assignment_submissions
  FOR SELECT USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.id = assignment_id
        AND public.is_classroom_teacher(a.classroom_id)
    )
  );
DROP POLICY IF EXISTS "students_insert_own_submission" ON assignment_submissions;
CREATE POLICY "students_insert_own_submission" ON assignment_submissions
  FOR INSERT WITH CHECK (
    student_id = auth.uid()
    AND status IN ('draft', 'submitted')
    AND EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.id = assignment_id
        AND public.is_classroom_member(a.classroom_id)
    )
  );
DROP POLICY IF EXISTS "students_update_own_submission" ON assignment_submissions;
CREATE POLICY "students_update_own_submission" ON assignment_submissions
  FOR UPDATE
  USING (
    student_id = auth.uid()
    AND status IN ('draft', 'submitted')
  )
  WITH CHECK (
    student_id = auth.uid()
    AND status IN ('draft', 'submitted')
  );
DROP POLICY IF EXISTS "teachers_update_submissions" ON assignment_submissions;
CREATE POLICY "teachers_update_submissions" ON assignment_submissions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.id = assignment_id
        AND public.is_classroom_teacher(a.classroom_id)
    )
  );

ALTER TABLE grading_rubrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "teachers_manage_rubrics" ON grading_rubrics;
CREATE POLICY "teachers_manage_rubrics" ON grading_rubrics
  FOR ALL USING (public.is_classroom_teacher(classroom_id));
DROP POLICY IF EXISTS "members_select_rubrics" ON grading_rubrics;
CREATE POLICY "members_select_rubrics" ON grading_rubrics
  FOR SELECT USING (public.is_classroom_member(classroom_id));

ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grade_access" ON grades;
CREATE POLICY "grade_access" ON grades
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      WHERE s.id = submission_id
        AND (
          s.student_id = auth.uid()
          OR public.is_classroom_teacher(a.classroom_id)
        )
    )
  );
DROP POLICY IF EXISTS "teachers_manage_grades" ON grades;
CREATE POLICY "teachers_manage_grades" ON grades
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      WHERE s.id = submission_id
        AND public.is_classroom_teacher(a.classroom_id)
    )
  );

ALTER TABLE grade_rubric_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grade_rubric_results_access" ON grade_rubric_results;
DROP POLICY IF EXISTS "grade_rubric_results_select" ON grade_rubric_results;
DROP POLICY IF EXISTS "teachers_manage_grade_rubric_results" ON grade_rubric_results;
CREATE POLICY "grade_rubric_results_select" ON grade_rubric_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM grades g
      JOIN assignment_submissions s ON s.id = g.submission_id
      JOIN assignments a ON a.id = s.assignment_id
      WHERE g.id = grade_id
        AND (
          s.student_id = auth.uid()
          OR public.is_classroom_teacher(a.classroom_id)
        )
    )
  );
CREATE POLICY "teachers_manage_grade_rubric_results" ON grade_rubric_results
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM grades g
      JOIN assignment_submissions s ON s.id = g.submission_id
      JOIN assignments a ON a.id = s.assignment_id
      WHERE g.id = grade_id
        AND public.is_classroom_teacher(a.classroom_id)
    )
  );
