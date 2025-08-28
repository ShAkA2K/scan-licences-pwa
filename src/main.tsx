import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { AuthProvider } from './auth/AuthProvider'
import ErrorBoundary from './components/ErrorBoundary'

// Flag build-time (mis dans Vercel). Par défaut OFF.
const ENABLE_PWA = import.meta.env.VITE_ENABLE_PWA === '1'

// Marqueur pour l'overlay diagnostic (injecté dans index.html)
;(window as any).__appBooted = false

async function maybeClearSW() {
  if (!location.search.includes('clear-sw')) return false
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      for (const r of regs) await r.unregister()
    }
    // @ts-ignore
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      for (const k of keys) await caches.delete(k)
    }
  } catch (e) {
    console.error('clear-sw failed:', e)
  }
  const url = location.origin + location.pathname // enlève la query
  location.replace(url)
  return true
}

async function boot() {
  const cleared = await maybeClearSW()
  if (cleared) return

  // PWA uniquement si explicitement activé
  if (ENABLE_PWA) {
    try {
      const { registerSW } = await import('virtual:pwa-register')
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          if (confirm('Mise à jour disponible. Actualiser ?')) updateSW(true)
        },
      })
    } catch (e) {
      console.warn('PWA disabled / plugin manquant:', e)
    }
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorBoundary>
    </React.StrictMode>
  )

  ;(window as any).__appBooted = true
}

// Logs globaux visibles même si React crashe
window.addEventListener('error', (e) => console.error('window.onerror', e?.error || e?.message || e))
window.addEventListener('unhandledrejection', (e) => console.error('unhandledrejection', e?.reason || e))

boot()
