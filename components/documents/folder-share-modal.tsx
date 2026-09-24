'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Share2, Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '@/components/ui/dialog'
import type { Folder } from '@/lib/db/types'

type ShareRow = {
  id: string
  grantee_id: string
  grantee_username: string | null
  permission: string
  created_at: string
}

export function FolderShareModal({
  folder,
  open,
  onClose,
}: {
  folder: Folder | null
  open: boolean
  onClose: () => void
}) {
  const t = useTranslations('documents')
  const [shares, setShares] = useState<ShareRow[]>([])
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const loadShares = useCallback(async () => {
    if (!folder) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/folders/${folder.id}/shares`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : t('shareLoadFailed'))
        setShares([])
        return
      }
      setShares((data.shares ?? []) as ShareRow[])
    } finally {
      setLoading(false)
    }
  }, [folder, t])

  useEffect(() => {
    if (!open || !folder) return
    setIdentifier('')
    setError('')
    void loadShares()
  }, [open, folder, loadShares])

  async function invite() {
    if (!folder || !identifier.trim()) return
    setInviting(true)
    setError('')
    try {
      const res = await fetch(`/api/folders/${folder.id}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : t('shareInviteFailed'))
        return
      }
      setIdentifier('')
      await loadShares()
    } finally {
      setInviting(false)
    }
  }

  async function revoke(shareId: string) {
    if (!folder) return
    setRevokingId(shareId)
    setError('')
    try {
      const res = await fetch(`/api/folders/${folder.id}/shares/${shareId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(typeof data.error === 'string' ? data.error : t('shareRevokeFailed'))
        return
      }
      setShares((prev) => prev.filter((s) => s.id !== shareId))
    } finally {
      setRevokingId(null)
    }
  }

  if (!folder) return null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('shareFolderTitle', { name: folder.name })}
    >
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">{t('shareFolderHint')}</p>

        <div className="space-y-1.5">
          <Label htmlFor="share-identifier">{t('shareIdentifier')}</Label>
          <div className="flex gap-2">
            <Input
              id="share-identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={t('shareIdentifierPlaceholder')}
              disabled={inviting}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void invite()
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              disabled={inviting || !identifier.trim()}
              onClick={() => void invite()}
              className="shrink-0"
            >
              {inviting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              <span className="ml-1.5 hidden sm:inline">{t('shareInvite')}</span>
            </Button>
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Share2 className="h-3.5 w-3.5" />
            {t('shareListTitle')}
          </div>
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : shares.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{t('shareListEmpty')}</p>
          ) : (
            <ul className="divide-y rounded-md border max-h-48 overflow-y-auto">
              {shares.map((share) => (
                <li
                  key={share.id}
                  className="flex items-center gap-2 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {share.grantee_username || share.grantee_id.slice(0, 8)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{t('sharePermissionViewer')}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-destructive"
                    disabled={revokingId === share.id}
                    onClick={() => void revoke(share.id)}
                    aria-label={t('shareRevoke')}
                  >
                    {revokingId === share.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('shareClose')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
