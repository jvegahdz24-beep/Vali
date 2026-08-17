'use client'

import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

/* ── Base Skeleton (with shimmer) ── */
export function SkeletonShimmer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton-shimmer rounded-md', className)} {...props} />
}

/* ── Skeleton Card (for stat cards) ── */
export function SkeletonCard() {
  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-7 w-28 mb-1.5" />
        <Skeleton className="h-3 w-36" />
      </CardContent>
    </Card>
  )
}

/* ── Skeleton Chart ── */
export function SkeletonChart({ className }: { className?: string }) {
  return (
    <Card className={cn('border-border/60', className)}>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent className="pt-0">
        <Skeleton className="h-[260px] w-full rounded-lg" />
      </CardContent>
    </Card>
  )
}

/* ── Skeleton Table ── */
export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border/60">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>
        {/* Rows */}
        <div className="divide-y divide-border/40">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              {Array.from({ length: cols }).map((_, j) => (
                <Skeleton key={j} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/* ── Skeleton Pipeline (for kanban columns) ── */
export function SkeletonPipeline({ columns = 5 }: { columns?: number }) {
  return (
    <div className="p-4 lg:p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <Skeleton className="h-6 w-40 mb-1" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <div className="flex gap-4 flex-1">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="w-[280px] shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-6" />
            </div>
            <div className="space-y-2 p-1">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Skeleton List (for contact list, conversation list) ── */
export function SkeletonList({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-1 p-3">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Skeleton Cards Grid (for agents, automations) ── */
export function SkeletonCardsGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="border-border/60">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="flex-1">
                <Skeleton className="h-4 w-28 mb-1" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/* ── Skeleton Automation ── */
export function SkeletonAutomation() {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
          <div className="flex-1">
            <Skeleton className="h-4 w-48 mb-2" />
            <Skeleton className="h-3 w-64" />
            <div className="flex gap-2 mt-3">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-9" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ── Skeleton Bar Chart ── */
export function SkeletonBarChart({ bars = 7 }: { bars?: number }) {
  return (
    <div className="flex items-end gap-2 h-[200px]">
      {Array.from({ length: bars }).map((_, i) => (
        <Skeleton
          key={i}
          className="flex-1 rounded-t-md"
          style={{ height: `${30 + Math.random() * 70}%` }}
        />
      ))}
    </div>
  )
}
