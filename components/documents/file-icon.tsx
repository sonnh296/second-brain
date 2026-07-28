import {
  FileText,
  FileType,
  File,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
} from 'lucide-react'

export function FileIcon({ type, size = 'md' }: { type: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
  switch (type) {
    case 'note':
      return <FileText className={`${cls} text-fuchsia-500`} />
    case 'pdf':
      return <FileText className={`${cls} text-red-500`} />
    case 'docx':
      return <FileType className={`${cls} text-blue-500`} />
    case 'txt':
    case 'md':
    case 'csv':
    case 'json':
    case 'html':
      return <FileText className={`${cls} text-slate-500`} />
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
      return <ImageIcon className={`${cls} text-emerald-500`} />
    case 'mp3':
    case 'wav':
      return <Music className={`${cls} text-violet-500`} />
    case 'mp4':
    case 'mov':
      return <Film className={`${cls} text-pink-500`} />
    case 'zip':
    case 'xlsx':
    case 'xls':
    case 'pptx':
    case 'ppt':
      return <Archive className={`${cls} text-orange-500`} />
    default:
      return <File className={`${cls} text-muted-foreground`} />
  }
}
