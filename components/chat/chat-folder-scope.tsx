'use client'

import { useState } from 'react'
import { ChevronDown, Folder } from 'lucide-react'
import { useTranslations } from 'next-intl'

export type ChatFolderOption = {
  id: string
  name: string
  shared?: boolean
  sharedBy?: string | null
}

type ChatFolderScopeProps = {
  readonly folders: ChatFolderOption[]
  readonly selectedFolderId: string | null
  readonly onChange: (folderId: string | null) => void
  readonly disabled?: boolean
}

export function ChatFolderScope({
  folders,
  selectedFolderId,
  onChange,
  disabled = false,
}: ChatFolderScopeProps) {
  const t = useTranslations('chat')
  const [expanded, setExpanded] = useState(false)
  const selected = folders.find((f) => f.id === selectedFolderId) ?? null

  const owned = folders.filter((f) => !f.shared)
  const shared = folders.filter((f) => f.shared)

  const summary = selected
    ? selected.shared && selected.sharedBy
      ? `${selected.name} (${selected.sharedBy})`
      : selected.name
    : t('scopeFolderAll')

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-0.5 py-0.5 text-left text-xs transition-colors hover:bg-muted/60 disabled:opacity-50"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
            expanded ? 'rotate-0' : '-rotate-90'
          }`}
          aria-hidden
        />
        <span className="text-muted-foreground shrink-0">{t('scopeByFolder')}</span>
        <span
          className={`min-w-0 truncate ${
            selected ? 'text-foreground font-medium' : 'text-muted-foreground'
          }`}
        >
          {summary}
        </span>
      </button>

      {expanded && (
        <>
          <p className="text-[10px] text-muted-foreground px-0.5">{t('scopeFolderHint')}</p>
          <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(null)}
              aria-pressed={!selectedFolderId}
              className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs text-left transition-colors disabled:opacity-50 ${
                !selectedFolderId
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-input bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              {t('scopeFolderAll')}
            </button>

            {owned.length > 0 && (
              <div className="space-y-1">
                {owned.map((folder) => {
                  const active = selectedFolderId === folder.id
                  return (
                    <button
                      key={folder.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange(folder.id)}
                      aria-pressed={active}
                      className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-xs text-left transition-colors disabled:opacity-50 ${
                        active
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-input bg-background text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{folder.name}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {shared.length > 0 && (
              <div className="space-y-1 pt-1 border-t">
                <p className="text-[10px] text-muted-foreground px-0.5">
                  {t('scopeFolderShared')}
                </p>
                {shared.map((folder) => {
                  const active = selectedFolderId === folder.id
                  return (
                    <button
                      key={folder.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange(folder.id)}
                      aria-pressed={active}
                      className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-xs text-left transition-colors disabled:opacity-50 ${
                        active
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-input bg-background text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0 truncate">
                        {folder.name}
                        {folder.sharedBy ? (
                          <span className="text-muted-foreground"> · {folder.sharedBy}</span>
                        ) : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
