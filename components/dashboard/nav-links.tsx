'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = {
  href: string
  label: string
  match?: (pathname: string) => boolean
}

function linkClass(active: boolean): string {
  return active
    ? 'font-bold text-foreground bg-muted px-2.5 py-1 rounded-md whitespace-nowrap transition-colors'
    : 'font-bold text-foreground/85 hover:text-foreground px-2.5 py-1 rounded-md whitespace-nowrap transition-colors'
}

export function NavLinks({
  items,
  className = '',
}: {
  items: NavItem[]
  className?: string
}) {
  const pathname = usePathname()

  return (
    <nav className={`flex items-center gap-1 sm:gap-2 text-sm ${className}`}>
      {items.map((item) => {
        const active = item.match
          ? item.match(pathname)
          : pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link key={item.href} href={item.href} className={linkClass(active)}>
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
