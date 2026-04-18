// ═══════════════════════════════════════════════════════════════
// Script standalone para conectar WhatsApp (Baileys)
// NO modifica lógica del bot — solo genera QR en consola
// ═══════════════════════════════════════════════════════════════

import path from 'path'
import fs from 'fs'
import pino from 'pino'
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from '@whiskeysockets/baileys'

const AUTH_DIR = path.join(process.cwd(), '.whatsapp-auth')

async function connectWhatsApp() {
  console.log('═════════════════════════════════════════════════════')
  console.log('📱 ValiAutoFlow — Conexión WhatsApp')
  console.log('═════════════════════════════════════════════════════')

  // Ensure auth dir exists
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true })
    console.log('📁 Carpeta de auth creada:', AUTH_DIR)
  }

  // Check for existing session
  const files = fs.readdirSync(AUTH_DIR)
  if (files.length > 0) {
    console.log('⚠️  Sesión existente encontrada. Intentando reconectar...')
  } else {
    console.log('🆕 Sin sesión previa. Se generará un QR nuevo.')
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()
  console.log('📋 Baileys version:', version)

  const logger = pino({ level: 'silent' })

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: state.keys,
    },
    logger,
    printQRInTerminal: true,  // ← QR visible en consola
    generateHighQualityLinkPreview: true,
    browser: ['ValiAutoFlow', 'Chrome', '120.0.0'],
    getMessage: async () => null,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update: any) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log('═══════════════════════════════════════════════')
      console.log('📱 ESCANEA EL QR DE ARRIBA CON WHATSAPP')
      console.log('📱 Tienes ~20 segundos antes de que expire')
      console.log('═══════════════════════════════════════════════')
    }

    if (connection === 'open') {
      console.log('═══════════════════════════════════════════════')
      console.log('✅ WHATSAPP CONECTADO EXITOSAMENTE')
      console.log('═══════════════════════════════════════════════')
      try {
        const phone = sock.user?.id?.split(':')[0]
        console.log('📱 Teléfono conectado:', phone || 'desconocido')
      } catch {}
      console.log('💾 Sesión guardada en:', AUTH_DIR)
      console.log('👉 Ya puedes cerrar este script (Ctrl+C)')
      console.log('👉 El servidor Next.js usará la sesión guardada')
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      console.log('❌ WhatsApp desconectado. Código:', statusCode)

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('🔄 Sesión cerrada remotamente. Borra .whatsapp-auth y reintenta.')
        process.exit(1)
      } else {
        console.log('🔄 Reconectando en 5s...')
        setTimeout(() => connectWhatsApp(), 5000)
      }
    }
  })

  // Keep alive
  process.on('SIGINT', () => {
    console.log('\n👋 Cerrando conexión WhatsApp...')
    process.exit(0)
  })
}

connectWhatsApp().catch((err) => {
  console.error('💥 Error fatal:', err)
  process.exit(1)
})
