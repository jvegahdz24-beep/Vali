'use client'

// ═══════════════════════════════════════════════════════════════
// Configuración de canales Meta (Instagram DM + Facebook Messenger).
// El dueño pega las credenciales de su App de Meta y el webhook empieza a
// recibir/responder mensajes de IG y Messenger con la misma IA que WhatsApp.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Copy, Check, Instagram } from 'lucide-react'

export function MetaChannelCard({ workspaceId }: { workspaceId: string }) {
  const [connected, setConnected] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('https://valiautoflow.com/api/webhooks/meta')
  const [tokenMasked, setTokenMasked] = useState<string | null>(null)
  const [form, setForm] = useState({ pageId: '', pageName: '', igAccountId: '', pageAccessToken: '', verifyToken: '' })
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState('')
  const [open, setOpen] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const load = useCallback(async () => {
    if (!workspaceId) return
    try {
      const r = await fetch(`/api/meta/config?workspaceId=${workspaceId}`)
      if (!r.ok) return
      const d = await r.json()
      setConnected(!!d.connected)
      if (d.webhookUrl) setWebhookUrl(d.webhookUrl)
      if (d.channel) {
        setTokenMasked(d.channel.tokenMasked)
        setForm((f) => ({ ...f, pageId: d.channel.pageId || '', pageName: d.channel.pageName || '', igAccountId: d.channel.igAccountId || '', verifyToken: d.channel.verifyToken || '' }))
      }
    } catch { /* */ }
  }, [workspaceId])
  useEffect(() => { load() }, [load])

  // Conexión por OAuth (1 clic): el usuario inicia sesión con Meta y se
  // auto-configura Página + IG + token + webhook, sin pegar credenciales.
  const startConnect = () => {
    setConnecting(true)
    const pop = window.open(`/api/meta/connect?workspaceId=${workspaceId}`, '_blank', 'width=640,height=780')
    const iv = setInterval(() => { if (!pop || pop.closed) { clearInterval(iv); setConnecting(false); load() } }, 1000)
  }

  const genVerify = () => setForm((f) => ({ ...f, verifyToken: f.verifyToken || `vali_${Math.random().toString(36).slice(2, 10)}` }))
  const copy = (text: string, key: string) => { navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 1500) }).catch(() => {}) }

  const save = async () => {
    if (!form.pageId.trim() || !form.pageAccessToken.trim() || !form.verifyToken.trim()) { toast.error('Faltan Page ID, Token o Verify Token'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/meta/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, ...form }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Error')
      toast.success('Instagram/Facebook conectado ✅')
      setOpen(false); await load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo conectar') } finally { setSaving(false) }
  }
  const disconnect = async () => {
    if (!confirm('¿Desconectar Instagram/Facebook?')) return
    try { const r = await fetch(`/api/meta/config?workspaceId=${workspaceId}`, { method: 'DELETE' }); if (r.ok) { toast.success('Desconectado'); setConnected(false); setTokenMasked(null); await load() } } catch { /* */ }
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><Instagram className="h-4 w-4 text-pink-500" /> Instagram & Facebook</CardTitle>
        {connected
          ? <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">Conectado</Badge>
          : <Badge variant="secondary">No conectado</Badge>}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Recibe y responde mensajes de <b>Instagram DM</b> y <b>Facebook Messenger</b> con la misma IA que WhatsApp. Requiere una App de Meta (te guiamos abajo).
        </p>

        {connected ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
            <p className="font-medium">Página conectada: {form.pageName || form.pageId}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Token: {tokenMasked} · Los mensajes de IG/Messenger ya se procesan con IA.</p>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" onClick={startConnect} disabled={connecting}>{connecting ? 'Conectando…' : 'Reconectar'}</Button>
              <Button size="sm" variant="outline" className="text-red-600 border-red-500/40 hover:bg-red-500/10" onClick={disconnect}>Desconectar</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Button size="sm" className="bg-pink-600 hover:bg-pink-700 text-white gap-1.5" onClick={startConnect} disabled={connecting}>
              <Instagram className="h-4 w-4" /> {connecting ? 'Conectando…' : 'Conectar Instagram/Facebook'}
            </Button>
            <p className="text-[11px] text-muted-foreground">Inicia sesión con tu cuenta de Meta y se configura solo (Página + Instagram + webhook) — no necesitas pegar credenciales.</p>
            <button onClick={() => { setOpen((v) => !v); genVerify() }} className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2">Configuración manual (avanzado)</button>
          </div>
        )}

        {open && (
          <div className="rounded-lg border border-border/60 p-3 space-y-3">
            {/* Datos para pegar en Meta */}
            <div className="rounded-md bg-muted/40 p-2.5 space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase">Pega esto en tu App de Meta (Webhooks)</p>
              {[
                { label: 'Callback URL', val: webhookUrl, key: 'url' },
                { label: 'Verify Token', val: form.verifyToken, key: 'vt' },
              ].map((x) => (
                <div key={x.key} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-24 shrink-0">{x.label}:</span>
                  <code className="flex-1 truncate bg-background rounded px-1.5 py-0.5">{x.val || '—'}</code>
                  <button onClick={() => copy(x.val, x.key)} className="text-muted-foreground hover:text-foreground">{copied === x.key ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}</button>
                </div>
              ))}
            </div>
            {/* Credenciales de tu página */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label className="text-xs">Page ID *</Label><Input className="mt-1 h-9" placeholder="1023456789..." value={form.pageId} onChange={(e) => setForm({ ...form, pageId: e.target.value })} /></div>
              <div><Label className="text-xs">Nombre de la página</Label><Input className="mt-1 h-9" placeholder="Mi Agencia" value={form.pageName} onChange={(e) => setForm({ ...form, pageName: e.target.value })} /></div>
              <div><Label className="text-xs">Instagram Account ID</Label><Input className="mt-1 h-9" placeholder="(opcional, para IG)" value={form.igAccountId} onChange={(e) => setForm({ ...form, igAccountId: e.target.value })} /></div>
              <div><Label className="text-xs">Verify Token *</Label><Input className="mt-1 h-9" value={form.verifyToken} onChange={(e) => setForm({ ...form, verifyToken: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label className="text-xs">Page Access Token *</Label><Input type="password" className="mt-1 h-9" placeholder={tokenMasked || 'EAAG...'} value={form.pageAccessToken} onChange={(e) => setForm({ ...form, pageAccessToken: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button size="sm" className="bg-pink-600 hover:bg-pink-700 text-white" disabled={saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar y conectar'}</Button>
            </div>
          </div>
        )}

        {/* Pasos */}
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium">¿Cómo obtengo estas credenciales? (pasos)</summary>
          <ol className="list-decimal ml-4 mt-2 space-y-1">
            <li>Entra a <b>developers.facebook.com</b> → crea una App tipo &quot;Business&quot;.</li>
            <li>Agrega los productos <b>Messenger</b> e <b>Instagram</b>.</li>
            <li>Conecta tu <b>Página de Facebook</b> (y tu cuenta de <b>Instagram Business</b> vinculada) y genera el <b>Page Access Token</b>.</li>
            <li>En <b>Webhooks</b>, pega la <b>Callback URL</b> y el <b>Verify Token</b> de arriba; suscríbete al evento <b>messages</b>.</li>
            <li>Copia aquí el <b>Page ID</b>, el <b>Instagram Account ID</b> y el <b>Page Access Token</b>, y pulsa Guardar.</li>
          </ol>
        </details>
      </CardContent>
    </Card>
  )
}
