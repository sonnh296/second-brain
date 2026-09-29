'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Users,
  CircleDollarSign,
  Package,
  Activity,
  type LucideIcon,
} from 'lucide-react'
import { LanguageSwitcher } from '@/components/dashboard/language-switcher'
import { cn } from '@/lib/utils'

const NAV: { href: string; key: 'navUsers' | 'navCosts' | 'navPlans' | 'navMonitor'; icon: LucideIcon }[] =
  [
    { href: '/admin/users', key: 'navUsers', icon: Users },
    { href: '/admin/costs', key: 'navCosts', icon: CircleDollarSign },
    { href: '/admin/plans', key: 'navPlans', icon: Package },
    { href: '/admin/monitor', key: 'navMonitor', icon: Activity },
  ]

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const t = useTranslations('admin')
  const tn = useTranslations('nav')

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="shrink-0 border-b px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <span className="font-semibold text-sm sm:text-base">{tn('adminTitle')}</span>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-foreground/80 hover:text-foreground cursor-pointer"
            >
              {tn('signOut')}
            </button>
          </form>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <aside className="w-52 shrink-0 border-r bg-muted/20 hidden sm:flex flex-col py-3">
          <nav className="px-2 space-y-0.5" aria-label={t('navLabel')}>
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-background font-medium text-foreground shadow-sm border'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  {t(item.key)}
                </Link>
              )
            })}
          </nav>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <nav
            className="sm:hidden shrink-0 border-b px-2 py-2 flex gap-1 overflow-x-auto"
            aria-label={t('navLabel')}
          >
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {t(item.key)}
                </Link>
              )
            })}
          </nav>
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto max-w-5xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  )
}
