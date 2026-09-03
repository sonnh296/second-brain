'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
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
  Heading2,
  Heading3,
  Quote,
  ImagePlus,
  Minus,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NoteImageKind } from '@/lib/notes/images'

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
})
turndown.addRule('strikethrough', {
  filter: ['del', 's'],
  replacement: (content) => `~~${content}~~`,
})
turndown.addRule('images', {
  filter: 'img',
  replacement: (_content, node) => {
    const el = node as HTMLImageElement
    const alt = el.getAttribute('alt') ?? ''
    const src = el.getAttribute('src') ?? ''
    if (!src) return ''
    return `![${alt}](${src})`
  },
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

export type NoteImageScope = {
  kind: NoteImageKind
  id: string
}

async function uploadNoteImage(file: File, scope: NoteImageScope): Promise<string> {
  let lastError = 'Upload ảnh thất bại'
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 400 * attempt))
    }
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('kind', scope.kind)
      form.append('scope_id', scope.id)
      const res = await fetch('/api/notes/images', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (res.ok && typeof data.src === 'string') return data.src

      const msg =
        typeof data.error === 'string' ? data.error : `Upload ảnh thất bại (${res.status})`
      lastError = msg

      // Retry transient auth / network style failures
      if (res.status === 503 || res.status === 429 || res.status >= 500) continue
      if (res.status === 401 && /unauthorized/i.test(msg)) {
        lastError = 'Phiên đăng nhập tạm thời lỗi. Thử lại hoặc đăng nhập lại.'
        continue
      }
      break
    } catch {
      lastError = 'Mất kết nối khi tải ảnh. Thử lại.'
    }
  }
  throw new Error(lastError)
}

function isImageFile(file: File | null | undefined): file is File {
  return Boolean(file && file.type.startsWith('image/'))
}

function replaceImageSrc(editor: Editor, fromSrc: string, toSrc: string) {
  let updated = false
  editor.state.doc.descendants((node, pos) => {
    if (updated) return false
    if (node.type.name === 'image' && node.attrs.src === fromSrc) {
      editor
        .chain()
        .command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: toSrc })
          return true
        })
        .run()
      updated = true
      return false
    }
  })
  return updated
}

