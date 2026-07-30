'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { User } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { LanguageSwitcher } from '@/components/dashboard/language-switcher'

export function HeaderActions() {
  const { confirm, dialog } = useConfirm()
  const pathname = usePathname()
  const t = useTranslations('nav')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  async function handleSignOut() {
    setMenuOpen(false)
    const ok = await confirm({
      title: t('signOutTitle'),
      description: t('signOutDesc'),
      confirmLabel: t('signOut'),
      cancelLabel: t('stay'),
    })
    if (!ok) return

    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/api/auth/signout'
    document.body.appendChild(form)
    form.submit()
  }

  const profileActive = pathname.startsWith('/profile')

  return (
    <>
      {dialog}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <LanguageSwitcher />
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={t('profile')}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors cursor-pointer ${
              menuOpen || profileActive
                ? 'border-foreground/25 bg-muted text-foreground'
                : 'border-input bg-background text-foreground/80 hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <User className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1.5 z-50 min-w-[10rem] rounded-lg border bg-popover py-1 shadow-lg"
              role="menu"
            >
              <Link
                href="/profile"
                role="menuitem"
                className={`block w-full px-3 py-2 text-sm hover:bg-muted cursor-pointer ${
                  profileActive ? 'font-medium text-foreground' : 'text-foreground'
                }`}
                onClick={() => setMenuOpen(false)}
              >
                {t('profile')}
              </Link>
              <button
                type="button"
                role="menuitem"
                className="w-full px-3 py-2 text-sm text-left hover:bg-muted cursor-pointer text-foreground"
                onClick={() => void handleSignOut()}
              >
                {t('signOut')}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
