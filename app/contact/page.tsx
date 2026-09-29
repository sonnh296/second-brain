import Link from 'next/link'
import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { Mail } from 'lucide-react'
import { APP_VERSION } from '@/lib/app-version'

const SALES_EMAIL = 'sonnh296@gmail.com'

export default async function ContactPage() {
  const t = await getTranslations('contact')
  const tc = await getTranslations('common')

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/home" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt={tc('appName')}
            width={28}
            height={28}
            className="h-7 w-7 rounded-md object-cover"
          />
          <span className="font-semibold text-base sm:text-lg">{tc('appName')}</span>
        </Link>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('back')}
          </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{t('intro')}</p>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-4">
            <p className="text-sm leading-relaxed text-foreground/90">{t('body')}</p>
            <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-3 py-3">
              <Mail className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t('emailLabel')}</p>
                <a
                  href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(t('mailSubject'))}`}
                  className="text-sm font-medium text-foreground hover:underline break-all"
                >
                  {SALES_EMAIL}
                </a>
              </div>
            </div>
            <a
              href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(t('mailSubject'))}`}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            >
              {t('sendEmail')}
            </a>
          </div>

          <p className="text-[11px] text-muted-foreground/80">
            noteeverything.site · v{APP_VERSION}
          </p>
        </div>
      </main>
    </div>
  )
}
