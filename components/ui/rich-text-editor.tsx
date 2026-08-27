'use client'

import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { marked } from 'marked'
import TurndownService from 'turndown'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Link as LinkIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
})
turndown.addRule('strikethrough', {
  filter: ['del', 's'],
  replacement: (content) => `~~${content}~~`,
})

marked.setOptions({ gfm: true, breaks: true })

function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) return ''
  return marked.parse(markdown, { async: false }) as string
}

function htmlToMarkdown(html: string): string {
  if (!html || html === '<p></p>') return ''
  return turndown.turndown(html).trim()
}

function ToolbarButton({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
        'hover:bg-muted hover:text-foreground disabled:opacity-40',
        active && 'bg-muted text-foreground'
      )}
    >
      {children}
    </button>
  )
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Viết nội dung...',
  disabled = false,
  minHeightClass = 'min-h-[200px]',
  className,
  autoFocus = false,
}: {
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
  disabled?: boolean
  minHeightClass?: string
  className?: string
  autoFocus?: boolean
}) {
  const lastEmitted = useRef(value.trim())

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'underline underline-offset-2 text-primary' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: markdownToHtml(value),
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2.5 text-sm leading-relaxed min-h-full',
      },
    },
    onUpdate: ({ editor: ed }) => {
      const md = htmlToMarkdown(ed.getHTML())
      lastEmitted.current = md
      onChange(md)
    },
  })

  useEffect(() => {
    if (!editor) return
    const incoming = value.trim()
    if (incoming === lastEmitted.current) return
    lastEmitted.current = incoming
    editor.commands.setContent(markdownToHtml(value), { emitUpdate: false })
  }, [value, editor])

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    if (autoFocus && editor && !disabled) {
      editor.commands.focus('end')
    }
  }, [autoFocus, editor, disabled])

  if (!editor) {
    return (
      <div
        className={cn(
          'rounded-md border border-input bg-background animate-pulse flex flex-col',
          minHeightClass,
          className
        )}
      />
    )
  }

  function setLink() {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Nhập URL', prev ?? 'https://')
    if (url === null) return
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }

  return (
    <div
      className={cn(
        'rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring',
        'flex flex-col min-h-0',
        minHeightClass,
        disabled && 'opacity-60',
        className
      )}
    >
      <div className="shrink-0 sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b bg-muted/40 backdrop-blur-sm px-1.5 py-1">
        <ToolbarButton
          label="In đậm"
          active={editor.isActive('bold')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="In nghiêng"
          active={editor.isActive('italic')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Gạch chân"
          active={editor.isActive('underline')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Gạch ngang"
          active={editor.isActive('strike')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          label="Danh sách"
          active={editor.isActive('bulletList')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Danh sách số"
          active={editor.isActive('orderedList')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          label="Chèn liên kết"
          active={editor.isActive('link')}
          disabled={disabled}
          onClick={setLink}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <EditorContent editor={editor} className="h-full [&_.tiptap]:outline-none" />
      </div>
    </div>
  )
}
