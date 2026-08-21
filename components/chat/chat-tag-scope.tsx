'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
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
  const [expanded, setExpanded] = useState(false)
  const selected = new Set(selectedTagIds)
  const selectedTags = tags.filter((tag) => selected.has(tag.id))

  function toggle(tagId: string) {
    if (disabled) return
    if (selected.has(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId))
    } else {
      onChange([...selectedTagIds, tagId])
    }
  }

  const summary =
    selectedTags.length === 0
      ? t('scopeCollapsedAll')
      : selectedTags.length <= 2
        ? selectedTags.map((tag) => tag.name).join(', ')
        : t('scopeActive', { count: selectedTags.length })

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
        <span className="text-muted-foreground shrink-0">{t('scopeByTag')}</span>
        <span
          className={`min-w-0 truncate ${
            selectedTags.length > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'
          }`}
        >
          {summary}
        </span>
        {selectedTagIds.length > 0 && !expanded && (
          <span
            className="ml-auto shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary"
            aria-hidden
          >
            {selectedTagIds.length}
          </span>
        )}
      </button>

      {expanded && (
        <>
          {tags.length === 0 ? (
            <p className="text-xs text-muted-foreground px-0.5">{t('scopeNoTags')}</p>
          ) : (
            <>
              <div className="flex items-center justify-end gap-2">
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
            </>
          )}
        </>
      )}
    </div>
  )
}
