'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useConfirm } from '@/components/ui/confirm-dialog'
import type { Tag } from '@/lib/db/types'

const TAG_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444']

interface TagManagerProps {
  tags: Tag[]
  onTagsChange: () => void
  onClose: () => void
}

export function TagManager({ tags, onTagsChange, onClose }: TagManagerProps) {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(TAG_COLORS[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function createTag() {
    if (!newName.trim()) return
    setSaving(true)
    setError('')
    const res = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Tạo tag thất bại')
      setSaving(false)
      return
    }
    setNewName('')
    setSaving(false)
    onTagsChange()
  }

  async function saveEdit(tagId: string) {
    if (!editName.trim()) return
    setSaving(true)
    setError('')
    const res = await fetch(`/api/tags/${tagId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), color: editColor }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Cập nhật thất bại')
      setSaving(false)
      return
    }
    setEditingId(null)
    setSaving(false)
    onTagsChange()
  }

  async function deleteTag(tagId: string) {
    const ok = await confirm({
      title: 'Xóa tag này?',
      description: 'Tag sẽ bị gỡ khỏi tất cả tài liệu.',
      confirmLabel: 'Xóa tag',
    })
    if (!ok) return
    await fetch(`/api/tags/${tagId}`, { method: 'DELETE' })
    onTagsChange()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      {confirmDialog}
      <div className="w-full max-w-md rounded-xl border bg-background shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Quản lý tag</h2>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Tạo tag mới</Label>
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tên tag..."
                className="h-9 text-sm flex-1"
                onKeyDown={(e) => e.key === 'Enter' && createTag()}
              />
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-9 w-10 rounded border cursor-pointer"
                title="Màu tag"
              />
              <Button size="sm" onClick={createTag} disabled={saving || !newName.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="space-y-1 max-h-64 overflow-y-auto">
            {tags.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Chưa có tag nào</p>
            ) : (
              tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2"
                >
                  {editingId === tag.id ? (
                    <>
                      <input
                        type="color"
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value)}
                        className="h-7 w-8 rounded border cursor-pointer shrink-0"
                      />
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 text-xs flex-1"
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit(tag.id)}
                      />
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => saveEdit(tag.id)}>
                        Lưu
                      </Button>
                    </>
                  ) : (
                    <>
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-sm flex-1 truncate">{tag.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          setEditingId(tag.id)
                          setEditName(tag.name)
                          setEditColor(tag.color)
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive"
                        onClick={() => deleteTag(tag.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function TagBadge({ tag }: { tag: Tag }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
      style={{ backgroundColor: tag.color }}
    >
      {tag.name}
    </span>
  )
}

interface DocumentTagEditorProps {
  allTags: Tag[]
  selectedTagIds: string[]
  saving: boolean
  onChange: (tagIds: string[]) => void
  onSave: () => void
}

export function DocumentTagEditor({
  allTags,
  selectedTagIds,
  saving,
  onChange,
  onSave,
}: DocumentTagEditorProps) {
  function toggleTag(tagId: string) {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId))
    } else {
      onChange([...selectedTagIds, tagId])
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Tag</Label>
      {allTags.length === 0 ? (
        <p className="text-xs text-muted-foreground">Chưa có tag — tạo tag từ sidebar</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => {
            const selected = selectedTagIds.includes(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium border transition-colors cursor-pointer ${
                  selected ? 'text-white border-transparent' : 'text-foreground border-input bg-background'
                }`}
                style={selected ? { backgroundColor: tag.color } : undefined}
              >
                {tag.name}
              </button>
            )
          })}
        </div>
      )}
      <Button size="sm" variant="outline" className="w-full" onClick={onSave} disabled={saving}>
        {saving ? 'Đang lưu...' : 'Lưu tag'}
      </Button>
    </div>
  )
}
