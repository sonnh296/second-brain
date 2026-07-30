import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/db/server'
import { isAdmin } from '@/lib/auth/admin'
import { logger } from '@/lib/logger'

const PatchUserSchema = z
  .object({
    role: z.enum(['user', 'admin']).optional(),
    password: z.string().min(6).max(128).optional(),
    disabled: z.boolean().optional(),
  })
  .refine((d) => d.role !== undefined || d.password !== undefined || d.disabled !== undefined, {
    message: 'At least one of role, password, disabled is required',
  })

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await isAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = PatchUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const updates = parsed.data

  if (id === user.id && updates.disabled === true) {
    return NextResponse.json(
      { error: 'Không thể vô hiệu hóa tài khoản của chính bạn' },
      { status: 400 }
    )
  }

  const service = createServiceSupabaseClient()

  if (updates.role !== undefined) {
    const { error } = await service
      .from('profiles')
      .update({ role: updates.role })
      .eq('id', id)
    if (error) {
      logger.error('Admin update role failed', { err: error, userId: id })
      return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
    }
    await service.auth.admin.updateUserById(id, {
      user_metadata: { role: updates.role },
    })
  }

  if (updates.password !== undefined) {
    const { error } = await service.auth.admin.updateUserById(id, {
      password: updates.password,
    })
    if (error) {
      logger.error('Admin reset password failed', { err: error, userId: id })
      return NextResponse.json(
        { error: error.message ?? 'Failed to reset password' },
        { status: 500 }
      )
    }
  }

  if (updates.disabled !== undefined) {
    const disabled_at = updates.disabled ? new Date().toISOString() : null
    const { error } = await service.from('profiles').update({ disabled_at }).eq('id', id)
    if (error) {
      logger.error('Admin disable/enable failed', { err: error, userId: id })
      return NextResponse.json(
        {
          error:
            error.message?.includes('disabled_at') || error.code === '42703'
              ? 'Chạy migration 002_profiles_disabled.sql trước'
              : 'Failed to update status',
        },
        { status: 500 }
      )
    }
  }

  const { data: profile } = await service
    .from('profiles')
    .select('id, username, role, created_at, disabled_at')
    .eq('id', id)
    .maybeSingle()

  if (!profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: profile.id,
    username: profile.username,
    role: profile.role,
    created_at: profile.created_at,
    disabled_at: profile.disabled_at ?? null,
  })
}
