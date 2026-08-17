'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Shield, Globe, Mail, Database, Zap, Lock, Bell, Users,
  CheckCircle2, Info,
} from 'lucide-react'

interface ConfigRow { label: string; value: string; status?: 'ok' | 'warn' | 'info' }

function Section({ title, description, icon: Icon, rows }: {
  title: string; description: string; icon: React.ElementType; rows: ConfigRow[]
}) {
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-800 rounded-lg">
            <Icon className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <CardTitle className="text-white text-sm font-semibold">{title}</CardTitle>
            <CardDescription className="text-gray-500 text-xs">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i}>
              {i > 0 && <Separator className="bg-gray-800 mb-3" />}
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">{row.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-200 text-sm font-medium">{row.value}</span>
                  {row.status === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  {row.status === 'warn' && <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs px-1.5">!</Badge>}
                  {row.status === 'info' && <Info className="w-3.5 h-3.5 text-blue-400" />}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function AdminSettingsPage() {
  const [appUrl, setAppUrl] = useState(process.env.NEXT_PUBLIC_APP_URL || '')
  useEffect(() => {
    if (!appUrl) setAppUrl(window.location.origin)
  }, [appUrl])

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Configuración</h1>
        <p className="text-gray-400 text-sm mt-1">Estado y configuración de la plataforma</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section
          title="Plataforma"
          description="Información general del sistema"
          icon={Globe}
          rows={[
            { label: 'Nombre', value: 'ValiAutoflow', status: 'ok' },
            { label: 'URL', value: appUrl, status: 'info' },
            { label: 'Entorno', value: process.env.NODE_ENV || 'production', status: 'ok' },
            { label: 'Versión', value: '1.0.0', status: 'info' },
          ]}
        />

        <Section
          title="Autenticación"
          description="Configuración de sesiones y seguridad"
          icon={Lock}
          rows={[
            { label: 'Método', value: 'JWT (HS256)', status: 'ok' },
            { label: 'Cookie', value: 'valiflow-session', status: 'ok' },
            { label: 'Duración sesión', value: '7 días', status: 'info' },
            { label: 'Roles disponibles', value: 'member, admin, owner, superadmin', status: 'info' },
          ]}
        />

        <Section
          title="Base de Datos"
          description="Configuración de Prisma + MySQL"
          icon={Database}
          rows={[
            { label: 'ORM', value: 'Prisma 6.11.1', status: 'ok' },
            { label: 'Motor', value: 'MySQL (XAMPP)', status: 'ok' },
            { label: 'Host', value: 'localhost:3306', status: 'ok' },
            { label: 'Base de datos', value: 'db_s704ag', status: 'ok' },
          ]}
        />

        <Section
          title="Email / SMTP"
          description="Configuración de MailerSend"
          icon={Mail}
          rows={[
            { label: 'Proveedor', value: 'MailerSend', status: 'ok' },
            { label: 'From', value: 'no-reply@valiautoflow.com', status: 'ok' },
            { label: 'Transaccional', value: 'Activo', status: 'ok' },
            { label: 'Templates', value: 'Bienvenida, Reset password', status: 'info' },
          ]}
        />

        <Section
          title="Planes y Precios"
          description="Configuración de membresías disponibles"
          icon={Zap}
          rows={[
            { label: 'Free', value: '$0 / mes', status: 'info' },
            { label: 'Trial', value: '30 días gratis', status: 'info' },
            { label: 'Starter', value: '$4,300 MXN / mes', status: 'ok' },
            { label: 'Pro', value: '$7,800 MXN / mes', status: 'ok' },
            { label: 'Enterprise', value: '$35,500 MXN / mes', status: 'ok' },
          ]}
        />

        <Section
          title="Seguridad"
          description="Medidas de protección activas"
          icon={Shield}
          rows={[
            { label: 'Rate limiting', value: 'Activo (Upstash Redis)', status: 'ok' },
            { label: 'CSRF protection', value: 'SameSite cookies', status: 'ok' },
            { label: 'Admin guard', value: 'Rol superadmin requerido', status: 'ok' },
            { label: 'Headers de seguridad', value: 'X-Frame, HSTS, CSP', status: 'ok' },
          ]}
        />

        <Section
          title="Usuarios"
          description="Configuración de registro y cuentas"
          icon={Users}
          rows={[
            { label: 'Registro', value: 'Abierto (flujo 3 pasos)', status: 'ok' },
            { label: 'Verificación email', value: 'Opcional', status: 'info' },
            { label: 'OAuth Google', value: 'Disponible', status: 'ok' },
            { label: 'Reset password', value: 'Por email', status: 'ok' },
          ]}
        />

        <Section
          title="Notificaciones"
          description="Sistema de notificaciones de la app"
          icon={Bell}
          rows={[
            { label: 'Toast UI', value: 'Sonner', status: 'ok' },
            { label: 'Email bienvenida', value: 'Automático al registrar', status: 'ok' },
            { label: 'Email reset', value: 'Automático en solicitud', status: 'ok' },
            { label: 'Webhooks', value: 'No configurados', status: 'warn' },
          ]}
        />
      </div>
    </div>
  )
}
