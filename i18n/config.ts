export const locales = ['vi', 'en', 'zh'] as const
export type AppLocale = (typeof locales)[number]
export const defaultLocale: AppLocale = 'vi'
export const LOCALE_COOKIE = 'NEXT_LOCALE'

export function isAppLocale(value: string | undefined | null): value is AppLocale {
  return locales.includes(value as AppLocale)
}

/** BCP 47 tag for Date#toLocaleString */
export function dateLocaleTag(locale: string): string {
  if (locale === 'en') return 'en-US'
  if (locale === 'zh') return 'zh-CN'
  return 'vi-VN'
}
