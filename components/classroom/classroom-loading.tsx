'use client'

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ClassroomLoading({
  label = 'Đang tải...',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground',
        className
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <Loader2 className="h-7 w-7 animate-spin text-primary/70" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function ClassroomTileSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="w-[7.25rem] sm:w-[7.5rem] h-[6.5rem] rounded-lg border bg-muted/40 animate-pulse"
        />
      ))}
    </div>
  )
}
