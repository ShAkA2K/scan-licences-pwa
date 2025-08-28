// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { AuthProvider } from './auth/AuthProvider'
import ErrorBoundary from './components/ErrorBoundary'

// Marqueur pour l'overlay diagnostic (injecté dans index.html)
;(window as any).__appBooted = false

// ——— util: clear service worker & caches via ?clear-sw
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
