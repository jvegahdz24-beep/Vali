'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Bot } from 'lucide-react'
import Link from 'next/link'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[ValiAutoFlow Error]', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-white to-orange-50 p-4">
      <div className="w-full max-w-md text-center">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-red-100 flex items-center justify-center mb-6">
            <AlertTriangle className="h-10 w-10 text-red-500" />
          </div>
          <div className="w-14 h-14 rounded-xl bg-emerald-600 flex items-center justify-center mb-3">
            <Bot className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            ValiAutoFlow
          </h1>
        </div>

        <div className="bg-white rounded-2xl shadow-lg shadow-gray-200/50 p-8 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Algo salió mal
          </h2>
          <p className="text-gray-500 mb-6 text-sm leading-relaxed">
            Ocurrió un error inesperado. Nuestro equipo ha sido notificado.
            Por favor, intenta de nuevo.
          </p>

          {error.digest && (
            <p className="text-xs text-gray-400 mb-4 font-mono">
              Error ID: {error.digest}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <Button
              onClick={reset}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Intentar de nuevo
            </Button>
            <Link href="/">
              <Button variant="outline" className="w-full">
                Volver al inicio
              </Button>
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          © {new Date().getFullYear()} ValiAutoFlow. Todos los derechos reservados.
        </p>
      </div>
    </div>
  )
}
