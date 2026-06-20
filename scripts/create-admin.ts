import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { usernameToEmail, normalizeUsername } from '../lib/auth/username'

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

async function main() {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
    console.error(
      'Set ADMIN_PASSWORD in .env.local (min 8 characters) before running create-admin'
    )
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const username = normalizeUsername(ADMIN_USERNAME)
  const email = usernameToEmail(username)

  const { data: listData } = await supabase.auth.admin.listUsers()
  const existingAuth = listData?.users?.find((u) => u.email === email)

  let userId: string

  if (existingAuth) {
    userId = existingAuth.id
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: ADMIN_PASSWORD,
      user_metadata: { username, role: 'admin' },
    })
    if (error) {
      console.error('Failed to update admin:', error.message)
      process.exit(1)
    }
    console.log(`Updated existing admin user: ${username}`)
  } else {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { username, role: 'admin' },
    })

    if (createErr || !created.user) {
      console.error('Failed to create admin user:', createErr?.message)
      process.exit(1)
    }
    userId = created.user.id
    console.log(`Created admin user: ${username}`)
  }

  const { error: profileErr } = await supabase.from('profiles').upsert({
    id: userId,
    username,
    role: 'admin',
  })

  if (profileErr) {
    console.warn('Profile upsert skipped (run migration 005 if needed):', profileErr.message)
  }

  console.log(`Admin ready — username: ${username}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
