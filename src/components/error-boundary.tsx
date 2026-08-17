'use client'

// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Global Error Boundary
// Catches ALL React errors during rendering/hydration.
// Prevents white screen — shows a visible error with retry button.
// Also logs errors to console for debugging.
// ═══════════════════════════════════════════════════════════════

import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })
    // Log to console for debugging
    console.error('[ValiAutoFlow Error]', error)
    console.error('[ValiAutoFlow Error Info]', errorInfo)

    // ChunkLoadError = stale JS cache after a deploy → force full reload
    if (
      typeof window !== 'undefined' &&
      (error.name === 'ChunkLoadError' || error.message?.includes('Failed to load chunk'))
    ) {
      window.location.reload()
      return
    }

    // Also dispatch a custom event so we can catch it in window.onerror
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('valiflow-error', {
        detail: {
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
        }
      }))
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleFullReload = () => {
    // Clear any cached state and force a full reload
    if (typeof window !== 'undefined') {
      window.location.href = window.location.pathname
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '2rem',
            backgroundColor: '#fafafa',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: '#1a1a1a',
          }}
        >
          <div
            style={{
              maxWidth: '480px',
              width: '100%',
              textAlign: 'center',
            }}
          >
            {/* Icon */}
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                background: '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem',
              }}
            >
              <AlertTriangle style={{ width: '32px', height: '32px', color: '#d97706' }} />
            </div>

            {/* Title */}
            <h1
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                marginBottom: '0.5rem',
                color: '#111827',
              }}
            >
              Error al cargar ValiFlow Pro
            </h1>

            {/* Error message */}
            <p
              style={{
                fontSize: '0.875rem',
                color: '#6b7280',
                marginBottom: '1.5rem',
                lineHeight: 1.5,
              }}
            >
              Ocurri&oacute; un error inesperado. Esto suele resolverse recargando la p&aacute;gina.
            </p>

            {/* Error details (collapsible) */}
            {this.state.error && (
              <details
                style={{
                  textAlign: 'left',
                  marginBottom: '1.5rem',
                  padding: '1rem',
                  backgroundColor: '#fef2f2',
                  borderRadius: '8px',
                  border: '1px solid #fecaca',
                }}
              >
                <summary
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#dc2626',
                    cursor: 'pointer',
                    marginBottom: '0.5rem',
                  }}
                >
                  Detalles t&eacute;cnicos
                </summary>
                <pre
                  style={{
                    fontSize: '0.7rem',
                    color: '#991b1b',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    maxHeight: '200px',
                    overflow: 'auto',
                    margin: 0,
                  }}
                >
                  {this.state.error.message}
                  {'\n\n'}
                  {this.state.error.stack?.substring(0, 500)}
                </pre>
              </details>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={this.handleRetry}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1.25rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <RotateCcw style={{ width: '16px', height: '16px' }} />
                Reintentar
              </button>

              <button
                onClick={this.handleFullReload}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1.25rem',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                Recargar p&aacute;gina
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// ─── Client-Side Global Error Logging ─────────────────────────

/**
 * Initialize global error handlers to catch and log errors
 * that happen outside of React's error boundary.
 */
export function initGlobalErrorHandlers() {
  if (typeof window === 'undefined') return

  // Catch unhandled JS errors
  window.onerror = (message, source, lineno, colno, error) => {
    console.error('[ValiFlow Global Error]', {
      message,
      source,
      lineno,
      colno,
      error,
    })
    return false // Don't suppress default handler
  }

  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[ValiFlow Unhandled Rejection]', event.reason)
  })

  // Catch our custom error boundary events
  window.addEventListener('valiflow-error', ((event: CustomEvent) => {
    console.error('[ValiFlow Error Boundary Event]', event.detail)
  }) as EventListener)
}
