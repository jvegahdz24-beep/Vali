'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Search,
  Send,
  Phone,
  Bot,
  Filter,
  MoreVertical,
  Paperclip,
  Smile,
  Check,
  CheckCheck,
  Star,
  Tag,
  User,
  Mail,
  MessageSquare,
  Loader2,
  Wifi,
  WifiOff,
  X,
  HandMetal,
  Sparkles,
  Image,
  Video,
  FileText,
  File,
  Mic,
  MapPin,
  Download,
  Play,
  Pause,
  ExternalLink,
  Volume2,
  Sticker,
  Contact,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn, formatPhoneNumber, timeAgo, getInitials, getChannelIcon, getChannelColor, truncate } from '@/lib/utils'
import { CHANNELS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// ── Types ──

interface Contact {
  id: string
  firstName: string
  lastName: string
  phone?: string | null
  email?: string | null
  leadScore: number
  avatar?: string | null
  tags?: string
  source?: string
}

interface Conversation {
  id: string
  contact: Contact
  channel: string
  lastMessageAt: string
  lastMessagePreview?: string | null
  unreadCount: number
  status: 'active' | 'pending' | 'closed'
  _count?: { messages: number }
}

interface MediaFileData {
  id: string
  fileName: string
  mimeType: string
  fileSize: number
  filePath: string
  thumbnailPath?: string | null
  caption?: string | null
  source: string
  metadata: string
}

interface Message {
  id: string
  content: string
  type: string
  direction: 'inbound' | 'outbound'
  isAiGenerated?: boolean | null
  senderType: string
  status: string | null
  metadata?: string | null
  createdAt: string
  mediaFiles?: MediaFileData[]
}

interface InboxProps {
  workspaceId: string
  onViewChange?: (view: string) => void
}

const quickReplies = [
  'Agendar cita',
  'Enviar precios',
  'Seguimiento 24h',
  'Gracias por contactarnos',
]

// System event messages shown in chat flow
const systemEvents = [
  { icon: '⚡', text: 'Lead nuevo detectado' },
  { icon: '🧠', text: 'Arquetipo: Comprador Urgente' },
  { icon: '📅', text: 'Cita agendada para mañana 10:00' },
  { icon: '📊', text: 'Score actualizado: 85 → 92' },
  { icon: '🔔', text: 'Seguimiento automático programado' },
]

function getScoreTextColor(score: number): string {
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-yellow-600'
  if (score >= 40) return 'text-orange-600'
  return 'text-red-600'
}

const commonEmojis = [
  '👍', '👏', '😊', '🙏', '🎉', '❤️', '🔥', '💯',
  '🚗', '💰', '⭐', '✅', '📅', '📞', '💡', '🤝',
  '😎', '🌟', '📦', '🏠',
]

function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-emerald-100 text-emerald-700'
  if (score >= 60) return 'bg-yellow-100 text-yellow-700'
  if (score >= 40) return 'bg-orange-100 text-orange-700'
  return 'bg-red-100 text-red-700'
}

function getStarredConversations(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem('valiflow_starred_conversations')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function setStarredConversations(ids: string[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem('valiflow_starred_conversations', JSON.stringify(ids))
}

// ── Media Message Components ──

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/** Image message bubble */
function ImageMessage({ mediaFile, content }: { mediaFile: MediaFileData; content?: string }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const mediaUrl = `/api/media/${mediaFile.id}`
  const thumbUrl = mediaFile.thumbnailPath ? `/api/media/${mediaFile.id}/thumbnail` : mediaUrl

  return (
    <div className="space-y-1.5">
      <div className="relative rounded-xl overflow-hidden bg-muted max-w-[280px]">
        {!loaded && !error && (
          <div className="aspect-square flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error ? (
          <div className="aspect-square flex flex-col items-center justify-center gap-2 bg-muted/50 p-4">
            <Image className="h-8 w-8 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Error al cargar imagen</span>
          </div>
        ) : (
          <img
            src={thumbUrl}
            alt={mediaFile.caption || 'Imagen'}
            className={cn(
              'w-full object-cover transition-opacity duration-200',
              loaded ? 'opacity-100' : 'opacity-0 absolute inset-0'
            )}
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
            loading="lazy"
          />
        )}
        {/* Full-size link */}
        <a
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 rounded-full p-1.5 transition-colors"
        >
          <ExternalLink className="h-3 w-3 text-white" />
        </a>
      </div>
      {content && !content.startsWith('[Imagen]') && (
        <p className="text-xs text-muted-foreground px-1">{content.replace(/^\[Imagen\]\s*/, '')}</p>
      )}
    </div>
  )
}

/** Video message bubble */
function VideoMessage({ mediaFile, content }: { mediaFile: MediaFileData; content?: string }) {
  const [playing, setPlaying] = useState(false)
  const mediaUrl = `/api/media/${mediaFile.id}`

  return (
    <div className="space-y-1.5">
      <div className="relative rounded-xl overflow-hidden bg-black max-w-[280px]">
        <video
          src={mediaUrl}
          className="w-full max-h-[300px] object-contain"
          controls
          preload="metadata"
          playsInline
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
            <div className="bg-white/90 rounded-full p-3">
              <Play className="h-6 w-6 text-emerald-600 fill-emerald-600" />
            </div>
          </div>
        )}
      </div>
      {content && !content.startsWith('[Video]') && (
        <p className="text-xs text-muted-foreground px-1">{content.replace(/^\[Video\]\s*/, '')}</p>
      )}
    </div>
  )
}

