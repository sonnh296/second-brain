-- Allow students to revise submissions after grading (status graded -> draft/submitted)
-- Clear grade on resubmit is handled by API via service role

DROP POLICY IF EXISTS "students_update_own_submission" ON assignment_submissions;

CREATE POLICY "students_update_own_submission" ON assignment_submissions
  FOR UPDATE
  USING (
    student_id = auth.uid()
  )
  WITH CHECK (
    student_id = auth.uid()
    AND status IN ('draft', 'submitted')
  );

-- Students may delete the grade on their own submission when they resubmit
DROP POLICY IF EXISTS "students_delete_own_grade_on_resubmit" ON grades;

CREATE POLICY "students_delete_own_grade_on_resubmit" ON grades
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM assignment_submissions s
      WHERE s.id = submission_id
        AND s.student_id = auth.uid()
    )
  );
