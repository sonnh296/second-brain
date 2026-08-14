'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Folder, MoreVertical, Pencil } from 'lucide-react'
import type { Folder as FolderType } from '@/lib/db/types'

function FolderBusyOverlay({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-background/85 backdrop-blur-[1px]"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-1.5 px-2">
        <div
          className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin"
          aria-hidden
        />
        <span className="text-[10px] text-muted-foreground text-center leading-tight">{label}</span>
      </div>
    </div>
  )
}

export function FolderGridItem({
  folder,
  onOpen,
  onRename,
  onDelete,
  busy,
  busyLabel = 'Đang xóa...',
}: {
  folder: FolderType
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
  busy?: boolean
  busyLabel?: string
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const t = useTranslations('documents')

  return (
    <div
      className={`group relative rounded-xl border bg-card p-3 cursor-pointer transition-all hover:shadow-md hover:border-amber-500/40 ${
        busy ? 'pointer-events-none opacity-90' : ''
      }`}
      onClick={busy ? undefined : onOpen}
    >
      {busy && <FolderBusyOverlay label={busyLabel} />}
      <div className="flex flex-col items-center text-center gap-2">
        <Folder className="h-10 w-10" style={{ color: folder.color }} />
        <p className="text-xs font-medium line-clamp-2 w-full leading-snug">{folder.name}</p>
        {folder.description && (
          <p className="text-[10px] text-muted-foreground line-clamp-2 w-full">{folder.description}</p>
        )}
      </div>
      <button
        type="button"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted cursor-pointer"
        onClick={(e) => {
          e.stopPropagation()
          setMenuOpen(!menuOpen)
        }}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
      {menuOpen && (
        <div
          className="absolute top-8 right-2 z-10 bg-popover border rounded-md shadow-md py-1 min-w-[100px]"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted cursor-pointer"
            onClick={() => {
              setMenuOpen(false)
              onRename()
            }}
          >
            <Pencil className="h-3 w-3" />
            {t('renameFolder')}
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs text-destructive hover:bg-muted cursor-pointer"
            onClick={() => {
              setMenuOpen(false)
              onDelete()
            }}
          >
            Xóa
          </button>
        </div>
      )}
    </div>
  )
}

export function FolderListItem({
  folder,
  onOpen,
  onRename,
  onDelete,
  busy,
  busyLabel = 'Đang xóa...',
}: {
  folder: FolderType
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
  busy?: boolean
  busyLabel?: string
}) {
  const t = useTranslations('documents')

  return (
    <div
      className={`relative flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors hover:bg-muted/50 bg-card ${
        busy ? 'pointer-events-none opacity-90' : ''
      }`}
      onClick={busy ? undefined : onOpen}
    >
      {busy && <FolderBusyOverlay label={busyLabel} />}
      <Folder className="h-8 w-8 shrink-0" style={{ color: folder.color }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{folder.name}</p>
        {folder.description && (
          <p className="text-xs text-muted-foreground truncate">{folder.description}</p>
        )}
      </div>
      <button
        type="button"
        className="text-xs hover:underline shrink-0 cursor-pointer"
        onClick={(e) => {
          e.stopPropagation()
          onRename()
        }}
      >
        {t('renameFolder')}
      </button>
      <button
        type="button"
        className="text-xs text-destructive hover:underline shrink-0 cursor-pointer"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        Xóa
      </button>
    </div>
  )
}

interface FolderBreadcrumbProps {
  items: { id: string | null; name: string }[]
  onNavigate: (folderId: string | null) => void
}

export function FolderBreadcrumb({ items, onNavigate }: FolderBreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-sm flex-wrap">
      {items.map((item, i) => (
        <span key={item.id ?? 'root'} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground">/</span>}
          <button
            type="button"
            onClick={() => onNavigate(item.id)}
            className={`hover:underline cursor-pointer ${
              i === items.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground'
            }`}
          >
            {item.name}
          </button>
        </span>
      ))}
    </nav>
  )
}

interface FolderPickerProps {
  folders: FolderType[]
  value: string | null
  onChange: (folderId: string | null) => void
}

export function FolderPicker({ folders, value, onChange }: FolderPickerProps) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">Thư mục</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="mt-1 w-full text-xs rounded-md border border-input bg-background px-2 py-1.5"
      >
        <option value="">Gốc (không có thư mục)</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </div>
  )
}
