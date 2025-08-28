import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { AuthProvider } from './auth/AuthProvider'
import { registerSW } from 'virtual:pwa-register'
import ErrorBoundary from './components/ErrorBoundary'

// ——— util: clear service worker & caches via ?clear-sw
async function maybeClearSW() {
  if (location.search.includes('clear-sw')) {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        for (const r of regs) await r.unregister()
      }
      // Clear caches
      // @ts-ignore
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys()
        for (const k of keys) await caches.delete(k)
      }
      const url = location.origin + location.pathname // drop query
      location.replace(url)
      return true
    } catch (e) {
      console.error('clear-sw failed:', e)
    }
  }
  return false
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (confirm('Une mise à jour est disponible. Actualiser ?')) {
      updateSW(true)
    }
  },
})

// ——— afficher les erreurs JS globales dans la console (et la boundary prendra le relais)
window.addEventListener('error', (e) => {
  console.error('window.onerror', e?.error || e?.message || e)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('unhandledrejection', e?.reason || e)
})

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
}
boot()