function removeImageBySrc(editor: Editor, src: string) {
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'image' && node.attrs.src === src) {
      editor
        .chain()
        .command(({ tr }) => {
          tr.delete(pos, pos + node.nodeSize)
          return true
        })
        .run()
      return false
    }
  })
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Viết nội dung...',
  disabled = false,
  minHeightClass = 'min-h-[200px]',
  className,
  autoFocus = false,
  imageScope,
}: {
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
  disabled?: boolean
  minHeightClass?: string
  className?: string
  autoFocus?: boolean
  /** When set, enables image insert / paste / drop for notes. */
  imageScope?: NoteImageScope
}) {
  const lastEmitted = useRef(value.trim())
  const imageScopeRef = useRef(imageScope)
  const editorRef = useRef<Editor | null>(null)
  const uploadingRef = useRef(false)
  const disabledRef = useRef(disabled)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    imageScopeRef.current = imageScope
  }, [imageScope])

  useEffect(() => {
    disabledRef.current = disabled
  }, [disabled])

  async function insertUploadedImage(file: File) {
    const scope = imageScopeRef.current
    const ed = editorRef.current
    if (!ed || !scope || uploadingRef.current) return

    uploadingRef.current = true
    setUploading(true)
    setUploadError('')

    const alt = file.name.replace(/\.[^.]+$/, '') || 'image'
    const blobUrl = URL.createObjectURL(file)
    ed.chain().focus().setImage({ src: blobUrl, alt }).run()

    try {
      const src = await uploadNoteImage(file, scope)
      if (!replaceImageSrc(ed, blobUrl, src)) {
        ed.chain().focus().setImage({ src, alt }).run()
      }
    } catch (err) {
      removeImageBySrc(ed, blobUrl)
      setUploadError(err instanceof Error ? err.message : 'Upload ảnh thất bại')
    } finally {
      URL.revokeObjectURL(blobUrl)
      uploadingRef.current = false
      setUploading(false)
    }
  }

  const insertRef = useRef(insertUploadedImage)
  insertRef.current = insertUploadedImage

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        // TipTap v3 StarterKit already includes these — avoid duplicate extensions
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'underline underline-offset-2 text-primary' },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: 'rounded-md max-w-full h-auto my-2 border border-border',
        },
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
      handlePaste: (_view, event) => {
        if (!imageScopeRef.current || disabledRef.current || uploadingRef.current) return false
        const items = event.clipboardData?.items
        if (!items) return false
        const imageItem = Array.from(items).find((item) => item.type.startsWith('image/'))
        if (!imageItem) return false
        const file = imageItem.getAsFile()
        if (!isImageFile(file)) return false
        event.preventDefault()
        void insertRef.current(file)
        return true
      },
      handleDrop: (_view, event) => {
        if (!imageScopeRef.current || disabledRef.current || uploadingRef.current) return false
        const file = event.dataTransfer?.files?.[0]
        if (!isImageFile(file)) return false
        event.preventDefault()
        void insertRef.current(file)
        return true
      },
    },
    onUpdate: ({ editor: ed }) => {
      const md = htmlToMarkdown(ed.getHTML())
      lastEmitted.current = md
      onChange(md)
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const incoming = value.trim()
    if (incoming === lastEmitted.current) return
    lastEmitted.current = incoming
    editor.commands.setContent(markdownToHtml(value), { emitUpdate: false })
  }, [value, editor])

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled && !uploading)
  }, [disabled, uploading, editor])

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

  function onPickImage() {
    if (!imageScope || disabled || uploading) return
    fileInputRef.current?.click()
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!isImageFile(file)) return
    await insertUploadedImage(file)
  }

  const controlsDisabled = disabled || uploading

  return (
    <div
      className={cn(
        'rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring',
        'flex flex-col min-h-0 relative',
        minHeightClass,
        disabled && 'opacity-60',
        className
      )}
    >
      <div className="shrink-0 sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b bg-muted/40 backdrop-blur-sm px-1.5 py-1">
        <ToolbarButton
          label="Tiêu đề 2"
          active={editor.isActive('heading', { level: 2 })}
          disabled={controlsDisabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Tiêu đề 3"
          active={editor.isActive('heading', { level: 3 })}
          disabled={controlsDisabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          label="In đậm"
          active={editor.isActive('bold')}
          disabled={controlsDisabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="In nghiêng"
          active={editor.isActive('italic')}
          disabled={controlsDisabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Gạch chân"
          active={editor.isActive('underline')}
          disabled={controlsDisabled}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Gạch ngang"
          active={editor.isActive('strike')}
          disabled={controlsDisabled}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          label="Danh sách"
          active={editor.isActive('bulletList')}
          disabled={controlsDisabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Danh sách số"
          active={editor.isActive('orderedList')}
          disabled={controlsDisabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Trích dẫn"
          active={editor.isActive('blockquote')}
          disabled={controlsDisabled}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Đường kẻ ngang"
          disabled={controlsDisabled}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          label="Chèn liên kết"
          active={editor.isActive('link')}
          disabled={controlsDisabled}
          onClick={setLink}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        {imageScope && (
          <>
            <ToolbarButton label="Chèn ảnh" disabled={controlsDisabled} onClick={onPickImage}>
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" />
              )}
            </ToolbarButton>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={onFileSelected}
            />
          </>
        )}
      </div>

      {uploading && (
        <div className="shrink-0 flex items-center gap-2 border-b bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" />
          <span>Đang tải ảnh lên...</span>
        </div>
      )}

      {uploadError && !uploading && (
        <div className="shrink-0 flex items-start justify-between gap-2 border-b border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
          <span>{uploadError}</span>
          <button
            type="button"
            className="shrink-0 underline underline-offset-2"
            onClick={() => setUploadError('')}
          >
            Đóng
          </button>
        </div>
      )}

      <div
        className={cn(
          'flex-1 min-h-0 overflow-y-auto overscroll-contain relative',
          uploading && 'opacity-80'
        )}
      >
        <EditorContent editor={editor} className="h-full [&_.tiptap]:outline-none" />
        {uploading && (
          <div
            className="pointer-events-none absolute inset-0 flex items-start justify-center pt-8 bg-background/30"
            aria-hidden
          >
            <div className="flex items-center gap-2 rounded-md border bg-background/95 px-3 py-2 text-xs shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Đang tải ảnh...
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