/** Audio/Voice note message bubble */
function AudioMessage({ mediaFile, content }: { mediaFile: MediaFileData; content?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const mediaUrl = `/api/media/${mediaFile.id}`
  const metadata = (() => { try { return JSON.parse(mediaFile.metadata) } catch { return {} } })()
  const isVoiceNote = metadata.isVoiceNote || mediaFile.mimeType === 'audio/ogg'

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onLoaded = () => setDuration(audio.duration)
    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onEnded = () => setPlaying(false)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
    }
  }, [])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) { audio.pause() } else { audio.play() }
    setPlaying(!playing)
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3 min-w-[220px] max-w-[300px]">
        <audio ref={audioRef} src={mediaUrl} preload="metadata" />
        <button
          onClick={togglePlay}
          className="shrink-0 w-10 h-10 rounded-full bg-emerald-100 hover:bg-emerald-200 flex items-center justify-center transition-colors"
        >
          {playing ? (
            <Pause className="h-4 w-4 text-emerald-700" />
          ) : (
            <Play className="h-4 w-4 text-emerald-700 fill-emerald-700" />
          )}
        </button>
        <div className="flex-1 space-y-1">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {isVoiceNote ? 'Nota de voz' : 'Audio'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {duration > 0 ? `${Math.floor(currentTime)}:${String(Math.floor(duration)).padStart(2, '0')}` : '--:--'}
            </span>
          </div>
        </div>
        <a
          href={mediaUrl}
          download={mediaFile.fileName}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Download className="h-4 w-4" />
        </a>
      </div>
      {content && !content.startsWith('[Nota de voz]') && !content.startsWith('[Audio]') && (
        <p className="text-xs text-muted-foreground px-1">{content}</p>
      )}
    </div>
  )
}

