'use client'

import Link from 'next/link'
import { useConfirm } from '@/components/ui/confirm-dialog'

export function HeaderActions() {
  const { confirm, dialog } = useConfirm()

  async function handleSignOut() {
    const ok = await confirm({
      title: 'Đăng xuất?',
      description: 'Bạn sẽ cần đăng nhập lại để tiếp tục sử dụng.',
      confirmLabel: 'Đăng xuất',
      cancelLabel: 'Ở lại',
    })
    if (!ok) return

    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/api/auth/signout'
    document.body.appendChild(form)
    form.submit()
  }

  return (
    <>
      {dialog}
      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        <Link
          href="/profile"
          className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
        >
          Cá nhân
        </Link>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Đăng xuất
        </button>
      </div>
    </>
  )
}
