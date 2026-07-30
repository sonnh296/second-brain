import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { defaultLocale, isAppLocale, type AppLocale } from './config'

export default getRequestConfig(async () => {
  const store = await cookies()
  const raw = store.get('NEXT_LOCALE')?.value
  const locale: AppLocale = isAppLocale(raw) ? raw : defaultLocale

  return {
    locale,
    messages: (await import(`../locales/${locale}.json`)).default,
  }
})
