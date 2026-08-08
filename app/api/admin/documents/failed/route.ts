import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/db/server'
import { isAdmin } from '@/lib/auth/admin'
import { getAdminFailedDocuments } from '@/lib/usage/admin-failed-documents'
import { logger } from '@/lib/logger'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await isAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const service = createServiceSupabaseClient()
    const result = await getAdminFailedDocuments(service)
    return NextResponse.json(result)
  } catch (error) {
    logger.error('Failed to fetch admin failed documents', { err: error })
    return NextResponse.json(
      { error: 'Failed to fetch failed documents' },
      { status: 500 }
    )
  }
}
