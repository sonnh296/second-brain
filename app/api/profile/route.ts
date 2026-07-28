import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { getProfileStats } from '@/lib/usage/stats'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const stats = await getProfileStats(supabase, user.id)
    return NextResponse.json(stats)
  } catch (err) {
    console.error('[profile] stats failed', err)
    return NextResponse.json({ error: 'Failed to load profile stats' }, { status: 500 })
  }
}
