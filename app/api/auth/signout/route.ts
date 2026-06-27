import { NextRequest, NextResponse } from 'next/server'
import { appUrl } from '@/lib/app-url'
import { createServerSupabaseClient } from '@/lib/db/server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(appUrl('/login', req))
}
