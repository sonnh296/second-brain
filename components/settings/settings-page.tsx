'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { User } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '@/components/ui/dialog'
import { ChangePasswordForm } from '@/components/auth/change-password-form'
import { formatBytes, formatTokenCount } from '@/lib/usage/format'
import type { ProfileStats } from '@/lib/usage/types'
import type { SubscriptionPlan } from '@/lib/plans/types'
import Link from 'next/link'
import { writeCachedAvatar } from '@/components/dashboard/header-actions'

type TabId = 'account' | 'personalization' | 'plan'

const PURPOSE_LABELS: Record<string, string> = {
  chat: 'Chat AI',
  title: 'Đặt tên chat',
  embedding_query: 'Embedding (truy vấn)',
  embedding_ingest: 'Embedding (xử lý tài liệu)',
}

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>
          {formatBytes(used)} / {formatBytes(limit)} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-amber-500' : 'bg-primary'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function TokenStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold tabular-nums mt-0.5">{formatTokenCount(value)}</p>
    </div>
  )
}

function parseTab(raw: string | null): TabId {
  if (raw === 'personalization' || raw === 'plan' || raw === 'account') return raw
  return 'account'
}

export function SettingsPage() {
  const t = useTranslations('settings')
  const tc = useTranslations('common')
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = parseTab(searchParams.get('tab'))

  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameMsg, setNameMsg] = useState('')
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarVersion, setAvatarVersion] = useState(0)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [consentOpen, setConsentOpen] = useState(false)
  const [whatIsOpen, setWhatIsOpen] = useState(false)
  const [personalizationBusy, setPersonalizationBusy] = useState(false)
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/profile')
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? t('loadError'))
      setLoading(false)
      return
    }
    const profile = data as ProfileStats
    setStats(profile)
    setDisplayName(profile.display_name ?? '')
    setLoading(false)
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (tab !== 'plan') return
    let cancelled = false
    setPlansLoading(true)
    void fetch('/api/plans')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled) setPlans(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) setPlans([])
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tab])

  function setTab(next: TabId) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', next)
    router.replace(`/settings?${params.toString()}`)
  }

  const tabs = useMemo(
    () =>
      [
        { id: 'account' as const, label: t('tabAccount') },
        { id: 'personalization' as const, label: t('tabPersonalization') },
        { id: 'plan' as const, label: t('tabPlan') },
      ] as const,
    [t]
  )

  async function saveDisplayName() {
    setSavingName(true)
    setNameMsg('')
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: displayName.trim() || null }),
    })
    const data = await res.json().catch(() => ({}))
    setSavingName(false)
    if (!res.ok) {
      setNameMsg(data.error ?? t('saveError'))
      return
    }
    setStats(data as ProfileStats)
    setNameMsg(t('saved'))
  }

  async function onAvatarSelected(file: File | null) {
    if (!file) return
    setAvatarBusy(true)
    setNameMsg('')
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/profile/avatar', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    setAvatarBusy(false)
    if (!res.ok) {
      setNameMsg(data.error ?? t('avatarError'))
      return
    }
    const nextUrl =
      typeof data.avatar_url === 'string'
        ? data.avatar_url
        : `/api/profile/avatar?cb=${Date.now()}`
    writeCachedAvatar(nextUrl)
    await load()
    setAvatarVersion(Date.now())
  }

  async function removeAvatar() {
    setAvatarBusy(true)
    const res = await fetch('/api/profile/avatar', { method: 'DELETE' })
    setAvatarBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setNameMsg(data.error ?? t('avatarError'))
      return
    }
    writeCachedAvatar(null)
    await load()
    setAvatarVersion(Date.now())
  }

  async function setPersonalization(enabled: boolean) {
    setPersonalizationBusy(true)
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personalization_enabled: enabled }),
    })
    const data = await res.json().catch(() => ({}))
    setPersonalizationBusy(false)
    setConsentOpen(false)
    if (!res.ok) {
      setError(data.error ?? t('saveError'))
      return
    }
    setStats(data as ProfileStats)
  }

  const avatarSrc = stats?.avatar_url
    ? `${stats.avatar_url}${stats.avatar_url.includes('?') ? '&' : '?'}cb=${avatarVersion}`
    : null

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>

        <div className="flex gap-1 border-b overflow-x-auto" role="tablist">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`shrink-0 px-3 py-2 text-sm border-b-2 -mb-px transition-colors cursor-pointer ${
                tab === item.id
                  ? 'border-foreground text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {tab === 'account' && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('accountCard')}</CardTitle>
                <CardDescription>{t('accountCardDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-16 rounded-full border bg-muted overflow-hidden flex items-center justify-center shrink-0">
                    {avatarSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-7 w-7 text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        void onAvatarSelected(e.target.files?.[0] ?? null)
                        e.target.value = ''
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={avatarBusy || loading}
                        onClick={() => fileRef.current?.click()}
                      >
                        {avatarBusy ? t('uploading') : t('changeAvatar')}
                      </Button>
                      {stats?.avatar_url && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={avatarBusy}
                          onClick={() => void removeAvatar()}
                        >
                          {t('removeAvatar')}
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{t('avatarHint')}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="display-name">{t('displayName')}</Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      id="display-name"
                      value={displayName}
                      maxLength={80}
                      placeholder={stats?.username ?? ''}
                      disabled={loading || savingName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={loading || savingName}
                      onClick={() => void saveDisplayName()}
                    >
                      {savingName ? tc('loading') : tc('save')}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('usernameLabel')}: @{stats?.username ?? '…'}
                    {stats?.role === 'admin' ? ' · Admin' : ''}
                  </p>
                  {nameMsg && <p className="text-xs text-muted-foreground">{nameMsg}</p>}
                </div>
              </CardContent>
            </Card>

            {loading && (
              <p className="text-sm text-muted-foreground" aria-busy="true">
                {tc('loading')}
              </p>
            )}

            {!loading && stats && (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t('storage')}</CardTitle>
                    <CardDescription>{t('storageDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <UsageBar
                      used={stats.storage.total_bytes}
                      limit={stats.storage.limit_bytes}
                      label={t('storageUsed')}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                      <div className="rounded-lg border px-3 py-2">
                        <p className="text-xs text-muted-foreground">{t('docs')}</p>
                        <p className="font-medium mt-0.5">
                          {formatBytes(stats.storage.documents_bytes)}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {stats.storage.documents_count} / {stats.storage.documents_limit} file
                        </p>
                      </div>
                      <div className="rounded-lg border px-3 py-2">
                        <p className="text-xs text-muted-foreground">{t('trash')}</p>
                        <p className="font-medium mt-0.5">{formatBytes(stats.storage.trash_bytes)}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {stats.storage.trash_count} {t('items')}
                        </p>
                      </div>
                      <div className="rounded-lg border px-3 py-2">
                        <p className="text-xs text-muted-foreground">{t('chatImages')}</p>
                        <p className="font-medium mt-0.5">
                          {formatBytes(stats.storage.attachments_bytes)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t('tokens')}</CardTitle>
                    <CardDescription>{t('tokensDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        {t('last30')}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <TokenStat label="Input" value={stats.tokens.last_30_days.input_tokens} />
                        <TokenStat label="Output" value={stats.tokens.last_30_days.output_tokens} />
                        <TokenStat label={t('total')} value={stats.tokens.last_30_days.total_tokens} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        {t('allTime')}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <TokenStat label="Input" value={stats.tokens.all_time.input_tokens} />
                        <TokenStat label="Output" value={stats.tokens.all_time.output_tokens} />
                        <TokenStat label={t('total')} value={stats.tokens.all_time.total_tokens} />
                      </div>
                    </div>
                    {stats.tokens.by_purpose.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          {t('byPurpose')}
                        </p>
                        <div className="rounded-lg border divide-y">
                          {stats.tokens.by_purpose.map((row) => (
                            <div
                              key={row.purpose}
                              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                            >
                              <div className="min-w-0">
                                <p className="font-medium truncate">
                                  {PURPOSE_LABELS[row.purpose] ?? row.purpose}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {row.requests} {t('requests')}
                                </p>
                              </div>
                              <p className="font-medium tabular-nums shrink-0">
                                {formatTokenCount(row.total_tokens)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('password')}</CardTitle>
                <CardDescription>{t('passwordDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowPasswordDialog(true)}
                >
                  {t('changePassword')}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'personalization' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('personalizationTitle')}</CardTitle>
              <CardDescription>{t('personalizationDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border px-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t('personalizationToggle')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {stats?.personalization_enabled
                      ? t('personalizationOn')
                      : t('personalizationOff')}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={stats?.personalization_enabled ? 'outline' : 'default'}
                  disabled={loading || personalizationBusy}
                  onClick={() => {
                    if (stats?.personalization_enabled) {
                      void setPersonalization(false)
                    } else {
                      setConsentOpen(true)
                    }
                  }}
                >
                  {stats?.personalization_enabled ? t('turnOff') : t('turnOn')}
                </Button>
              </div>

              <div className="rounded-lg border bg-muted/30 px-3 py-3 text-sm text-muted-foreground leading-relaxed">
                {t('consentSummary')}
              </div>

              <Button type="button" size="sm" variant="ghost" onClick={() => setWhatIsOpen(true)}>
                {t('whatIsThis')}
              </Button>
            </CardContent>
          </Card>
        )}

        {tab === 'plan' && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('planTitle')}</CardTitle>
                <CardDescription>{t('planDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {plansLoading ? (
                  <p className="text-sm text-muted-foreground">{tc('loading')}</p>
                ) : plans.length === 0 ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">{t('planBody')}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {plans.map((p) => (
                      <div key={p.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="font-medium text-sm">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.price_display}</p>
                        </div>
                        {p.description && (
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {p.description}
                          </p>
                        )}
                        {p.features.length > 0 && (
                          <ul className="list-disc pl-4 text-xs space-y-0.5 text-muted-foreground">
                            {p.features.slice(0, 6).map((f) => (
                              <li key={f}>{f}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/contact"
                    className="inline-flex h-7 items-center rounded-lg bg-primary px-2.5 text-[0.8rem] font-medium text-primary-foreground hover:bg-primary/80"
                  >
                    {t('contactSales')}
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {showPasswordDialog && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowPasswordDialog(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowPasswordDialog(false)
          }}
        >
          <Card className="w-full max-w-sm shadow-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('password')}</CardTitle>
              <CardDescription>{t('passwordDialogDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm
                onClose={() => setShowPasswordDialog(false)}
                onSuccess={() => {
                  setTimeout(() => setShowPasswordDialog(false), 1200)
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog
        open={consentOpen}
        title={t('consentTitle')}
        onClose={() => setConsentOpen(false)}
        maxWidth="max-w-lg"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setConsentOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              type="button"
              disabled={personalizationBusy}
              onClick={() => void setPersonalization(true)}
            >
              {t('consentAccept')}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>{t('consentP1')}</p>
          <p>{t('consentP2')}</p>
          <p>{t('consentP3')}</p>
        </div>
      </Dialog>

      <Dialog
        open={whatIsOpen}
        title={t('whatIsTitle')}
        onClose={() => setWhatIsOpen(false)}
        maxWidth="max-w-2xl"
        footer={
          <Button type="button" variant="outline" onClick={() => setWhatIsOpen(false)}>
            {tc('close')}
          </Button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg border p-3 space-y-2">
            <p className="font-medium text-foreground">{t('withTitle')}</p>
            <p className="text-muted-foreground leading-relaxed">{t('withBody')}</p>
            <p className="text-xs rounded-md bg-muted/60 px-2 py-1.5 text-muted-foreground italic">
              {t('withExample')}
            </p>
          </div>
          <div className="rounded-lg border p-3 space-y-2">
            <p className="font-medium text-foreground">{t('withoutTitle')}</p>
            <p className="text-muted-foreground leading-relaxed">{t('withoutBody')}</p>
            <p className="text-xs rounded-md bg-muted/60 px-2 py-1.5 text-muted-foreground italic">
              {t('withoutExample')}
            </p>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
