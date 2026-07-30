'use client'

import { useTranslations } from 'next-intl'
import { NavLinks } from '@/components/dashboard/nav-links'

export function DashboardNav({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('nav')

  const items = [
    {
      href: '/documents',
      label: t('documents'),
      match: (p: string) => p.startsWith('/documents'),
    },
    {
      href: '/chat',
      label: t('chat'),
      match: (p: string) => p.startsWith('/chat'),
    },
    ...(isAdmin
      ? [
          {
            href: '/admin',
            label: t('admin'),
            match: (p: string) => p.startsWith('/admin'),
          },
        ]
      : []),
  ]

  return <NavLinks items={items} />
}
