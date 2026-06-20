import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/db/server'

const QuerySchema = z.object({
  ids: z
    .string()
    .transform((s) => s.split(',').map((id) => id.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1).max(50)),
})

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const idsParam = req.nextUrl.searchParams.get('ids') ?? ''
  const parsed = QuerySchema.safeParse({ ids: idsParam })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid ids parameter' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('documents')
    .select('id, status, error_message, chunk_count')
    .eq('user_id', user.id)
    .in('id', parsed.data.ids)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 })
  }

  const byId = Object.fromEntries((data ?? []).map((d) => [d.id, d]))
  return NextResponse.json(byId)
}
