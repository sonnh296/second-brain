'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { locales, type AppLocale } from '@/i18n/config'

const LABELS: Record<AppLocale, string> = {
  vi: 'VI',
  en: 'EN',
  zh: '中文',
}

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const t = useTranslations('common')
  const locale = useLocale() as AppLocale
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  async function setLocale(next: AppLocale) {
    if (next === locale) return
    await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: next }),
    })
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <div className={`flex items-center gap-1 ${className}`} title={t('language')}>
      {locales.map((code, i) => (
        <span key={code} className="contents">
          {i > 0 && <span className="text-foreground/30 text-xs">|</span>}
          <button
            type="button"
            disabled={pending}
            onClick={() => void setLocale(code)}
            className={`text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
              locale === code
                ? 'font-semibold text-foreground bg-muted'
                : 'text-foreground/70 hover:text-foreground'
            }`}
          >
            {LABELS[code]}
          </button>
        </span>
      ))}
    </div>
  )
}
