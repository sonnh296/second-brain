import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** Public liveness probe — no infrastructure details exposed. */
export async function GET() {
  return NextResponse.json({ ok: true })
}
