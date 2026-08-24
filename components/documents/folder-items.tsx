'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Folder, MoreVertical, Pencil } from 'lucide-react'
import type { Folder as FolderType } from '@/lib/db/types'
import { useLongPressSelect } from '@/hooks/use-long-press-select'
import {
  LIBRARY_DOC_DRAG_TYPE,
  endLibraryDocDrag,
  isLibraryDocDrag,
  readLibraryDocIds,
} from '@/lib/documents/library-drag'

// ─── drag types ──────────────────────────────────────────────────────────────

export const LIBRARY_FOLDER_DRAG_TYPE = 'application/x-second-brain-folders'

let draggingFolderIds: string[] = []

export function beginLibraryFolderDrag(ids: string[], dt: DataTransfer) {
  draggingFolderIds = [...ids]
  const payload = JSON.stringify(ids)
  try {
    dt.setData(LIBRARY_FOLDER_DRAG_TYPE, payload)
  } catch {
    /* some browsers reject custom types */
  }
  dt.setData('text/plain', payload)
  dt.effectAllowed = 'move'
}

export function endLibraryFolderDrag() {
  draggingFolderIds = []
}

function isLibraryFolderDrag(dt: DataTransfer) {
  if (draggingFolderIds.length > 0) return true
  return Array.from(dt.types).includes(LIBRARY_FOLDER_DRAG_TYPE)
}

function readLibraryFolderIds(dt: DataTransfer): string[] {
  if (draggingFolderIds.length > 0) return [...draggingFolderIds]
  const raw = dt.getData(LIBRARY_FOLDER_DRAG_TYPE)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string')
  } catch {
    return []
  }
}

// ─── drop zone hook (accepts both docs and folders) ──────────────────────────

