import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id, title, created_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const { data: messages } = await supabase
    .from('messages')
    .select('role, content, cited_sources, created_at')
    .eq('session_id', id)
    .order('created_at', { ascending: true })

  const format = req.nextUrl.searchParams.get('format') ?? 'markdown'

  if (format === 'json') {
    return NextResponse.json({ session, messages: messages ?? [] })
  }

  const lines: string[] = [
    `# ${session.title}`,
    '',
    `Exported: ${new Date().toISOString()}`,
    '',
  ]

  for (const m of messages ?? []) {
    const role = m.role === 'user' ? 'User' : 'Assistant'
    lines.push(`## ${role}`, '', m.content, '')
    const sources = m.cited_sources as { filename: string; chunk_index: number }[] | null
    if (sources?.length) {
      lines.push(
        '**Sources:**',
        ...sources.map((s) => `- ${s.filename} (chunk ${s.chunk_index})`),
        ''
      )
    }
  }

  const markdown = lines.join('\n')

  return new NextResponse(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(session.title)}.md"`,
    },
  })
}
