'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  TrendingUp,
  Lightbulb,
  GraduationCap,
  AlertTriangle,
  Loader2,
  Eye,
  Brain,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Insight } from './types'

const TYPE_CONFIG: Record<Insight['type'], { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  pattern: {
    label: 'Patrón',
    icon: <TrendingUp className="w-4 h-4" />,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
  },
  suggestion: {
    label: 'Sugerencia',
    icon: <Lightbulb className="w-4 h-4" />,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
  learning: {
    label: 'Aprendizaje',
    icon: <GraduationCap className="w-4 h-4" />,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  anomaly: {
    label: 'Anomalía',
    icon: <AlertTriangle className="w-4 h-4" />,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
}

interface InsightsViewProps {
  insights: Insight[]
  onGenerateInsights: () => Promise<void>
  onLoadInsights: () => Promise<void>
}

export function InsightsView({ insights, onGenerateInsights, onLoadInsights }: InsightsViewProps) {
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      await onGenerateInsights()
      await onLoadInsights()
    } finally {
      setIsGenerating(false)
    }
  }

  const unreadCount = insights.filter((i) => !i.isRead).length

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Insights IA</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Análisis inteligente de tus conversaciones
              {unreadCount > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {unreadCount} nuevo{unreadCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </p>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analizando...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generar Insights
              </>
            )}
          </Button>
        </div>

        {/* Insights list */}
        <div className="space-y-3">
          <AnimatePresence>
            {insights.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16"
              >
                <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                  <Brain className="w-8 h-8 text-muted-foreground/30" />
                </div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  Sin insights aún
                </h3>
                <p className="text-xs text-muted-foreground/60 mb-4">
                  Conversa con NEXUS y genera insights para descubrir patrones
                </p>
                <Button
                  variant="outline"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
                  Generar primer análisis
                </Button>
              </motion.div>
            ) : (
              insights.map((insight, index) => {
                const config = TYPE_CONFIG[insight.type] || TYPE_CONFIG.pattern
                const confidencePct = Math.round(insight.confidence * 100)

                return (
                  <motion.div
                    key={insight.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.04 }}
                  >
                    <Card className={`border-border/40 hover:border-border/60 transition-all ${
                      !insight.isRead ? 'border-l-2 border-l-emerald-500' : ''
                    }`}>
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                          {/* Type icon */}
                          <div className={`w-9 h-9 rounded-lg ${config.bgColor} flex items-center justify-center flex-shrink-0 ${config.color}`}>
                            {config.icon}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="text-sm font-semibold">
                                {insight.title}
                              </h3>
                              <Badge variant="outline" className="text-[10px] px-2 py-0">
                                {config.label}
                              </Badge>
                              {!insight.isRead && (
                                <Eye className="w-3 h-3 text-emerald-500" />
                              )}
                            </div>

                            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                              {insight.content}
                            </p>

                            {/* Confidence bar */}
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-muted-foreground">Confianza</span>
                              <Progress
                                value={confidencePct}
                                className="h-1.5 flex-1 max-w-32"
                              />
                              <span className="text-[10px] font-medium text-muted-foreground">
                                {confidencePct}%
                              </span>
                            </div>

                            {/* Timestamp */}
                            <p className="text-[10px] text-muted-foreground/50 mt-2">
                              {formatDate(insight.createdAt)}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
