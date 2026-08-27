-- Classroom security hardening (idempotent).
-- Join only via RPC; lock student attempts/submissions after submit/grade;
-- grade_rubric_results teacher-write / member-read.

-- 1) Drop self-join bypass (join_classroom_by_code is SECURITY DEFINER)
DROP POLICY IF EXISTS "users_insert_self_student" ON classroom_members;

-- 2) review_attempts: split FOR ALL into constrained policies
DROP POLICY IF EXISTS "students_own_attempts" ON review_attempts;
DROP POLICY IF EXISTS "attempts_select" ON review_attempts;
DROP POLICY IF EXISTS "students_insert_attempts" ON review_attempts;
DROP POLICY IF EXISTS "students_update_in_progress_attempts" ON review_attempts;
DROP POLICY IF EXISTS "teachers_select_attempts" ON review_attempts;

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

-- USING checks OLD row (must be in_progress); prevents post-submit tampering
CREATE POLICY "students_update_in_progress_attempts" ON review_attempts
  FOR UPDATE
  USING (student_id = auth.uid() AND status = 'in_progress')
  WITH CHECK (student_id = auth.uid());

-- 3) assignment_submissions: membership on insert; no student writes after graded
DROP POLICY IF EXISTS "students_insert_own_submission" ON assignment_submissions;
DROP POLICY IF EXISTS "students_update_own_submission" ON assignment_submissions;

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

-- 4) grade_rubric_results: students read-only; teachers manage
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
