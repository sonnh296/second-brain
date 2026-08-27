import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ClassroomRole = 'teacher' | 'student'

export interface ClassroomMembership {
  classroom_id: string
  user_id: string
  role: ClassroomRole
}

/** 6-char uppercase alphanumeric join code (no ambiguous 0/O/1/I). */
export function generateJoinCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(6)
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += alphabet[bytes[i]! % alphabet.length]
  }
  return code
}

export async function getMembership(
  supabase: SupabaseClient,
  classroomId: string,
  userId: string
): Promise<ClassroomMembership | null> {
  const { data } = await supabase
    .from('classroom_members')
    .select('classroom_id, user_id, role')
    .eq('classroom_id', classroomId)
    .eq('user_id', userId)
    .maybeSingle()
  return data as ClassroomMembership | null
}

export async function requireMember(
  supabase: SupabaseClient,
  classroomId: string,
  userId: string
): Promise<ClassroomMembership | { error: string; status: number }> {
  const m = await getMembership(supabase, classroomId, userId)
  if (!m) return { error: 'Not a member of this classroom', status: 403 }

  const { data: classroom } = await supabase
    .from('classrooms')
    .select('archived_at')
    .eq('id', classroomId)
    .maybeSingle()

  // Students cannot use archived classes; teachers retain access (unarchive / manage)
  if (classroom?.archived_at && m.role !== 'teacher') {
    return { error: 'Classroom archived', status: 403 }
  }

  return m
}

export async function requireTeacher(
  supabase: SupabaseClient,
  classroomId: string,
  userId: string
): Promise<ClassroomMembership | { error: string; status: number }> {
  const m = await requireMember(supabase, classroomId, userId)
  if ('error' in m) return m
  if (m.role !== 'teacher') return { error: 'Teacher only', status: 403 }
  return m
}

export function isAclError(
  v: ClassroomMembership | { error: string; status: number }
): v is { error: string; status: number } {
  return 'error' in v
}

export const CLASSROOM_ASSIGNMENT_MAX_BYTES = 100 * 1024 * 1024 // 100MB
export const CLASSROOM_DOC_MAX_BYTES = 100 * 1024 * 1024

export function classroomR2Key(
  classroomId: string,
  documentId: string,
  filename: string
): string {
  return `classroom/${classroomId}/${documentId}/${filename}`
}

export function classroomSubmissionR2Key(
  classroomId: string,
  assignmentId: string,
  studentId: string,
  fileId: string,
  filename: string
): string {
  return `classroom/${classroomId}/submissions/${assignmentId}/${studentId}/${fileId}/${filename}`
}

/** Expected prefix for a student's submission object (includes trailing slash). */
export function classroomSubmissionKeyPrefix(
  classroomId: string,
  assignmentId: string,
  studentId: string,
  fileId: string
): string {
  return `classroom/${classroomId}/submissions/${assignmentId}/${studentId}/${fileId}/`
}

export function isOwnedSubmissionR2Key(
  r2Key: string,
  classroomId: string,
  assignmentId: string,
  studentId: string,
  fileId: string
): boolean {
  if (!r2Key || r2Key.includes('..') || r2Key.includes('\\')) return false
  const prefix = classroomSubmissionKeyPrefix(classroomId, assignmentId, studentId, fileId)
  return r2Key.startsWith(prefix) && r2Key.length > prefix.length
}

export function classroomImportR2Key(
  classroomId: string,
  jobId: string,
  filename: string
): string {
  return `classroom/${classroomId}/imports/${jobId}/${filename}`
}
