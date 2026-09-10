'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MessageSquarePlus, Trash2, Check } from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { Mark, Extension, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { marked } from 'marked'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export type AssignmentComment = {
  id: string
  quote_text: string
  body: string
  author_id: string
  author_name?: string | null
  submission_id: string | null
  resolved_at: string | null
  created_at: string
}

marked.setOptions({ gfm: true, breaks: true })

export function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) return ''
  return marked.parse(markdown, { async: false }) as string
}

/** Mark for text typed by the student (red). Prompt text stays unmarked. */
const StudentText = Mark.create({
  name: 'studentText',
  inclusive: true,
  parseHTML() {
    return [{ tag: 'span[data-student-text]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-student-text': '1',
        class: 'student-typed-text',
      }),
      0,
    ]
  },
})

/** Force newly typed / pasted text to carry the studentText mark when enabled. */
function createStudentTypingExtension(enabledRef: { current: boolean }) {
  return Extension.create({
    name: 'studentTyping',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('studentTyping'),
          props: {
            handleTextInput(view, from, to, text) {
              if (!enabledRef.current) return false
              const markType = view.state.schema.marks.studentText
              if (!markType) return false
              const mark = markType.create()
              const tr = view.state.tr.insertText(text, from, to)
              tr.addMark(from, from + text.length, mark)
              tr.setStoredMarks([mark])
              view.dispatch(tr)
              return true
            },
            handlePaste(view, event) {
              if (!enabledRef.current) return false
              const markType = view.state.schema.marks.studentText
              if (!markType) return false
              const text = event.clipboardData?.getData('text/plain')
              if (!text) return false
              event.preventDefault()
              const mark = markType.create()
              const { from, to } = view.state.selection
              const tr = view.state.tr.insertText(text, from, to)
              tr.addMark(from, from + text.length, mark)
              tr.setStoredMarks([mark])
              view.dispatch(tr)
              return true
            },
          },
        }),
      ]
    },
  })
}

function tabBtn(active: boolean, onClick: () => void, label: string, onClose?: () => void) {
  return (
    <div
      className={cn(
        'relative inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors shrink-0 max-w-40',
        active
          ? 'border-primary text-primary font-medium'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
    >
      <button type="button" onClick={onClick} className="truncate min-w-0">
        {label}
      </button>
      {onClose && (
        <button
          type="button"
          className="ml-0.5 rounded p-0.5 hover:bg-muted text-muted-foreground"
          onClick={onClose}
          aria-label="Đóng tab"
        >
          ×
        </button>
      )}
    </div>
  )
}

export function AssignmentContentTabs({
  tabs,
  activeId,
  onSelect,
  onCloseTab,
}: {
  tabs: { id: string; label: string; closable?: boolean }[]
  activeId: string
  onSelect: (id: string) => void
  onCloseTab?: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-0 border-b overflow-x-auto">
      {tabs.map((t) =>
        tabBtn(
          activeId === t.id,
          () => onSelect(t.id),
          t.label,
          t.closable ? () => onCloseTab?.(t.id) : undefined
        )
      )}
    </div>
  )
}

/** Teacher prompt editor — markdown via RichTextEditor */
export function AssignmentEditor({
  value,
  onChange,
  placeholder,
  disabled,
  minHeightClass = 'min-h-[280px]',
  className,
}: {
  value: string
  onChange: (md: string) => void
  placeholder?: string
  disabled?: boolean
  minHeightClass?: string
  className?: string
}) {
  return (
    <div className={className}>
      <RichTextEditor
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        minHeightClass={minHeightClass}
        imageScope={undefined}
      />
    </div>
  )
}

/**
 * Single document editor for student work:
 * - Starts as a copy of the prompt (normal color)
 * - New text the student types/pastes is marked red
 * - Stores HTML (preserves studentText marks)
 */
export function AssignmentWorkEditor({
  valueHtml,
  onChange,
  placeholder = 'Làm bài trực tiếp trên đề...',
  disabled = false,
  studentTyping = false,
  minHeightClass = 'min-h-[320px]',
  className,
}: {
  valueHtml: string
  onChange: (html: string) => void
  placeholder?: string
  disabled?: boolean
  /** When true, newly typed text is marked as student (red) */
  studentTyping?: boolean
  minHeightClass?: string
  className?: string
}) {
  const lastEmitted = useRef(valueHtml)
  const studentTypingRef = useRef(studentTyping)
  const studentTypingExt = useRef(createStudentTypingExtension(studentTypingRef)).current

  useEffect(() => {
    studentTypingRef.current = studentTyping
  }, [studentTyping])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'underline underline-offset-2 text-primary' },
      }),
      Placeholder.configure({ placeholder }),
      StudentText,
      studentTypingExt,
    ],
    content: valueHtml || '',
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2.5 text-sm leading-relaxed min-h-full',
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      lastEmitted.current = html
      onChange(html === '<p></p>' ? '' : html)
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [editor, disabled])

  useEffect(() => {
    if (!editor) return
    if (valueHtml === lastEmitted.current) return
    lastEmitted.current = valueHtml
    editor.commands.setContent(valueHtml || '', { emitUpdate: false })
  }, [valueHtml, editor])

  useEffect(() => {
    if (!editor || disabled || !studentTyping) return
    const mark = editor.schema.marks.studentText?.create()
    if (!mark) return
    const tr = editor.state.tr.setStoredMarks([mark])
    editor.view.dispatch(tr)
  }, [editor, disabled, studentTyping])

  if (!editor) {
    return (
      <div
        className={cn(
          'rounded-md border border-input bg-background animate-pulse',
          minHeightClass,
          className
        )}
      />
    )
  }

  return (
    <div
      className={cn(
        'rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring',
        'flex flex-col min-h-0',
        minHeightClass,
        disabled && 'opacity-90',
        className
      )}
    >
      <div className={cn('flex-1 min-h-0 overflow-y-auto', minHeightClass)}>
        <EditorContent editor={editor} className="h-full [&_.tiptap]:outline-none" />
      </div>
    </div>
  )
}

