"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

// Notificaciones globales (sonner) — colores ricos por tipo, botón de cerrar,
// esquinas redondeadas, sombra y borde sutil. Estilo premium y consistente
// en todo el sistema.
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={(resolvedTheme as ToasterProps["theme"]) || "light"}
      position="top-right"
      richColors
      closeButton
      expand
      gap={10}
      duration={3800}
      offset={16}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group rounded-xl border shadow-lg shadow-black/5 backdrop-blur-sm !font-sans px-4 py-3",
          title: "text-sm font-semibold",
          description: "text-xs opacity-90",
          actionButton: "rounded-lg text-xs font-medium",
          cancelButton: "rounded-lg text-xs",
          closeButton: "rounded-md border-border/60 hover:bg-muted transition-colors",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
