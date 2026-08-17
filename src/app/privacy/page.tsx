import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link href="/" className="text-emerald-600 hover:text-emerald-700 text-sm font-medium mb-8 inline-block">
          &larr; Volver a ValiAutoFlow
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Política de Privacidad</h1>
        <p className="text-sm text-gray-500 mb-8">Última actualización: Abril 2026</p>

        <div className="prose prose-gray max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-gray-900">1. Información que Recopilamos</h2>
            <p className="text-gray-600 leading-relaxed">
              Recopilamos información que nos proporcionas directamente al crear una cuenta, including tu nombre,
              correo electrónico y datos de negocio. También recopilamos información de uso automática cuando
              interactúas con nuestra plataforma, como patrones de uso, datos de conversaciones de WhatsApp
              procesadas a través de nuestros agentes de IA, y métricas de rendimiento del sistema.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">2. Cómo Usamos tu Información</h2>
            <p className="text-gray-600 leading-relaxed">
              Utilizamos la información recopilada para proveer y mejorar nuestros servicios de CRM y automatización
              con IA, procesar mensajes de WhatsApp a través de nuestros agentes inteligentes, generar reportes
              y analíticas de tu negocio, comunicarnos contigo sobre actualizaciones del servicio, y mantener
              la seguridad e integridad de la plataforma. No vendemos ni compartimos tu información personal
              con terceros para fines de marketing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">3. Almacenamiento y Seguridad</h2>
            <p className="text-gray-600 leading-relaxed">
              Tus datos se almacenan en servidores propios con encriptación en reposo y en tránsito.
              Implementamos medidas de seguridad incluyendo autenticación JWT, encriptación de contraseñas,
              y controles de acceso basados en roles. Retenemos tus datos mientras tu cuenta esté activa
              y los eliminamos dentro de los 30 días posteriores al cierre de cuenta, salvo requerimiento legal.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">4. Tus Derechos</h2>
            <p className="text-gray-600 leading-relaxed">
              Puedes acceder, corregir o eliminar tu información personal en cualquier momento desde la
              configuración de tu cuenta. Tienes derecho a solicitar una copia de tus datos, revocar
              consentimientos, y oponerte al procesamiento de datos para fines específicos. Para ejercer
              estos derechos, contacta a privacidad@valiflow.com.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">5. Contacto</h2>
            <p className="text-gray-600 leading-relaxed">
              Para preguntas sobre esta política de privacidad, contacta a nuestro equipo en
              privacidad@valiflow.com. Responderemos dentro de los 5 días hábiles.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
