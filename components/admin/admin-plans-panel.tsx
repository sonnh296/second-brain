'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { formatBytes } from '@/lib/usage/format'
import type { SubscriptionPlan } from '@/lib/plans/types'

type FormState = {
  slug: string
  name: string
  description: string
  price_display: string
  price_monthly_vnd: string
  storage_gb: string
  documents_limit: string
  featuresText: string
  sort_order: string
  is_active: boolean
}

const emptyForm = (): FormState => ({
  slug: '',
  name: '',
  description: '',
  price_display: 'Liên hệ',
  price_monthly_vnd: '0',
  storage_gb: '',
  documents_limit: '',
  featuresText: '',
  sort_order: '0',
  is_active: true,
})

function planToForm(p: SubscriptionPlan): FormState {
  return {
    slug: p.slug,
    name: p.name,
    description: p.description ?? '',
    price_display: p.price_display,
    price_monthly_vnd: String(p.price_monthly_vnd ?? 0),
    storage_gb:
      p.storage_limit_bytes != null
        ? String(Math.round((p.storage_limit_bytes / (1024 ** 3)) * 100) / 100)
        : '',
    documents_limit: p.documents_limit != null ? String(p.documents_limit) : '',
    featuresText: p.features.join('\n'),
    sort_order: String(p.sort_order ?? 0),
    is_active: p.is_active,
  }
}

export function AdminPlansPanel() {
  const t = useTranslations('admin')
  const tc = useTranslations('common')
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/plans')
    const data = await res.json().catch(() => ([]))
    if (!res.ok) {
      setError(data.error ?? t('plansLoadError'))
      setPlans([])
      setLoading(false)
      return
    }
    setPlans(data as SubscriptionPlan[])
    setLoading(false)
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setFormError('')
    setFormOpen(true)
  }

  function openEdit(p: SubscriptionPlan) {
    setEditing(p)
    setForm(planToForm(p))
    setFormError('')
    setFormOpen(true)
  }

  function buildPayload() {
    const storageGb = form.storage_gb.trim()
    const docs = form.documents_limit.trim()
    return {
      slug: form.slug.trim().toLowerCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      price_display: form.price_display.trim(),
      price_monthly_vnd: Number(form.price_monthly_vnd) || 0,
      storage_limit_bytes: storageGb
        ? Math.round(Number(storageGb) * 1024 ** 3)
        : null,
      documents_limit: docs ? Number(docs) : null,
      features: form.featuresText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    const payload = buildPayload()
    const res = editing
      ? await fetch(`/api/admin/plans/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/admin/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setFormError(data.error ?? tc('error'))
      return
    }
    setFormOpen(false)
    await load()
  }

  async function handleDelete(p: SubscriptionPlan) {
    const ok = await confirm({
      title: t('planDeleteTitle'),
      description: t('planDeleteDesc', { name: p.name }),
      confirmLabel: t('planDelete'),
      cancelLabel: tc('cancel'),
      variant: 'destructive',
    })
    if (!ok) return
    const res = await fetch(`/api/admin/plans/${p.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? tc('error'))
      return
    }
    await load()
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('plansTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('plansSubtitle')}</p>
        </div>
        <Button type="button" onClick={openCreate}>
          {t('planAdd')}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">{t('plansEmpty')}</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {plans.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {p.name}
                      <Badge variant={p.is_active ? 'default' : 'secondary'}>
                        {p.is_active ? t('planActive') : t('planInactive')}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {p.slug} · {p.price_display}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {p.description && (
                  <p className="text-muted-foreground leading-relaxed">{p.description}</p>
                )}
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>
                    {t('planStorage')}:{' '}
                    {p.storage_limit_bytes != null ? formatBytes(p.storage_limit_bytes) : '—'}
                  </li>
                  <li>
                    {t('planDocs')}: {p.documents_limit ?? '—'}
                  </li>
                </ul>
                {p.features.length > 0 && (
                  <ul className="list-disc pl-4 text-xs space-y-0.5">
                    {p.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2 pt-1">
                  <Button type="button" size="sm" variant="outline" onClick={() => openEdit(p)}>
                    {t('editUser')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => void handleDelete(p)}
                  >
                    {t('planDelete')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={formOpen}
        title={editing ? t('planEditTitle', { name: editing.name }) : t('planCreateTitle')}
        onClose={() => !saving && setFormOpen(false)}
        maxWidth="max-w-lg"
        footer={
          <>
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setFormOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" form="admin-plan-form" size="sm" disabled={saving}>
              {saving ? t('saving') : tc('save')}
            </Button>
          </>
        }
      >
        <form id="admin-plan-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan-slug">{t('planSlug')}</Label>
              <Input
                id="plan-slug"
                value={form.slug}
                disabled={Boolean(editing)}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                required
                pattern="[a-z0-9_-]{2,40}"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-name">{t('planName')}</Label>
              <Input
                id="plan-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-desc">{t('planDescription')}</Label>
            <Input
              id="plan-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan-price-display">{t('planPriceDisplay')}</Label>
              <Input
                id="plan-price-display"
                value={form.price_display}
                onChange={(e) => setForm((f) => ({ ...f, price_display: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-price-vnd">{t('planPriceVnd')}</Label>
              <Input
                id="plan-price-vnd"
                type="number"
                min={0}
                value={form.price_monthly_vnd}
                onChange={(e) => setForm((f) => ({ ...f, price_monthly_vnd: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan-storage">{t('planStorageGb')}</Label>
              <Input
                id="plan-storage"
                type="number"
                min={0}
                step="0.1"
                value={form.storage_gb}
                onChange={(e) => setForm((f) => ({ ...f, storage_gb: e.target.value }))}
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-docs">{t('planDocs')}</Label>
              <Input
                id="plan-docs"
                type="number"
                min={0}
                value={form.documents_limit}
                onChange={(e) => setForm((f) => ({ ...f, documents_limit: e.target.value }))}
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-sort">{t('planSort')}</Label>
              <Input
                id="plan-sort"
                type="number"
                min={0}
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-features">{t('planFeatures')}</Label>
            <textarea
              id="plan-features"
              value={form.featuresText}
              onChange={(e) => setForm((f) => ({ ...f, featuresText: e.target.value }))}
              rows={4}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder={t('planFeaturesHint')}
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            {t('planActive')}
          </label>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </form>
      </Dialog>
    </div>
  )
}
