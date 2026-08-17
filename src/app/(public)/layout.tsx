import type { Metadata } from 'next'
import { Geist } from 'next/font/google'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'ValiAutoFlow — Automatiza tus ventas con IA y WhatsApp',
  description: 'CRM Inteligente con IA para WhatsApp. Automatiza ventas, gestiona leads y cierra más tratos con agentes IA y pipeline visual.',
}

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${geistSans.variable} font-sans antialiased`}>
      {children}
    </div>
  )
}
