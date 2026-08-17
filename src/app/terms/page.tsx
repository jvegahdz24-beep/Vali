import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link href="/" className="text-emerald-600 hover:text-emerald-700 text-sm font-medium mb-8 inline-block">
          &larr; Volver a ValiAutoFlow
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Términos de Servicio</h1>
        <p className="text-sm text-gray-500 mb-8">Última actualización: Abril 2026</p>

        <div className="prose prose-gray max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-gray-900">1. Aceptación de los Términos</h2>
            <p className="text-gray-600 leading-relaxed">
              Al acceder y utilizar ValiAutoFlow, aceptas estar sujeto a estos Términos de Servicio y nuestra
              Política de Privacidad. Si no estás de acuerdo con alguno de estos términos, no deberás utilizar
              la plataforma. Estos términos aplican a todos los usuarios, incluyendo cuentas gratuitas y de pago.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">2. Descripción del Servicio</h2>
            <p className="text-gray-600 leading-relaxed">
              ValiAutoFlow es una plataforma de CRM inteligente que integra automatización de WhatsApp con agentes
              de inteligencia artificial. Los servicios incluyen gestión de contactos, pipeline de ventas,
              automatización de seguimientos, análisis con IA, y generación de reportes. Nos reservamos el
              derecho de modificar o descontinuar funcionalidades con previo aviso.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">3. Uso Aceptable</h2>
            <p className="text-gray-600 leading-relaxed">
              Te comprometes a utilizar la plataforma de manera ética y legal. No deberás utilizar ValiAutoFlow
              para enviar spam, mensajes no solicitados, contenido ilegal o ofensivo. El uso de los agentes de IA
              debe cumplir con las regulaciones de comunicaciones aplicables en tu jurisdicción. Nos reservamos
              el derecho de suspender cuentas que violen estas políticas.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">4. Planes y Facturación</h2>
            <p className="text-gray-600 leading-relaxed">
              Los planes de pago se facturan mensualmente a través de Stripe. Las cancelaciones surten efecto al
              final del período de facturación actual. No ofrecemos reembolsos parciales por períodos ya facturados.
              Los precios pueden cambiar con 30 días de aviso previo.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">5. Contacto</h2>
            <p className="text-gray-600 leading-relaxed">
              Para preguntas sobre estos términos, contacta a legal@valiflow.com.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