function useFolderDropZone(
  folderId: string,
  targetFolderId: string,
  onDropDocs?: (folderId: string, docIds: string[]) => void,
  onDropFolders?: (targetFolderId: string, folderIds: string[]) => void,
) {
  const [dragOver, setDragOver] = useState(false)
  const enterCount = useRef(0)

  function isRelevantDrag(dt: DataTransfer) {
    return isLibraryDocDrag(dt) || isLibraryFolderDrag(dt)
  }

  function onDragEnter(e: React.DragEvent) {
    if (!isRelevantDrag(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    enterCount.current += 1
    setDragOver(true)
  }

  function onDragOver(e: React.DragEvent) {
    if (!isRelevantDrag(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }

  function onDragLeave() {
    enterCount.current = Math.max(0, enterCount.current - 1)
    if (enterCount.current === 0) setDragOver(false)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    enterCount.current = 0
    setDragOver(false)

    if (isLibraryFolderDrag(e.dataTransfer)) {
      const ids = readLibraryFolderIds(e.dataTransfer)
      endLibraryFolderDrag()
      // Prevent dropping a folder onto itself.
      const valid = ids.filter((id) => id !== targetFolderId)
      if (valid.length > 0) onDropFolders?.(targetFolderId, valid)
      return
    }

    if (isLibraryDocDrag(e.dataTransfer)) {
      const ids = readLibraryDocIds(e.dataTransfer)
      endLibraryDocDrag()
      if (ids.length > 0) onDropDocs?.(folderId, ids)
    }
  }

  return { dragOver, onDragEnter, onDragOver, onDragLeave, onDrop }
}

// ─── shared overlay ───────────────────────────────────────────────────────────

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

// ─── FolderGridItem ───────────────────────────────────────────────────────────

export function FolderGridItem({
  folder,
  onOpen,
  onRename,
  onEditDescription,
  onDropDocs,
  onDropFolders,
  onDelete,
  selectionMode,
  selected,
  onSelect,
  selectedFolderIds,
  busy,
  busyLabel = 'Đang xóa...',
}: {
  folder: FolderType
  onOpen: () => void
  onRename: () => void
  onEditDescription: () => void
  onDropDocs?: (folderId: string, docIds: string[]) => void
  onDropFolders?: (targetFolderId: string, folderIds: string[]) => void
  onDelete: () => void
  selectionMode?: boolean
  selected?: boolean
  onSelect?: (folderId: string) => void
  /** Ids currently being dragged (to show drag ghost). */
  selectedFolderIds?: string[]
  busy?: boolean
  busyLabel?: string
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const t = useTranslations('documents')

  const drop = useFolderDropZone(folder.id, folder.id, onDropDocs, onDropFolders)

  const press = useLongPressSelect({
    disabled: busy,
    onLongPress: () => onSelect?.(folder.id),
    onTap: () => {
      if (selectionMode) {
        onSelect?.(folder.id)
      } else {
        onOpen()
      }
    },
  })

  const isDraggable = Boolean(onSelect) && (selectionMode || Boolean(selectedFolderIds?.length))

  function onDragStart(e: React.DragEvent) {
    const ids =
      selectedFolderIds && selectedFolderIds.includes(folder.id)
        ? selectedFolderIds
        : [folder.id]
    beginLibraryFolderDrag(ids, e.dataTransfer)
  }

  return (
    <div
      data-selectable
      className={`group relative rounded-xl border bg-card p-3 cursor-pointer select-none transition-all hover:shadow-md hover:border-amber-500/40 ${
        busy ? 'pointer-events-none opacity-90' : ''
      } ${selected ? 'ring-2 ring-primary/70 border-primary/50' : ''} ${
        drop.dragOver ? 'ring-2 ring-primary bg-primary/5' : ''
      }`}
      draggable={isDraggable}
      onDragStart={isDraggable ? onDragStart : undefined}
      onDragEnd={isDraggable ? endLibraryFolderDrag : undefined}
      onDragEnter={drop.onDragEnter}
      onDragOver={drop.onDragOver}
      onDragLeave={drop.onDragLeave}
      onDrop={drop.onDrop}
      onPointerDown={press.onPointerDown}
      onPointerMove={press.onPointerMove}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onClick={press.onClick}
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
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted cursor-pointer"
            onClick={() => {
              setMenuOpen(false)
              onEditDescription()
            }}
          >
            <Pencil className="h-3 w-3" />
            {t('folderDescription')}
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

// ─── FolderListItem ───────────────────────────────────────────────────────────

export function FolderListItem({
  folder,
  onOpen,
  onRename,
  onDropDocs,
  onDropFolders,
  onDelete,
  selectionMode,
  selected,
  onSelect,
  selectedFolderIds,
  busy,
  busyLabel = 'Đang xóa...',
}: {
  folder: FolderType
  onOpen: () => void
  onRename: () => void
  onDropDocs?: (folderId: string, docIds: string[]) => void
  onDropFolders?: (targetFolderId: string, folderIds: string[]) => void
  onDelete: () => void
  selectionMode?: boolean
  selected?: boolean
  onSelect?: (folderId: string) => void
  selectedFolderIds?: string[]
  busy?: boolean
  busyLabel?: string
}) {
  const t = useTranslations('documents')

  const drop = useFolderDropZone(folder.id, folder.id, onDropDocs, onDropFolders)

  const press = useLongPressSelect({
    disabled: busy,
    onLongPress: () => onSelect?.(folder.id),
    onTap: () => {
      if (selectionMode) {
        onSelect?.(folder.id)
      } else {
        onOpen()
      }
    },
  })

  const isDraggable = Boolean(onSelect) && (selectionMode || Boolean(selectedFolderIds?.length))

  function onDragStart(e: React.DragEvent) {
    const ids =
      selectedFolderIds && selectedFolderIds.includes(folder.id)
        ? selectedFolderIds
        : [folder.id]
    beginLibraryFolderDrag(ids, e.dataTransfer)
  }

  return (
    <div
      data-selectable
      className={`relative flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer select-none transition-colors hover:bg-muted/50 bg-card ${
        busy ? 'pointer-events-none opacity-90' : ''
      } ${selected ? 'ring-2 ring-primary/70 border-primary/50' : ''} ${
        drop.dragOver ? 'ring-2 ring-primary bg-primary/5' : ''
      }`}
      draggable={isDraggable}
      onDragStart={isDraggable ? onDragStart : undefined}
      onDragEnd={isDraggable ? endLibraryFolderDrag : undefined}
      onDragEnter={drop.onDragEnter}
      onDragOver={drop.onDragOver}
      onDragLeave={drop.onDragLeave}
      onDrop={drop.onDrop}
      onPointerDown={press.onPointerDown}
      onPointerMove={press.onPointerMove}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onClick={press.onClick}
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

// ─── FolderBreadcrumb ─────────────────────────────────────────────────────────

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

// ─── FolderPicker ─────────────────────────────────────────────────────────────

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

// re-export so page.tsx doesn't need to import library-drag directly
export { LIBRARY_DOC_DRAG_TYPE }
