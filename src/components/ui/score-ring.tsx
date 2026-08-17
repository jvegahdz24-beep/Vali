'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface ScoreRingProps {
  score: number
  size?: number
  strokeWidth?: number
  className?: string
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-500'
  if (score >= 60) return 'text-yellow-500'
  if (score >= 30) return 'text-amber-500'
  return 'text-red-500'
}

function getScoreTrackColor(score: number): string {
  if (score >= 80) return '#10b981'
  if (score >= 60) return '#eab308'
  if (score >= 30) return '#f59e0b'
  return '#ef4444'
}

export function ScoreRing({
  score,
  size = 64,
  strokeWidth = 4,
  className,
}: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clampedScore = Math.max(0, Math.min(100, score))
  const offset = circumference - (circumference * clampedScore) / 100
  const color = getScoreTrackColor(clampedScore)
  const textColor = getScoreColor(clampedScore)

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/50"
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums',
          textColor
        )}
        style={{ fontSize: size * 0.26 }}
      >
        {clampedScore}
      </span>
    </div>
  )
}
