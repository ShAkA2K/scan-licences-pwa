// src/main.tsx
import './index.css'

// Petit utilitaire pour afficher un message d’erreur DANS la page
function showBootError(msg: string) {
  try {
    let box = document.getElementById('boot-msg')
    if (!box) {
      // crée un mini overlay si index.html n’a pas le bloc
      const wrap = document.createElement('div')
      wrap.style.minHeight = '100vh'
      wrap.style.display = 'grid'
      wrap.style.placeItems = 'center'
      wrap.style.background = 'linear-gradient(180deg,#2563eb,#1d4ed8)'
      wrap.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,.15);max-width:680px">
          <b>Échec du démarrage</b>
          <div id="boot-msg" style="white-space:pre-wrap;background:#fef2f2;color:#991b1b;border-radius:8px;padding:8px;margin-top:8px"></div>
        </div>`
      document.body.innerHTML = ''
      document.body.appendChild(wrap)
      box = document.getElementById('boot-msg')!
    }
    box.textContent = msg
    // log console aussi
    console.error('[BOOT]', msg)
  } catch {
    // ultime fallback
    alert('BOOT ERROR: ' + msg)
  }
}

// ——— clear SW & caches via ?clear-sw
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
  } catch (e: any) {
    showBootError('clear-sw failed: ' + (e?.message || String(e)))
  }
  const url = location.origin + location.pathname // enlève la query
  location.replace(url)
  return true
}

// ——— Hooks d’erreurs globales (avant React)
window.addEventListener('error', (e) => {
  showBootError('Erreur JS globale: ' + (e?.error?.message || e?.message || String(e)))
})
window.addEventListener('unhandledrejection', (e) => {
  // ne pas casser le boot, juste afficher
  showBootError('Promesse rejetée: ' + (e?.reason?.message || String(e?.reason || e)))
})

// ——— Démarrage progressif et robuste
async function boot() {
  const cleared = await maybeClearSW()
  if (cleared) return

  // Mode minimal pour diagnostic rapide: ?minimal=1
  const minimal = new URLSearchParams(location.search).get('minimal') === '1'
  if (minimal) {
    const root = document.getElementById('root') || (() => {
      const r = document.createElement('div'); r.id = 'root'; document.body.appendChild(r); return r
    })()
    root.innerHTML = `
      <div style="min-height:100vh;display:grid;place-items:center;background:#e0f2fe">
        <div style="background:#fff;border-radius:16px;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,.15)">
          <b>Boot minimal OK ✅</b>
          <div style="margin-top:8px">React non chargé (mode test). Enlève <code>?minimal=1</code> pour lancer l’app.</div>
        </div>
      </div>`
    return
  }

  try {
    // imports dynamiques pour pouvoir catcher une erreur de module
    const React = await import('react')
    const ReactDOM = await import('react-dom/client')
    const { default: App } = await import('./App')
    const { default: ErrorBoundary } = await import('./components/ErrorBoundary')
    const { AuthProvider } = await import('./auth/AuthProvider')

    const rootEl = document.getElementById('root') || (() => {
      const r = document.createElement('div'); r.id = 'root'; document.body.appendChild(r); return r
    })()

    ReactDOM.createRoot(rootEl).render(
      React.createElement(React.StrictMode, null,
        React.createElement(ErrorBoundary, null,
          React.createElement(AuthProvider, null,
            React.createElement(App, null)
          )
        )
      )
    )
  } catch (e: any) {
    showBootError('Échec import/rendu: ' + (e?.message || String(e)))
  }
}

boot()
