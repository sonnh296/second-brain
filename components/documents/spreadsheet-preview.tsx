'use client'

import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { cn } from '@/lib/utils'

const MAX_PREVIEW_ROWS = 2000
const MAX_PREVIEW_COLS = 200

type SheetGrid = {
  name: string
  rows: string[][]
  truncated: boolean
  totalRows: number
  totalCols: number
}

function cellToString(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toLocaleString('vi-VN')
  return String(value)
}

function workbookToGrids(workbook: XLSX.WorkBook): SheetGrid[] {
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]
    if (!sheet) {
      return { name, rows: [], truncated: false, totalRows: 0, totalCols: 0 }
    }

    const raw = XLSX.utils.sheet_to_json<(string | number | boolean | null | undefined)[]>(
      sheet,
      {
        header: 1,
        defval: '',
        blankrows: false,
        raw: false,
      }
    )

    const totalRows = raw.length
    let totalCols = 0
    for (const row of raw) {
      if (Array.isArray(row)) totalCols = Math.max(totalCols, row.length)
    }

    const truncated = totalRows > MAX_PREVIEW_ROWS || totalCols > MAX_PREVIEW_COLS
    const rows = raw.slice(0, MAX_PREVIEW_ROWS).map((row) => {
      const cells = Array.isArray(row) ? row : [row]
      const padded = Array.from({ length: Math.min(totalCols, MAX_PREVIEW_COLS) }, (_, i) =>
        cellToString(cells[i])
      )
      return padded
    })

    return {
      name,
      rows,
      truncated,
      totalRows,
      totalCols,
    }
  })
}

export function SpreadsheetPreview({
  downloadUrl,
  filename,
  className,
}: {
  downloadUrl: string
  filename?: string
  className?: string
}) {
  const [grids, setGrids] = useState<SheetGrid[] | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setGrids(null)
    setActiveIdx(0)

    async function load() {
      try {
        const res = await fetch(downloadUrl)
        if (!res.ok) {
          throw new Error(`Không tải được file Excel (${res.status})`)
        }
        const buffer = await res.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
        const next = workbookToGrids(workbook)
        if (cancelled) return
        if (next.length === 0) {
          setError('File Excel không có sheet nào')
          return
        }
        setGrids(next)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Không đọc được file Excel')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [downloadUrl])

  const active = useMemo(() => {
    if (!grids || grids.length === 0) return null
    return grids[Math.min(activeIdx, grids.length - 1)] ?? null
  }, [grids, activeIdx])

  if (loading) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-3 text-muted-foreground flex-1 min-h-[200px] p-8',
          className
        )}
        aria-busy="true"
        aria-live="polite"
      >
        <div
          className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"
          aria-hidden
        />
        <p className="text-sm">Đang mở bảng tính...</p>
      </div>
    )
  }

  if (error || !active || !grids) {
    return (
      <div className={cn('p-4 text-sm text-muted-foreground', className)}>
        <p>{error || 'Không có dữ liệu để xem'}</p>
      </div>
    )
  }

  const colCount = active.rows[0]?.length ?? 0

  return (
    <div className={cn('flex-1 min-h-0 flex flex-col', className)}>
      <div className="shrink-0 flex items-center gap-1 overflow-x-auto border-b px-2 py-1.5 bg-muted/30">
        {grids.map((sheet, idx) => (
          <button
            key={`${sheet.name}-${idx}`}
            type="button"
            onClick={() => setActiveIdx(idx)}
            className={cn(
              'shrink-0 rounded-md px-2.5 py-1 text-xs transition-colors cursor-pointer',
              idx === activeIdx
                ? 'bg-background border font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            )}
          >
            {sheet.name}
          </button>
        ))}
      </div>

      {active.truncated && (
        <p className="shrink-0 px-3 py-1.5 text-[11px] text-muted-foreground border-b bg-muted/20">
          Đang hiện {Math.min(active.totalRows, MAX_PREVIEW_ROWS).toLocaleString('vi-VN')} /{' '}
          {active.totalRows.toLocaleString('vi-VN')} hàng
          {active.totalCols > MAX_PREVIEW_COLS
            ? `, ${MAX_PREVIEW_COLS} / ${active.totalCols.toLocaleString('vi-VN')} cột`
            : ''}
          . Tải về để xem đầy đủ
          {filename ? ` (${filename})` : ''}.
        </p>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {active.rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Sheet trống</p>
        ) : (
          <table className="min-w-full border-collapse text-xs">
            <tbody>
              {active.rows.map((row, rIdx) => (
                <tr key={rIdx} className={rIdx === 0 ? 'bg-muted/40' : undefined}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-muted/80 border border-border px-1.5 py-1 text-right text-muted-foreground font-normal tabular-nums min-w-8"
                  >
                    {rIdx + 1}
                  </th>
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className={cn(
                        'border border-border px-2 py-1 whitespace-pre-wrap max-w-64 align-top',
                        rIdx === 0 && 'font-medium'
                      )}
                    >
                      {cell}
                    </td>
                  ))}
                  {row.length < colCount &&
                    Array.from({ length: colCount - row.length }, (_, i) => (
                      <td key={`pad-${i}`} className="border border-border px-2 py-1" />
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
