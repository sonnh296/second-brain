'use client'

import { useTranslations } from 'next-intl'
import type { Tag } from '@/lib/db/types'

type ChatTagScopeProps = {
  readonly tags: Tag[]
  readonly selectedTagIds: string[]
  readonly onChange: (tagIds: string[]) => void
  readonly disabled?: boolean
}

export function ChatTagScope({
  tags,
  selectedTagIds,
  onChange,
  disabled = false,
}: ChatTagScopeProps) {
  const t = useTranslations('chat')
  const selected = new Set(selectedTagIds)

  function toggle(tagId: string) {
    if (disabled) return
    if (selected.has(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId))
    } else {
      onChange([...selectedTagIds, tagId])
    }
  }

  if (tags.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-0.5">{t('scopeNoTags')}</p>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t('scopeByTag')}</span>
        {selectedTagIds.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange([])}
            className="text-xs text-primary hover:underline disabled:opacity-50"
          >
            {t('scopeAll')}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
        {tags.map((tag) => {
          const active = selected.has(tag.id)
          return (
            <button
              key={tag.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(tag.id)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
                active
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-input bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: tag.color }}
                aria-hidden
              />
              <span className="truncate max-w-32">{tag.name}</span>
            </button>
          )
        })}
      </div>
      {selectedTagIds.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {t('scopeActive', { count: selectedTagIds.length })}
        </p>
      )}
    </div>
  )
}
