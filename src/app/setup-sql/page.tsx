'use client'

import { useState, useEffect } from 'react'

export default function SetupSQLPage() {
  const [parts, setParts] = useState<{ name: string; sql: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/sql-migration')
      .then(r => r.json())
      .then(data => {
        setParts(data.parts || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleCopy = async (text?: string) => {
    const sql = text || parts[activeTab]?.sql || ''
    try {
      await navigator.clipboard.writeText(sql)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = sql
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const allSql = parts.map(p => p.sql).join('\n\n')

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#0f172a', color: '#e2e8f0' }}>
        Cargando SQL...
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', padding: 20 }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, marginBottom: 8, color: '#38bdf8' }}>Supabase SQL Migration</h1>
        <p style={{ color: '#94a3b8', marginBottom: 20 }}>
          Copia cada parte y pegala en el{' '}
          <a href="https://supabase.com/dashboard/project/ffxppvsdunvsmotxkdiy/sql/new" target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>
            SQL Editor de Supabase
          </a>. Ejecuta en orden: Parte 1 - Parte 2 - Parte 3.
        </p>

        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => handleCopy(allSql)}
            style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 'bold' }}
          >
            {copied ? 'Copiado!' : 'Copiar TODO (3 partes juntas)'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 0 }}>
          {parts.map((part, i) => (
            <button key={i} onClick={() => setActiveTab(i)} style={{
              background: activeTab === i ? '#1e293b' : 'transparent',
              color: activeTab === i ? '#38bdf8' : '#94a3b8',
              border: activeTab === i ? '1px solid #334155' : '1px solid transparent',
              borderBottom: activeTab === i ? '2px solid #38bdf8' : 'none',
              padding: '8px 16px', cursor: 'pointer', fontSize: 13, borderRadius: '6px 6px 0 0',
            }}>
              {part.name} ({part.sql.split('\n').length} lineas)
            </button>
          ))}
        </div>

        {parts[activeTab] && (
          <div style={{ position: 'relative' }}>
            <button onClick={() => handleCopy()} style={{
              position: 'absolute', top: 8, right: 8, background: '#334155', color: '#e2e8f0',
              border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, zIndex: 1,
            }}>
              {copied ? 'Copiado!' : 'Copiar esta parte'}
            </button>
            <pre style={{
              background: '#1e293b', border: '1px solid #334155', borderTop: 'none',
              borderRadius: '0 0 6px 6px', padding: 16, overflow: 'auto', maxHeight: '70vh',
              fontSize: 12, lineHeight: 1.4, whiteSpace: 'pre', tabSize: 2,
            }}>
              {parts[activeTab].sql}
            </pre>
          </div>
        )}

        <div style={{ marginTop: 24, padding: 16, background: '#1e293b', borderRadius: 8, border: '1px solid #334155' }}>
          <h3 style={{ color: '#fbbf24', fontSize: 14, marginBottom: 8 }}>Instrucciones:</h3>
          <ol style={{ color: '#94a3b8', fontSize: 13, paddingLeft: 20, lineHeight: 1.8 }}>
            <li>Abre el <a href="https://supabase.com/dashboard/project/ffxppvsdunvsmotxkdiy/sql/new" target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>SQL Editor de Supabase</a></li>
            <li>Clic &quot;Copiar TODO&quot; o copia cada parte por separado</li>
            <li>Pega en el editor (Ctrl+V)</li>
            <li>Clic &quot;Run&quot; o Ctrl+Enter</li>
            <li>Vuelve aqui y escribe &quot;listo&quot;</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
