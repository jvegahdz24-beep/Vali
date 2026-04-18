import { whatsAppManager } from '@/lib/whatsapp/connection'

async function main() {
  console.log('═══════════════════════════════════════════════════')
  console.log('📱 ValiAutoFlow — WhatsApp Baileys Connection')
  console.log('═══════════════════════════════════════════════════')
  console.log('')

  whatsAppManager.onStatusChange((status) => {
    console.log('[Status]', JSON.stringify(status))
  })

  whatsAppManager.onMessage((data) => {
    console.log(`📩 MENSAJE DE ${data.from}: ${data.message.slice(0, 80)}`)
  })

  console.log('Iniciando conexión con Baileys...')
  try {
    const result = await whatsAppManager.start()
    console.log('start() → connected:', result.connected, '| connecting:', result.connecting, '| phone:', result.phone)
  } catch (err) {
    console.error('❌ Error:', err)
  }

  console.log('')
  console.log('⏳ Esperando QR o conexión... Ctrl+C para salir.')
  console.log('')

  setInterval(() => {}, 10000)
}

main()
