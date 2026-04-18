import { Loader2, Car } from 'lucide-react'

export default function Loading() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/25">
            <Car className="h-9 w-9 text-white" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
            <Loader2 className="h-4 w-4 text-white animate-spin" />
          </div>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1">
            ValiAutoFlow
          </h2>
          <p className="text-sm text-muted-foreground">
            Cargando...
          </p>
        </div>
      </div>
    </div>
  )
}
