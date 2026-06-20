import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/db/server'
import { isAdmin, listUsersWithProfiles } from '@/lib/auth/admin'
import {
  isValidUsername,
  normalizeUsername,
  usernameToEmail,
} from '@/lib/auth/username'
import { logger } from '@/lib/logger'

const CreateUserSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(6).max(128),
  role: z.enum(['user', 'admin']).optional().default('user'),
})

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await isAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceSupabaseClient()

  try {
    const users = await listUsersWithProfiles(service)
    return NextResponse.json(users)
  } catch (error) {
    logger.error('Failed to fetch users', { err: error })
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await isAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = CreateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const username = normalizeUsername(parsed.data.username)
  if (!isValidUsername(username)) {
    return NextResponse.json(
      { error: 'Tên đăng nhập không hợp lệ (3–32 ký tự, chữ thường, số, _)' },
      { status: 400 }
    )
  }

  const service = createServiceSupabaseClient()
  const email = usernameToEmail(username)

  const { data: listData } = await service.auth.admin.listUsers()
  const exists = listData?.users?.some((u) => u.email === email)
  if (exists) {
    return NextResponse.json({ error: 'Tên đăng nhập đã tồn tại' }, { status: 409 })
  }

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { username, role: parsed.data.role },
  })

  if (createErr || !created.user) {
    logger.error('Admin createUser failed', { err: createErr })
    return NextResponse.json({ error: createErr?.message ?? 'Failed to create user' }, { status: 500 })
  }

  await service.from('profiles').upsert({
    id: created.user.id,
    username,
    role: parsed.data.role,
  })

  return NextResponse.json(
    {
      id: created.user.id,
      username,
      role: parsed.data.role,
    },
    { status: 201 }
  )
}
