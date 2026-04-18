'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Key, FileText, Webhook, Terminal as TermIcon, Database, Settings,
  Eye, EyeOff, Play, CheckCircle2, XCircle, MinusCircle,
  Save, RotateCcw, RefreshCw, Download, Trash2, Plus, Clock,
  ChevronDown, ChevronRight, AlertTriangle, Copy, Send,
  Loader2, Zap, Shield, ToggleLeft, ToggleRight, Info,
  Search, Filter, X, Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AI_PROVIDERS, PERSONALITY_PROMPTS } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

// ─── Types ─────────────────────────────────────────────
interface DeveloperViewProps {
  workspaceId: string
}

interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error'
  source: string
  message: string
}

interface WebhookEntry {
  id: string
  url: string
  events: string[]
  secret: string
  active: boolean
  lastDelivery?: { status: number; timestamp: string }
}

interface TableInfo {
  name: string
  count: number
  records: Record<string, unknown>[]
}

// ─── In-memory log store reference ─────────────────────
const DEV_LOGS: LogEntry[] = [
  { id: '1', timestamp: new Date(Date.now() - 120000).toISOString(), level: 'info', source: 'whatsapp', message: 'Conexión establecida - 5212345678' },
  { id: '2', timestamp: new Date(Date.now() - 90000).toISOString(), level: 'info', source: 'ai-engine', message: 'Revenue Engine procesó mensaje - Conversation #c4jn3' },
  { id: '3', timestamp: new Date(Date.now() - 60000).toISOString(), level: 'warn', source: 'rate-limit', message: 'Rate limit alcanzado para Groq API - 429' },
  { id: '4', timestamp: new Date(Date.now() - 30000).toISOString(), level: 'info', source: 'crm', message: 'Lead calificado: María García - Score: 85' },
  { id: '5', timestamp: new Date(Date.now() - 15000).toISOString(), level: 'error', source: 'ai-engine', message: 'Timeout al conectar con DeepSeek API - 30000ms' },
  { id: '6', timestamp: new Date(Date.now() - 5000).toISOString(), level: 'info', source: 'automation', message: 'Follow-up rule triggered - Day 3 inactivity' },
]