export function AssignmentCommentsPanel({
  comments,
  canComment,
  onAdd,
  onResolve,
  onDelete,
  busy,
  gradingSlot,
}: {
  comments: AssignmentComment[]
  canComment: boolean
  onAdd: (quote: string, body: string) => Promise<void>
  onResolve?: (id: string) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  busy?: boolean
  gradingSlot?: ReactNode
}) {
  const [draftQuote, setDraftQuote] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [composing, setComposing] = useState(false)
  const quoteRef = useRef('')

  useEffect(() => {
    function onSelectionChange() {
      const sel = window.getSelection()?.toString().trim()
      if (sel && sel.length > 0) quoteRef.current = sel.slice(0, 500)
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [])

  async function submit() {
    const quote = draftQuote.trim() || quoteRef.current
    const body = draftBody.trim()
    if (!body) return
    await onAdd(quote, body)
    setDraftBody('')
    setDraftQuote('')
    setComposing(false)
  }

  const open = comments.filter((c) => !c.resolved_at)
  const resolved = comments.filter((c) => c.resolved_at)

  return (
    <div className="flex flex-col h-full min-h-0 border-l bg-muted/20">
      {gradingSlot ? (
        <div className="shrink-0 border-b bg-background p-3 space-y-2">{gradingSlot}</div>
      ) : null}

      <div className="shrink-0 px-3 py-2 border-b flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Nhận xét</p>
        {canComment && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            disabled={busy}
            onClick={() => {
              setDraftQuote(quoteRef.current)
              setComposing(true)
            }}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Thêm
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {composing && (
          <div className="rounded-lg border bg-background p-3 space-y-2">
            <p className="text-[11px] text-muted-foreground">
              Bôi đen đoạn văn trong bài rồi bấm Thêm — hoặc nhập trích dẫn thủ công.
            </p>
            <Textarea
              placeholder="Trích dẫn (tuỳ chọn)"
              value={draftQuote}
              onChange={(e) => setDraftQuote(e.target.value)}
              rows={2}
              className="text-xs resize-none"
              disabled={busy}
            />
            <Textarea
              placeholder="Nội dung nhận xét..."
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              rows={3}
              className="text-sm resize-none"
              autoFocus
              disabled={busy}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="flex-1"
                disabled={busy || !draftBody.trim()}
                onClick={() => void submit()}
              >
                Gửi
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setComposing(false)}
              >
                Hủy
              </Button>
            </div>
          </div>
        )}

        {open.length === 0 && !composing && (
          <p className="text-xs text-muted-foreground text-center py-6">
            Chưa có nhận xét. Bôi đen đoạn văn và bấm Thêm.
          </p>
        )}

        {open.map((c) => (
          <div key={c.id} className="rounded-lg border bg-background p-3 space-y-1.5 text-sm">
            {c.quote_text && (
              <blockquote className="border-l-2 border-amber-400 pl-2 text-xs text-muted-foreground italic line-clamp-3">
                “{c.quote_text}”
              </blockquote>
            )}
            <p className="whitespace-pre-wrap">{c.body}</p>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1">
              <span>{c.author_name ?? 'GV'}</span>
              <span>·</span>
              <span>{new Date(c.created_at).toLocaleString('vi-VN')}</span>
              <span className="ml-auto flex gap-1">
                {onResolve && (
                  <button
                    type="button"
                    title="Đánh dấu xong"
                    className="p-1 rounded hover:bg-muted"
                    onClick={() => void onResolve(c.id)}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    title="Xóa"
                    className="p-1 rounded hover:bg-muted text-destructive"
                    onClick={() => void onDelete(c.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            </div>
          </div>
        ))}

        {resolved.length > 0 && (
          <div className="pt-2 space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Đã xử lý</p>
            {resolved.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground opacity-70"
              >
                {c.quote_text && <p className="italic line-clamp-2">“{c.quote_text}”</p>}
                <p className="line-clamp-2">{c.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
