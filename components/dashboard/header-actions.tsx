'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { User } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { LanguageSwitcher } from '@/components/dashboard/language-switcher'

const AVATAR_CACHE_KEY = 'ne_avatar_url'
export const AVATAR_CHANGED_EVENT = 'ne:avatar-changed'

function readCachedAvatar(): string | null {
  try {
    const v = sessionStorage.getItem(AVATAR_CACHE_KEY)
    return v && v.length > 0 ? v : null
  } catch {
    return null
  }
}

export function writeCachedAvatar(url: string | null) {
  try {
    if (url) sessionStorage.setItem(AVATAR_CACHE_KEY, url)
    else sessionStorage.removeItem(AVATAR_CACHE_KEY)
  } catch {
    // ignore quota / private mode
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AVATAR_CHANGED_EVENT, { detail: { url } }))
  }
}

export function HeaderActions() {
  const { confirm, dialog } = useConfirm()
  const pathname = usePathname()
  const t = useTranslations('nav')
  const [menuOpen, setMenuOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const prevPathRef = useRef(pathname)
  const fetchedOnceRef = useRef(false)

  async function refreshAvatar() {
    try {
      const res = await fetch('/api/profile', { credentials: 'same-origin' })
      if (!res.ok) return
      const data = await res.json()
      const next =
        typeof data.avatar_url === 'string' && data.avatar_url.length > 0
          ? data.avatar_url
          : null
      setAvatarUrl(next)
      writeCachedAvatar(next)
    } catch {
      // keep cached value
    }
  }

  // Hydrate from session cache once, then fetch if needed.
  useEffect(() => {
    const cached = readCachedAvatar()
    if (cached) setAvatarUrl(cached)
    if (!fetchedOnceRef.current) {
      fetchedOnceRef.current = true
      void refreshAvatar()
    }

    function onAvatarChanged(e: Event) {
      const detail = (e as CustomEvent<{ url: string | null }>).detail
      setAvatarUrl(detail?.url ?? null)
    }
    window.addEventListener(AVATAR_CHANGED_EVENT, onAvatarChanged)
    return () => window.removeEventListener(AVATAR_CHANGED_EVENT, onAvatarChanged)
  }, [])

  // After leaving Settings, refresh once (avatar/name may have changed).
  useEffect(() => {
    const prev = prevPathRef.current
    prevPathRef.current = pathname
    const leftSettings =
      (prev.startsWith('/settings') || prev.startsWith('/profile')) &&
      !(pathname.startsWith('/settings') || pathname.startsWith('/profile'))
    if (leftSettings) void refreshAvatar()
  }, [pathname])

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

    writeCachedAvatar(null)
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/api/auth/signout'
    document.body.appendChild(form)
    form.submit()
  }

  const settingsActive = pathname.startsWith('/settings') || pathname.startsWith('/profile')

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
            aria-label={t('settings')}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border overflow-hidden transition-colors cursor-pointer ${
              menuOpen || settingsActive
                ? 'border-foreground/25 bg-muted text-foreground'
                : 'border-input bg-background text-foreground/80 hover:text-foreground hover:bg-muted/50'
            }`}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover"
                decoding="async"
              />
            ) : (
              <User className="h-4 w-4" />
            )}
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1.5 z-50 min-w-[11rem] rounded-lg border bg-popover py-1 shadow-lg"
              role="menu"
            >
              <Link
                href="/settings?tab=account"
                role="menuitem"
                className={`block w-full px-3 py-2 text-sm hover:bg-muted cursor-pointer ${
                  settingsActive ? 'font-medium text-foreground' : 'text-foreground'
                }`}
                onClick={() => setMenuOpen(false)}
              >
                {t('settings')}
              </Link>
              <div className="my-1 border-t" />
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