/** Document message bubble */
function DocumentMessage({ mediaFile, content }: { mediaFile: MediaFileData; content?: string }) {
  const mediaUrl = `/api/media/${mediaFile.id}`
  const isPdf = mediaFile.mimeType.includes('pdf')
  const isExcel = mediaFile.mimeType.includes('sheet') || mediaFile.mimeType.includes('excel') || mediaFile.mimeType.includes('csv')
  const isWord = mediaFile.mimeType.includes('word') || mediaFile.mimeType.includes('document')

  const iconColor = isPdf ? 'text-red-500' : isExcel ? 'text-green-600' : isWord ? 'text-blue-600' : 'text-zinc-500'
  const label = isPdf ? 'PDF' : isExcel ? 'Excel' : isWord ? 'Documento' : 'Archivo'

  return (
    <div className="max-w-[280px]">
      <a
        href={mediaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-background/50 hover:bg-muted/50 transition-colors"
      >
        <div className={cn('shrink-0', iconColor)}>
          {isPdf ? (
            <FileText className="h-10 w-10" />
          ) : isExcel ? (
            <FileText className="h-10 w-10" />
          ) : (
            <File className="h-10 w-10" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{mediaFile.fileName}</p>
          <p className="text-[10px] text-muted-foreground">{label} · {formatFileSize(mediaFile.fileSize)}</p>
        </div>
        <Download className="h-4 w-4 text-muted-foreground shrink-0" />
      </a>
      {content && !content.startsWith('[Documento]') && (
        <p className="text-xs text-muted-foreground mt-1 px-1">{content.replace(/^\[Documento\]\s*/, '')}</p>
      )}
    </div>
  )
}

/** Sticker message */
function StickerMessage({ mediaFile }: { mediaFile: MediaFileData }) {
  const [error, setError] = useState(false)
  const mediaUrl = `/api/media/${mediaFile.id}`

  if (error) return <span className="text-xs text-muted-foreground">Sticker</span>

  return (
    <img
      src={mediaUrl}
      alt="Sticker"
      className="w-32 h-32 object-contain"
      onError={() => setError(true)}
      loading="lazy"
    />
  )
}

/** Location message */
function LocationMessage({ content }: { content: string }) {
  try {
    // Try to parse location from message content or use a static map
    const metadata = (() => { try { return JSON.parse(content) } catch { return null } })()
    const lat = metadata?.latitude
    const lng = metadata?.longitude
    const name = metadata?.name || metadata?.locationName

    if (lat && lng) {
      const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`
      return (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-background/50 hover:bg-muted/50 transition-colors max-w-[280px]"
        >
          <div className="shrink-0 w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
            <MapPin className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{name || 'Ubicacion compartida'}</p>
            <p className="text-[10px] text-muted-foreground">{lat.toFixed(4)}, {lng.toFixed(4)}</p>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
        </a>
      )
    }
  } catch {}

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <MapPin className="h-4 w-4" />
      <span>{content || 'Ubicacion compartida'}</span>
    </div>
  )
}

/** Contact message */
function ContactMessage({ content }: { content: string }) {
  try {
    const metadata = (() => { try { return JSON.parse(content) } catch { return null } })()
    const name = metadata?.contactName || metadata?.name
    const phone = metadata?.contactPhone || metadata?.phone

    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-background/50 max-w-[280px]">
        <div className="shrink-0 w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
          <User className="h-5 w-5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{name || 'Contacto'}</p>
          {phone && <p className="text-[10px] text-muted-foreground">{phone}</p>}
        </div>
      </div>
    )
  } catch {}

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <User className="h-4 w-4" />
      <span>{content || 'Contacto compartido'}</span>
    </div>
  )
}

/** Main media renderer — picks the right component based on message type */
function MediaRenderer({ msg }: { msg: Message }) {
  const type = msg.type

  // If message has associated mediaFiles from DB
  if (msg.mediaFiles && msg.mediaFiles.length > 0) {
    const media = msg.mediaFiles[0]
    switch (type) {
      case 'image': return <ImageMessage mediaFile={media} content={msg.content} />
      case 'video': return <VideoMessage mediaFile={media} content={msg.content} />
      case 'audio': return <AudioMessage mediaFile={media} content={msg.content} />
      case 'document': return <DocumentMessage mediaFile={media} content={msg.content} />
      case 'sticker': return <StickerMessage mediaFile={media} />
      case 'location': return <LocationMessage content={msg.content} />
      case 'contact': return <ContactMessage content={msg.content} />
    }
  }

  // Fallback: render based on type + content pattern
  if (type === 'image') {
    // Try to extract mediaFileId from metadata
    try {
      const meta = msg.metadata ? JSON.parse(msg.metadata) : {}
      if (meta.mediaFileId) {
        return <ImageMessage mediaFile={{ id: meta.mediaFileId, fileName: meta.fileName || 'imagen.jpg', mimeType: meta.mimeType || 'image/jpeg', fileSize: meta.fileSize || 0, filePath: '', source: 'whatsapp', metadata: '{}' } as MediaFileData} content={msg.content} />
      }
    } catch {}
    return (
      <div className="flex items-center gap-2 text-sm">
        <Image className="h-4 w-4 text-blue-500 shrink-0" />
        <span>{msg.content}</span>
      </div>
    )
  }

  if (type === 'video') {
    try {
      const meta = msg.metadata ? JSON.parse(msg.metadata) : {}
      if (meta.mediaFileId) {
        return <VideoMessage mediaFile={{ id: meta.mediaFileId, fileName: meta.fileName || 'video.mp4', mimeType: meta.mimeType || 'video/mp4', fileSize: meta.fileSize || 0, filePath: '', source: 'whatsapp', metadata: '{}' } as MediaFileData} content={msg.content} />
      }
    } catch {}
    return (
      <div className="flex items-center gap-2 text-sm">
        <Video className="h-4 w-4 text-purple-500 shrink-0" />
        <span>{msg.content}</span>
      </div>
    )
  }

  if (type === 'audio') {
    try {
      const meta = msg.metadata ? JSON.parse(msg.metadata) : {}
      if (meta.mediaFileId) {
        return <AudioMessage mediaFile={{ id: meta.mediaFileId, fileName: meta.fileName || 'audio.ogg', mimeType: meta.mimeType || 'audio/ogg', fileSize: meta.fileSize || 0, filePath: '', source: 'whatsapp', metadata: JSON.stringify({ isVoiceNote: meta.mimeType === 'audio/ogg' }) } as MediaFileData} content={msg.content} />
      }
    } catch {}
    return (
      <div className="flex items-center gap-2 text-sm">
        <Mic className="h-4 w-4 text-orange-500 shrink-0" />
        <span>{msg.content}</span>
      </div>
    )
  }

  if (type === 'document') {
    try {
      const meta = msg.metadata ? JSON.parse(msg.metadata) : {}
      if (meta.mediaFileId) {
        return <DocumentMessage mediaFile={{ id: meta.mediaFileId, fileName: meta.fileName || 'documento.pdf', mimeType: meta.mimeType || 'application/pdf', fileSize: meta.fileSize || 0, filePath: '', source: 'whatsapp', metadata: '{}' } as MediaFileData} content={msg.content} />
      }
    } catch {}
    return (
      <div className="flex items-center gap-2 text-sm">
        <File className="h-4 w-4 text-zinc-500 shrink-0" />
        <span>{msg.content}</span>
      </div>
    )
  }

  if (type === 'sticker') {
    try {
      const meta = msg.metadata ? JSON.parse(msg.metadata) : {}
      if (meta.mediaFileId) {
        return <StickerMessage mediaFile={{ id: meta.mediaFileId, fileName: 'sticker.webp', mimeType: 'image/webp', fileSize: 0, filePath: '', source: 'whatsapp', metadata: '{}' } as MediaFileData} />
      }
    } catch {}
    return <span className="text-xs text-muted-foreground">Sticker</span>
  }

  if (type === 'location') {
    return <LocationMessage content={msg.content} />
  }

  if (type === 'contact') {
    return <ContactMessage content={msg.content} />
  }

  // Default: text message
  return null
}

// ── Inbox Component ──

export function Inbox({ workspaceId, onViewChange }: InboxProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [closedConversations, setClosedConversations] = useState<Set<string>>(new Set())
  const [selectedConversation, setSelectedConversation] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [currentContact, setCurrentContact] = useState<Contact | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [messageInput, setMessageInput] = useState('')
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [waConnected, setWaConnected] = useState<boolean | null>(null)
  const [sendMode, setSendMode] = useState<'ai' | 'manual'>('ai')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [notification, setNotification] = useState<string | null>(null)
  const [starredIds, setStarredIds] = useState<string[]>([])
  const [creatingDeal, setCreatingDeal] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load starred from localStorage
  useEffect(() => {
    setStarredIds(getStarredConversations())
  }, [])

  // Show notification helper
  const showNotif = useCallback((msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 3000)
  }, [])

  // Check WhatsApp connection status
  useEffect(() => {
    const checkWa = async () => {
      try {
        const res = await fetch('/api/whatsapp/status')
        if (res.ok) {
          const data = await res.json()
          setWaConnected(data.connected)
        }
      } catch { setWaConnected(false) }
    }
    checkWa()
    const interval = setInterval(checkWa, 15000)
    return () => clearInterval(interval)
  }, [])

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!workspaceId) return
    try {
      setIsLoadingConversations(true)
      const params = new URLSearchParams({ workspaceId })
      if (channelFilter !== 'all') params.set('channel', channelFilter)
      const res = await fetch(`/api/conversations?${params}`)
      if (!res.ok) throw new Error('Error al cargar conversaciones')
      const data = await res.json()
      setConversations(data.items || [])

      // Auto-select first conversation if none selected
      if (!selectedConversation && data.items && data.items.length > 0) {
        setSelectedConversation(data.items[0].id)
      }
    } catch (err) {
      console.error('Error fetching conversations:', err)
    } finally {
      setIsLoadingConversations(false)
    }
  }, [workspaceId, channelFilter, selectedConversation])

  useEffect(() => {
    fetchConversations()
    // Poll for new conversations/messages every 10s
    const pollInterval = setInterval(fetchConversations, 10000)
    return () => clearInterval(pollInterval)
  }, [fetchConversations])

  // Fetch messages for selected conversation
  const fetchMessages = useCallback(async () => {
    if (!selectedConversation) return
    try {
      setIsLoadingMessages(true)
      const res = await fetch(`/api/conversations/${selectedConversation}`)
      if (!res.ok) throw new Error('Error al cargar mensajes')
      const data = await res.json()
      const newMessages = data.messages || []
      // Only update if there are actually new messages (avoid scroll reset)
      if (newMessages.length !== messages.length) {
        setMessages(newMessages)
      }
      setCurrentContact(data.conversation?.contact || null)
    } catch (err) {
      console.error('Error fetching messages:', err)
    } finally {
      setIsLoadingMessages(false)
    }
  }, [selectedConversation, messages.length])

  useEffect(() => {
    fetchMessages()
    // Poll for new messages every 8s when a conversation is selected
    const pollInterval = setInterval(fetchMessages, 8000)
    return () => clearInterval(pollInterval)
  }, [fetchMessages])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selectedConversation, messages.length])

  const handleSend = async () => {
    if (!messageInput.trim() || !selectedConversation || isSending) return

    const content = messageInput.trim()
    setMessageInput('')
    setShowEmojiPicker(false)
    setIsSending(true)

    try {
      if (sendMode === 'ai') {
        // Send through AI chat endpoint for real AI response
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            conversationId: selectedConversation,
            message: content,
            channel: 'whatsapp',
          }),
        })

        if (!res.ok) throw new Error('Error al enviar mensaje')
      } else {
        // Manual mode: send directly without AI
        const res = await fetch(`/api/conversations/${selectedConversation}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            senderType: 'human_agent',
            direction: 'outbound',
          }),
        })

        if (!res.ok) throw new Error('Error al enviar mensaje')
      }

      // Refresh messages to show the new ones
      await fetchMessages()
      await fetchConversations()
    } catch (err) {
      console.error('Error sending message:', err)
    } finally {
      setIsSending(false)
    }
  }

  const insertEmoji = (emoji: string) => {
    setMessageInput((prev) => prev + emoji)
    setShowEmojiPicker(false)
  }

  const toggleStar = (convId: string) => {
    setStarredIds((prev) => {
      const next = prev.includes(convId)
        ? prev.filter((id) => id !== convId)
        : [...prev, convId]
      setStarredConversations(next)
      return next
    })
  }

  const handleCloseConversation = (convId: string) => {
    setClosedConversations((prev) => new Set(prev).add(convId))
    if (selectedConversation === convId) {
      const remaining = conversations.filter((c) => c.id !== convId && !closedConversations.has(c.id))
      setSelectedConversation(remaining.length > 0 ? remaining[0].id : '')
    }
    toast.success('Conversación cerrada')
  }

  const handleCreateDeal = async () => {
    if (!currentConv?.contact || creatingDeal) return
    setCreatingDeal(true)
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          title: currentConv.contact ? `Trato con ${currentConv.contact.firstName} ${currentConv.contact.lastName || ''}`.trim() : 'Nuevo trato',
          contactId: currentConv.contact?.id,
          value: 0,
        }),
      })
      if (!res.ok) throw new Error('Error al crear trato')
      toast.success('Trato creado correctamente')
    } catch {
      toast.error('Error al crear trato')
    } finally {
      setCreatingDeal(false)
    }
  }

  const handleTransferToHuman = async () => {
    if (!currentConv || transferring) return
    setTransferring(true)
    try {
      const res = await fetch(`/api/conversations/${currentConv.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedTo: null, status: 'active' }),
      })
      if (!res.ok) throw new Error('Error al transferir')
      toast.success('Conversación transferida a humano')
    } catch {
      toast.error('Error al transferir conversación')
    } finally {
      setTransferring(false)
    }
  }

  // Filter conversations client-side by search
  const filteredConversations = conversations.filter((conv) => {
    if (closedConversations.has(conv.id)) return false
    const contactName = (conv.contact ? `${conv.contact.firstName} ${conv.contact.lastName}` : '').toLowerCase()
    const lastMsg = (conv.lastMessagePreview || '').toLowerCase()
    const matchesSearch =
      contactName.includes(searchQuery.toLowerCase()) || lastMsg.includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  // Sort: starred first
  const sortedConversations = [...filteredConversations].sort((a, b) => {
    const aStar = starredIds.includes(a.id) ? 0 : 1
    const bStar = starredIds.includes(b.id) ? 0 : 1
    return aStar - bStar
  })

  const currentConv = conversations.find((c) => c.id === selectedConversation)
  const isCurrentStarred = selectedConversation ? starredIds.includes(selectedConversation) : false

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left Panel - Conversation List */}
      <div className="w-full sm:w-80 lg:w-96 border-r border-border bg-background flex flex-col shrink-0">
        {/* Search & Filter */}
        <div className="p-3 space-y-2 border-b border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Conversaciones</span>
            <Badge variant="secondary" className={cn(
              'h-6 text-[10px] gap-1',
              waConnected === true
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : waConnected === false
                  ? 'bg-red-50 text-red-600 border-red-200'
                  : 'bg-zinc-50 text-zinc-500 border-zinc-200'
            )}>
              {waConnected === true ? (
                <><Wifi className="h-3 w-3" /> WhatsApp OK</>
              ) : waConnected === false ? (
                <><WifiOff className="h-3 w-3" /> Sin conexión</>
              ) : (
                <><Loader2 className="h-3 w-3 animate-spin" /> Verificando...</>
              )}
            </Badge>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversaciones..."
              className="pl-8 h-9 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="Canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los canales</SelectItem>
                {CHANNELS.map((ch) => (
                  <SelectItem key={ch.value} value={ch.value}>
                    {ch.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="h-8 text-xs shrink-0">
              {sortedConversations.length} chats
            </Badge>
          </div>
        </div>

        {/* Conversation List */}
        <ScrollArea className="flex-1">
          {isLoadingConversations ? (
            <div className="p-3 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 p-2">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {sortedConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv.id)}
                  className={cn(
                    'w-full flex items-start gap-3 p-3 text-left hover:bg-muted/50 transition-colors',
                    selectedConversation === conv.id && 'bg-muted/80'
                  )}
                >
                  <div className="relative">
                    <Avatar className="h-10 w-10 shrink-0 mt-0.5">
                      <AvatarFallback className={cn(
                        'text-xs font-semibold',
                        conv.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : conv.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-zinc-100 text-zinc-600'
                      )}>
                        {getInitials(conv.contact ? `${conv.contact.firstName} ${conv.contact.lastName}` : '??')}
                      </AvatarFallback>
                    </Avatar>
                    {starredIds.includes(conv.id) && (
                      <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 absolute -top-1 -right-1" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {conv.contact ? `${conv.contact.firstName} ${conv.contact.lastName}` : 'Sin contacto'}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {timeAgo(new Date(conv.lastMessageAt))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs">{getChannelIcon(conv.channel)}</span>
                      <span className={cn('text-xs', getChannelColor(conv.channel))}>
                        {CHANNELS.find((ch) => ch.value === conv.channel)?.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {truncate(conv.lastMessagePreview || 'Sin mensajes', 45)}
                    </p>
                  </div>
                  {/* Reactivation dot for cold leads */}
                  {(() => {
                    const daysSince = Math.floor((Date.now() - new Date(conv.lastMessageAt).getTime()) / 86400000)
                    const isCold = daysSince > 3
                    return isCold ? (
                      <span className="mt-2 h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" title="Lead frío · Reactivar" />
                    ) : null
                  })()}
                  {conv.unreadCount > 0 && (
                    <span className="mt-1 h-5 min-w-5 flex items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold px-1.5">
                      {conv.unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right Panel - Chat View */}
      <div className="flex-1 flex flex-col bg-muted/20 relative">
        {/* Notification Toast */}
        {notification && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-2">
            {notification}
          </div>
        )}

        {currentConv ? (
          <>
            {/* Contact Header */}
            <div className="h-14 border-b border-border bg-background flex items-center justify-between px-4 shrink-0">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-semibold">
                    {getInitials(currentConv.contact ? `${currentConv.contact.firstName} ${currentConv.contact.lastName}` : '??')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      {currentConv.contact ? `${currentConv.contact.firstName} ${currentConv.contact.lastName}` : 'Sin contacto'}
                    </h3>
                    <span className="text-xs">{getChannelIcon(currentConv.channel)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {currentConv.contact.phone && (
                      <span className="text-[10px] text-muted-foreground">
                        {formatPhoneNumber(currentConv.contact.phone)}
                      </span>
                    )}
                    <Badge className={cn('h-4 text-[9px] px-1.5 border-0', getScoreColor(currentConv.contact.leadScore))}>
                      Score {currentConv.contact.leadScore}
                    </Badge>
                    {currentConv.contact.source && (
                      <Badge variant="secondary" className="h-4 text-[9px] px-1.5 border-0">
                        {currentConv.contact.source}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Send Mode Toggle */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          'h-8 gap-1.5 text-xs px-2',
                          sendMode === 'ai'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                        )}
                        onClick={() => setSendMode(sendMode === 'ai' ? 'manual' : 'ai')}
                      >
                        {sendMode === 'ai' ? (
                          <><Sparkles className="h-3.5 w-3.5" /> IA</>
                        ) : (
                          <><HandMetal className="h-3.5 w-3.5" /> Manual</>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {sendMode === 'ai' ? 'Modo IA activado — los mensajes se procesan con IA' : 'Modo Manual — envío directo sin IA'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <Separator orientation="vertical" className="h-6 mx-1" />

                {/* Action Buttons */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Adjuntar</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn('h-8 w-8', currentConv.contact.phone ? '' : 'opacity-40')}
                        onClick={() => {
                          if (currentConv.contact.phone) {
                            window.open(`tel:${currentConv.contact.phone}`, '_self')
                          } else {
                            showNotif('Sin número de teléfono')
                          }
                        }}
                      >
                        <Phone className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Llamar</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn('h-8 w-8', currentConv.contact.email ? '' : 'opacity-40')}
                        onClick={() => {
                          if (currentConv.contact.email) {
                            window.open(`mailto:${currentConv.contact.email}`, '_self')
                          } else {
                            showNotif('Sin correo electrónico')
                          }
                        }}
                      >
                        <Mail className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Email</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => showNotif('Gestión de etiquetas - Próximamente')}
                      >
                        <Tag className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Tags</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleStar(selectedConversation)}
                      >
                        <Star className={cn(
                          'h-4 w-4',
                          isCurrentStarred
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-muted-foreground'
                        )} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isCurrentStarred ? 'Quitar favorito' : 'Marcar favorito'}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onViewChange?.('contacts')}>
                      <User className="h-4 w-4 mr-2" />
                      Ver perfil
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleCreateDeal} disabled={creatingDeal}>
                      <Tag className="h-4 w-4 mr-2" />
                      {creatingDeal ? 'Creando trato...' : 'Crear trato'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleTransferToHuman} disabled={transferring}>
                      <HandMetal className="h-4 w-4 mr-2" />
                      {transferring ? 'Transfiriendo...' : 'Transferir a humano'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={() => handleCloseConversation(currentConv.id)}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cerrar conversación
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {isLoadingMessages ? (
                <div className="max-w-2xl mx-auto space-y-4 py-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className={cn('flex gap-2', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
                      <Skeleton className="h-16 w-64 rounded-2xl" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="max-w-2xl mx-auto space-y-3">
                  {/* System Event Messages — only shown when AI-detected events exist in message metadata */}
                  {messages.some((msg) => {
                    if (msg.senderType !== 'system') return false
                    try {
                      const meta = msg.metadata ? JSON.parse(msg.metadata) : {}
                      return meta?.type === 'lead_detected'
                    } catch { return false }
                  }) && (
                    <div className="flex justify-center">
                      <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-3 py-1 text-xs text-center max-w-fit">
                        ⚡ Lead nuevo detectado
                      </div>
                    </div>
                  )}
                  {messages.some((msg) => {
                    if (msg.senderType !== 'system') return false
                    try {
                      const meta = msg.metadata ? JSON.parse(msg.metadata) : {}
                      return meta?.type === 'archetype_detected'
                    } catch { return false }
                  }) && (() => {
                    const sysMsg = messages.find((msg) => {
                      if (msg.senderType !== 'system') return false
                      try {
                        const meta = msg.metadata ? JSON.parse(msg.metadata) : {}
                        return meta?.type === 'archetype_detected'
                      } catch { return false }
                    })
                    let archetypeLabel = 'Arquetipo detectado'
                    try {
                      const meta = sysMsg?.metadata ? JSON.parse(sysMsg.metadata) : {}
                      if (meta?.archetype) archetypeLabel = `Arquetipo detectado: ${meta.archetype}`
                    } catch { /* use default label */ }
                    return (
                      <div className="flex justify-center">
                        <div className="bg-purple-50 text-purple-800 border border-purple-200 rounded-full px-3 py-1 text-xs text-center max-w-fit">
                          🧠 {archetypeLabel}
                        </div>
                      </div>
                    )
                  })()}
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex gap-2',
                        msg.direction === 'inbound' ? 'justify-start' : 'justify-end'
                      )}
                    >
                      {msg.direction === 'inbound' && (
                        <Avatar className="h-7 w-7 shrink-0 mt-auto">
                          <AvatarFallback className="bg-zinc-100 text-zinc-600 text-[9px]">
                            {currentContact ? getInitials(`${currentContact.firstName} ${currentContact.lastName}`) : '??'}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className={cn('max-w-[75%]')}>
                        {/* Check if this is a media message */}
                        {msg.type !== 'text' && msg.type !== 'interactive' ? (
                          <div
                            className={cn(
                              'rounded-2xl px-3 py-2.5',
                              msg.direction === 'inbound'
                                ? 'bg-background rounded-bl-md border border-border/60'
                                : 'bg-emerald-600 rounded-br-md'
                            )}
                          >
                            <MediaRenderer msg={msg} />
                            {/* Show text content if it's not just the type prefix */}
                            {msg.content && !msg.content.startsWith(`[${msg.type === 'audio' ? 'Nota de voz' : msg.type.charAt(0).toUpperCase() + msg.type.slice(1)}]`) && (
                              <p className={cn(
                                'text-sm mt-1',
                                msg.direction === 'outbound' ? 'text-white/90' : 'text-foreground'
                              )}>{msg.content}</p>
                            )}
                          </div>
                        ) : (
                          <div
                            className={cn(
                              'rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line',
                              msg.direction === 'inbound'
                                ? 'bg-background rounded-bl-md border border-border/60'
                                : 'bg-emerald-600 text-white rounded-br-md'
                            )}
                          >
                            {msg.content}
                          </div>
                        )}
                        <div className={cn(
                          'flex items-center gap-1.5 mt-1 px-1',
                          msg.direction === 'inbound' ? 'justify-start' : 'justify-end'
                        )}>
                          <span className="text-[10px] text-muted-foreground">
                            {timeAgo(new Date(msg.createdAt))}
                          </span>
                          {msg.isAiGenerated && (
                            <Badge variant="secondary" className="h-4 text-[9px] px-1 bg-emerald-50 text-emerald-600 border-0 gap-0.5">
                              <Bot className="h-2.5 w-2.5" />
                              IA
                            </Badge>
                          )}
                          {msg.direction === 'outbound' && (
                            msg.status === 'read' ? (
                              <CheckCheck className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Check className="h-3 w-3 text-muted-foreground" />
                            )
                          )}
                        </div>
                      </div>
                      {msg.direction === 'outbound' && msg.isAiGenerated && (
                        <Avatar className="h-7 w-7 shrink-0 mt-auto">
                          <AvatarFallback className="bg-emerald-100 text-emerald-700 text-[9px]">
                            <Bot className="h-3.5 w-3.5" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  ))}
                  {isSending && (
                    <div className="flex justify-end gap-2">
                      <div className="max-w-[75%]">
                        <div className="rounded-2xl px-4 py-2.5 text-sm bg-muted rounded-br-md flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                          <span className="text-muted-foreground">
                            {sendMode === 'ai' ? 'Procesando con IA...' : 'Enviando...'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Quick Replies */}
            <div className="px-4 py-2 border-t border-border bg-background">
              <div className="max-w-2xl mx-auto">
                <ScrollArea className="w-full" type="scroll">
                  <div className="flex gap-2 pb-1">
                    {quickReplies.map((reply) => (
                      <button
                        key={reply}
                        onClick={() => setMessageInput(reply)}
                        className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {/* Message Input */}
            <div className="px-4 pb-4 pt-2 border-t border-border bg-background">
              <div className="max-w-2xl mx-auto flex items-end gap-2">
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.3gp,.ogg,.mp3,.m4a,.pdf,.doc,.docx,.xls,.xlsx,.csv"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const formData = new FormData()
                      formData.append('file', file)
                      formData.append('conversationId', selectedConversation)
                      try {
                        const res = await fetch('/api/upload', { method: 'POST', body: formData })
                        if (res.ok) {
                          const data = await res.json()
                          toast.success(`Archivo "${file.name}" adjuntado`)
                          // If WhatsApp connected, offer to send
                          if (waConnected && currentConv?.contact?.phone) {
                            try {
                              const sendRes = await fetch('/api/whatsapp/send-media', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  phone: currentConv.contact.phone,
                                  mediaId: data.mediaId,
                                  conversationId: selectedConversation,
                                }),
                              })
                              if (sendRes.ok) {
                                toast.success('Archivo enviado por WhatsApp')
                                await fetchMessages()
                                await fetchConversations()
                              } else {
                                toast.info('Archivo guardado pero no enviado por WhatsApp')
                              }
                            } catch {
                              toast.info('Archivo guardado localmente')
                            }
                          }
                        } else {
                          toast.error('Error al adjuntar archivo')
                        }
                      } catch {
                        toast.error('Error al adjuntar archivo')
                      }
                      e.target.value = ''
                    }}
                  />
                </div>
                <div className="flex-1 relative">
                  <Input
                    placeholder={sendMode === 'ai' ? 'Escribe un mensaje (se procesa con IA)...' : 'Escribe un mensaje (envío directo)...'}
                    className="pr-10 h-10 rounded-xl bg-muted/50 border-0 focus-visible:ring-1"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    disabled={isSending}
                  />
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-9 w-9 text-muted-foreground z-10"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    >
                      <Smile className="h-4 w-4" />
                    </Button>
                    {showEmojiPicker && (
                      <div className="absolute bottom-full right-0 mb-2 bg-background border border-border rounded-lg shadow-lg p-3 z-20">
                        <div className="grid grid-cols-5 gap-1">
                          {commonEmojis.map((emoji) => (
                            <button
                              key={emoji}
                              className="h-8 w-8 flex items-center justify-center text-lg hover:bg-muted rounded transition-colors"
                              onClick={() => insertEmoji(emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  size="icon"
                  className={cn(
                    'h-10 w-10 rounded-xl shrink-0 disabled:opacity-50',
                    sendMode === 'ai'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-zinc-700 hover:bg-zinc-800 text-white'
                  )}
                  onClick={handleSend}
                  disabled={isSending || !messageInput.trim()}
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {/* Send Mode Indicator */}
              <div className="max-w-2xl mx-auto mt-1">
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded',
                  sendMode === 'ai'
                    ? 'text-emerald-600 bg-emerald-50'
                    : 'text-zinc-600 bg-zinc-100'
                )}>
                  {sendMode === 'ai' ? '🤖 Modo IA activado' : '✋ Modo Manual activado'}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {isLoadingConversations
                  ? 'Cargando conversaciones...'
                  : 'Selecciona una conversación para ver los mensajes'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
