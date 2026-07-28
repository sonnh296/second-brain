'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChangePasswordForm } from '@/components/auth/change-password-form'
import {
  formatBytes,
  formatTokenCount,
} from '@/lib/usage/format'
import type { ProfileStats } from '@/lib/usage/types'

const PURPOSE_LABELS: Record<string, string> = {
  chat: 'Chat AI',
  title: 'Đặt tên chat',
  embedding_query: 'Embedding (truy vấn)',
  embedding_ingest: 'Embedding (xử lý tài liệu)',
}

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>
          {formatBytes(used)} / {formatBytes(limit)} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-amber-500' : 'bg-primary'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function TokenStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold tabular-nums mt-0.5">{formatTokenCount(value)}</p>
    </div>
  )
}

function SkeletonBar({ className }: { className?: string }) {
  return <div className={`rounded-md bg-muted animate-pulse ${className ?? 'h-3'}`} />
}

function ProfileStatsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Đang tải thống kê">
      <Card>
        <CardHeader className="pb-2">
          <SkeletonBar className="h-4 w-24" />
          <SkeletonBar className="h-3 w-32 mt-2" />
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <SkeletonBar className="h-4 w-40" />
          <SkeletonBar className="h-3 w-56 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <SkeletonBar className="h-3 w-20" />
              <SkeletonBar className="h-3 w-28" />
            </div>
            <SkeletonBar className="h-2 w-full rounded-full" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border px-3 py-2 space-y-2">
                <SkeletonBar className="h-3 w-16" />
                <SkeletonBar className="h-4 w-20" />
                <SkeletonBar className="h-3 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <SkeletonBar className="h-4 w-28" />
          <SkeletonBar className="h-3 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-5">
          {[1, 2].map((section) => (
            <div key={section}>
              <SkeletonBar className="h-3 w-32 mb-2" />
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg border px-3 py-2.5 space-y-2">
                    <SkeletonBar className="h-3 w-12" />
                    <SkeletonBar className="h-5 w-16" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

export default function ProfilePage() {
  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const res = await fetch('/api/profile')
      const data = await res.json().catch(() => ({}))
      if (cancelled) return
      if (!res.ok) {
        setError(data.error ?? 'Không tải được thống kê')
        setLoading(false)
        return
      }
      setStats(data as ProfileStats)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Trang cá nhân</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Thống kê sử dụng và cài đặt tài khoản
          </p>
        </div>

        {loading && <ProfileStatsSkeleton />}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && stats && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tài khoản</CardTitle>
                <CardDescription>
                  @{stats.username}
                  {stats.role === 'admin' ? ' · Admin' : ''}
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Dung lượng lưu trữ</CardTitle>
                <CardDescription>
                  Tài liệu trong kho, thùng rác và ảnh đính kèm chat
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <UsageBar
                  used={stats.storage.total_bytes}
                  limit={stats.storage.limit_bytes}
                  label="Tổng đã dùng"
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-lg border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Tài liệu</p>
                    <p className="font-medium mt-0.5">
                      {formatBytes(stats.storage.documents_bytes)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {stats.storage.documents_count} / {stats.storage.documents_limit} file
                    </p>
                  </div>
                  <div className="rounded-lg border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Thùng rác</p>
                    <p className="font-medium mt-0.5">
                      {formatBytes(stats.storage.trash_bytes)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {stats.storage.trash_count} mục
                    </p>
                  </div>
                  <div className="rounded-lg border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Ảnh chat</p>
                    <p className="font-medium mt-0.5">
                      {formatBytes(stats.storage.attachments_bytes)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Token AI</CardTitle>
                <CardDescription>
                  Token được ghi từ lúc bật thống kê. Dữ liệu cũ trước đó không có trong log.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">30 ngày gần đây</p>
                  <div className="grid grid-cols-3 gap-2">
                    <TokenStat label="Input" value={stats.tokens.last_30_days.input_tokens} />
                    <TokenStat label="Output" value={stats.tokens.last_30_days.output_tokens} />
                    <TokenStat label="Tổng" value={stats.tokens.last_30_days.total_tokens} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Toàn thời gian</p>
                  <div className="grid grid-cols-3 gap-2">
                    <TokenStat label="Input" value={stats.tokens.all_time.input_tokens} />
                    <TokenStat label="Output" value={stats.tokens.all_time.output_tokens} />
                    <TokenStat label="Tổng" value={stats.tokens.all_time.total_tokens} />
                  </div>
                </div>

                {stats.tokens.by_purpose.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Theo loại</p>
                    <div className="rounded-lg border divide-y">
                      {stats.tokens.by_purpose.map((row) => (
                        <div
                          key={row.purpose}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              {PURPOSE_LABELS[row.purpose] ?? row.purpose}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {row.requests} lần gọi
                            </p>
                          </div>
                          <div className="text-right shrink-0 tabular-nums">
                            <p className="font-medium">{formatTokenCount(row.total_tokens)}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {formatTokenCount(row.input_tokens)} in ·{' '}
                              {formatTokenCount(row.output_tokens)} out
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {stats.tokens.by_day.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Theo ngày (30 ngày)
                    </p>
                    <div className="rounded-lg border overflow-hidden">
                      <div className="max-h-48 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 sticky top-0">
                            <tr className="text-left text-[11px] text-muted-foreground">
                              <th className="px-3 py-2 font-medium">Ngày</th>
                              <th className="px-3 py-2 font-medium text-right">Input</th>
                              <th className="px-3 py-2 font-medium text-right">Output</th>
                              <th className="px-3 py-2 font-medium text-right">Tổng</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {[...stats.tokens.by_day].reverse().map((day) => (
                              <tr key={day.date}>
                                <td className="px-3 py-1.5">{day.date}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                  {formatTokenCount(day.input_tokens)}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                  {formatTokenCount(day.output_tokens)}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                                  {formatTokenCount(day.total_tokens)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {stats.tokens.all_time.total_tokens === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Chưa có dữ liệu token. Chat hoặc upload tài liệu để bắt đầu ghi nhận.
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Đổi mật khẩu</CardTitle>
            <CardDescription>Mật khẩu mới cần ít nhất 6 ký tự</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowPasswordDialog(true)}>
              Đổi mật khẩu
            </Button>
          </CardContent>
        </Card>

        {showPasswordDialog && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
            onClick={() => setShowPasswordDialog(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowPasswordDialog(false)
            }}
          >
            <Card
              className="w-full max-w-sm shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className="pb-2">
                <CardTitle id="change-password-title" className="text-base">
                  Đổi mật khẩu
                </CardTitle>
                <CardDescription>Nhập mật khẩu hiện tại và mật khẩu mới</CardDescription>
              </CardHeader>
              <CardContent>
                <ChangePasswordForm
                  onClose={() => setShowPasswordDialog(false)}
                  onSuccess={() => {
                    setTimeout(() => setShowPasswordDialog(false), 1200)
                  }}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
