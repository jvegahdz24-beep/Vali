'use client'

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
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
  Pencil,
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
  Circle,
  ArrowUpRight,
  Copy,
  Bookmark,
  PenLine,
  Zap,
  Brain,
  ThumbsUp,
  Heart,
  PartyPopper,
  Wand2,
  Instagram,
  Facebook,
  Globe,
  MessageCircle,
  CalendarCheck,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { EventBusTicker } from '@/components/dashboard/event-bus-ticker'
import { hasCapability } from '@/lib/rbac'
import { CorrectionDialog } from './training-studio'
import { cn, formatPhoneNumber, timeAgo, getInitials, truncate } from '@/lib/utils'
import { CHANNELS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { ExpedientePanel } from '@/components/dashboard/expediente-panel'
import { QuoteModal } from '@/components/dashboard/quote-modal'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// ── Helpers ──
function getContactName(contact: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  if (!contact) return 'Sin contacto'
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Sin contacto'
}

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
  customFields?: string
  notes?: string | null
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
  updatedAt?: string
  mediaFiles?: MediaFileData[]
  isStarred?: boolean
}

const statusLabels: Record<string, { label: string; color: string }> = {
  active: { label: 'Activa', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  closed: { label: 'Cerrada', color: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
  bot: { label: 'Bot', color: 'bg-blue-100 text-blue-600 border-blue-200' },
}

interface InboxProps {
  workspaceId: string
  onViewChange?: (view: string) => void
  initialContactId?: string
}

const quickReplies: { label: string; template: string }[] = [
  { label: 'Agendar cita', template: '¿Le gustaría agendar una cita? Podemos coordinar el día y horario que mejor le convenga 📅' },
  { label: 'Enviar precios', template: 'Con gusto le comparto nuestra información de precios y paquetes. ¿Qué es lo que más le interesa?' },
  { label: 'Seguimiento 24h', template: 'Le contactamos para darle seguimiento a nuestra conversación. ¿Pudo revisar la información que le enviamos?' },
  { label: 'Gracias por contactarnos', template: '¡Gracias por contactarnos! Es un placer atenderle. ¿En qué podemos ayudarle hoy? 😊' },
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

function getStarredMessages(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem('valiflow_starred_messages')
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function setStarredMessages(data: Record<string, boolean>) {
  if (typeof window === 'undefined') return
  localStorage.setItem('valiflow_starred_messages', JSON.stringify(data))
}

function getMessageReactions(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem('valiflow_message_reactions')
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function setMessageReaction(msgId: string, emoji: string) {
  if (typeof window === 'undefined') return
  const reactions = getMessageReactions()
 reactions[msgId] = reactions[msgId] === emoji ? '' : emoji
  localStorage.setItem('valiflow_message_reactions', JSON.stringify(reactions))
}

// ── Avatar con foto real + badge del canal (WhatsApp/IG/FB) ──
function InboxChannelBadge({ channel }: { channel: string }) {
  const ch = (channel || 'whatsapp').toLowerCase()
  const map: Record<string, { bg: string; icon: React.ReactNode }> = {
    whatsapp: { bg: 'bg-green-500', icon: <MessageCircle className="h-2.5 w-2.5 text-white" /> },
    instagram: { bg: 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600', icon: <Instagram className="h-2.5 w-2.5 text-white" /> },
    facebook: { bg: 'bg-blue-600', icon: <Facebook className="h-2.5 w-2.5 text-white" /> },
    messenger: { bg: 'bg-blue-600', icon: <Facebook className="h-2.5 w-2.5 text-white" /> },
    telegram: { bg: 'bg-sky-500', icon: <Send className="h-2.5 w-2.5 text-white" /> },
    webchat: { bg: 'bg-violet-500', icon: <Globe className="h-2.5 w-2.5 text-white" /> },
  }
  const c = map[ch] || map.whatsapp
  return (
    <span className={cn('absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full ring-2 ring-background h-4 w-4 shadow', c.bg)}>
      {c.icon}
    </span>
  )
}

function ContactChannelAvatar({ name, avatar, channel, size = 44, statusColor }: { name: string; avatar?: string | null; channel?: string; size?: number; statusColor?: string }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <Avatar className="h-full w-full ring-2 ring-background">
        {avatar ? <AvatarImage src={avatar} alt={name} /> : null}
        <AvatarFallback className={cn('text-[11px] font-semibold', statusColor || 'bg-gradient-to-br from-zinc-600 to-zinc-800 text-white')}>{getInitials(name || '??')}</AvatarFallback>
      </Avatar>
      {channel ? <InboxChannelBadge channel={channel} /> : null}
    </div>
  )
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
  // Empieza por la miniatura; si falla, cae a la imagen completa antes de rendirse.
  const [imgSrc, setImgSrc] = useState(thumbUrl)

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
            <span className="text-xs text-muted-foreground">Imagen no disponible</span>
          </div>
        ) : (
          <img
            src={imgSrc}
            alt={mediaFile.caption || 'Imagen'}
            className={cn(
              'w-full object-cover transition-opacity duration-200',
              loaded ? 'opacity-100' : 'opacity-0 absolute inset-0'
            )}
            onLoad={() => setLoaded(true)}
            onError={() => { if (imgSrc !== mediaUrl) setImgSrc(mediaUrl); else setError(true) }}
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

export function Inbox({ workspaceId, onViewChange, initialContactId }: InboxProps) {
  const { user } = useAuth()
  // Solo owner/admin pueden enseñar/corregir a la IA (capacidad agents.manage).
  const canTrainAi = hasCapability(user?.workspaceRole, 'agents.manage')
  const [correction, setCorrection] = useState<{ messageId: string; bad: string; trigger: string } | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [convLimit, setConvLimit] = useState(100) // cuántas conversaciones pedir (paginación incremental)
  const [convTotal, setConvTotal] = useState(0)  // total disponible (para "Cargar más")
  const [closedConversations, setClosedConversations] = useState<Set<string>>(new Set())
  const [selectedConversation, setSelectedConversation] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [currentContact, setCurrentContact] = useState<Contact | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [messageInput, setMessageInput] = useState('')
  // Respuestas rápidas SUGERIDAS POR IA (según la conversación). Arrancan con
  // las genéricas y se reemplazan cuando la IA analiza el chat abierto.
  const [aiQuickReplies, setAiQuickReplies] = useState<{ label: string; text: string }[]>(
    quickReplies.map((q) => ({ label: q.label, text: q.template }))
  )
  const [quickRepliesLoading, setQuickRepliesLoading] = useState(false)
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [waConnected, setWaConnected] = useState<boolean | null>(null)
  // Reconexión transitoria (ya estuvo conectado, se está recuperando): NO debe
  // bloquear la bandeja; solo mostramos un aviso pequeño. El bloqueo total es
  // solo para cuando NUNCA se ha conectado (hay que escanear QR).
  const [waReconnecting, setWaReconnecting] = useState(false)
  const [sendMode, setSendMode] = useState<'ai' | 'manual'>('ai')
  // Pausa temporal del bot (ISO): al vencer, el backend reactiva la IA solo.
  const [aiPausedUntil, setAiPausedUntil] = useState<string | null>(null)
  // Editar el nombre del contacto desde el chat (el bot usa este nombre en TODO)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [notification, setNotification] = useState<string | null>(null)
  const [starredIds, setStarredIds] = useState<string[]>([])
  const [listTab, setListTab] = useState<'all' | 'unread' | 'starred' | 'mentions'>('all')
  // Pestañas del chat (Chat · Notas · Historial · Archivos · Eventos)
  const [chatTab, setChatTab] = useState<'chat' | 'notas' | 'historial' | 'archivos' | 'eventos'>('chat')
  const [showFilters, setShowFilters] = useState(false)
  // Filtros reales del panel "Filtros": temperatura del lead y estado de la conversación
  const [tempFilter, setTempFilter] = useState<'all' | 'hot' | 'warm' | 'cold'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'closed'>('all')
  const [notesDraft, setNotesDraft] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [chatTimeline, setChatTimeline] = useState<Array<{ id: string; title: string; createdAt: string; source?: string }> | null>(null)
  const [transferring, setTransferring] = useState(false)
  const [messageSearchQuery, setMessageSearchQuery] = useState('')
  const [showMessageSearch, setShowMessageSearch] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [typingIndicator, setTypingIndicator] = useState(false)
  const [statusChangeConv, setStatusChangeConv] = useState<string | null>(null)
  const [starredMessages, setStarredMessages] = useState<Record<string, boolean>>(getStarredMessages)
  const [messageReactions, setMessageReactionsState] = useState<Record<string, string>>(getMessageReactions)
  const [showExpediente, setShowExpediente] = useState(false)
  // Panel persistente (3ra columna en xl). El botón "Expediente" lo colapsa/expande
  // en pantallas anchas en vez de abrir el overlay (evita verlo DOBLE).
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [searchMatchIdx, setSearchMatchIdx] = useState(0)
  const [showTagsModal, setShowTagsModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showDealModal, setShowDealModal] = useState(false)
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const selectedConversationRef = useRef<string>('')

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
          // "Reconectando" = no conectado pero está conectándose o ya tiene un
          // número vinculado (fue conectado antes). Eso NO bloquea la bandeja.
          setWaReconnecting(!data.connected && (data.connecting === true || !!data.phone))
        }
      } catch { /* mantiene el último estado conocido; no bloquear por un fallo de red */ }
    }
    checkWa()
    const interval = setInterval(checkWa, 15000)
    return () => clearInterval(interval)
  }, [])

  // Fetch conversations. silent=true → refresco en segundo plano (poll): NO
  // toca el estado de carga para que la lista no parpadee cada 30s.
  const fetchConversations = useCallback(async (silent = false) => {
    if (!workspaceId) return
    try {
      if (!silent) setIsLoadingConversations(true)
      const params = new URLSearchParams({ workspaceId, limit: String(convLimit) })
      if (channelFilter !== 'all') params.set('channel', channelFilter)
      const res = await fetch(`/api/conversations?${params}`)
      if (!res.ok) throw new Error('Error al cargar conversaciones')
      const data = await res.json()
      setConvTotal(typeof data.total === 'number' ? data.total : 0)
      // Deduplicate by contactId — keep the most recent conversation per contact
      const items: Conversation[] = data.items || []
      const seen = new Set<string>()
      const deduped = items.filter(conv => {
        const key = (conv as { contactId?: string }).contactId || conv.id
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setConversations(deduped)

      // Auto-select conversation by initialContactId, or first if none selected.
      // En MÓVIL (<640px) NO auto-abrimos la primera: se debe ver la LISTA primero
      // (como WhatsApp). En escritorio sí, para mostrar un chat de inmediato.
      if (!selectedConversation) {
        const deepId = initialContactId ? initialContactId.split('|')[0] : undefined
        if (deepId) {
          const match = items.find(c => (c as any).contactId === deepId)
          if (match) { setSelectedConversation(match.id); return }
        }
        const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 640
        if (isDesktop && data.items && data.items.length > 0) {
          setSelectedConversation(data.items[0].id)
        }
      }
    } catch (err) {
      console.error('Error fetching conversations:', err)
    } finally {
      if (!silent) setIsLoadingConversations(false)
    }
  }, [workspaceId, channelFilter, selectedConversation, convLimit])

  useEffect(() => {
    fetchConversations()
    // Poll for new conversations — 30s interval with visibility detection
    const POLL_INTERVAL = 30000
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchConversations(true)
      }
    }, POLL_INTERVAL)
    return () => clearInterval(pollInterval)
  }, [fetchConversations])

  useEffect(() => {
    selectedConversationRef.current = selectedConversation
    setMessages([])
    setCurrentContact(null)
    setEditingName(false)
    // Al cambiar de chat, vuelve a los genéricos hasta que la IA analice el nuevo
    setAiQuickReplies(quickReplies.map((q) => ({ label: q.label, text: q.template })))
  }, [selectedConversation])

  // Deep-link: si initialContactId CAMBIA con la bandeja ya montada (clic en una
  // notificación estando en Conversaciones), salta a la conversación de ese contacto.
  // Se aplica UNA vez por valor (ref) para que el poll de conversaciones (que cambia
  // la identidad del array cada 30s) no regrese al usuario si cambió de chat a mano.
  const appliedDeepLinkRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!initialContactId || conversations.length === 0) return
    if (appliedDeepLinkRef.current === initialContactId) return
    const deepId = initialContactId.split('|')[0]
    const match = conversations.find(c => (c as { contactId?: string }).contactId === deepId)
    if (match) {
      appliedDeepLinkRef.current = initialContactId
      if (match.id !== selectedConversationRef.current) setSelectedConversation(match.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContactId, conversations])

  // Al vaciarse el compositor (mensaje enviado), la caja vuelve a 1 línea.
  useEffect(() => {
    if (messageInput === '' && composerRef.current) composerRef.current.style.height = 'auto'
  }, [messageInput])

  // ── Búsqueda dentro del chat: coincidencias + salto al mensaje actual ──
  const searchMatches = messageSearchQuery.trim()
    ? messages.filter((m) => m.senderType !== 'system' && m.content.toLowerCase().includes(messageSearchQuery.trim().toLowerCase()))
    : []
  useEffect(() => {
    if (!messageSearchQuery.trim()) return
    const q = messageSearchQuery.trim().toLowerCase()
    const matches = messages.filter((m) => m.senderType !== 'system' && m.content.toLowerCase().includes(q))
    const target = matches[Math.min(searchMatchIdx, Math.max(0, matches.length - 1))]
    if (target) {
      document.getElementById(`msg-${target.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageSearchQuery, searchMatchIdx, messages])

  // Respuestas rápidas SUGERIDAS POR IA: se regeneran al abrir el chat y cada
  // vez que llega/cambia el último mensaje (para que reflejen lo que el cliente
  // acaba de decir). Se apoya en el endpoint que analiza la conversación.
  const lastMsgId = messages.length > 0 ? messages[messages.length - 1].id : ''
  useEffect(() => {
    if (!selectedConversation || messages.length === 0) return
    const convId = selectedConversation
    let cancelled = false
    setQuickRepliesLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/conversations/${convId}/quick-replies`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled || selectedConversationRef.current !== convId) return
        if (Array.isArray(data.replies) && data.replies.length > 0) setAiQuickReplies(data.replies)
      } catch { /* mantiene los actuales */ } finally {
        if (!cancelled) setQuickRepliesLoading(false)
      }
    }, 400) // pequeño debounce para no llamar en cada tecla del poll
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation, lastMsgId])

  // Fetch messages for selected conversation
  const fetchMessages = useCallback(async () => {
    if (!selectedConversation) return
    const conversationId = selectedConversation
    try {
      if (messages.length === 0) setIsLoadingMessages(true)
      const res = await fetch(`/api/conversations/${conversationId}?all=true`)
      if (!res.ok) throw new Error('Error al cargar mensajes')
      const data = await res.json()
      if (selectedConversationRef.current !== conversationId) return
      const newMessages = [...(data.messages || [])].sort(
        (a: Message, b: Message) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
      const nextSignature = newMessages.map((msg: Message) => `${msg.id}:${msg.updatedAt || msg.createdAt}`).join('|')
      setMessages((current) => {
        const currentSignature = current.map((msg) => `${msg.id}:${msg.updatedAt || msg.createdAt}`).join('|')
        return nextSignature !== currentSignature ? newMessages : current
      })
      setCurrentContact(data.conversation?.contact || null)
      // Sync sendMode — contact-level customFields.aiDisabled is the primary
      // source (channel/status-independent); conversation metadata is the fallback.
      try {
        const contactCF = JSON.parse(data.conversation?.contact?.customFields || '{}')
        const meta = JSON.parse(data.conversation?.metadata || '{}')
        const isDisabled = contactCF.aiDisabled === true || meta.aiDisabled === true
        const until = (contactCF.aiPausedUntil || meta.aiPausedUntil || null) as string | null
        // Si la pausa ya venció, muéstralo como IA (el backend limpia la bandera
        // en cuanto llegue el siguiente mensaje del cliente).
        const expired = until ? new Date(until).getTime() <= Date.now() : false
        setSendMode(isDisabled && !expired ? 'manual' : 'ai')
        setAiPausedUntil(isDisabled && !expired ? until : null)
      } catch { /* ignore */ }
    } catch (err) {
      console.error('Error fetching messages:', err)
    } finally {
      setIsLoadingMessages(false)
    }
  }, [selectedConversation, messages.length])

  useEffect(() => {
    fetchMessages()
    // Poll for new messages — 15s interval with visibility detection
    const POLL_INTERVAL = 15000
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && selectedConversation) {
        fetchMessages()
      }
    }, POLL_INTERVAL)
    return () => clearInterval(pollInterval)
  }, [fetchMessages])

  // Chat uses the standard reading order: oldest at top, newest at bottom.
  //
  // Auto-scroll policy:
  //   • When the user OPENS a conversation (selectedConversation changes),
  //     always jump to the bottom — they expect to see the latest message.
  //   • When new content arrives (new message, typing indicator, sending
  //     state), only auto-scroll if the user is already near the bottom
  //     (within ~120px). If the user has scrolled up to read history, we
  //     respect that and do NOT yank them back to the bottom.
  //
  // Implementation note (BURNED-BY bug, final):
  //   Earlier versions of this effect used `scrollTop = scrollHeight` after
  //   a single rAF. That broke in production because:
  //     1. The 15s polling tick refreshes `messages` even when the user
  //        is reading history. The effect would fire and reset scrollTop
  //        to the *old* scrollHeight (since rAF can fire before the new
  //        layout is committed), leaving the user stranded above the
  //        new content.
  //     2. The layout effect itself wasn't enough either: the Inbox lives
  //        inside a `<main>` parent that ALSO has `overflow-y-auto`, so
  //        the scroll position can shift when the outer container decides
  //        to compensate for content changes.
  //
  //   The fix below uses a sentinel `<div ref={messagesEndRef} />` placed
  //   at the very end of the message list. We scroll the sentinel into view
  //   with `behavior: 'auto'` (no smooth animation, so the visual jump is
  //   imperceptible). The browser handles all the "where is the bottom?"
  //   math for us, including async layout shifts from images, fonts, etc.
  //   The sentinel pattern is the standard, time-tested way to keep a chat
  //   scrolled to the latest message in any UI framework.
  //
  //   The `wasAtBottomRef` tracks the user's intent: were they already
  //   near the bottom BEFORE the re-render? If yes, we keep them glued
  //   to the bottom as new content arrives. If no, we don't move the
  //   scroll at all — they're reading history.

  const SCROLL_BOTTOM_THRESHOLD_PX = 120

  // Track the conversation that the sentinel is currently anchored to.
  // We only force-scroll to bottom when the user switches conversations
  // OR when the user was already following the chat.
  const lastScrolledConvRef = useRef<string>('')
  const pendingInitialScrollConvRef = useRef<string>('')

  // Capture whether the user was at the bottom BEFORE React commits the
  // new state. This runs synchronously after the previous paint and before
  // the new commit, so it always reads the "true" pre-render scroll position.
  const wasAtBottomRef = useRef<boolean>(true)

  useEffect(() => {
    pendingInitialScrollConvRef.current = selectedConversation
    wasAtBottomRef.current = true
  }, [selectedConversation])

  // Track scroll position on every scroll event. We use a ref + DOM listener
  // (not state) because we don't want a state update on every wheel tick —
  // that would cause re-renders.
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return

    const update = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      wasAtBottomRef.current = distance <= SCROLL_BOTTOM_THRESHOLD_PX
    }
    // Initialize on mount
    update()
    el.addEventListener('scroll', update, { passive: true })
    return () => el.removeEventListener('scroll', update)
  }, [selectedConversation])

  useLayoutEffect(() => {
    const el = chatScrollRef.current
    const sentinel = messagesEndRef.current
    if (!el) return

    const convChanged = lastScrolledConvRef.current !== selectedConversation
    const shouldForceInitialScroll =
      pendingInitialScrollConvRef.current === selectedConversation && messages.length > 0

    if (convChanged || shouldForceInitialScroll) {
      // Opening a new conversation: always jump to the bottom. The pending
      // flag keeps this true after the async message fetch has rendered.
      if (sentinel) {
        sentinel.scrollIntoView({ block: 'end' })
      } else {
        el.scrollTop = el.scrollHeight
      }
      lastScrolledConvRef.current = selectedConversation
      if (shouldForceInitialScroll) pendingInitialScrollConvRef.current = ''
      wasAtBottomRef.current = true
      return
    }

    // Same conversation, new content. Only auto-scroll if the user
    // is already near the bottom (they're "following" the chat).
    if (wasAtBottomRef.current) {
      if (sentinel) {
        sentinel.scrollIntoView({ block: 'end' })
      } else {
        el.scrollTop = el.scrollHeight
      }
    }
    // Otherwise, leave the scroll position alone — the user is reading
    // history and we shouldn't drag them back down.
  }, [selectedConversation, messages.length, isSending, typingIndicator])

  const handleSend = async () => {
    if (!messageInput.trim() || !selectedConversation || isSending) return

    const content = messageInput.trim()
    const conv = conversations.find((c) => c.id === selectedConversation)
    setMessageInput('')
    setShowEmojiPicker(false)
    setIsSending(true)

    // Note: we no longer set a typing indicator here. The AI does not
    // respond to operator-typed messages — the bot only replies to
    // inbound messages from the customer. Sending a typing bubble for
    // the AI here would be misleading.

    try {
      // ── Step 1: deliver the operator's message to the customer ──
      // This is the actual send. The /api/whatsapp/send route:
      //   • delivers via Baileys OR Meta Cloud (channel-router)
      //   • persists as direction='outbound' + senderType='human'
      //   • returns 503 if the channel send fails (we surface the error)
      //
      // For non-WhatsApp channels, there is no real "delivery" — we
      // just save the operator's text directly to the conversation
      // as outbound/human.
      const isWhatsApp = conv?.channel === 'whatsapp' && currentContact?.phone

      if (isWhatsApp) {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: currentContact.phone,
            message: content,
            workspaceId,
            conversationId: selectedConversation,
            contactId: currentContact.id,
          }),
        })
        if (!res.ok) {
          // Restore the input so the operator can retry
          setMessageInput(content)
          throw new Error('Error al enviar mensaje por WhatsApp')
        }
      } else {
        // Non-WhatsApp channel: persist to DB only. Schema accepts
        // senderType: contact, agent, human, system — "human_agent"
        // was a typo and is not a valid value.
        const res = await fetch(`/api/conversations/${selectedConversation}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            senderType: 'human',
            direction: 'outbound',
          }),
        })
        if (!res.ok) {
          setMessageInput(content)
          throw new Error('Error al enviar mensaje')
        }
      }

      // ── Step 2: NO AI follow-up ──
      // The bot is intentionally NOT triggered when the operator sends a
      // message manually. The bot only replies to messages that come IN
      // from the customer on WhatsApp (the Baileys / Meta webhook is the
      // single entry point for AI). If we let `/api/ai/chat` run after
      // the operator's text, the assistant would talk over the operator
      // and send a second message on top of the one the customer just
      // received — that's the bug we're fixing.
      //
      // The `sendMode` toggle does NOT control this anymore. It only
      // governs whether the bot responds to the *next* inbound message
      // from the customer (via customFields.aiDisabled, which the
      // WhatsApp webhook checks before invoking the AI pipeline).

      await fetchMessages()
      await fetchConversations()
    } catch (err) {
      console.error('Error sending message:', err)
    } finally {
      setIsSending(false)
      setTypingIndicator(false)
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

  const toggleMessageStar = async (msgId: string) => {
    const isCurrentlyStarred = starredMessages[msgId]
    // Optimistic update
    setStarredMessages((prev) => ({ ...prev, [msgId]: !prev[msgId] }))
    try {
      const res = await fetch(`/api/messages/${msgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStarred: !isCurrentlyStarred }),
      })
      if (!res.ok) throw new Error()
    } catch {
      // Revert on error
      setStarredMessages((prev) => {
        const next = { ...prev, [msgId]: isCurrentlyStarred }
        setStarredMessages(next)
        return next
      })
    }
  }

  const handleReaction = async (msgId: string, emoji: string) => {
    // Optimistic update
    setMessageReaction(msgId, emoji)
    setMessageReactionsState(getMessageReactions())
    try {
      await fetch(`/api/messages/${msgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction: emoji }),
      })
    } catch {
      // Revert on error — remove the reaction
      setMessageReaction(msgId, emoji) // toggles it back
      setMessageReactionsState(getMessageReactions())
    }
  }

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content)
    toast.success('Mensaje copiado al portapapeles')
  }

  const handleChangeStatus = async (convId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/conversations/${convId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error('Error al cambiar estado')
      toast.success(`Estado cambiado a ${statusLabels[newStatus]?.label || newStatus}`)
      setStatusChangeConv(null)
      fetchConversations()
    } catch {
      toast.error('Error al cambiar estado de la conversación')
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!selectedConversation) { e.target.value = ''; return }
    if (!currentContact?.phone) {
      toast.error('Este contacto no tiene WhatsApp para enviarle archivos')
      e.target.value = ''
      return
    }
    setUploadingFile(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('conversationId', selectedConversation)
    formData.append('workspaceId', workspaceId)
    formData.append('caption', messageInput.trim()) // texto actual = pie de foto
    try {
      // Sube y ENVÍA el archivo al cliente por WhatsApp en un solo paso.
      const res = await fetch('/api/whatsapp/send-file', { method: 'POST', body: formData })
      if (!res.ok) {
        const ej = await res.json().catch(() => ({}))
        toast.error(ej.error || 'No se pudo enviar el archivo')
        return
      }
      toast.success(`Enviado: ${file.name}`)
      setMessageInput('')
      await fetchMessages()
      await fetchConversations()
    } catch {
      toast.error('Error al enviar el archivo')
    } finally {
      setUploadingFile(false)
      e.target.value = ''
    }
  }

  const handleCloseConversation = (convId: string) => {
    setClosedConversations((prev) => new Set(prev).add(convId))
    if (selectedConversation === convId) {
      const remaining = conversations.filter((c) => c.id !== convId && !closedConversations.has(c.id))
      setSelectedConversation(remaining.length > 0 ? remaining[0].id : '')
    }
    toast.success('Conversación cerrada')
  }

  // Guarda el nombre REAL del cliente (corrige el username de WhatsApp tipo
  // "Diego Tuzo 🚗⚽"). Primer token → firstName (el bot saluda con él), resto → lastName.
  const saveContactName = async () => {
    const contactId = currentConv?.contact?.id || currentContact?.id
    const draft = nameDraft.trim().replace(/\s+/g, ' ')
    if (!contactId || draft.length < 2) { toast.error('Escribe un nombre válido'); return }
    setSavingName(true)
    const [firstName, ...rest] = draft.split(' ')
    const lastName = rest.join(' ')
    try {
      const r = await fetch(`/api/contacts/${contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName }),
      })
      if (!r.ok) throw new Error()
      setConversations((prev) => prev.map((c) => (c as { contactId?: string }).contactId === contactId || c.contact?.id === contactId
        ? { ...c, contact: { ...c.contact, firstName, lastName } }
        : c))
      setCurrentContact((prev) => (prev && prev.id === contactId ? { ...prev, firstName, lastName } : prev))
      setEditingName(false)
      toast.success(`Nombre actualizado a "${draft}" — el bot lo usará desde su siguiente mensaje`)
    } catch { toast.error('No se pudo guardar el nombre') } finally { setSavingName(false) }
  }

  // Cambia el modo del bot para ESTE contacto. hours: pausa temporal (la IA se
  // reactiva sola al vencer); sin hours: manual indefinido. disabled=false: IA ya.
  const applyAiMode = (disabled: boolean, hours?: number) => {
    const until = disabled && hours ? new Date(Date.now() + hours * 3600 * 1000).toISOString() : null
    setSendMode(disabled ? 'manual' : 'ai')
    setAiPausedUntil(until)

    if (selectedConversation) {
      fetch(`/api/conversations/${selectedConversation}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiDisabled: disabled, aiPausedUntil: until }),
      }).catch(() => {})
    }
    // customFields del CONTACTO = fuente primaria que revisa el bot (sobrevive
    // cambios de canal/estado de la conversación).
    if (currentContact?.id) {
      let existingCF: Record<string, unknown> = {}
      try { existingCF = JSON.parse(currentContact.customFields || '{}') } catch { existingCF = {} }
      const newCF: Record<string, unknown> = { ...existingCF, aiDisabled: disabled }
      if (until) newCF.aiPausedUntil = until
      else delete newCF.aiPausedUntil
      fetch(`/api/contacts/${currentContact.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customFields: newCF }),
      }).catch(() => {})
      setCurrentContact(prev => prev ? { ...prev, customFields: JSON.stringify(newCF) } : prev)
    }

    if (!disabled) toast.success('IA reactivada — el bot vuelve a responder a este cliente')
    else if (hours) toast.success(`Bot pausado ${hours} h — se reactiva solo a las ${new Date(Date.now() + hours * 3600 * 1000).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}`)
    else toast.success('Modo Manual indefinido — el bot no responderá hasta que lo reactives')
  }

  // En xl el expediente vive como 3ra columna persistente: el botón la colapsa o
  // expande. En pantallas menores abre el overlay. Así NUNCA se ve doble.
  const toggleExpediente = () => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1280) {
      setShowRightPanel((v) => !v)
      setShowExpediente(false)
    } else {
      setShowExpediente((v) => !v)
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

  // Al cambiar de conversación: volver a la pestaña Chat y cargar notas del contacto
  useEffect(() => {
    setChatTab('chat')
    setChatTimeline(null)
  }, [selectedConversation])
  useEffect(() => {
    setNotesDraft(currentContact?.notes || '')
  }, [currentContact?.id, currentContact?.notes])
  // Cargar bitácora cuando se abre la pestaña Historial
  useEffect(() => {
    if (chatTab !== 'historial' || !currentContact?.id || chatTimeline !== null) return
    let cancelled = false
    fetch(`/api/contacts/${currentContact.id}/profile?workspaceId=${workspaceId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setChatTimeline(Array.isArray(j?.timeline) ? j.timeline : []) })
      .catch(() => { if (!cancelled) setChatTimeline([]) })
    return () => { cancelled = true }
  }, [chatTab, currentContact?.id, workspaceId, chatTimeline])

  const handleSaveNotes = async () => {
    if (!currentContact?.id) return
    setNotesSaving(true)
    try {
      const res = await fetch(`/api/contacts/${currentContact.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesDraft }),
      })
      if (!res.ok) throw new Error()
      setCurrentContact((prev) => (prev ? { ...prev, notes: notesDraft } : prev))
      toast.success('Nota guardada')
    } catch {
      toast.error('No se pudo guardar la nota')
    } finally {
      setNotesSaving(false)
    }
  }

  // Filter conversations client-side by search
  const searchableConversations = conversations.filter((conv) => {
    if (closedConversations.has(conv.id)) return false
    const contactName = getContactName(conv.contact).toLowerCase()
    const lastMsg = (conv.lastMessagePreview || '').toLowerCase()
    return contactName.includes(searchQuery.toLowerCase()) || lastMsg.includes(searchQuery.toLowerCase())
  })
  // Contadores para las pestañas (Todas / No leídos / Destacados)
  const unreadCount = searchableConversations.filter((c) => c.unreadCount > 0).length
  const starredCount = searchableConversations.filter((c) => starredIds.includes(c.id)).length
  const filteredConversations = searchableConversations.filter((conv) => {
    if (listTab === 'unread' && conv.unreadCount === 0) return false
    if (listTab === 'starred' && !starredIds.includes(conv.id)) return false
    if (listTab === 'mentions') return false
    // Filtros del panel: temperatura (score canónico) y estado
    if (tempFilter !== 'all') {
      const s = conv.contact.leadScore || 0
      if (tempFilter === 'hot' && s < 70) return false
      if (tempFilter === 'warm' && (s < 40 || s >= 70)) return false
      if (tempFilter === 'cold' && s >= 40) return false
    }
    if (statusFilter !== 'all' && conv.status !== statusFilter) return false
    return true
  })
  const activeFilterCount = (tempFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)

  // Sort: starred first
  const sortedConversations = [...filteredConversations].sort((a, b) => {
    const aStar = starredIds.includes(a.id) ? 0 : 1
    const bStar = starredIds.includes(b.id) ? 0 : 1
    return aStar - bStar
  })

  const currentConv = conversations.find((c) => c.id === selectedConversation)
  const isCurrentStarred = selectedConversation ? starredIds.includes(selectedConversation) : false

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
      {/* Aviso NO bloqueante mientras WhatsApp se reconecta (fue conectado antes).
          La bandeja sigue usable: las conversaciones se leen de la base de datos. */}
      {waReconnecting && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-amber-300/60 bg-amber-50 dark:bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300 shadow-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reconectando WhatsApp… puedes seguir trabajando.
        </div>
      )}
      {/* WhatsApp not connected overlay — SOLO cuando nunca se ha conectado
          (necesita escanear QR). Un corte transitorio ya NO bloquea la bandeja. */}
      {waConnected === false && !waReconnecting && (
        <div className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-background/60">
          <div className="mx-4 max-w-sm w-full rounded-2xl border border-border bg-background shadow-2xl p-8 flex flex-col items-center text-center gap-4">
            <div className="h-16 w-16 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-9 w-9 fill-green-500" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">WhatsApp no configurado</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Conecta tu número de WhatsApp para enviar y recibir mensajes desde la bandeja de entrada.
              </p>
            </div>
            <button
              onClick={() => onViewChange?.('settings:whatsapp')}
              className="w-full rounded-xl bg-green-500 hover:bg-green-600 text-white font-semibold py-2.5 px-4 transition-colors text-sm"
            >
              Configurar WhatsApp
            </button>
          </div>
        </div>
      )}
      {/* Left Panel - Conversation List */}
      <div className={cn('w-full sm:w-80 lg:w-96 border-r border-border bg-background flex-col shrink-0 min-h-0', selectedConversation ? 'hidden sm:flex' : 'flex')}>
        {/* Search & Filter */}
        <div className="p-3 space-y-2 border-b border-border">
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-foreground">Conversaciones</span>
            {/* El estado de WhatsApp solo se muestra cuando NO está OK (el mockup, conectado, no lo enseña) */}
            {waConnected !== true && (
              <Badge
                variant="secondary"
                onClick={waConnected === false && !waReconnecting ? () => onViewChange?.('settings:whatsapp') : undefined}
                className={cn(
                  'h-6 text-[10px] gap-1',
                  waReconnecting
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : waConnected === false
                      ? 'bg-red-50 text-red-600 border-red-200 cursor-pointer hover:bg-red-100'
                      : 'bg-zinc-50 text-zinc-500 border-zinc-200'
                )}
              >
                {waReconnecting ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Reconectando…</>
                ) : waConnected === false ? (
                  <><WifiOff className="h-3 w-3" /> Conectar WhatsApp</>
                ) : (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Verificando...</>
                )}
              </Badge>
            )}
          </div>
          <div className="relative" data-tour="inbox-buscar">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversaciones..."
              className="pl-8 h-9 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {/* Píldoras de CANAL (Centro de Comando Unificado): filtro de un toque
              con ícono de librería por canal. TikTok NO está aquí a propósito:
              no tiene API de DMs — es canal de SALIDA (marketing), no de entrada. */}
          <div data-tour="inbox-canales" className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
            {([
              { v: 'all', label: 'Todos', Icon: MessageSquare },
              { v: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle },
              { v: 'instagram', label: 'Instagram', Icon: Instagram },
              { v: 'facebook', label: 'Messenger', Icon: Facebook },
              { v: 'webchat', label: 'Web', Icon: Globe },
              { v: 'telegram', label: 'Telegram', Icon: Send },
            ] as const).map((ch) => (
              <button
                key={ch.v}
                onClick={() => setChannelFilter(ch.v)}
                title={`Ver conversaciones de ${ch.label}`}
                className={cn('h-7 px-2 rounded-full text-[11px] font-medium inline-flex items-center gap-1 shrink-0 border transition-colors',
                  channelFilter === ch.v
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
                    : 'text-muted-foreground border-border hover:bg-muted/60')}
              >
                <ch.Icon className="h-3 w-3" /> {ch.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setListTab((t) => t === 'unread' ? 'all' : 'unread')}
              className={cn('h-8 px-2 rounded-md text-xs font-medium inline-flex items-center gap-1 shrink-0 border transition-colors',
                listTab === 'unread' ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' : 'text-muted-foreground border-border hover:bg-muted/60')}
            >
              <PenLine className="h-3.5 w-3.5" /> No leídos
            </button>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={cn('h-8 px-2 rounded-md text-xs font-medium inline-flex items-center gap-1 shrink-0 border transition-colors',
                showFilters || activeFilterCount > 0 ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' : 'text-muted-foreground border-border hover:bg-muted/60')}
            >
              <Filter className="h-3.5 w-3.5" /> Filtros
              {activeFilterCount > 0 && <span className="h-4 min-w-4 px-1 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center">{activeFilterCount}</span>}
            </button>
          </div>
          {/* Panel de filtros: temperatura + estado (antes el botón no hacía nada) */}
          {showFilters && (
            <div className="rounded-lg border border-border/70 bg-muted/30 p-2.5 space-y-2 animate-in fade-in slide-in-from-top-1">
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Temperatura</p>
                <div className="flex flex-wrap gap-1">
                  {([['all', 'Todas'], ['hot', '🔥 Caliente'], ['warm', '🟡 Tibio'], ['cold', '🧊 Frío']] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setTempFilter(k)}
                      className={cn('px-2 py-1 rounded-md text-[11px] font-medium border transition-colors',
                        tempFilter === k ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/40' : 'border-border text-muted-foreground hover:bg-muted/60')}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Estado</p>
                <div className="flex flex-wrap gap-1">
                  {([['all', 'Todos'], ['active', 'Activas'], ['pending', 'Pendientes'], ['closed', 'Cerradas']] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setStatusFilter(k)}
                      className={cn('px-2 py-1 rounded-md text-[11px] font-medium border transition-colors',
                        statusFilter === k ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/40' : 'border-border text-muted-foreground hover:bg-muted/60')}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {activeFilterCount > 0 && (
                <button onClick={() => { setTempFilter('all'); setStatusFilter('all') }} className="text-[11px] text-red-500 hover:underline font-medium">
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
          {/* Pestañas: Todas / No leídos / Más / @Menciones (como el mockup) */}
          <div className="flex items-center gap-3 text-xs border-b border-border -mx-3 px-3">
            {([
              { key: 'all', label: 'Todas', count: searchableConversations.length },
              { key: 'unread', label: 'No leídos', count: unreadCount },
              { key: 'starred', label: 'Más', count: starredCount },
              { key: 'mentions', label: '@ Menciones', count: 0 },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => setListTab(t.key)}
                className={cn(
                  'flex items-center gap-1 pb-1.5 -mb-px border-b-2 font-medium transition-colors',
                  listTab === t.key ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={cn('h-4 min-w-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center',
                    t.key === 'unread' ? 'bg-red-500 text-white' : listTab === t.key ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground')}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation List */}
        <ScrollArea className="flex-1 min-h-0">
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
                    'w-full flex items-start gap-3 p-3 text-left transition-colors border-l-2',
                    selectedConversation === conv.id
                      ? 'bg-emerald-500/10 border-l-emerald-500'
                      : 'border-l-transparent hover:bg-muted/50'
                  )}
                >
                  <div className="relative mt-0.5">
                    <ContactChannelAvatar
                      name={getContactName(conv.contact)}
                      avatar={conv.contact.avatar}
                      channel={conv.channel}
                      size={44}
                      statusColor={conv.status === 'active' ? 'bg-emerald-100 text-emerald-700' : conv.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : undefined}
                    />
                    {starredIds.includes(conv.id) && (
                      <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 absolute -top-1 -left-1 drop-shadow" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground truncate flex items-center gap-1">
                        {getContactName(conv.contact)}
                        {starredIds.includes(conv.id) && <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {timeAgo(new Date(conv.lastMessageAt))}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {truncate(conv.lastMessagePreview || 'Sin mensajes', 45)}
                    </p>
                  </div>
                  {/* Lado derecho: badge no-leídos (rojo) o punto de estado (como el mockup) */}
                  <div className="flex flex-col items-end gap-1 shrink-0 mt-1">
                    {conv.unreadCount > 0 ? (
                      <span className="h-5 min-w-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5">
                        {conv.unreadCount}
                      </span>
                    ) : (() => {
                      const daysSince = Math.floor((Date.now() - new Date(conv.lastMessageAt).getTime()) / 86400000)
                      const cold = daysSince > 3
                      return <span className={cn('h-2.5 w-2.5 rounded-full', cold ? 'bg-amber-500 animate-pulse' : conv.status === 'active' ? 'bg-emerald-500' : 'bg-zinc-400')} title={cold ? 'Lead frío' : conv.status} />
                    })()}
                  </div>
                </button>
              ))}
            </div>
          )}
          {!isLoadingConversations && convTotal > convLimit && (
            <button
              onClick={() => setConvLimit((l) => l + 100)}
              className="w-full py-3 text-xs font-medium text-emerald-600 hover:bg-emerald-50 transition-colors border-t border-border/50"
            >
              Cargar más conversaciones ({sortedConversations.length} de {convTotal})
            </button>
          )}
        </ScrollArea>
        {/* Footer: contador (como el mockup) */}
        {!isLoadingConversations && (
          <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground shrink-0">
            Mostrando {sortedConversations.length} de {convTotal || sortedConversations.length}
          </div>
        )}
      </div>

      {/* Right Panel - Chat View */}
      <div className={cn('flex-1 flex-col bg-muted/20 relative min-h-0 overflow-hidden', selectedConversation ? 'flex' : 'hidden sm:flex')}>
        {/* Notification Toast */}
        {notification && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-2">
            {notification}
          </div>
        )}

        {/* Overlay SOLO en pantallas <xl — en xl vive la 3ra columna persistente
            (así el expediente jamás se ve dos veces). */}
        {currentContact && showExpediente && (
          <div className="xl:hidden">
            <ExpedientePanel
              workspaceId={workspaceId}
              contactId={currentContact.id}
              onClose={() => setShowExpediente(false)}
            />
          </div>
        )}

        {currentConv ? (
          <>
            {/* Contact Header */}
            <div className="h-14 border-b border-border bg-background flex items-center justify-between px-4 shrink-0">
              <div className="flex items-center gap-3">
                {/* Volver a la lista (solo móvil) */}
                <button onClick={() => setSelectedConversation('')} className="sm:hidden -ml-1 mr-0.5 p-1.5 rounded-lg hover:bg-muted text-muted-foreground" aria-label="Volver">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <ContactChannelAvatar
                  name={getContactName(currentConv.contact)}
                  avatar={currentConv.contact.avatar}
                  channel={currentConv.channel}
                  size={38}
                  statusColor="bg-emerald-100 text-emerald-700"
                />
                <div>
                  <div className="flex items-center gap-2">
                    {editingName ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={nameDraft}
                          onChange={(e) => setNameDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveContactName(); if (e.key === 'Escape') setEditingName(false) }}
                          className="h-7 text-sm w-48"
                          autoFocus
                        />
                        <button onClick={saveContactName} disabled={savingName} className="text-emerald-500 hover:text-emerald-600 shrink-0" title="Guardar nombre">
                          {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </button>
                        <button onClick={() => setEditingName(false)} className="text-muted-foreground hover:text-foreground shrink-0" title="Cancelar">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <h3 className="text-sm font-semibold text-foreground">
                          {getContactName(currentConv.contact)}
                        </h3>
                        {/* Editar nombre: WhatsApp guarda el "username" del cliente
                            (ej. "Diego Tuzo 🚗⚽") y el bot saluda con eso. Al corregirlo
                            aquí, TODOS los mensajes del bot (saludos, recordatorios,
                            seguimientos) usan el nombre real desde el siguiente mensaje. */}
                        <button
                          onClick={() => { setNameDraft(getContactName(currentConv.contact)); setEditingName(true) }}
                          className="text-muted-foreground/60 hover:text-foreground shrink-0"
                          title="Editar nombre del cliente (el bot lo usará en todos sus mensajes)"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </>
                    )}
                    {isCurrentStarred && <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />}
                    {statusChangeConv === currentConv.id && (
                      <div className="flex items-center gap-1">
                        {Object.entries(statusLabels).filter(([key]) => key !== currentConv.status).map(([key, val]) => (
                          <button key={key} className="text-[9px] px-1.5 py-0.5 rounded border hover:bg-muted transition-colors" onClick={() => handleChangeStatus(currentConv.id, key)}>
                            {val.label}
                          </button>
                        ))}
                        <button className="text-[9px] px-1 py-0.5 text-muted-foreground hover:text-foreground" onClick={() => setStatusChangeConv(null)}>
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Línea de estado: canal + teléfono (como el mockup) */}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <button onClick={() => setStatusChangeConv(currentConv.id)} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                      <span className={cn('h-2 w-2 rounded-full', currentConv.status === 'active' ? 'bg-emerald-500' : currentConv.status === 'pending' ? 'bg-amber-500' : 'bg-zinc-400')} />
                      {CHANNELS.find((ch) => ch.value === currentConv.channel)?.label || 'WhatsApp'}
                    </button>
                    {currentConv.contact.phone && (
                      <span className="text-[10px] text-muted-foreground">· {formatPhoneNumber(currentConv.contact.phone)}</span>
                    )}
                  </div>
                </div>
              </div>
              {/* Lado derecho del header: badge de temperatura (mismo criterio que el
                  expediente y la tabla de Contactos: leadScore canónico → no contradice). */}
              <div className="flex items-center gap-1">
                {currentConv.contact.leadScore >= 70 ? (
                  <Badge className="h-6 text-[10px] px-2 border-0 bg-red-500 text-white font-semibold gap-0.5 mr-1">🔥 Lead Caliente</Badge>
                ) : currentConv.contact.leadScore >= 40 ? (
                  <Badge className="h-6 text-[10px] px-2 border-0 bg-amber-500 text-white font-semibold gap-0.5 mr-1">🟡 Lead Tibio</Badge>
                ) : null}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowMessageSearch((v) => !v)} title="Buscar en mensajes">
                  <Search className="h-4 w-4 text-muted-foreground" />
                </Button>
                {/* Modo IA/Manual con PAUSAS TEMPORALES: el asesor pausa el bot 1h/3h/24h
                    para atender él mismo, y la IA se reactiva SOLA al vencer (pedido de
                    Jhon 2026-07-11 — antes el Manual era solo indefinido). */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      title={sendMode === 'ai'
                        ? 'Modo IA — el bot responde a los mensajes del cliente. Clic para pausar.'
                        : aiPausedUntil
                          ? `Bot pausado — se reactiva solo a las ${new Date(aiPausedUntil).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
                          : 'Modo Manual — el bot NO responde hasta que lo reactives'}
                      className={cn(
                        'h-8 gap-1.5 text-xs px-2',
                        sendMode === 'ai'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                      )}
                    >
                      {sendMode === 'ai' ? (
                        <><Sparkles className="h-3.5 w-3.5" /> IA</>
                      ) : (
                        <><HandMetal className="h-3.5 w-3.5" /> Manual{aiPausedUntil ? ` · ${new Date(aiPausedUntil).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}` : ''}</>
                      )}
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    {sendMode === 'ai' ? (
                      <>
                        <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Pausar el bot para atender tú (se reactiva solo):</div>
                        <DropdownMenuItem onClick={() => applyAiMode(true, 1)}><HandMetal className="h-4 w-4 mr-2 text-amber-500" /> Pausar 1 hora</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => applyAiMode(true, 3)}><HandMetal className="h-4 w-4 mr-2 text-amber-500" /> Pausar 3 horas</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => applyAiMode(true, 24)}><HandMetal className="h-4 w-4 mr-2 text-amber-500" /> Pausar 24 horas</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => applyAiMode(true)}><X className="h-4 w-4 mr-2 text-red-500" /> Manual indefinido</DropdownMenuItem>
                      </>
                    ) : (
                      <>
                        {aiPausedUntil && (
                          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                            ⏸️ Pausado — la IA vuelve sola a las {new Date(aiPausedUntil).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}
                          </div>
                        )}
                        <DropdownMenuItem onClick={() => applyAiMode(false)}><Sparkles className="h-4 w-4 mr-2 text-emerald-500" /> Reactivar IA ahora</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => applyAiMode(true, 1)}><HandMetal className="h-4 w-4 mr-2 text-amber-500" /> Extender 1 hora más</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => applyAiMode(true)}><X className="h-4 w-4 mr-2 text-red-500" /> Manual indefinido</DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Separator orientation="vertical" className="h-6 mx-1" />

                {/* Expediente Panel Toggle */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn('h-8 w-8', (showExpediente || showRightPanel) && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400')}
                        onClick={toggleExpediente}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Expediente del lead (mostrar/ocultar)</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

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
                        onClick={() => setShowTagsModal(true)}
                      >
                        <Tag className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Etiquetas del contacto</TooltipContent>
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
                    <DropdownMenuItem onClick={() => setShowProfileModal(true)}>
                      <User className="h-4 w-4 mr-2" />
                      Ver perfil
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowDealModal(true)}>
                      <Tag className="h-4 w-4 mr-2" />
                      Crear trato
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

            {/* Pestañas del chat (Chat · Notas · Historial · Archivos · Eventos) */}
            <div className="border-b border-border bg-background px-4 flex items-center gap-1 shrink-0">
              {([
                { key: 'chat', label: 'Chat' },
                { key: 'notas', label: 'Notas' },
                { key: 'historial', label: 'Historial' },
                { key: 'archivos', label: 'Archivos' },
                { key: 'eventos', label: 'Eventos' },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setChatTab(t.key)}
                  className={cn(
                    'px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                    chatTab === t.key ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {chatTab === 'chat' ? (
            <>
            {/* Búsqueda en mensajes (aparece solo al activarla con la lupa del header).
                Con contador de coincidencias y navegación ↑/↓ que SALTA al mensaje. */}
            {showMessageSearch && (
              <div className="px-4 py-2 border-b border-border bg-background">
                <div className="max-w-2xl mx-auto flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar en mensajes..."
                      className="pl-8 h-8 text-xs"
                      value={messageSearchQuery}
                      onChange={(e) => { setMessageSearchQuery(e.target.value); setSearchMatchIdx(0) }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && searchMatches.length > 0) setSearchMatchIdx((i) => (i + 1) % searchMatches.length) }}
                      autoFocus
                    />
                  </div>
                  {messageSearchQuery.trim() && (
                    <span className={cn('text-[11px] shrink-0 tabular-nums', searchMatches.length === 0 ? 'text-red-500 font-medium' : 'text-muted-foreground')}>
                      {searchMatches.length === 0 ? 'Sin coincidencias' : `${searchMatchIdx + 1} de ${searchMatches.length}`}
                    </span>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={searchMatches.length === 0} title="Anterior" onClick={() => setSearchMatchIdx((i) => (i - 1 + searchMatches.length) % searchMatches.length)}>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={searchMatches.length === 0} title="Siguiente" onClick={() => setSearchMatchIdx((i) => (i + 1) % searchMatches.length)}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs shrink-0" onClick={() => { setShowMessageSearch(false); setMessageSearchQuery('') }}>
                    <X className="h-3 w-3 mr-1" /> Cerrar
                  </Button>
                </div>
              </div>
            )}

            {/* Messages: oldest at top, newest at bottom. */}
            <div ref={chatScrollRef} className="flex-1 px-4 pb-4 overflow-y-auto overflow-x-hidden min-h-0">
              {isLoadingMessages ? (
                <div className="max-w-2xl mx-auto space-y-4 py-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className={cn('flex gap-2', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
                      <Skeleton className="h-16 w-64 rounded-2xl" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="max-w-2xl mx-auto space-y-3 pt-4">
                  {/* Separador de fecha (como el mockup) */}
                  {messages.length > 0 && (
                    <div className="flex justify-center">
                      <span className="text-[11px] text-muted-foreground bg-muted/60 rounded-full px-3 py-1">
                        {(() => {
                          const d = new Date(messages[messages.length - 1]?.createdAt || Date.now())
                          const today = new Date()
                          const isToday = d.toDateString() === today.toDateString()
                          return isToday ? `Hoy, ${d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}` : d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                        })()}
                      </span>
                    </div>
                  )}
                  {/* System Event Messages */}
                  {messages.some((msg) => {
                    if (msg.senderType !== 'system') return false
                    try {
                      const meta = msg.metadata ? JSON.parse(msg.metadata) : {}
                      return meta?.type === 'lead_detected'
                    } catch { return false }
                  }) && (
                    <div className="flex justify-center">
                      <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-3 py-1 text-xs text-center max-w-fit flex items-center gap-1.5">
                        <Zap className="h-3 w-3 shrink-0" /> Lead nuevo detectado
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
                        <div className="bg-purple-50 text-purple-800 border border-purple-200 rounded-full px-3 py-1 text-xs text-center max-w-fit flex items-center gap-1.5">
                          <Brain className="h-3 w-3 shrink-0" /> {archetypeLabel}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Messages rendered in chronological order: oldest first, newest last */}
                  {messages.map((msg) => {
                    if (msg.senderType === 'system') return null
                    const isMatch = messageSearchQuery && msg.content.toLowerCase().includes(messageSearchQuery.toLowerCase())
                    const isCurrentMatch = isMatch && searchMatches[Math.min(searchMatchIdx, Math.max(0, searchMatches.length - 1))]?.id === msg.id
                    // Check if message has DB-persisted reaction/star from metadata
                    let dbReaction = ''
                    let dbStarred = false
                    try {
                      const meta = msg.metadata ? JSON.parse(msg.metadata) : {}
                      dbReaction = meta.reaction || ''
                      dbStarred = !!meta.isStarred
                    } catch { /* ignore */ }
                    const effectiveReaction = messageReactions[msg.id] || dbReaction
                    const effectiveStarred = starredMessages[msg.id] !== undefined ? starredMessages[msg.id] : dbStarred
                    const isAI = msg.direction === 'outbound' && !!msg.isAiGenerated
                    return (
                    <div
                      key={msg.id}
                      id={`msg-${msg.id}`}
                      className={cn(
                        'flex gap-2 group',
                        msg.direction === 'inbound' ? 'justify-start' : 'justify-end'
                      )}
                    >
                      {msg.direction === 'inbound' && (
                        <Avatar className="h-7 w-7 shrink-0 mt-auto">
                          {currentContact?.avatar ? <AvatarImage src={currentContact.avatar} alt={getContactName(currentContact)} /> : null}
                          <AvatarFallback className="bg-zinc-100 text-zinc-600 text-[9px]">
                            {currentContact ? getInitials(getContactName(currentContact)) : '??' }
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className={cn('max-w-[75%] min-w-0')}>
                        {msg.type !== 'text' && msg.type !== 'interactive' ? (
                          <div
                            className={cn(
                              'rounded-2xl px-3 py-2.5',
                              msg.direction === 'inbound'
                                ? 'bg-background rounded-bl-md border border-border/60'
                                : isAI
                                  ? 'bg-gradient-to-br from-violet-600 to-purple-700 rounded-br-md shadow-md'
                                  : 'bg-emerald-600 rounded-br-md'
                            )}
                          >
                            {isAI && <span className="flex items-center gap-1 text-[10px] text-white/80 mb-1 font-medium"><Sparkles className="h-3 w-3" />IA</span>}
                            <MediaRenderer msg={msg} />
                            {msg.content && !msg.content.startsWith(`[${msg.type === 'audio' ? 'Nota de voz' : msg.type.charAt(0).toUpperCase() + msg.type.slice(1)}]`) && (
                              <p className={cn(
                                'text-sm mt-1',
                                msg.direction === 'outbound' ? 'text-white/90' : 'text-foreground'
                              )}>{msg.content}</p>
                            )}
                          </div>
                        ) : (
                          <ContextMenu>
                            <ContextMenuTrigger asChild>
                              <div
                                className={cn(
                                  'rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line break-words cursor-default',
                                  msg.direction === 'inbound'
                                    ? 'bg-background rounded-bl-md border border-border/60'
                                    : isAI
                                      ? 'bg-gradient-to-br from-violet-600 to-purple-700 text-white rounded-br-md shadow-md'
                                      : 'bg-emerald-600 text-white rounded-br-md',
                                  isMatch && 'ring-2 ring-amber-400',
                                  isCurrentMatch && 'ring-2 ring-orange-500 shadow-lg shadow-orange-500/20'
                                )}
                              >
                                {isAI && <span className="flex items-center gap-1 text-[10px] text-white/80 mb-1 font-medium"><Sparkles className="h-3 w-3" />IA</span>}
                                {typeof msg.content === 'string'
                                  ? msg.content
                                  : typeof msg.content === 'object' && msg.content !== null
                                    ? JSON.stringify(msg.content, null, 2)
                                    : String(msg.content ?? '')
                                }
                              </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-48">
                              <ContextMenuItem className="gap-2" onClick={() => toggleMessageStar(msg.id)}>
                                <Bookmark className={cn('h-4 w-4', effectiveStarred ? 'fill-amber-400 text-amber-400' : '')} />
                                {effectiveStarred ? 'Quitar favorito' : 'Marcar importante'}
                              </ContextMenuItem>
                              <ContextMenuItem className="gap-2" onClick={() => handleCopyMessage(msg.content)}>
                                <Copy className="h-4 w-4" />
                                Copiar texto
                              </ContextMenuItem>
                              {canTrainAi && msg.isAiGenerated && (
                                <>
                                  <ContextMenuSeparator />
                                  <ContextMenuItem
                                    className="gap-2 text-emerald-600 focus:text-emerald-600"
                                    onClick={() => {
                                      const idx = messages.findIndex((x) => x.id === msg.id)
                                      const prev = idx >= 0 ? [...messages.slice(0, idx)].reverse().find((x) => x.direction === 'inbound') : undefined
                                      setCorrection({ messageId: msg.id, bad: msg.content, trigger: prev?.content || '' })
                                    }}
                                  >
                                    <Wand2 className="h-4 w-4" />
                                    Corregir IA
                                  </ContextMenuItem>
                                </>
                              )}
                              <ContextMenuSeparator />
                              <ContextMenuItem className="gap-2 text-emerald-600" onClick={() => handleReaction(msg.id, '👍')}>
                                <ThumbsUp className="h-3.5 w-3.5" /> Me gusta
                              </ContextMenuItem>
                              <ContextMenuItem className="gap-2 text-emerald-600" onClick={() => handleReaction(msg.id, '❤️')}>
                                <Heart className="h-3.5 w-3.5" /> Me encanta
                              </ContextMenuItem>
                              <ContextMenuItem className="gap-2 text-emerald-600" onClick={() => handleReaction(msg.id, '🎉')}>
                                <PartyPopper className="h-3.5 w-3.5" /> Genial
                              </ContextMenuItem>
                              <ContextMenuItem className="gap-2 text-emerald-600" onClick={() => handleReaction(msg.id, '🙏')}>
                                <HandMetal className="h-3.5 w-3.5" /> Gracias
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        )}
                        <div className={cn(
                          'flex items-center gap-1.5 mt-1 px-1',
                          msg.direction === 'inbound' ? 'justify-start' : 'justify-end'
                        )}>
                          <span className="text-[10px] text-muted-foreground">
                            {timeAgo(new Date(msg.createdAt))}
                          </span>
                          {effectiveStarred && (
                            <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                          )}
                          {effectiveReaction && (
                            <span className="text-xs bg-muted rounded-full px-1.5 py-0.5">{effectiveReaction}</span>
                          )}
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
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              className="p-0.5 rounded hover:bg-muted transition-colors"
                              onClick={() => toggleMessageStar(msg.id)}
                              title={effectiveStarred ? 'Quitar importante' : 'Marcar importante'}
                            >
                              <Bookmark className={cn('h-3 w-3', effectiveStarred ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
                            </button>
                            <button
                              className="p-0.5 rounded hover:bg-muted transition-colors"
                              onClick={() => handleCopyMessage(msg.content)}
                              title="Copiar texto"
                            >
                              <Copy className="h-3 w-3 text-muted-foreground" />
                            </button>
                            <button
                              className="p-0.5 rounded hover:bg-muted transition-colors"
                              onClick={() => handleReaction(msg.id, '👍')}
                              title="Reaccionar"
                            >
                              <Smile className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </div>
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
                    )
                  })}

                  {isSending && (
                    <div className="flex justify-end gap-2">
                      <div className="max-w-[75%]">
                        <div className="rounded-2xl px-4 py-2.5 text-sm bg-muted rounded-br-md flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                          <span className="text-muted-foreground">Enviando...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {typingIndicator && (
                    <div className="flex justify-start gap-2">
                      <Avatar className="h-7 w-7 shrink-0 mt-auto">
                        <AvatarFallback className="bg-emerald-100 text-emerald-700 text-[9px]">
                          <Sparkles className="h-3.5 w-3.5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="bg-background rounded-2xl rounded-bl-md border border-border/60 px-4 py-3 flex items-center gap-1.5">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground ml-1">IA está escribiendo...</span>
                      </div>
                    </div>
                  )}
                  {/* Sentinel — the auto-scroll logic scrolls this element into
                      view to keep the chat pinned to the latest message. Keeping
                      it empty (no padding, no margin) avoids layout shifts while
                      still being a valid scroll target. */}
                  <div ref={messagesEndRef} aria-hidden="true" />
                </div>
              )}
            </div>

            {/* Quick Replies — sugeridas por IA según la conversación */}
            <div className="px-4 py-2 border-t border-border bg-background">
              <div className="max-w-2xl mx-auto">
                <div className="flex items-center gap-1 mb-1 text-[10px] text-muted-foreground">
                  <Sparkles className={cn('h-3 w-3 text-violet-500', quickRepliesLoading && 'animate-pulse')} />
                  <span>{quickRepliesLoading ? 'La IA está sugiriendo respuestas…' : 'Respuestas sugeridas por IA — toca una para editarla y enviarla'}</span>
                </div>
                <ScrollArea className="w-full" type="scroll">
                  <div className="flex gap-2 pb-1">
                    {aiQuickReplies.map((reply, i) => (
                      <button
                        key={`${reply.label}-${i}`}
                        onClick={() => setMessageInput(reply.text)}
                        title={reply.text}
                        className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 dark:border-violet-500/40 dark:text-violet-300 dark:bg-violet-500/10 dark:hover:bg-violet-500/20 transition-colors"
                      >
                        {reply.label}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {/* Message Input */}
            <div className="px-4 pb-4 pt-2 border-t border-border bg-background">
              {/* pr-16 en móvil: deja libre la esquina inferior derecha para que
                  el botón flotante del Copiloto NO tape el botón de enviar. En
                  pantallas grandes el compositor va centrado y no hay choque. */}
              <div className="max-w-2xl mx-auto flex items-end gap-2 pr-16 sm:pr-0">
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
                    onChange={handleFileUpload}
                  />
                </div>
                <div className="flex-1 relative">
                  {/* Textarea auto-expandible: Enter envía, Shift+Enter hace SALTO
                      DE LÍNEA (antes era un input de una línea y no se podía). */}
                  <Textarea
                    ref={composerRef}
                    placeholder={'Escribe un mensaje... (Shift+Enter = salto de línea)'}
                    className="pr-10 min-h-[40px] max-h-32 py-2.5 rounded-xl bg-muted/50 border-0 focus-visible:ring-1 resize-none overflow-y-auto custom-scroll leading-snug"
                    value={messageInput}
                    rows={1}
                    onChange={(e) => {
                      setMessageInput(e.target.value)
                      e.target.style.height = 'auto'
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                    }}
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
                    'h-10 w-10 rounded-xl shrink-0 disabled:opacity-50 text-white',
                    'bg-gradient-to-br from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 shadow-md'
                  )}
                  onClick={handleSend}
                  disabled={isSending || uploadingFile || !messageInput.trim()}
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
                  {sendMode === 'ai'
                    ? <><Bot className="h-3 w-3 inline-block mr-1" />Modo IA — el bot responde al cliente</>
                    : <><HandMetal className="h-3 w-3 inline-block mr-1" />Modo Manual — el bot está en silencio{aiPausedUntil ? ` · vuelve solo a las ${new Date(aiPausedUntil).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}` : ''}</>
                  }
                </span>
              </div>
              {/* Barra de acciones rápidas del chat (como el mockup) */}
              <div className="max-w-2xl mx-auto mt-2 flex items-center gap-2 flex-wrap">
                {([
                  { label: 'Agendar cita', icon: <CalendarCheck className="h-3.5 w-3.5" />, c: 'text-blue-500', run: () => { try { sessionStorage.setItem('vaf-quick-action', `new-appointment:${currentContact?.id || ''}`) } catch { /* */ } onViewChange?.('calendar') } },
                  { label: 'Cotizar', icon: <FileText className="h-3.5 w-3.5" />, c: 'text-violet-500', run: () => setShowQuoteModal(true) },
                  { label: 'Crear trato', icon: <Tag className="h-3.5 w-3.5" />, c: 'text-emerald-500', run: () => setShowDealModal(true) },
                  { label: 'Llamar', icon: <Phone className="h-3.5 w-3.5" />, c: 'text-teal-500', run: () => currentConv?.contact.phone ? window.open(`tel:${currentConv.contact.phone}`) : toast.info('Sin teléfono') },
                  { label: 'Expediente', icon: <User className="h-3.5 w-3.5" />, c: 'text-muted-foreground', run: () => toggleExpediente() },
                ]).map((a) => (
                  <button
                    key={a.label}
                    onClick={a.run}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <span className={a.c}>{a.icon}</span>{a.label}
                  </button>
                ))}
              </div>
            </div>
            </>
            ) : (
            /* ── Paneles de las otras pestañas (funcionales) ── */
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              <div className="max-w-2xl mx-auto">
                {chatTab === 'notas' && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><PenLine className="h-3.5 w-3.5" /> Notas internas</p>
                    <textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Escribe notas internas sobre este lead (solo tu equipo las ve)…"
                      className="w-full min-h-[160px] rounded-lg border border-border bg-background p-3 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                    />
                    <div className="flex justify-end">
                      <Button size="sm" onClick={handleSaveNotes} disabled={notesSaving || notesDraft === (currentContact?.notes || '')} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        {notesSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Guardar nota
                      </Button>
                    </div>
                  </div>
                )}
                {chatTab === 'archivos' && (() => {
                  const mediaMsgs = messages.filter((m) => (m.mediaFiles && m.mediaFiles.length > 0) || (m.type !== 'text' && m.type !== 'interactive' && m.senderType !== 'system'))
                  return mediaMsgs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-10">Sin archivos multimedia en esta conversación.</p>
                  ) : (
                    <div className="space-y-3">
                      {mediaMsgs.map((m) => (
                        <div key={m.id} className="rounded-xl border border-border/60 p-2 bg-background">
                          <MediaRenderer msg={m} />
                          <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(new Date(m.createdAt))} · {m.direction === 'inbound' ? 'Recibido' : 'Enviado'}</p>
                        </div>
                      ))}
                    </div>
                  )
                })()}
                {chatTab === 'historial' && (
                  chatTimeline === null ? (
                    <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : chatTimeline.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-10">Aún sin bitácora. La IA irá registrando aquí los puntos importantes del lead.</p>
                  ) : (
                    <div className="space-y-2">
                      {chatTimeline.map((ev) => (
                        <div key={ev.id} className="rounded-lg border-l-2 border-l-emerald-500 bg-muted/30 px-3 py-2">
                          <p className="text-xs text-foreground">{ev.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(new Date(ev.createdAt))}{ev.source === 'ai' ? ' · IA' : ''}</p>
                        </div>
                      ))}
                    </div>
                  )
                )}
                {chatTab === 'eventos' && (() => {
                  const sysMsgs = messages.filter((m) => m.senderType === 'system')
                  const labelFor = (m: Message) => {
                    try { const meta = m.metadata ? JSON.parse(m.metadata) : {}
                      if (meta?.type === 'lead_detected') return '🎯 Lead nuevo detectado'
                      if (meta?.type === 'archetype_detected') return `🧠 Arquetipo detectado${meta.archetype ? `: ${meta.archetype}` : ''}`
                    } catch { /* */ }
                    return m.content || 'Evento del sistema'
                  }
                  return sysMsgs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-10">Sin eventos del sistema en esta conversación.</p>
                  ) : (
                    <div className="space-y-2">
                      {sysMsgs.map((m) => (
                        <div key={m.id} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 flex items-center justify-between gap-2">
                          <span className="text-xs text-foreground">{labelFor(m)}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(new Date(m.createdAt))}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            </div>
            )}
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

      {/* Panel de lead PERSISTENTE — 3ra columna en pantallas anchas (como el mockup).
          En pantallas menores sigue el panel por botón (overlay). El botón Expediente
          lo colapsa/expande (showRightPanel). */}
      {currentContact && showRightPanel && (
        <div className="hidden xl:block h-full shrink-0">
          <ExpedientePanel workspaceId={workspaceId} contactId={currentContact.id} onClose={() => {}} persistent />
        </div>
      )}

      {/* Corregir IA: enseña a la IA la respuesta correcta (entrenamiento in-context) */}
      {correction && (
        <CorrectionDialog
          workspaceId={workspaceId}
          source="inbox"
          conversationId={selectedConversation}
          messageId={correction.messageId}
          trigger={correction.trigger}
          badResponse={correction.bad}
          onClose={() => setCorrection(null)}
          onSaved={() => setCorrection(null)}
        />
      )}

      {/* Etiquetas del contacto: asignar existentes o crear una al vuelo */}
      {currentContact && (
        <ContactTagsModal
          open={showTagsModal}
          onOpenChange={setShowTagsModal}
          workspaceId={workspaceId}
          contact={currentContact}
          onSaved={(tagsJson) => setCurrentContact((prev) => (prev ? { ...prev, tags: tagsJson } : prev))}
        />
      )}

      {/* Perfil completo del contacto (Ver perfil del menú ⋮) */}
      {currentContact && (
        <ContactProfileModal
          open={showProfileModal}
          onOpenChange={setShowProfileModal}
          workspaceId={workspaceId}
          contactId={currentContact.id}
          onOpenExpediente={() => { setShowProfileModal(false); toggleExpediente() }}
        />
      )}

      {/* Crear trato con el cliente YA seleccionado */}
      {currentContact && (
        <CreateDealModal
          open={showDealModal}
          onOpenChange={setShowDealModal}
          workspaceId={workspaceId}
          contactId={currentContact.id}
          contactName={getContactName(currentContact)}
          onGoPipeline={() => onViewChange?.('pipeline')}
        />
      )}

      {/* Cotización para ESTE cliente (mensaje autogenerado → WhatsApp) */}
      <QuoteModal
        open={showQuoteModal}
        onOpenChange={setShowQuoteModal}
        workspaceId={workspaceId}
        initialContactId={currentContact?.id}
      />
      </div>
    </div>
  )
}

// ═══ Etiquetas del contacto: chips actuales + sugerencias del workspace + crear al vuelo ═══
function ContactTagsModal({ open, onOpenChange, workspaceId, contact, onSaved }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  workspaceId: string
  contact: Contact
  onSaved: (tagsJson: string) => void
}) {
  const [tags, setTags] = useState<string[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    try {
      const t = JSON.parse(contact.tags || '[]')
      setTags(Array.isArray(t) ? t.filter((x: unknown) => typeof x === 'string') : [])
    } catch { setTags([]) }
    setDraft('')
    // Sugerencias: todas las etiquetas ya usadas en el workspace
    fetch(`/api/contacts?workspaceId=${workspaceId}&limit=300`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const all = new Set<string>()
        for (const c of (d?.items || d?.contacts || [])) {
          try {
            const arr = JSON.parse((c as { tags?: string }).tags || '[]')
            if (Array.isArray(arr)) arr.forEach((t: unknown) => { if (typeof t === 'string' && t.trim()) all.add(t.trim()) })
          } catch { /* ignore */ }
        }
        setSuggestions(Array.from(all).sort((a, b) => a.localeCompare(b, 'es')))
      })
      .catch(() => setSuggestions([]))
  }, [open, contact.id, contact.tags, workspaceId])

  const persist = async (next: string[]) => {
    setSaving(true)
    try {
      const r = await fetch(`/api/contacts/${contact.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: next }),
      })
      if (!r.ok) throw new Error('save failed')
      setTags(next)
      onSaved(JSON.stringify(next))
      return true
    } catch {
      toast.error('No se pudo guardar la etiqueta')
      return false
    } finally { setSaving(false) }
  }

  const addTag = async (raw: string) => {
    const t = raw.trim()
    if (!t) return
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) { toast.info('Ese contacto ya tiene esa etiqueta'); return }
    const ok = await persist([...tags, t])
    if (ok) toast.success(`Etiqueta "${t}" asignada`)
    setDraft('')
  }
  const removeTag = async (t: string) => {
    const ok = await persist(tags.filter((x) => x !== t))
    if (ok) toast.success(`Etiqueta "${t}" quitada`)
  }

  const available = suggestions.filter((s) => !tags.some((x) => x.toLowerCase() === s.toLowerCase()))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4 text-emerald-500" /> Etiquetas de {getContactName(contact)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Asignadas</Label>
            {tags.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-1.5">Sin etiquetas todavía — asigna una abajo.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2.5 py-1 text-xs font-medium">
                    {t}
                    <button onClick={() => removeTag(t)} disabled={saving} className="hover:text-red-500" title="Quitar etiqueta"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          {available.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">Etiquetas del workspace (toca para asignar)</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5 max-h-28 overflow-y-auto custom-scroll">
                {available.map((s) => (
                  <button key={s} onClick={() => addTag(s)} disabled={saving} className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground hover:border-emerald-500/50 hover:text-emerald-600 transition-colors">
                    + {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">Crear etiqueta nueva</Label>
            <div className="flex items-center gap-2 mt-1.5">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addTag(draft) }}
                placeholder="Ej. Interesado en SUV, Crédito, VIP…"
                className="h-9 text-sm"
              />
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0" disabled={saving || !draft.trim()} onClick={() => addTag(draft)}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Asignar'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ═══ Perfil completo del contacto (Ver perfil ⋮): datos + IA + tratos + próxima cita ═══
interface FullProfile {
  contact: { id: string; firstName: string; lastName: string | null; phone: string | null; email: string | null; source: string | null; leadScore: number; temperature: string | null; tags: string; notes: string | null; createdAt: string; lastMessageAt: string | null }
  profile: { archetype?: string; archetypeConfidence?: number; budget?: string | null; preferredProduct?: string | null; mainObjection?: string | null; decisionMaker?: string | null; timeline?: string | null; communicationStyle?: string; buyingMotivation?: string | null; urgencyLevel?: string; priceSensitivity?: string; totalMessages?: number } | null
  nextAppointment: { date: string; title: string; type: string; status: string } | null
  deals: Array<{ id: string; title: string; value: number; currency: string | null; status: string; stageName: string | null }>
}
function ContactProfileModal({ open, onOpenChange, workspaceId, contactId, onOpenExpediente }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  workspaceId: string
  contactId: string
  onOpenExpediente: () => void
}) {
  const [data, setData] = useState<FullProfile | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !contactId) return
    setLoading(true); setData(null)
    fetch(`/api/contacts/${contactId}/profile?workspaceId=${workspaceId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.contact) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, contactId, workspaceId])

  const c = data?.contact
  const p = data?.profile
  const name = c ? [c.firstName, c.lastName].filter(Boolean).join(' ') : ''
  const tagList: string[] = (() => { try { const t = JSON.parse(c?.tags || '[]'); return Array.isArray(t) ? t : [] } catch { return [] } })()
  const tempBadge = (c?.leadScore ?? 0) >= 70
    ? { label: '🔥 Caliente', cls: 'bg-red-500/15 text-red-500' }
    : (c?.leadScore ?? 0) >= 40
      ? { label: '🟡 Tibio', cls: 'bg-amber-500/15 text-amber-500' }
      : { label: '🧊 Frío', cls: 'bg-sky-500/15 text-sky-500' }
  const ARCHETYPES: Record<string, string> = { practico: 'Práctico', familiar: 'Familiar', aspiracional: 'Aspiracional', estrategico: 'Estratégico', consciente: 'Consciente', desconocido: 'Sin detectar aún' }
  const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,640px)] sm:max-w-[640px] max-h-[88vh] overflow-y-auto overflow-x-hidden custom-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><User className="h-4 w-4 text-emerald-500" /> Perfil del contacto</DialogTitle>
        </DialogHeader>
        {loading || !data ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {/* Identidad */}
            <div className="flex items-center gap-3 rounded-xl border border-border/60 p-3.5 bg-gradient-to-br from-emerald-500/5 to-transparent">
              <Avatar className="h-14 w-14">
                <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white text-lg font-bold">{getInitials(name || '?')}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-base font-bold truncate">{name || 'Sin nombre'}</p>
                  <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5', tempBadge.cls)}>{tempBadge.label}</span>
                  <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-violet-500/15 text-violet-500">Score {c?.leadScore ?? 0}/100</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{c?.phone || 'Sin teléfono'}{c?.email ? ` · ${c.email}` : ''}</p>
                <p className="text-[11px] text-muted-foreground">Origen: {c?.source || '—'} · Desde {fmtDate(c?.createdAt).split(',')[0]} · Últ. mensaje {fmtDate(c?.lastMessageAt)}</p>
              </div>
            </div>

            {/* Etiquetas */}
            {tagList.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tagList.map((t) => <span key={t} className="rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-medium">{t}</span>)}
              </div>
            )}

            {/* Inteligencia IA (LeadProfile real) */}
            <div className="rounded-xl border border-border/60 p-3.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">Inteligencia de la IA</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                <div><p className="text-[10px] text-muted-foreground">Arquetipo</p><p className="font-medium">{ARCHETYPES[p?.archetype || 'desconocido'] || p?.archetype}{p?.archetypeConfidence ? ` (${Math.round((p.archetypeConfidence || 0) * 100)}%)` : ''}</p></div>
                <div><p className="text-[10px] text-muted-foreground">Presupuesto detectado</p><p className="font-medium">{p?.budget || '—'}</p></div>
                <div><p className="text-[10px] text-muted-foreground">Vehículo de interés</p><p className="font-medium">{p?.preferredProduct || '—'}</p></div>
                <div><p className="text-[10px] text-muted-foreground">Objeción principal</p><p className="font-medium">{p?.mainObjection || '—'}</p></div>
                <div><p className="text-[10px] text-muted-foreground">Quién decide</p><p className="font-medium">{p?.decisionMaker || '—'}</p></div>
                <div><p className="text-[10px] text-muted-foreground">Cuándo compra</p><p className="font-medium">{p?.timeline || '—'}</p></div>
                <div><p className="text-[10px] text-muted-foreground">Urgencia</p><p className="font-medium capitalize">{p?.urgencyLevel || '—'}</p></div>
                <div><p className="text-[10px] text-muted-foreground">Motivación</p><p className="font-medium capitalize">{p?.buyingMotivation || '—'}</p></div>
              </div>
            </div>

            {/* Próxima cita + tratos */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/60 p-3.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Próxima cita</p>
                {data.nextAppointment ? (
                  <>
                    <p className="text-sm font-medium">{data.nextAppointment.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(data.nextAppointment.date)}</p>
                  </>
                ) : <p className="text-xs text-muted-foreground">Sin citas pendientes</p>}
              </div>
              <div className="rounded-xl border border-border/60 p-3.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Tratos ({data.deals.length})</p>
                {data.deals.length === 0 ? <p className="text-xs text-muted-foreground">Sin tratos aún</p> : (
                  <div className="space-y-1">
                    {data.deals.slice(0, 3).map((d) => (
                      <p key={d.id} className="text-xs truncate"><span className="font-medium">{d.title}</span> · ${Number(d.value).toLocaleString('es-MX')} · {d.stageName || d.status}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Notas */}
            {c?.notes && (
              <div className="rounded-xl border border-border/60 p-3.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notas</p>
                <p className="text-xs whitespace-pre-line">{c.notes}</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onOpenExpediente}>Expediente completo</Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onOpenChange(false)}>Cerrar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ═══ Crear trato con el cliente preseleccionado ═══
function CreateDealModal({ open, onOpenChange, workspaceId, contactId, contactName, onGoPipeline }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  workspaceId: string
  contactId: string
  contactName: string
  onGoPipeline: () => void
}) {
  const [title, setTitle] = useState('')
  const [value, setValue] = useState('')
  const [creating, setCreating] = useState(false)
  // El POST /api/deals EXIGE pipelineId + stageId (el botón viejo nunca los mandó
  // y por eso jamás creó nada). Se cargan al abrir: primera etapa del pipeline.
  const [pipe, setPipe] = useState<{ pipelineId: string; stageId: string; stageName: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle(`Trato con ${contactName}`); setValue(''); setPipe(null)
    fetch(`/api/pipeline?workspaceId=${workspaceId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const pl = d?.items?.[0]
        const stage = pl?.stages?.slice().sort((a: { order: number }, b: { order: number }) => a.order - b.order)?.[0]
        if (pl && stage) setPipe({ pipelineId: pl.id, stageId: stage.id, stageName: stage.name })
      })
      .catch(() => {})
  }, [open, contactName, workspaceId])

  const create = async (goPipeline: boolean) => {
    if (!title.trim()) { toast.error('Escribe el título del trato'); return }
    if (!pipe) { toast.error('El pipeline aún no carga — intenta de nuevo'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, pipelineId: pipe.pipelineId, stageId: pipe.stageId, title: title.trim(), contactId, value: Number(value.replace(/[^0-9.]/g, '')) || 0 }),
      })
      if (!res.ok) throw new Error('create failed')
      toast.success(`Trato creado en "${pipe.stageName}" ✅`)
      onOpenChange(false)
      if (goPipeline) onGoPipeline()
    } catch {
      toast.error('Error al crear el trato')
    } finally { setCreating(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4 text-emerald-500" /> Nuevo trato</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm flex items-center gap-2">
            <User className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>Cliente: <span className="font-semibold">{contactName}</span></span>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Título del trato</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Venta Mazda CX-5 2022" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Valor estimado (MXN)</Label>
            <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" placeholder="Ej. 385000" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button variant="outline" size="sm" disabled={creating} onClick={() => create(true)}>Crear y ver pipeline</Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" disabled={creating || !pipe} onClick={() => create(false)}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Crear trato
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
