'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export type Crumb = {
  label: string
  href?: string
}

export function ClassroomBreadcrumb({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm flex-wrap min-w-0">
      {items.map((item, i) => {
        const last = i === items.length - 1
        return (
          <span key={`${item.label}-${i}`} className="flex items-center gap-1 min-w-0">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            {item.href && !last ? (
              <Link
                href={item.href}
                className="text-muted-foreground hover:text-foreground hover:underline truncate max-w-[10rem] sm:max-w-[14rem]"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={`truncate max-w-[12rem] sm:max-w-[18rem] ${
                  last ? 'font-medium text-foreground' : 'text-muted-foreground'
                }`}
              >
                {item.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
