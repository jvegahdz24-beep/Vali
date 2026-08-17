// ═══════════════════════════════════════════════════════════════
// Texto a voz (locución) con MiniMax Speech-02. Voces en español
// seleccionables. Requiere MINIMAX_API_KEY (y opcional MINIMAX_GROUP_ID).
// ═══════════════════════════════════════════════════════════════

import { writeFile } from 'fs/promises'

export interface VoiceOption { id: string; label: string; gender: 'F' | 'M' }

// Voces en español de MiniMax (las dos primeras verificadas en producción).
export const VOICES: VoiceOption[] = [
  { id: 'Spanish_ConfidentWoman', label: 'Mujer · Segura y confiable', gender: 'F' },
  { id: 'Spanish_SensibleManager', label: 'Hombre · Profesional', gender: 'M' },
  { id: 'Spanish_Kind-heartedGirl', label: 'Mujer · Cálida', gender: 'F' },
  { id: 'Spanish_ReservedYoungMan', label: 'Hombre · Joven', gender: 'M' },
  { id: 'Spanish_DeterminedManager', label: 'Hombre · Enérgico', gender: 'M' },
  { id: 'Spanish_LovelyGirl', label: 'Mujer · Juvenil', gender: 'F' },
]

export const ttsAvailable = (): boolean => !!process.env.MINIMAX_API_KEY
export const isValidVoice = (id: string): boolean => VOICES.some((v) => v.id === id)

interface MiniMaxTTS { data?: { audio?: string }; base_resp?: { status_code?: number; status_msg?: string } }

export type TtsEmotion = 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'neutral'

/** Genera locución MP3 y la escribe en outPath. Lanza si no hay key o falla. */
export async function synthesize(text: string, voiceId: string, speed: number, outPath: string, emotion?: TtsEmotion): Promise<void> {
  const key = process.env.MINIMAX_API_KEY
  if (!key) throw new Error('MINIMAX_API_KEY no configurado — la voz no está disponible')
  const group = process.env.MINIMAX_GROUP_ID
  const url = `https://api.minimax.io/v1/t2a_v2${group ? `?GroupId=${group}` : ''}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'speech-02-hd',
      text: text.slice(0, 4000),
      language_boost: 'Spanish',
      voice_setting: { voice_id: isValidVoice(voiceId) ? voiceId : 'Spanish_ConfidentWoman', speed: Math.max(0.5, Math.min(2, speed || 1)), vol: 1, pitch: 0, ...(emotion ? { emotion } : {}) },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
    }),
  })
  const data = await res.json().catch(() => ({})) as MiniMaxTTS
  const hex = data?.data?.audio
  if (!hex) throw new Error(data?.base_resp?.status_msg || `Error de TTS (${res.status})`)
  await writeFile(outPath, Buffer.from(hex, 'hex'))
}
