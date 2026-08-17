import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: string = 'MXN'): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return ''
  const cleaned = phone.replace(/\D/g, '')
  // Not a phone number at all — don't display the raw non-numeric string
  if (cleaned.length === 0) return ''
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`
  }
  if (cleaned.length === 12) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`
  }
  // International WhatsApp number (country code + number, 11-17 digits)
  if (cleaned.length >= 11) {
    return `+${cleaned}`
  }
  return phone
}

export function getChannelIcon(channel: string): string {
  const icons: Record<string, string> = {
    whatsapp: '💬',
    telegram: '✈️',
    instagram: '📷',
    webchat: '🌐',
  }
  return icons[channel] || '💬'
}

export function getChannelColor(channel: string): string {
  const colors: Record<string, string> = {
    whatsapp: 'text-green-500',
    telegram: 'text-blue-500',
    instagram: 'text-pink-500',
    webchat: 'text-violet-500',
  }
  return colors[channel] || 'text-gray-500'
}

export function getChannelBgColor(channel: string): string {
  const colors: Record<string, string> = {
    whatsapp: 'bg-green-500/10',
    telegram: 'bg-blue-500/10',
    instagram: 'bg-pink-500/10',
    webchat: 'bg-violet-500/10',
  }
  return colors[channel] || 'bg-gray-500/10'
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '??'
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

export function timeAgo(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Ahora'
  if (minutes < 60) return `Hace ${minutes}m`
  if (hours < 24) return `Hace ${hours}h`
  if (days < 7) return `Hace ${days}d`
  return new Date(date).toLocaleDateString('es-MX')
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-MX').format(num)
}

export function getStageColor(stage: string): string {
  const colors: Record<string, string> = {
    'Lead Nuevo': 'bg-slate-100 text-slate-700',
    'Contactado': 'bg-blue-100 text-blue-700',
    'Cualificado': 'bg-yellow-100 text-yellow-700',
    'Propuesta': 'bg-orange-100 text-orange-700',
    'Negociación': 'bg-red-100 text-red-700',
    'Cerrado Ganado': 'bg-green-100 text-green-700',
    'Cerrado Perdido': 'bg-gray-100 text-gray-700',
  }
  return colors[stage] || 'bg-gray-100 text-gray-700'
}
