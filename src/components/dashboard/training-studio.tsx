'use client'

// ═══════════════════════════════════════════════════════════════
// Estudio de Entrenamiento de la IA (coaching in-context).
// 3 secciones:
//  1) Conversaciones reales → elige un chat y corrige mensajes de la IA.
//  2) Subir .txt → extrae pares cliente→vendedor como ejemplos.
//  3) Lecciones aprendidas → administra (activa/elimina) lo enseñado.
// Todo se guarda en AiTrainingExample y se inyecta en el prompt
// (loadTrainingBlock) para que la IA lo aplique en cada respuesta.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  GraduationCap, MessageSquare, Upload, Lightbulb, Loader2, Save, Trash2,
  Wand2, CheckCircle2, Eye, EyeOff, Bot, User, FileText, AlertCircle, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'

interface TrainingExample {
  id: string
  type: string
  trigger: string
  badResponse?: string | null
  goodResponse: string
  note?: string | null
  source: string
  isActive: boolean
  createdAt: string
}
interface ConvItem { id: string; lastMessagePreview?: string | null; lastMessageAt?: string; contact?: { firstName?: string; lastName?: string | null; phone?: string | null } }
interface Msg { id: string; content: string; direction: string; senderType: string; isAiGenerated: boolean; createdAt: string }
interface ParsedPair { trigger: string; goodResponse: string }

// ── Tolerant transcript parser (WhatsApp export + generic "Name: text") ──
function parseTranscript(text: string): { speaker: string; text: string }[] {
  const out: { speaker: string; text: string }[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    let l = rawLine.trim()
    if (!l) continue
    l = l.replace(/^\[[^\]]+\]\s*/, '') // [12/06/26 10:30:00]
    l = l.replace(/^\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4},?\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?\s?m\.?)?\s*[-–]\s*/i, '') // 12/06/26, 10:30 -
    const m = l.match(/^([^:]{1,40}):\s*(.+)$/)
    if (m) out.push({ speaker: m[1].trim(), text: m[2].trim() })
    else if (out.length) out[out.length - 1].text += ' ' + l
  }
  return out
}

