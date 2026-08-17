import { ReactNode } from 'react'
import { AdminSidebar } from './_components/admin-sidebar'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Admin Panel — ValiAutoFlow',
  description: 'Panel de administración de ValiAutoFlow',
  robots: 'noindex, nofollow',
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <AdminSidebar />
      <div className="pl-64">
        <main className="min-h-screen">
          {children}
        </main>
      </div>
    </div>
  )
}
