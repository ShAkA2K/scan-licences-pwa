// src/main.tsx
import './index.css'

// Overlay de statut/erreur visible même si React ne démarre pas
function ensureOverlay() {
  let wrap = document.getElementById('boot-wrap') as HTMLDivElement | null
  if (!wrap) {
    wrap = document.createElement('div')
    wrap.id = 'boot-wrap'
    wrap.style.minHeight = '100vh'
    wrap.style.display = 'grid'
    wrap.style.placeItems = 'center'
    wrap.style.background = 'linear-gradient(180deg,#2563eb,#1d4ed8)'
    wrap.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,.15);max-width:760px;width:calc(100% - 32px)">
        <b>Démarrage de l’app…</b>
        <pre id="boot-log" style="white-space:pre-wrap;background:#f8fafc;color:#0f172a;border-radius:8px;padding:8px;margin-top:8px;max-height:60vh;overflow:auto"></pre>
        <div id="boot-err" style="white-space:pre-wrap;background:#fef2f2;color:#991b1b;border-radius:8px;padding:8px;margin-top:8px;display:none"></div>
      </div>`
    document.body.innerHTML = ''
    document.body.appendChild(wrap)
  }
  return {
    log: (msg: string) => {
      const pre = document.getElementById('boot-log')!
      pre.textContent += (pre.textContent ? '\n' : '') + msg
      console.log('[BOOT]', msg)
    },
    err: (msg: string) => {
      const div = document.getElementById('boot-err')!
      div.style.display = 'block'
      div.textContent = msg
      console.error('[BOOT ERROR]', msg)
    },
  }
}
const overlay = ensureOverlay()

async function clearSWIfAsked() {
  if (!location.search.includes('clear-sw')) return false
  overlay.log('clear-sw: désinscription SW + purge caches…')
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      for (const r of regs) await r.unregister()
      overlay.log(`clear-sw: SW unregistered (${(await navigator.serviceWorker.getRegistrations()).length} restants)`)
    }
    // @ts-ignore
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      overlay.log(`clear-sw: supprime caches ${keys.join(', ') || '(aucun)'}`)
      for (const k of keys) await caches.delete(k)
    }
  } catch (e: any) {
    overlay.err('clear-sw failed: ' + (e?.message || String(e)))
  }
  const url = location.origin + location.pathname
  location.replace(url)
  return true
}

// Accrocher les erreurs globales
window.addEventListener('error', (e) => overlay.err('Erreur JS globale: ' + (e?.error?.message || e?.message || String(e))))
window.addEventListener('unhandledrejection', (e) => overlay.err('Promesse rejetée: ' + (e?.reason?.message || String(e?.reason || e))))

async function boot() {
  overlay.log('boot: start')
  const cleared = await clearSWIfAsked()
  if (cleared) return

  // Mode test minimal = pas de React (juste pour valider l’index & les assets)
  const usp = new URLSearchParams(location.search)
  if (usp.get('minimal') === '1') {
    overlay.log('mode minimal=1: index OK ✅')
    return
  }

  // Mode HelloApp = rend un composant React ultra simple
  const helloMode = usp.get('hello') === '1'
  overlay.log(`mode hello=${helloMode ? 'ON' : 'OFF'}`)

  try {
    overlay.log('import react…')
    const React = await import('react')

    overlay.log('import react-dom/client…')
    const ReactDOM = await import('react-dom/client')

    overlay.log(helloMode ? 'import HelloApp…' : 'import App…')
    const AppModule = helloMode
      ? await import('./sandbox/HelloApp')
      : await import('./App')

    overlay.log('import ErrorBoundary…')
    const { default: ErrorBoundary } = await import('./components/ErrorBoundary')

    overlay.log('import AuthProvider…')
    const { AuthProvider } = await import('./auth/AuthProvider')

    overlay.log('création root…')
    let rootEl = document.getElementById('root')
    if (!rootEl) {
      rootEl = document.createElement('div')
      rootEl.id = 'root'
      document.body.appendChild(rootEl)
    }

    overlay.log('render React…')
    const AppComp = (AppModule as any).default
    ReactDOM.createRoot(rootEl!).render(
      React.createElement(React.StrictMode, null,
        React.createElement(ErrorBoundary, null,
          React.createElement(AuthProvider, null,
            React.createElement(AppComp, null)
          )
        )
      )
    )

    overlay.log('render OK ✅ — masque l’overlay.')
    // On masque l’overlay après un tick pour être sûr que le rendu a commencé
    setTimeout(() => {
      const w = document.getElementById('boot-wrap')
      if (w) w.style.display = 'none'
    }, 50)
  } catch (e: any) {
    overlay.err('Échec import/rendu: ' + (e?.message || String(e)))
  }
}

boot()