export function TrainingStudio({ workspaceId }: { workspaceId: string }) {
  const [lessons, setLessons] = useState<TrainingExample[]>([])
  const [loadingLessons, setLoadingLessons] = useState(true)

  const fetchLessons = useCallback(async () => {
    if (!workspaceId) return
    setLoadingLessons(true)
    try {
      const res = await fetch(`/api/training?workspaceId=${workspaceId}`)
      if (res.ok) { const d = await res.json(); setLessons(d.items || []) }
    } catch { /* silent */ } finally { setLoadingLessons(false) }
  }, [workspaceId])

  useEffect(() => { fetchLessons() }, [fetchLessons])

  const activeCount = lessons.filter((l) => l.isActive).length

  return (
    <div className="p-4 lg:p-6 h-full overflow-y-auto">
      <div className="mb-5 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
          <GraduationCap className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Entrenamiento de la IA</h3>
          <p className="text-sm text-muted-foreground">
            Corrige errores y enséñale con conversaciones reales. {activeCount > 0 && `${activeCount} lecciones activas — la IA las aplica en cada respuesta.`}
          </p>
        </div>
      </div>

      <Tabs defaultValue="chats" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="chats" className="gap-1.5 text-xs"><MessageSquare className="h-3.5 w-3.5" />Conversaciones reales</TabsTrigger>
          <TabsTrigger value="upload" className="gap-1.5 text-xs"><Upload className="h-3.5 w-3.5" />Subir .txt</TabsTrigger>
          <TabsTrigger value="lessons" className="gap-1.5 text-xs"><Lightbulb className="h-3.5 w-3.5" />Lecciones {lessons.length > 0 && `(${lessons.length})`}</TabsTrigger>
        </TabsList>

        <TabsContent value="chats">
          <ConversationsCorrector workspaceId={workspaceId} onSaved={fetchLessons} />
        </TabsContent>
        <TabsContent value="upload">
          <TxtImporter workspaceId={workspaceId} onSaved={fetchLessons} />
        </TabsContent>
        <TabsContent value="lessons">
          <LessonsManager lessons={lessons} loading={loadingLessons} onChanged={fetchLessons} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── 1. Corregir desde conversaciones reales ──────────────────
function ConversationsCorrector({ workspaceId, onSaved }: { workspaceId: string; onSaved: () => void }) {
  const [convs, setConvs] = useState<ConvItem[]>([])
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [selected, setSelected] = useState<ConvItem | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [correcting, setCorrecting] = useState<{ aiMsg: Msg; prevCustomer?: Msg } | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    setLoadingConvs(true)
    fetch(`/api/conversations?workspaceId=${workspaceId}&limit=50`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConvs(d?.items || []))
      .catch(() => {})
      .finally(() => setLoadingConvs(false))
  }, [workspaceId])

  const openConv = async (c: ConvItem) => {
    setSelected(c); setLoadingMsgs(true); setMsgs([])
    try {
      const res = await fetch(`/api/conversations/${c.id}?all=true`)
      if (res.ok) { const d = await res.json(); setMsgs(d.messages || d.items || []) }
    } catch { toast.error('No se pudo cargar la conversación') } finally { setLoadingMsgs(false) }
  }

  const name = (c?: ConvItem) => [c?.contact?.firstName, c?.contact?.lastName].filter(Boolean).join(' ') || c?.contact?.phone || 'Contacto'

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* conversation list */}
      <Card className="border-border/60">
        <CardContent className="p-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 py-1.5">Conversaciones recientes</p>
          <ScrollArea className="h-[480px]">
            {loadingConvs ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : convs.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">No hay conversaciones aún.</p>
            ) : convs.map((c) => (
              <button key={c.id} onClick={() => openConv(c)}
                className={cn('w-full text-left px-2.5 py-2 rounded-lg hover:bg-muted/60 transition-colors', selected?.id === c.id && 'bg-emerald-50 dark:bg-emerald-500/10')}>
                <p className="text-sm font-medium truncate">{name(c)}</p>
                <p className="text-[11px] text-muted-foreground truncate">{c.lastMessagePreview || 'Sin mensajes'}</p>
              </button>
            ))}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* messages */}
      <Card className="border-border/60">
        <CardContent className="p-0">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-[520px] gap-2 text-muted-foreground">
              <MessageSquare className="h-8 w-8" />
              <p className="text-sm">Elige una conversación para revisar y corregir a la IA</p>
            </div>
          ) : loadingMsgs ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <ScrollArea className="h-[520px] p-4">
              <p className="text-xs text-muted-foreground mb-3">
                Pasa el cursor sobre una respuesta de la IA y pulsa <span className="font-medium text-emerald-600">Corregir</span> para enseñarle la respuesta correcta.
              </p>
              <div className="space-y-3">
                {msgs.map((m, i) => {
                  const isAi = m.isAiGenerated || (m.direction === 'outbound' && m.senderType !== 'human')
                  const isCustomer = m.direction === 'inbound'
                  const prevCustomer = [...msgs.slice(0, i)].reverse().find((x) => x.direction === 'inbound')
                  return (
                    <div key={m.id} className={cn('group flex gap-2', isCustomer ? 'justify-start' : 'justify-end')}>
                      {isCustomer && <User className="h-4 w-4 mt-2 text-muted-foreground shrink-0" />}
                      <div className={cn('max-w-[78%] rounded-2xl px-3.5 py-2 text-sm relative',
                        isCustomer ? 'bg-muted text-foreground rounded-bl-sm' : 'bg-emerald-600 text-white rounded-br-sm')}>
                        {m.content}
                        {isAi && (
                          <button
                            onClick={() => setCorrecting({ aiMsg: m, prevCustomer })}
                            className="absolute -bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-white text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 shadow-sm flex items-center gap-1"
                          >
                            <Wand2 className="h-3 w-3" /> Corregir
                          </button>
                        )}
                      </div>
                      {isAi && <Bot className="h-4 w-4 mt-2 text-emerald-600 shrink-0" />}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {correcting && (
        <CorrectionDialog
          workspaceId={workspaceId}
          source="playground"
          conversationId={selected?.id}
          messageId={correcting.aiMsg.id}
          trigger={correcting.prevCustomer?.content || ''}
          badResponse={correcting.aiMsg.content}
          onClose={() => setCorrecting(null)}
          onSaved={() => { setCorrecting(null); onSaved() }}
        />
      )}
    </div>
  )
}

// ─── Correction dialog (shared) ───────────────────────────────
export function CorrectionDialog({
  workspaceId, source, conversationId, messageId, trigger: triggerInit, badResponse, onClose, onSaved,
}: {
  workspaceId: string; source: string; conversationId?: string; messageId?: string
  trigger: string; badResponse: string; onClose: () => void; onSaved: () => void
}) {
  const [trigger, setTrigger] = useState(triggerInit)
  const [good, setGood] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!good.trim()) { toast.error('Escribe la respuesta correcta que debió dar la IA'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/training', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId, type: 'correction', trigger: trigger.trim() || '(sin contexto previo)',
          badResponse, goodResponse: good.trim(), note: note.trim() || undefined,
          source, sourceConversationId: conversationId, sourceMessageId: messageId,
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Error') }
      toast.success('Lección guardada — la IA la aplicará de ahora en adelante')
      onSaved()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar') } finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-emerald-600" />Corregir a la IA</DialogTitle>
          <DialogDescription>Enséñale qué debió responder. Lo aplicará en todas las conversaciones futuras.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Contexto / lo que dijo el cliente</label>
            <Textarea value={trigger} onChange={(e) => setTrigger(e.target.value)} className="mt-1 text-sm min-h-[56px]" placeholder="Ej: «está muy caro»" />
          </div>
          <div>
            <label className="text-xs font-medium text-red-600">❌ Lo que la IA respondió (mal)</label>
            <div className="mt-1 text-xs bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-2.5 text-foreground/80 max-h-24 overflow-y-auto">{badResponse || '—'}</div>
          </div>
          <div>
            <label className="text-xs font-medium text-emerald-700">✅ Lo que DEBIÓ responder</label>
            <Textarea value={good} onChange={(e) => setGood(e.target.value)} className="mt-1 text-sm min-h-[80px]" placeholder="Escribe la respuesta correcta..." autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Motivo / lección (opcional)</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 text-sm" placeholder="Ej: nunca cerrar sin ofrecer financiamiento" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar lección
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── 2. Importar .txt ─────────────────────────────────────────
function TxtImporter({ workspaceId, onSaved }: { workspaceId: string; onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [speakers, setSpeakers] = useState<string[]>([])
  const [seller, setSeller] = useState<string>('')
  const [parsed, setParsed] = useState<{ speaker: string; text: string }[]>([])
  const [pairs, setPairs] = useState<ParsedPair[]>([])
  const [saving, setSaving] = useState(false)
  const [fileName, setFileName] = useState('')

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    setFileName(f.name)
    const text = await f.text()
    const msgs = parseTranscript(text)
    if (msgs.length === 0) { toast.error('No se detectaron mensajes. Formato esperado: «Nombre: mensaje» por línea.'); return }
    setParsed(msgs)
    const uniq = [...new Set(msgs.map((m) => m.speaker))]
    setSpeakers(uniq)
    setSeller(uniq[1] || uniq[0] || '')
    toast.success(`${msgs.length} mensajes detectados de ${uniq.length} participantes`)
  }

  // recompute pairs when seller changes
  useEffect(() => {
    if (!seller || parsed.length === 0) { setPairs([]); return }
    const p: ParsedPair[] = []
    for (let i = 1; i < parsed.length; i++) {
      if (parsed[i].speaker === seller && parsed[i - 1].speaker !== seller) {
        p.push({ trigger: parsed[i - 1].text, goodResponse: parsed[i].text })
      }
    }
    setPairs(p)
  }, [seller, parsed])

  const save = async () => {
    if (pairs.length === 0) { toast.error('No hay pares cliente→vendedor para guardar'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/training', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          examples: pairs.map((p) => ({ type: 'example', trigger: p.trigger, goodResponse: p.goodResponse, source: 'upload' })),
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Error') }
      const d = await res.json()
      toast.success(`${d.created} ejemplos guardados — la IA imitará el estilo del vendedor`)
      setParsed([]); setPairs([]); setSpeakers([]); setSeller(''); setFileName('')
      if (fileRef.current) fileRef.current.value = ''
      onSaved()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar') } finally { setSaving(false) }
  }

  return (
    <Card className="border-border/60">
      <CardContent className="p-5 space-y-4">
        <div className="rounded-lg border border-sky-200 bg-sky-50/70 dark:bg-sky-500/10 dark:border-sky-500/20 p-3 text-xs text-sky-900 dark:text-sky-300">
          Sube un .txt con una conversación real (ej. exportada de WhatsApp). Detectamos los intercambios y guardamos cómo respondió el vendedor humano como <span className="font-semibold">ejemplos</span> para que la IA imite ese estilo.
        </div>

        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept=".txt,text/plain" className="hidden" onChange={onFile} />
          <Button variant="outline" className="gap-2" onClick={() => fileRef.current?.click()}>
            <FileText className="h-4 w-4" />{fileName || 'Elegir archivo .txt'}
          </Button>
          {parsed.length > 0 && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => { setParsed([]); setPairs([]); setSpeakers([]); setSeller(''); setFileName(''); if (fileRef.current) fileRef.current.value = '' }}>
              <RefreshCw className="h-3.5 w-3.5" />Reiniciar
            </Button>
          )}
        </div>

        {speakers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">¿Quién es el <span className="font-semibold text-emerald-700">vendedor</span> (a imitar)?</span>
            {speakers.map((s) => (
              <button key={s} onClick={() => setSeller(s)}
                className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors', seller === s ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10' : 'border-border hover:border-emerald-300')}>
                {s}
              </button>
            ))}
          </div>
        )}

        {pairs.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />{pairs.length} pares cliente→vendedor detectados</p>
              <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2" size="sm">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar {pairs.length} ejemplos
              </Button>
            </div>
            <ScrollArea className="h-[340px] rounded-lg border border-border/60 p-3">
              <div className="space-y-2.5">
                {pairs.slice(0, 100).map((p, i) => (
                  <div key={i} className="text-xs border-l-2 border-emerald-300 pl-2.5">
                    <p className="text-muted-foreground"><span className="font-medium">Cliente:</span> {p.trigger}</p>
                    <p className="text-foreground"><span className="font-medium text-emerald-700">Vendedor:</span> {p.goodResponse}</p>
                  </div>
                ))}
                {pairs.length > 100 && <p className="text-[10px] text-muted-foreground">…y {pairs.length - 100} más (se guardan todos)</p>}
              </div>
            </ScrollArea>
          </>
        )}

        {parsed.length > 0 && pairs.length === 0 && seller && (
          <p className="text-xs text-amber-600 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" />No se detectaron pares con ese vendedor. Prueba con otro participante.</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── 3. Lecciones aprendidas ──────────────────────────────────
function LessonsManager({ lessons, loading, onChanged }: { lessons: TrainingExample[]; loading: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)

  const toggle = async (l: TrainingExample) => {
    setBusy(l.id)
    try {
      await fetch(`/api/training/${l.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !l.isActive }) })
      onChanged()
    } catch { toast.error('Error') } finally { setBusy(null) }
  }
  const remove = async (l: TrainingExample) => {
    if (!confirm('¿Eliminar esta lección?')) return
    setBusy(l.id)
    try { await fetch(`/api/training/${l.id}`, { method: 'DELETE' }); toast.success('Eliminada'); onChanged() }
    catch { toast.error('Error') } finally { setBusy(null) }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (lessons.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
      <Lightbulb className="h-8 w-8" />
      <p className="text-sm">Aún no hay lecciones. Corrige a la IA en una conversación o sube un .txt.</p>
    </div>
  )

  return (
    <div className="space-y-2.5">
      {lessons.map((l) => (
        <Card key={l.id} className={cn('border-border/60', !l.isActive && 'opacity-60')}>
          <CardContent className="p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={cn('text-[9px] border-0', l.type === 'correction' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700')}>
                    {l.type === 'correction' ? 'Corrección' : 'Ejemplo'}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{l.source}</span>
                  {!l.isActive && <Badge variant="secondary" className="text-[9px] border-0">Inactiva</Badge>}
                </div>
                <p className="text-xs text-muted-foreground truncate"><span className="font-medium">Cliente:</span> {l.trigger}</p>
                {l.badResponse && <p className="text-xs text-red-600/80 truncate">❌ {l.badResponse}</p>}
                <p className="text-xs text-foreground truncate">✅ {l.goodResponse}</p>
                {l.note && <p className="text-[11px] text-muted-foreground italic mt-0.5">{l.note}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={busy === l.id} onClick={() => toggle(l)} title={l.isActive ? 'Desactivar' : 'Activar'}>
                  {l.isActive ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" disabled={busy === l.id} onClick={() => remove(l)} title="Eliminar">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
