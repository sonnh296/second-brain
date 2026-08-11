'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { LanguageSwitcher } from '@/components/dashboard/language-switcher'
import { formatBytes, formatTokenCount } from '@/lib/usage/format'
import { formatUsd } from '@/lib/usage/pricing'
import { dateLocaleTag } from '@/i18n/config'
import type { AdminSystemStats } from '@/lib/usage/admin-stats'
import type {
  AdminFailedDocument,
  AdminFailedDocumentsResult,
} from '@/lib/usage/admin-failed-documents'

interface AdminUser {
  id: string
  username: string
  role: 'user' | 'admin'
  created_at: string
  disabled_at: string | null
}

type UserFormMode = 'create' | 'edit'

export default function AdminPage() {
  const t = useTranslations('admin')
  const tc = useTranslations('common')
  const locale = useLocale()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [stats, setStats] = useState<AdminSystemStats | null>(null)
  const [failedDocs, setFailedDocs] = useState<AdminFailedDocument[]>([])
  const [failedTotal, setFailedTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [failedLoading, setFailedLoading] = useState(true)

  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<UserFormMode>('create')
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/users')
    if (res.ok) {
      setUsers(await res.json())
    }
    setLoading(false)
  }, [])

  const fetchStats = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setStatsLoading(true)
    const res = await fetch('/api/admin/stats')
    if (res.ok) {
      setStats(await res.json())
    }
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
    void fetchUsers()
    void fetchStats()
    void fetchFailedDocs()
  }, [fetchUsers, fetchStats, fetchFailedDocs])

  useEffect(() => {
    const id = setInterval(() => {
      void fetchStats({ silent: true })
      void fetchFailedDocs({ silent: true })
    }, 60_000)
    return () => clearInterval(id)
  }, [fetchStats, fetchFailedDocs])

  function openCreate() {
    setFormMode('create')
    setEditingUser(null)
    setUsername('')
    setPassword('')
    setRole('user')
    setFormError('')
    setFormOpen(true)
  }

  function openEdit(u: AdminUser) {
    setFormMode('edit')
    setEditingUser(u)
    setUsername(u.username)
    setPassword('')
    setRole(u.role)
    setFormError('')
    setFormOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError('')

    if (formMode === 'create') {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error ?? tc('error'))
        setSaving(false)
        return
      }
    } else if (editingUser) {
      const body: { role?: 'user' | 'admin'; password?: string } = {}
      if (role !== editingUser.role) body.role = role
      if (password.trim()) body.password = password
      if (Object.keys(body).length === 0) {
        setFormOpen(false)
        setSaving(false)
        return
      }
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error ?? tc('error'))
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setFormOpen(false)
    await fetchUsers()
    await fetchStats()
  }

  async function toggleDisabled(u: AdminUser) {
    const willDisable = !u.disabled_at
    const ok = await confirm({
      title: willDisable ? t('disableTitle') : t('enableTitle'),
      description: willDisable
        ? t('disableDesc', { username: u.username })
        : t('enableDesc', { username: u.username }),
      confirmLabel: willDisable ? t('disable') : t('enable'),
      cancelLabel: tc('cancel'),
      variant: willDisable ? 'destructive' : 'default',
    })
    if (!ok) return

    setActionError('')
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: willDisable }),
    })
    const data = await res.json()
    if (!res.ok) {
      setActionError(data.error ?? tc('error'))
      return
    }
    await fetchUsers()
    await fetchStats()
  }

  const dateLocale = dateLocaleTag(locale)

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
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
          <Button type="button" onClick={openCreate}>
            {t('addUser')}
          </Button>
        </div>
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

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('userList')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{tc('loading')}</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noUsers')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">{t('colUsername')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('colRole')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('colStatus')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('colCreated')}</th>
                    <th className="pb-2 font-medium">{t('colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 font-medium">{u.username}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                          {u.role === 'admin' ? 'Admin' : 'User'}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={u.disabled_at ? 'destructive' : 'secondary'}>
                          {u.disabled_at ? t('disabled') : t('active')}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">
                        {new Date(u.created_at).toLocaleString(dateLocale)}
                      </td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => openEdit(u)}
                          >
                            {t('editUser')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={u.disabled_at ? 'default' : 'destructive'}
                            className="h-7 text-xs"
                            onClick={() => void toggleDisabled(u)}
                          >
                            {u.disabled_at ? t('enable') : t('disable')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={formOpen}
        title={
          formMode === 'create'
            ? t('createTitle')
            : t('editTitle', { username: editingUser?.username ?? '' })
        }
        onClose={() => !saving && setFormOpen(false)}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => setFormOpen(false)}
            >
              {tc('cancel')}
            </Button>
            <Button type="submit" form="admin-user-form" size="sm" disabled={saving}>
              {saving
                ? t('saving')
                : formMode === 'create'
                  ? t('createAccount')
                  : t('saveChanges')}
            </Button>
          </>
        }
      >
        <form id="admin-user-form" onSubmit={handleSubmit} className="space-y-4">
          {formMode === 'create' && (
            <div className="space-y-2">
              <Label htmlFor="new-username">{t('username')}</Label>
              <Input
                id="new-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('usernamePlaceholder')}
                pattern="[a-z0-9_]{3,32}"
                required
              />
              <p className="text-xs text-muted-foreground">{t('usernameHint')}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-password">
              {formMode === 'create' ? t('password') : t('passwordOptional')}
            </Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={formMode === 'create' ? 6 : undefined}
              required={formMode === 'create'}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-role">{t('role')}</Label>
            <select
              id="new-role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'user' | 'admin')}
              className="w-full text-sm rounded-md border border-input bg-background px-3 py-2"
            >
              <option value="user">{t('roleUser')}</option>
              <option value="admin">{t('roleAdmin')}</option>
            </select>
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </form>
      </Dialog>
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
