'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Folder, FolderOpen } from 'lucide-react'
import { useTranslations } from 'next-intl'

export type ChatFolderOption = {
  id: string
  name: string
  parent_id: string | null
  shared?: boolean
  sharedBy?: string | null
}

type TreeNode = ChatFolderOption & { children: TreeNode[] }

type ChatFolderScopeProps = {
  readonly folders: ChatFolderOption[]
  readonly selectedFolderId: string | null
  readonly onChange: (folderId: string | null) => void
  readonly disabled?: boolean
  /** Compact collapsible bar (mobile). Default: always-open panel. */
  readonly collapsible?: boolean
}

function buildTree(folders: ChatFolderOption[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  for (const f of folders) {
    map.set(f.id, { ...f, children: [] })
  }
  const roots: TreeNode[] = []
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    for (const n of nodes) sortRec(n.children)
  }
  sortRec(roots)
  return roots
}

function FolderTreeNode({
  node,
  depth,
  selectedFolderId,
  onChange,
  disabled,
  expandedIds,
  toggleExpand,
}: {
  node: TreeNode
  depth: number
  selectedFolderId: string | null
  onChange: (folderId: string | null) => void
  disabled: boolean
  expandedIds: Set<string>
  toggleExpand: (id: string) => void
}) {
  const hasChildren = node.children.length > 0
  const expanded = expandedIds.has(node.id)
  const active = selectedFolderId === node.id
  const Icon = active || expanded ? FolderOpen : Folder

  return (
    <div>
      <div
        className="flex items-center gap-0.5"
        style={{ paddingLeft: `${depth * 0.75}rem` }}
      >
        {hasChildren ? (
          <button
            type="button"
            disabled={disabled}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            onClick={() => toggleExpand(node.id)}
            className="h-5 w-5 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${expanded ? 'rotate-0' : '-rotate-90'}`}
              aria-hidden
            />
          </button>
        ) : (
          <span className="w-5 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(node.id)}
          aria-pressed={active}
          className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-left transition-colors disabled:opacity-50 ${
            active
              ? 'bg-primary/10 text-foreground font-medium'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">
            {node.name}
            {node.shared && node.sharedBy ? (
              <span className="text-muted-foreground font-normal"> · {node.sharedBy}</span>
            ) : null}
          </span>
        </button>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <FolderTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedFolderId={selectedFolderId}
              onChange={onChange}
              disabled={disabled}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function ChatFolderScope({
  folders,
  selectedFolderId,
  onChange,
  disabled = false,
  collapsible = false,
}: ChatFolderScopeProps) {
  const t = useTranslations('chat')
  const owned = useMemo(() => folders.filter((f) => !f.shared), [folders])
  const shared = useMemo(() => folders.filter((f) => f.shared), [folders])
  const ownedTree = useMemo(() => buildTree(owned), [owned])
  const sharedTree = useMemo(() => buildTree(shared), [shared])

  // Expand ancestors of the selected folder so it stays visible
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (!selectedFolderId) return
    const byId = new Map(folders.map((f) => [f.id, f]))
    const ancestors: string[] = []
    let cur = byId.get(selectedFolderId)
    while (cur?.parent_id) {
      ancestors.push(cur.parent_id)
      cur = byId.get(cur.parent_id)
    }
    if (ancestors.length === 0) return
    setExpandedIds((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const id of ancestors) {
        if (!next.has(id)) {
          next.add(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [selectedFolderId, folders])

  const [headerExpanded, setHeaderExpanded] = useState(!collapsible)

  const selected = folders.find((f) => f.id === selectedFolderId) ?? null
  const summary = selected
    ? selected.shared && selected.sharedBy
      ? `${selected.name} (${selected.sharedBy})`
      : selected.name
    : t('scopeFolderAll')

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const tree = (
    <div className="flex flex-col gap-0.5 max-h-[min(50vh,24rem)] overflow-y-auto pr-0.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(null)}
        aria-pressed={!selectedFolderId}
        className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-xs text-left transition-colors disabled:opacity-50 ${
          !selectedFolderId
            ? 'bg-primary/10 text-foreground font-medium'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{t('scopeFolderAll')}</span>
      </button>

      {ownedTree.map((node) => (
        <FolderTreeNode
          key={node.id}
          node={node}
          depth={0}
          selectedFolderId={selectedFolderId}
          onChange={onChange}
          disabled={disabled}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
        />
      ))}

      {sharedTree.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t space-y-0.5">
          <p className="text-[10px] text-muted-foreground px-1.5 py-0.5">
            {t('scopeFolderShared')}
          </p>
          {sharedTree.map((node) => (
            <FolderTreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedFolderId={selectedFolderId}
              onChange={onChange}
              disabled={disabled}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  )

  if (!collapsible) {
    return (
      <div className="flex flex-col gap-1.5 min-w-0">
        <p className="text-xs font-medium text-foreground px-0.5">{t('scopeByFolder')}</p>
        <p className="text-[10px] text-muted-foreground px-0.5">{t('scopeFolderHint')}</p>
        {tree}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={headerExpanded}
        onClick={() => setHeaderExpanded((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-0.5 py-0.5 text-left text-xs transition-colors hover:bg-muted/60 disabled:opacity-50"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
            headerExpanded ? 'rotate-0' : '-rotate-90'
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

      {headerExpanded && (
        <>
          <p className="text-[10px] text-muted-foreground px-0.5">{t('scopeFolderHint')}</p>
          {tree}
        </>
      )}
    </div>
  )
}
