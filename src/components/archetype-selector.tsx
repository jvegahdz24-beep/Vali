'use client'

import { useState } from 'react'
import { BUSINESS_ARCHETYPES, type BusinessArchetype } from '@/lib/archetypes'
import { Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ArchetypeSelectorProps {
  onSelect?: (archetype: BusinessArchetype) => void
  selectedId?: string
  compact?: boolean
  showPreview?: boolean
}

export function ArchetypeSelector({ onSelect, selectedId, compact = false, showPreview = true }: ArchetypeSelectorProps) {
  const [selected, setSelected] = useState<string>(selectedId || '')
  const [applying, setApplying] = useState(false)
  const [preview, setPreview] = useState<BusinessArchetype | null>(null)

  const handleSelect = (archetype: BusinessArchetype) => {
    setSelected(archetype.id)
    if (showPreview) setPreview(archetype)
    onSelect?.(archetype)
  }

  const colorMap: Record<string, { bg: string; border: string; text: string; hover: string; gradient: string }> = {
    cyan: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', hover: 'hover:bg-cyan-100', gradient: 'from-cyan-500 to-cyan-600' },
    violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', hover: 'hover:bg-violet-100', gradient: 'from-violet-500 to-violet-600' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', hover: 'hover:bg-amber-100', gradient: 'from-amber-500 to-amber-600' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', hover: 'hover:bg-emerald-100', gradient: 'from-emerald-500 to-emerald-600' },
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', hover: 'hover:bg-red-100', gradient: 'from-red-500 to-red-600' },
    pink: { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', hover: 'hover:bg-pink-100', gradient: 'from-pink-500 to-pink-600' },
    slate: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', hover: 'hover:bg-slate-100', gradient: 'from-slate-500 to-slate-600' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', hover: 'hover:bg-orange-100', gradient: 'from-orange-500 to-orange-600' },
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', hover: 'hover:bg-indigo-100', gradient: 'from-indigo-500 to-indigo-600' },
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {BUSINESS_ARCHETYPES.map((archetype) => {
          const colors = colorMap[archetype.color] || colorMap.slate
          const isSelected = selected === archetype.id

          if (compact) {
            return (
              <button
                key={archetype.id}
                onClick={() => handleSelect(archetype)}
                className={`flex items-center gap-2 p-2.5 rounded-lg border-2 transition-all text-left ${isSelected ? `${colors.border} ${colors.bg}` : 'border-gray-200 hover:border-gray-300'}`}
              >
                <span className="text-xl">{archetype.icon}</span>
                <span className={`text-sm font-medium ${isSelected ? colors.text : 'text-gray-700'}`}>{archetype.name}</span>
                {isSelected && <Check className={`h-4 w-4 ml-auto ${colors.text}`} />}
              </button>
            )
          }

          return (
            <button
              key={archetype.id}
              onClick={() => handleSelect(archetype)}
              className={`relative overflow-hidden rounded-xl border-2 p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${isSelected ? `${colors.border} ${colors.bg} ring-2 ring-offset-1 ${colors.text}` : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'}`}
            >
              {/* Icon + Name */}
              <div className="flex items-start gap-3">
                <div className={`flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${colors.gradient} text-white text-2xl shadow-sm`}>
                  {archetype.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold text-sm ${isSelected ? colors.text : 'text-gray-900'}`}>{archetype.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{archetype.description}</p>
                </div>
                {isSelected && (
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br ${colors.gradient} text-white`}>
                    <Check className="h-4 w-4" />
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="flex gap-3 mt-3 pt-3 border-t border-gray-100">
                <span className="text-[10px] text-gray-400">
                  {archetype.pipelineStages.length} etapas
                </span>
                <span className="text-[10px] text-gray-400">
                  {archetype.contacts.length} contactos
                </span>
                <span className="text-[10px] text-gray-400">
                  {archetype.deals.length} tratos
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Preview Panel */}
      {showPreview && preview && (
        <div className="mt-6 p-5 rounded-xl border border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">{preview.icon}</span>
            <div>
              <h3 className="font-semibold text-gray-900">{preview.name}</h3>
              <p className="text-sm text-gray-500">{preview.description}</p>
            </div>
          </div>

          {/* Pipeline Preview */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pipeline</h4>
            <div className="flex flex-wrap gap-1.5">
              {preview.pipelineStages.map((stage, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium text-white"
                  style={{ backgroundColor: stage.color }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                  {stage.name}
                  <span className="opacity-70">{stage.probability}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sample Contacts */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Contactos de ejemplo</h4>
            <div className="flex flex-wrap gap-1.5">
              {preview.contacts.slice(0, 5).map((contact, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium ${contact.temperature === 'hot' ? 'bg-red-100 text-red-700' : contact.temperature === 'warm' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}
                >
                  {contact.firstName} {contact.lastName[0]}.
                  <span className="opacity-60">•</span>
                  {contact.tags[1] || contact.tags[0]}
                </span>
              ))}
              {preview.contacts.length > 5 && (
                <span className="text-[11px] text-gray-400">+{preview.contacts.length - 5} más</span>
              )}
            </div>
          </div>

          {/* Sample Conversation */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ejemplo de conversación</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {preview.sampleConversation.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'contact' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-lg text-xs ${msg.role === 'contact' ? 'bg-gray-200 text-gray-800 rounded-bl-none' : 'bg-emerald-600 text-white rounded-br-none'}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Apply Button */}
          <div className="mt-4 pt-4 border-t border-gray-200 flex gap-3">
            <Button
              onClick={async () => {
                setApplying(true)
                try {
                  const res = await fetch('/api/archetypes/apply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ archetypeId: preview.id }),
                  })
                  const data = await res.json()
                  if (data.success) {
                    localStorage.setItem('valiflow_archetype', preview.id)
                    window.location.reload()
                  }
                } catch (e) {
                  console.error(e)
                } finally {
                  setApplying(false)
                }
              }}
              disabled={applying}
              className={`flex-1 bg-gradient-to-r ${preview.gradientFrom} to ${preview.gradientTo} text-white hover:opacity-90`}
            >
              {applying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {applying ? 'Aplicando...' : `Configurar como ${preview.name}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
