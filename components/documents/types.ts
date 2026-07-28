import type { DocumentStatus } from '@/lib/db/types'

export type TypeFilter = 'all' | 'note' | 'pdf' | 'docx' | 'txt'
export type StatusFilter = 'all' | DocumentStatus
export type SortBy = 'date' | 'name'
export type ViewMode = 'grid' | 'list'

export interface PreviewData {
  filename: string
  file_type: string
  status: string
  content: string | null
  preview_type: string
  message?: string
  image_url?: string
  viewer_url?: string
  can_inline?: boolean
  download_url?: string
}

export interface NoteModalState {
  mode: 'create' | 'edit'
  doc?: import('@/lib/db/types').Document
}
