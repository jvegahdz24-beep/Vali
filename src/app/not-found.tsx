import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Car, SearchX } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-gray-50 p-4">
      <div className="w-full max-w-md text-center">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-6">
            <SearchX className="h-10 w-10 text-slate-400" />
          </div>
          <div className="w-14 h-14 rounded-xl bg-emerald-600 flex items-center justify-center mb-3">
            <Car className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            ValiAutoFlow
          </h1>
        </div>

        <div className="bg-white rounded-2xl shadow-lg shadow-gray-200/50 p-8 border border-gray-100">
          <h2 className="text-6xl font-bold text-emerald-600 mb-2">404</h2>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Página no encontrada
          </h3>
          <p className="text-gray-500 mb-6 text-sm leading-relaxed">
            La página que buscas no existe o ha sido movida. Verifica que la URL sea correcta.
          </p>

          <div className="flex flex-col gap-3">
            <Link href="/">
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                Ir al inicio
              </Button>
            </Link>
            <Link href="/landing">
              <Button variant="outline" className="w-full">
                Página de inicio
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
