'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatBytes, formatTokenCount } from '@/lib/usage/format'
import { formatUsd } from '@/lib/usage/pricing'
import { dateLocaleTag } from '@/i18n/config'
import type { AdminSystemStats } from '@/lib/usage/admin-stats'
import type {
  AdminFailedDocument,
  AdminFailedDocumentsResult,
} from '@/lib/usage/admin-failed-documents'

export function AdminCostsPanel() {
  const t = useTranslations('admin')
  const tc = useTranslations('common')
  const locale = useLocale()
  const [stats, setStats] = useState<AdminSystemStats | null>(null)
  const [failedDocs, setFailedDocs] = useState<AdminFailedDocument[]>([])
  const [failedTotal, setFailedTotal] = useState(0)
  const [statsLoading, setStatsLoading] = useState(true)
  const [failedLoading, setFailedLoading] = useState(true)

  const fetchStats = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setStatsLoading(true)
    const res = await fetch('/api/admin/stats')
    if (res.ok) setStats(await res.json())
    if (!opts?.silent) setStatsLoading(false)
  }, [])

  const fetchFailedDocs = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setFailedLoading(true)
    const res = await fetch('/api/admin/documents/failed')
    if (res.ok) {
      const data = (await res.json()) as AdminFailedDocumentsResult
      setFailedDocs(data.items)
      setFailedTotal(data.total)
    }
    if (!opts?.silent) setFailedLoading(false)
  }, [])

  useEffect(() => {
    void fetchStats()
    void fetchFailedDocs()
  }, [fetchStats, fetchFailedDocs])

  useEffect(() => {
    const id = setInterval(() => {
      void fetchStats({ silent: true })
      void fetchFailedDocs({ silent: true })
    }, 60_000)
    return () => clearInterval(id)
  }, [fetchStats, fetchFailedDocs])

  const dateLocale = dateLocaleTag(locale)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('costsTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('costsSubtitle')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void fetchStats()
            void fetchFailedDocs()
          }}
          disabled={statsLoading || failedLoading}
        >
          {t('refreshStats')}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title={t('statStorage')}
          loading={statsLoading}
          value={stats ? formatBytes(stats.storage.total_bytes) : '—'}
          hint={
            stats
              ? t('statDocsHint', {
                  count: stats.storage.documents_count,
                  attachments: formatBytes(stats.storage.attachments_bytes),
                })
              : undefined
          }
        />
        <StatCard
          title={t('statTokens')}
          loading={statsLoading}
          value={stats ? formatTokenCount(stats.tokens.mtd.total_tokens) : '—'}
          hint={
            stats
              ? t('statAllTime', {
                  count: formatTokenCount(stats.tokens.all_time.total_tokens),
                })
              : undefined
          }
        />
        <StatCard
          title={t('statCost')}
          loading={statsLoading}
          value={stats ? formatUsd(stats.cost.mtd_usd) : '—'}
          hint={stats?.cost.note ?? t('costNote')}
        />
        <StatCard
          title={t('statForecast')}
          loading={statsLoading}
          value={stats ? formatUsd(stats.cost.forecast_eom_usd) : '—'}
          hint={
            stats
              ? t('statUsersHint', {
                  active: stats.users.active,
                  disabled: stats.users.disabled,
                })
              : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          title={t('statOpenAiCost')}
          loading={statsLoading}
          value={stats ? formatUsd(stats.cost.openai_usd) : '—'}
          hint={providerHint(stats?.cost.providers.openai.status, t)}
        />
        <StatCard
          title={t('statAnthropicCost')}
          loading={statsLoading}
          value={stats ? formatUsd(stats.cost.anthropic_usd) : '—'}
          hint={providerHint(stats?.cost.providers.anthropic.status, t)}
        />
        <StatCard
          title={t('statEstimatedCost')}
          loading={statsLoading}
          value={stats ? formatUsd(stats.cost.estimated_usd) : '—'}
          hint={t('estimatedCostHint')}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">{t('failedDocsTitle')}</CardTitle>
            {!failedLoading && failedTotal > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('failedDocsHint', {
                  shown: failedDocs.length,
                  total: failedTotal,
                })}
              </p>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={failedLoading}
            onClick={() => void fetchFailedDocs()}
          >
            {t('refreshFailedDocs')}
          </Button>
        </CardHeader>
        <CardContent>
          {failedLoading ? (
            <p className="text-sm text-muted-foreground">{tc('loading')}</p>
          ) : failedDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('failedDocsEmpty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">{t('colFilename')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('colFileType')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('colOwner')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('colStatus')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('colError')}</th>
                    <th className="pb-2 font-medium">{t('colFailedAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {failedDocs.map((doc) => (
                    <tr key={doc.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 font-medium max-w-48 truncate" title={doc.filename}>
                        {doc.filename}
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{doc.file_type}</td>
                      <td className="py-2.5 pr-4">{doc.username}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="destructive">{t('failedStatus')}</Badge>
                      </td>
                      <td
                        className="py-2.5 pr-4 max-w-80 truncate text-muted-foreground"
                        title={doc.error_message ?? undefined}
                      >
                        {doc.error_message || '—'}
                      </td>
                      <td className="py-2.5 text-muted-foreground whitespace-nowrap">
                        {new Date(doc.created_at).toLocaleString(dateLocale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function providerHint(
  status: 'ok' | 'missing_key' | 'error' | 'skipped' | undefined,
  t: (key: string) => string
): string {
  switch (status) {
    case 'ok':
      return t('providerStatusOk')
    case 'missing_key':
      return t('providerStatusMissingKey')
    case 'error':
      return t('providerStatusError')
    default:
      return t('providerStatusEstimate')
  }
}

function StatCard({
  title,
  value,
  hint,
  loading,
}: {
  title: string
  value: string
  hint?: string
  loading?: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {loading ? (
          <div className="h-7 w-20 rounded bg-muted animate-pulse" />
        ) : (
          <p className="text-xl font-semibold tabular-nums">{value}</p>
        )}
        {hint && !loading && (
          <p className="text-[11px] text-muted-foreground mt-1 leading-snug line-clamp-2">{hint}</p>
        )}
      </CardContent>
    </Card>
  )
}
