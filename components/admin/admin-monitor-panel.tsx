'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { DeepHealthReport, HealthCheckResult } from '@/lib/health/checks'

export function AdminMonitorPanel() {
  const t = useTranslations('admin')
  const tc = useTranslations('common')
  const [report, setReport] = useState<DeepHealthReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [checkedAt, setCheckedAt] = useState<string | null>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    setError('')
    const res = await fetch('/api/admin/health')
    const data = await res.json().catch(() => ({}))
    if (!res.ok && !data.checks) {
      setError(data.error ?? t('monitorLoadError'))
      if (!opts?.silent) setLoading(false)
      return
    }
    setReport(data as DeepHealthReport)
    setCheckedAt(new Date().toISOString())
    if (!opts?.silent) setLoading(false)
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const id = setInterval(() => void load({ silent: true }), 30_000)
    return () => clearInterval(id)
  }, [load])

  const checks = report ? Object.entries(report.checks) : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('monitorTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('monitorSubtitle')}</p>
        </div>
        <Button type="button" variant="outline" disabled={loading} onClick={() => void load()}>
          {t('monitorRefresh')}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">{t('monitorStatus')}</CardTitle>
          {report && (
            <Badge variant={report.status === 'healthy' ? 'default' : 'destructive'}>
              {report.status === 'healthy' ? t('monitorHealthy') : t('monitorDegraded')}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {loading && !report ? (
            <p className="text-sm text-muted-foreground">{tc('loading')}</p>
          ) : (
            <div className="space-y-3">
              {checkedAt && (
                <p className="text-xs text-muted-foreground">
                  {t('monitorCheckedAt', { time: new Date(checkedAt).toLocaleString() })}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {checks.map(([name, result]) => (
                  <CheckCard key={name} name={name} result={result} t={t} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CheckCard({
  name,
  result,
  t,
}: {
  name: string
  result: HealthCheckResult
  t: (key: string) => string
}) {
  const label =
    name === 'postgres'
      ? t('monitorPostgres')
      : name === 'redis'
        ? t('monitorRedis')
        : name === 'qdrant'
          ? t('monitorQdrant')
          : name

  return (
    <div className="rounded-lg border px-3 py-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <Badge variant={result.ok ? 'secondary' : 'destructive'}>
          {result.ok ? 'OK' : 'FAIL'}
        </Badge>
      </div>
      {result.latency_ms != null && (
        <p className="text-xs text-muted-foreground tabular-nums">{result.latency_ms} ms</p>
      )}
      {result.error && (
        <p className="text-xs text-destructive break-words">{result.error}</p>
      )}
    </div>
  )
}