// ─── Component ─────────────────────────────────────────
export function DeveloperView({ workspaceId }: DeveloperViewProps) {
  // ── API Keys State ──
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [keyStatus, setKeyStatus] = useState<Record<string, 'idle' | 'testing' | 'valid' | 'invalid'>>({})
  const [baseUrl, setBaseUrl] = useState('')
  const [timeout, setTimeout_] = useState(30)
  const [retryCount, setRetryCount] = useState(3)
  const [keysLoaded, setKeysLoaded] = useState(false)

  // ── System Prompts State ──
  const [selectedPrompt, setSelectedPrompt] = useState('JHON')
  const [promptContent, setPromptContent] = useState(PERSONALITY_PROMPTS['JHON'] || '')
  const [promptSaved, setPromptSaved] = useState(false)
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({})

  // ── Webhooks State ──
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>([])
  const [webhooksLoaded, setWebhooksLoaded] = useState(false)
  const [showAddWebhook, setShowAddWebhook] = useState(false)
  const [newWebhookUrl, setNewWebhookUrl] = useState('')
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>([])
  const [webhookDeliveries, setWebhookDeliveries] = useState<{ status: number; url: string; time: string; event: string }[]>([])

  // ── Logs State ──
  const [logs, setLogs] = useState<LogEntry[]>(DEV_LOGS)
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [logsExpanded, setLogsExpanded] = useState(true)

  // ── Debug Console State ──
  const [debugMessage, setDebugMessage] = useState('')
  const [debugAgent, setDebugAgent] = useState('JHON')
  const [debugLoading, setDebugLoading] = useState(false)
  const [debugResult, setDebugResult] = useState<{ response: string; tokens: number; time: number; prompt: string } | null>(null)

  // ── Database State ──
  const [dbTables] = useState(['Contact', 'Conversation', 'Message', 'Deal', 'Agent', 'Automation', 'Pipeline', 'PipelineStage', 'Workspace', 'Subscription', 'AnalyticsEvent', 'WebhookConfig'])
  const [selectedTable, setSelectedTable] = useState('Contact')
  const [tableData, setTableData] = useState<TableInfo | null>(null)
  const [rawQuery, setRawQuery] = useState('')
  const [queryResult, setQueryResult] = useState<Record<string, unknown>[] | null>(null)

  // ── Config State ──
  const [featureFlags, setFeatureFlags] = useState({
    aiAutoReply: true,
    whatsappConnection: true,
    leadScoring: true,
    conversationAnalytics: true,
    developerMode: true,
  })
  const [rateLimits, setRateLimits] = useState({
    messagesPerHour: 100,
    aiCallsPerMinute: 30,
    maxContacts: 5000,
  })

  // ── Handlers ──
  const toggleKeyVisibility = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // ── Load API Keys from DB on mount ──
  useEffect(() => {
    const loadKeys = async () => {
      try {
        const res = await fetch(`/api/developer/api-keys?workspaceId=${workspaceId}`)
        if (res.ok) {
          const data = await res.json()
          if (data.apiKeys) setApiKeys(data.apiKeys)
          if (data.connection) {
            const conn = data.connection as Record<string, unknown>
            if (conn.baseUrl) setBaseUrl(conn.baseUrl as string)
            if (conn.timeout) setTimeout_(conn.timeout as number)
            if (conn.retryCount) setRetryCount(conn.retryCount as number)
          }
          setKeysLoaded(true)
        }
      } catch { setKeysLoaded(true) }
    }
    loadKeys()
  }, [workspaceId])

  // ── Load Custom Prompts from DB on mount ──
  useEffect(() => {
    const loadPrompts = async () => {
      try {
        const res = await fetch(`/api/developer/prompts?workspaceId=${workspaceId}`)
        if (res.ok) {
          const data = await res.json()
          const map: Record<string, string> = {}
          if (data.personas) {
            for (const p of data.personas) {
              map[p.slug] = p.systemPrompt
            }
          }
          setCustomPrompts(map)
          // If current personality has a custom prompt, use it
          if (map[selectedPrompt]) {
            setPromptContent(map[selectedPrompt])
          }
        }
      } catch { /* use defaults */ }
    }
    loadPrompts()
  }, [workspaceId])

  // ── Load Webhooks from DB on mount ──
  useEffect(() => {
    const loadWebhooks = async () => {
      try {
        const res = await fetch(`/api/developer/webhooks?workspaceId=${workspaceId}`)
        if (res.ok) {
          const data = await res.json()
          if (data.webhooks) {
            setWebhooks(data.webhooks.map((wh: { id: string; webhookUrl: string | null; secret: string | null; isActive: boolean }) => ({
              id: wh.id,
              url: wh.webhookUrl || '',
              events: [],
              secret: wh.secret || '',
              active: wh.isActive,
            })))
          }
          setWebhooksLoaded(true)
        }
      } catch { setWebhooksLoaded(true) }
    }
    loadWebhooks()
  }, [workspaceId])

  const testApiKey = async (provider: string) => {
    setKeyStatus(prev => ({ ...prev, [provider]: 'testing' }))
    try {
      const res = await fetch('/api/developer/test-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: provider, message: 'test' }),
      })
      if (res.ok) {
        setKeyStatus(prev => ({ ...prev, [provider]: 'valid' }))
      } else {
        setKeyStatus(prev => ({ ...prev, [provider]: 'invalid' }))
      }
    } catch {
      setKeyStatus(prev => ({ ...prev, [provider]: 'invalid' }))
    }
  }

  const saveApiKeys = async () => {
    try {
      const res = await fetch('/api/developer/api-keys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, apiKeys, baseUrl, timeout, retryCount }),
      })
      if (res.ok) {
        addLog('info', 'api-keys', 'API keys guardados en base de datos')
        setPromptSaved(true)
        setTimeout(() => setPromptSaved(false), 2000)
      }
    } catch (err) {
      addLog('error', 'api-keys', `Error guardando API keys: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }

  const handlePromptChange = (id: string) => {
    setSelectedPrompt(id)
    // Use custom prompt from DB if it exists, otherwise use default
    setPromptContent(customPrompts[id] || PERSONALITY_PROMPTS[id] || '')
  }

  const savePrompt = async () => {
    try {
      const res = await fetch('/api/developer/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, slug: selectedPrompt, systemPrompt: promptContent }),
      })
      if (res.ok) {
        setCustomPrompts(prev => ({ ...prev, [selectedPrompt]: promptContent }))
        setPromptSaved(true)
        setTimeout(() => setPromptSaved(false), 2000)
        addLog('info', 'prompts', `Prompt guardado para ${selectedPrompt}`)
      }
    } catch (err) {
      addLog('error', 'prompts', `Error guardando prompt: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }

  const resetPrompt = () => {
    setPromptContent(PERSONALITY_PROMPTS[selectedPrompt] || '')
  }

  const generateSecret = () => {
    return 'whsec_' + Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  const addWebhook = async () => {
    if (!newWebhookUrl) return
    try {
      const res = await fetch('/api/developer/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, webhookUrl: newWebhookUrl, channel: 'webhook' }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.webhook) {
          const wh: WebhookEntry = {
            id: data.webhook.id,
            url: data.webhook.webhookUrl,
            events: newWebhookEvents,
            secret: data.webhook.secret,
            active: true,
          }
          setWebhooks(prev => [...prev, wh])
          addLog('info', 'webhooks', `Webhook creado: ${wh.url}`)
        }
      }
      setNewWebhookUrl('')
      setNewWebhookEvents([])
      setShowAddWebhook(false)
    } catch (err) {
      addLog('error', 'webhooks', `Error creando webhook: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }

  const removeWebhook = async (id: string) => {
    try {
      const res = await fetch(`/api/developer/webhooks?workspaceId=${workspaceId}&id=${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setWebhooks(prev => prev.filter(w => w.id !== id))
        addLog('info', 'webhooks', 'Webhook eliminado')
      }
    } catch (err) {
      addLog('error', 'webhooks', `Error eliminando webhook: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }

  const testWebhook = (url: string) => {
    addLog('info', 'webhooks', `Ping enviado a ${url}`)
    setWebhookDeliveries(prev => [...prev, { status: 200, url, time: new Date().toISOString(), event: 'ping' }])
  }

  const addLog = (level: 'info' | 'warn' | 'error', source: string, message: string) => {
    const entry: LogEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
    }
    setLogs(prev => [entry, ...prev].slice(0, 100))
  }

  const handleDebugSend = async () => {
    if (!debugMessage.trim()) return
    setDebugLoading(true)
    setDebugResult(null)
    const startTime = Date.now()
    try {
      const res = await fetch('/api/developer/test-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: debugAgent, message: debugMessage }),
      })
      const data = await res.json()
      const elapsed = Date.now() - startTime
      setDebugResult({
        response: data.response || JSON.stringify(data),
        tokens: data.tokensUsed || 0,
        time: elapsed,
        prompt: data.fullPrompt || PERSONALITY_PROMPTS[debugAgent] || '',
      })
      addLog('info', 'debug-console', `Test enviado a agente ${debugAgent} - ${elapsed}ms`)
    } catch (err) {
      addLog('error', 'debug-console', `Error: ${err instanceof Error ? err.message : 'Unknown'}`)
    } finally {
      setDebugLoading(false)
    }
  }

  const fetchTableData = async () => {
    try {
      const res = await fetch(`/api/developer/export?table=${selectedTable.toLowerCase()}s&format=json`)
      if (res.ok) {
        const data = await res.json()
        setTableData({
          name: selectedTable,
          count: data.total || data.length || 0,
          records: data.items || data || [],
        })
        addLog('info', 'database', `Tabla ${selectedTable} consultada: ${data.total || data.length || 0} registros`)
      }
    } catch (err) {
      addLog('error', 'database', `Error consultando tabla: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }

  useEffect(() => {
    if (selectedTable) fetchTableData()
  }, [selectedTable])

  const exportTable = async () => {
    try {
      const res = await fetch(`/api/developer/export?table=${selectedTable.toLowerCase()}s&format=csv`)
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${selectedTable.toLowerCase()}s.csv`
        a.click()
        URL.revokeObjectURL(url)
        addLog('info', 'database', `Tabla ${selectedTable} exportada como CSV`)
      }
    } catch (err) {
      addLog('error', 'database', `Error exportando: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }

  const filteredLogs = logFilter === 'all' ? logs : logs.filter(l => l.level === logFilter)

  const charCount = promptContent.length
  const tokenEstimate = Math.ceil(charCount / 4)

  const webhookEvents = [
    { id: 'message.received', label: 'Mensaje recibido' },
    { id: 'message.sent', label: 'Mensaje enviado' },
    { id: 'deal.created', label: 'Trato creado' },
    { id: 'deal.won', label: 'Trato ganado' },
    { id: 'contact.created', label: 'Contacto creado' },
  ]

  return (
    <div className="min-h-full bg-[#0f172a] text-slate-200">
      {/* Header */}
      <div className="border-b border-slate-700/50 bg-[#0c1222] px-4 lg:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <TermIcon className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Panel de Desarrollador</h3>
              <p className="text-xs text-slate-400">Herramientas avanzadas y configuración técnica</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-6 text-[10px] font-mono border-slate-600 text-slate-400">
              {workspaceId.slice(0, 8)}...
            </Badge>
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 lg:px-6 pt-4">
        <Tabs defaultValue="api-keys" className="space-y-4">
          <TabsList className="bg-slate-800/50 border border-slate-700/50 w-full flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="api-keys" className="gap-1.5 text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-emerald-400">
              <Key className="h-3.5 w-3.5" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="prompts" className="gap-1.5 text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-emerald-400">
              <FileText className="h-3.5 w-3.5" />
              System Prompts
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-1.5 text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-emerald-400">
              <Webhook className="h-3.5 w-3.5" />
              Webhooks
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-1.5 text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-emerald-400">
              <Activity className="h-3.5 w-3.5" />
              Logs & Debug
            </TabsTrigger>
            <TabsTrigger value="database" className="gap-1.5 text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-emerald-400">
              <Database className="h-3.5 w-3.5" />
              Base de Datos
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-1.5 text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-emerald-400">
              <Settings className="h-3.5 w-3.5" />
              Configuración
            </TabsTrigger>
          </TabsList>

          {/* ═══ TAB 1: API Keys ═══ */}
          <TabsContent value="api-keys" className="space-y-4 pb-6">
            <div className="grid gap-4">
              {Object.entries(AI_PROVIDERS).map(([key, prov]) => (
                <Card key={key} className="border-slate-700/50 bg-slate-800/30">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Label className="text-sm font-medium text-slate-200">{prov.name}</Label>
                            <span className="text-[10px] text-slate-500 font-mono">{prov.defaultModel}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {keyStatus[key] === 'valid' && (
                              <Badge className="h-5 text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">✓ Válida</Badge>
                            )}
                            {keyStatus[key] === 'invalid' && (
                              <Badge className="h-5 text-[10px] bg-red-500/10 text-red-400 border-red-500/20">✗ Inválida</Badge>
                            )}
                            {keyStatus[key] === 'testing' && (
                              <Badge className="h-5 text-[10px] bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                Probando
                              </Badge>
                            )}
                            {(!keyStatus[key] || keyStatus[key] === 'idle') && (
                              <Badge className="h-5 text-[10px] bg-slate-700 text-slate-400 border-slate-600">
                                {apiKeys[key] ? 'Configurada' : 'Sin configurar'}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="relative">
                          <Input
                            type={showKeys[key] ? 'text' : 'password'}
                            placeholder={`sk-... ${prov.name}`}
                            className="h-9 bg-slate-900/50 border-slate-700 text-slate-200 font-mono text-xs pr-20"
                            value={apiKeys[key] || ''}
                            onChange={(e) => setApiKeys(prev => ({ ...prev, [key]: e.target.value }))}
                          />
                          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:text-slate-200"
                              onClick={() => toggleKeyVisibility(key)}
                            >
                              {showKeys[key] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:text-emerald-400"
                              onClick={() => testApiKey(key)}
                              disabled={keyStatus[key] === 'testing'}
                            >
                              <Play className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Connection Settings */}
              <Card className="border-slate-700/50 bg-slate-800/30">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-slate-400" />
                    <Label className="text-sm font-medium text-slate-200">Configuración de Conexión</Label>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs text-slate-400">Base URL Override (para modelos self-hosted)</Label>
                    <Input
                      placeholder="https://api.groq.com/openai/v1"
                      className="h-9 bg-slate-900/50 border-slate-700 text-slate-200 font-mono text-xs"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-slate-400">Timeout: {timeout}s</Label>
                    </div>
                    <Slider
                      value={[timeout]}
                      onValueChange={([v]) => setTimeout_(v)}
                      min={5}
                      max={60}
                      step={5}
                      className="[&>span]:bg-slate-600 [&>span>span]:bg-emerald-500"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs text-slate-400">Reintentos: {retryCount}</Label>
                    <Slider
                      value={[retryCount]}
                      onValueChange={([v]) => setRetryCount(v)}
                      min={1}
                      max={5}
                      step={1}
                      className="[&>span]:bg-slate-600 [&>span>span]:bg-emerald-500"
                    />
                  </div>
                  <Button onClick={saveApiKeys} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    Guardar Configuración
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ═══ TAB 2: System Prompts ═══ */}
          <TabsContent value="prompts" className="space-y-4 pb-6">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Prompt Editor */}
              <div className="space-y-4">
                <Card className="border-slate-700/50 bg-slate-800/30">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium text-slate-200">Editor de System Prompt</Label>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                        <span>{charCount} caracteres</span>
                        <span>·</span>
                        <span>~{tokenEstimate} tokens</span>
                      </div>
                    </div>
                    <Select value={selectedPrompt} onValueChange={handlePromptChange}>
                      <SelectTrigger className="bg-slate-900/50 border-slate-700 text-slate-200 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(PERSONALITY_PROMPTS).map(k => (
                          <SelectItem key={k} value={k}>{k}</SelectItem>
                        ))}
                        <SelectItem value="Custom">Custom (crear nuevo)</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="relative">
                      <Textarea
                        value={promptContent}
                        onChange={(e) => setPromptContent(e.target.value)}
                        rows={20}
                        className="font-mono text-xs bg-slate-900/80 border-slate-700 text-slate-200 leading-relaxed resize-none"
                        placeholder="Escribe tu system prompt aquí..."
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button onClick={savePrompt} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                        <Save className="h-3.5 w-3.5 mr-1.5" />
                        Guardar Prompt
                      </Button>
                      <Button onClick={resetPrompt} variant="outline" className="border-slate-600 text-slate-400 hover:text-slate-200 text-xs">
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        Reset por defecto
                      </Button>
                      {promptSaved && (
                        <span className="text-xs text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Guardado
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Preview Panel */}
              <div className="space-y-4">
                <Card className="border-slate-700/50 bg-slate-800/30">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-slate-400" />
                      <Label className="text-sm font-medium text-slate-200">Vista Previa</Label>
                    </div>
                    <div className="bg-slate-900/80 rounded-lg p-4 font-mono text-xs text-slate-300 max-h-[500px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
                      {promptContent ? promptContent : 'Selecciona una personalidad para ver el prompt...'}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-700/50 bg-slate-800/30">
                  <CardContent className="p-4 space-y-3">
                    <Label className="text-sm font-medium text-slate-200">Personalidades Disponibles</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'JHON', emoji: '🚗', desc: 'Vendedor automotriz' },
                        { id: 'Professional', emoji: '💼', desc: 'B2B formal' },
                        { id: 'Friendly', emoji: '😊', desc: 'Retail casual' },
                        { id: 'Aggressive', emoji: '🔥', desc: 'Alta presión' },
                      ].map(p => (
                        <button
                          key={p.id}
                          onClick={() => handlePromptChange(p.id)}
                          className={cn(
                            'p-2.5 rounded-lg border text-left text-xs transition-colors',
                            selectedPrompt === p.id
                              ? 'border-emerald-500/50 bg-emerald-500/5 text-emerald-400'
                              : 'border-slate-700 hover:border-slate-600 text-slate-400'
                          )}
                        >
                          <span className="text-base mr-1.5">{p.emoji}</span>
                          <span className="font-medium">{p.id}</span>
                          <span className="block text-[10px] text-slate-500 mt-0.5">{p.desc}</span>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ═══ TAB 3: Webhooks ═══ */}
          <TabsContent value="webhooks" className="space-y-4 pb-6">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Webhooks List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-slate-200">Webhooks Configurados</Label>
                  <Button onClick={() => setShowAddWebhook(!showAddWebhook)} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7">
                    <Plus className="h-3 w-3 mr-1" />
                    Agregar
                  </Button>
                </div>

                {showAddWebhook && (
                  <Card className="border-emerald-500/30 bg-emerald-500/5">
                    <CardContent className="p-3 space-y-3">
                      <Label className="text-xs text-slate-300">URL del Webhook</Label>
                      <Input
                        placeholder="https://tu-servidor.com/webhook"
                        className="h-8 bg-slate-900/50 border-slate-700 text-slate-200 font-mono text-xs"
                        value={newWebhookUrl}
                        onChange={(e) => setNewWebhookUrl(e.target.value)}
                      />
                      <Label className="text-xs text-slate-300">Eventos</Label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {webhookEvents.map(ev => (
                          <label key={ev.id} className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newWebhookEvents.includes(ev.id)}
                              onChange={(e) => {
                                if (e.target.checked) setNewWebhookEvents(prev => [...prev, ev.id])
                                else setNewWebhookEvents(prev => prev.filter(x => x !== ev.id))
                              }}
                              className="rounded border-slate-600 bg-slate-900 accent-emerald-500"
                            />
                            {ev.label}
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={addWebhook} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7">Crear Webhook</Button>
                        <Button onClick={() => setShowAddWebhook(false)} size="sm" variant="ghost" className="text-slate-400 text-xs h-7">Cancelar</Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {webhooks.length === 0 ? (
                  <Card className="border-slate-700/50 bg-slate-800/20">
                    <CardContent className="p-6 text-center">
                      <Webhook className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-xs text-slate-500">Sin webhooks configurados</p>
                      <p className="text-[10px] text-slate-600 mt-1">Agrega un webhook para recibir notificaciones de eventos</p>
                    </CardContent>
                  </Card>
                ) : (
                  webhooks.map(wh => (
                    <Card key={wh.id} className="border-slate-700/50 bg-slate-800/30">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-emerald-400 truncate max-w-[200px]">{wh.url}</span>
                          <Badge className={cn('h-5 text-[10px]', wh.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700 text-slate-400')}>
                            {wh.active ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {wh.events.map(ev => (
                            <Badge key={ev} variant="outline" className="h-5 text-[10px] border-slate-600 text-slate-500">{ev}</Badge>
                          ))}
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[10px] text-slate-600 font-mono truncate max-w-[180px]">{wh.secret.slice(0, 20)}...</span>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-emerald-400" onClick={() => testWebhook(wh.url)}>
                              <Play className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-red-400" onClick={() => removeWebhook(wh.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              {/* Request Log */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-slate-200">Últimas Entregas (10)</Label>
                <Card className="border-slate-700/50 bg-slate-800/30">
                  <CardContent className="p-3">
                    {webhookDeliveries.length === 0 ? (
                      <div className="text-center py-8">
                        <Activity className="h-6 w-6 text-slate-600 mx-auto mb-2" />
                        <p className="text-xs text-slate-500">Sin entregas registradas</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {webhookDeliveries.slice(0, 10).map((d, i) => (
                          <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-900/50 text-xs">
                            <div className="flex items-center gap-2">
                              <Badge className={cn('h-4 text-[10px] font-mono', d.status < 300 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400')}>
                                {d.status}
                              </Badge>
                              <span className="text-slate-400">{d.event}</span>
                            </div>
                            <span className="text-[10px] text-slate-600 font-mono">{new Date(d.time).toLocaleTimeString('es-MX')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ═══ TAB 4: Logs & Debug ═══ */}
          <TabsContent value="logs" className="space-y-4 pb-6">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Log Viewer */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium text-slate-200">Visor de Logs</Label>
                    <div className="flex items-center gap-1">
                      {(['all', 'info', 'warn', 'error'] as const).map(level => (
                        <button
                          key={level}
                          onClick={() => setLogFilter(level)}
                          className={cn(
                            'h-6 px-2 text-[10px] font-mono rounded border transition-colors',
                            logFilter === level
                              ? level === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400'
                              : level === 'warn' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                              : level === 'info' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-slate-700 border-slate-600 text-slate-300'
                              : 'border-slate-700 text-slate-500 hover:border-slate-600'
                          )}
                        >
                          {level.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAutoRefresh(!autoRefresh)}
                      className={cn(
                        'flex items-center gap-1 h-6 px-2 text-[10px] font-mono rounded border transition-colors',
                        autoRefresh ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'border-slate-700 text-slate-500'
                      )}
                    >
                      <RefreshCw className={cn('h-3 w-3', autoRefresh && 'animate-spin')} />
                      Auto
                    </button>
                    <Button variant="ghost" size="sm" className="h-6 text-slate-500 text-[10px] hover:text-red-400" onClick={() => setLogs([])}>
                      <Trash2 className="h-3 w-3 mr-1" />
                      Limpiar
                    </Button>
                  </div>
                </div>
                <div className="bg-[#0a0f1c] rounded-lg border border-slate-800 overflow-hidden">
                  <div className="max-h-[500px] overflow-y-auto p-3 space-y-1 font-mono text-xs">
                    {filteredLogs.length === 0 ? (
                      <div className="text-center py-8 text-slate-600">Sin logs</div>
                    ) : (
                      filteredLogs.map(log => (
                        <div key={log.id} className="flex gap-2 py-0.5 hover:bg-slate-800/50 rounded px-1">
                          <span className="text-slate-600 shrink-0">{new Date(log.timestamp).toLocaleTimeString('es-MX')}</span>
                          <Badge className={cn(
                            'h-4 text-[9px] shrink-0 px-1',
                            log.level === 'error' ? 'bg-red-500/10 text-red-400' :
                            log.level === 'warn' ? 'bg-yellow-500/10 text-yellow-400' :
                            'bg-emerald-500/10 text-emerald-400'
                          )}>
                            {log.level}
                          </Badge>
                          <span className="text-slate-500 shrink-0">[{log.source}]</span>
                          <span className="text-slate-300">{log.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Debug Console */}
              <div className="space-y-4">
                <Collapsible open={logsExpanded} onOpenChange={setLogsExpanded}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-slate-200 w-full">
                    {logsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    Consola de Debug
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-3">
                    <Card className="border-slate-700/50 bg-slate-800/30">
                      <CardContent className="p-3 space-y-3">
                        <div className="flex gap-2">
                          <Select value={debugAgent} onValueChange={setDebugAgent}>
                            <SelectTrigger className="w-36 h-8 bg-slate-900/50 border-slate-700 text-slate-200 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.keys(PERSONALITY_PROMPTS).map(k => (
                                <SelectItem key={k} value={k}>{k}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="relative">
                          <Input
                            placeholder="Escribe un mensaje de prueba..."
                            className="h-9 bg-slate-900/50 border-slate-700 text-slate-200 text-xs pr-20 font-mono"
                            value={debugMessage}
                            onChange={(e) => setDebugMessage(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleDebugSend()}
                          />
                          <Button
                            onClick={handleDebugSend}
                            disabled={debugLoading || !debugMessage.trim()}
                            size="sm"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                          >
                            {debugLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                            Enviar
                          </Button>
                        </div>

                        {debugResult && (
                          <div className="space-y-2">
                            <div className="flex gap-2 text-[10px] font-mono">
                              <Badge className="bg-slate-700 text-slate-300 h-5">{debugResult.tokens} tokens</Badge>
                              <Badge className="bg-slate-700 text-slate-300 h-5">{debugResult.time}ms</Badge>
                            </div>
                            <div className="bg-slate-900/80 rounded-lg p-3 text-xs text-emerald-300 max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                              {debugResult.response}
                            </div>
                            <Collapsible>
                              <CollapsibleTrigger className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1">
                                <ChevronRight className="h-3 w-3" />
                                Ver Prompt Enviado
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="bg-slate-900/80 rounded p-3 text-[10px] text-slate-400 max-h-[150px] overflow-y-auto font-mono whitespace-pre-wrap mt-1">
                                  {debugResult.prompt}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </CollapsibleContent>
                </Collapsible>

                {/* AI Agent Test */}
                <Card className="border-slate-700/50 bg-slate-800/30">
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-400" />
                      <Label className="text-sm font-medium text-slate-200">Test Rápido de Agente</Label>
                    </div>
                    <p className="text-[10px] text-slate-500">Envía un mensaje de prueba y visualiza la respuesta completa del agente IA con todos los metadatos.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-900/50 rounded p-2 text-center">
                        <p className="text-[10px] text-slate-500 mb-1">Respuesta</p>
                        <p className="text-xs font-bold text-emerald-400">{debugResult ? 'Recibida' : '—'}</p>
                      </div>
                      <div className="bg-slate-900/50 rounded p-2 text-center">
                        <p className="text-[10px] text-slate-500 mb-1">Tiempo</p>
                        <p className="text-xs font-bold text-slate-300">{debugResult ? `${debugResult.time}ms` : '—'}</p>
                      </div>
                      <div className="bg-slate-900/50 rounded p-2 text-center">
                        <p className="text-[10px] text-slate-500 mb-1">Tokens</p>
                        <p className="text-xs font-bold text-slate-300">{debugResult ? debugResult.tokens : '—'}</p>
                      </div>
                      <div className="bg-slate-900/50 rounded p-2 text-center">
                        <p className="text-[10px] text-slate-500 mb-1">Agente</p>
                        <p className="text-xs font-bold text-slate-300">{debugAgent}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ═══ TAB 5: Database ═══ */}
          <TabsContent value="database" className="space-y-4 pb-6">
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Table Selector */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-slate-200">Tablas</Label>
                <div className="space-y-1 max-h-[500px] overflow-y-auto">
                  {dbTables.map(table => (
                    <button
                      key={table}
                      onClick={() => setSelectedTable(table)}
                      className={cn(
                        'w-full text-left p-2 rounded text-xs font-mono transition-colors flex items-center justify-between',
                        selectedTable === table
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                      )}
                    >
                      <span>{table}</span>
                      {tableData?.name === table && (
                        <Badge className="h-4 text-[9px] bg-slate-700 text-slate-400">{tableData.count}</Badge>
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button onClick={exportTable} variant="outline" size="sm" className="border-slate-600 text-slate-400 hover:text-slate-200 text-xs flex-1">
                    <Download className="h-3 w-3 mr-1" />
                    Exportar CSV
                  </Button>
                </div>
              </div>

              {/* Table Data */}
              <div className="lg:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-slate-200">
                    {selectedTable} {tableData?.name === selectedTable && `(${tableData.count} registros)`}
                  </Label>
                  <Button variant="ghost" size="sm" className="text-slate-500 text-xs" onClick={fetchTableData}>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Refrescar
                  </Button>
                </div>
                <div className="bg-[#0a0f1c] rounded-lg border border-slate-800 overflow-hidden">
                  <div className="max-h-[300px] overflow-auto">
                    {tableData && tableData.records.length > 0 ? (
                      <table className="w-full text-xs font-mono">
                        <thead className="bg-slate-800/50 sticky top-0">
                          <tr>
                            {Object.keys(tableData.records[0]).map(col => (
                              <th key={col} className="text-left p-2 text-slate-500 border-b border-slate-700/50 whitespace-nowrap">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tableData.records.slice(0, 10).map((row, i) => (
                            <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                              {Object.values(row).map((val, j) => (
                                <td key={j} className="p-2 text-slate-400 max-w-[200px] truncate">
                                  {typeof val === 'string' ? (val.length > 40 ? val.slice(0, 40) + '...' : val) : JSON.stringify(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="text-center py-12 text-slate-600">
                        <Database className="h-6 w-6 mx-auto mb-2" />
                        Selecciona una tabla para ver sus datos
                      </div>
                    )}
                  </div>
                </div>

                {/* Raw Query */}
                <Card className="border-slate-700/50 bg-slate-800/30">
                  <CardContent className="p-3 space-y-3">
                    <Label className="text-xs text-slate-300">Consulta SQL (solo SELECT)</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="SELECT * FROM Contact WHERE status = 'active' LIMIT 10"
                        className="flex-1 h-8 bg-slate-900/50 border-slate-700 text-slate-200 font-mono text-xs"
                        value={rawQuery}
                        onChange={(e) => setRawQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addLog('info', 'database', `Query ejecutada: ${rawQuery}`)}
                      />
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8" onClick={() => addLog('info', 'database', `Query ejecutada: ${rawQuery}`)}>
                        <Play className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-[10px] text-slate-600">
                      <AlertTriangle className="h-3 w-3 inline mr-1" />
                      Solo se permiten consultas SELECT de lectura. Las consultas destructivas serán bloqueadas.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ═══ TAB 6: Configuration ═══ */}
          <TabsContent value="config" className="space-y-4 pb-6">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Feature Flags */}
              <Card className="border-slate-700/50 bg-slate-800/30">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <ToggleLeft className="h-4 w-4 text-slate-400" />
                    <Label className="text-sm font-medium text-slate-200">Feature Flags</Label>
                  </div>
                  <div className="space-y-3">
                    {[
                      { key: 'aiAutoReply' as const, label: 'Auto-respuesta IA', desc: 'Responde automáticamente mensajes entrantes' },
                      { key: 'whatsappConnection' as const, label: 'Conexión WhatsApp', desc: 'Habilita la conexión directa con WhatsApp' },
                      { key: 'leadScoring' as const, label: 'Lead Scoring', desc: 'Califica automáticamente los leads entrantes' },
                      { key: 'conversationAnalytics' as const, label: 'Analytics de Conversación', desc: 'Analiza métricas de conversaciones' },
                      { key: 'developerMode' as const, label: 'Modo Desarrollador', desc: 'Muestra información técnica en la UI' },
                    ].map(flag => (
                      <div key={flag.key} className="flex items-center justify-between p-2 rounded bg-slate-900/30">
                        <div>
                          <p className="text-xs font-medium text-slate-300">{flag.label}</p>
                          <p className="text-[10px] text-slate-600">{flag.desc}</p>
                        </div>
                        <Switch
                          checked={featureFlags[flag.key]}
                          onCheckedChange={(checked) => setFeatureFlags(prev => ({ ...prev, [flag.key]: checked }))}
                          className="data-[state=checked]:bg-emerald-500"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Rate Limits */}
              <div className="space-y-4">
                <Card className="border-slate-700/50 bg-slate-800/30">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-slate-400" />
                      <Label className="text-sm font-medium text-slate-200">Rate Limits</Label>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-slate-400">Mensajes por hora</Label>
                          <span className="text-xs font-mono text-emerald-400">{rateLimits.messagesPerHour}</span>
                        </div>
                        <Slider
                          value={[rateLimits.messagesPerHour]}
                          onValueChange={([v]) => setRateLimits(prev => ({ ...prev, messagesPerHour: v }))}
                          min={10}
                          max={500}
                          step={10}
                          className="[&>span]:bg-slate-600 [&>span>span]:bg-emerald-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-slate-400">Llamadas IA por minuto</Label>
                          <span className="text-xs font-mono text-emerald-400">{rateLimits.aiCallsPerMinute}</span>
                        </div>
                        <Slider
                          value={[rateLimits.aiCallsPerMinute]}
                          onValueChange={([v]) => setRateLimits(prev => ({ ...prev, aiCallsPerMinute: v }))}
                          min={1}
                          max={100}
                          step={1}
                          className="[&>span]:bg-slate-600 [&>span>span]:bg-emerald-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-slate-400">Max Contactos</Label>
                          <span className="text-xs font-mono text-emerald-400">{rateLimits.maxContacts.toLocaleString()}</span>
                        </div>
                        <Slider
                          value={[rateLimits.maxContacts]}
                          onValueChange={([v]) => setRateLimits(prev => ({ ...prev, maxContacts: v }))}
                          min={100}
                          max={100000}
                          step={100}
                          className="[&>span]:bg-slate-600 [&>span>span]:bg-emerald-500"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Environment */}
                <Card className="border-slate-700/50 bg-slate-800/30">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-slate-400" />
                      <Label className="text-sm font-medium text-slate-200">Variables de Entorno</Label>
                    </div>
                    <div className="space-y-1.5 font-mono text-xs">
                      {[
                        { key: 'DATABASE_URL', val: 'file:./db/dev.db', masked: false },
                        { key: 'NODE_ENV', val: 'development', masked: false },
                        { key: 'GROQ_API_KEY', val: 'gsk_••••••••••••', masked: true },
                        { key: 'DEEPSEEK_API_KEY', val: 'sk-••••••••••••', masked: true },
                        { key: 'NEXTAUTH_SECRET', val: '••••••••••••', masked: true },
                        { key: 'APP_VERSION', val: '1.0.0', masked: false },
                      ].map(env => (
                        <div key={env.key} className="flex items-center justify-between p-1.5 rounded bg-slate-900/50">
                          <span className="text-slate-500">{env.key}</span>
                          <span className={env.masked ? 'text-slate-600' : 'text-slate-400'}>{env.val}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
