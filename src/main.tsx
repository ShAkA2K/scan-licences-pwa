// src/main.tsx
import './index.css'

function ensureOverlay() {
  let wrap = document.getElementById('boot-wrap') as HTMLDivElement | null
  if (!wrap) {
    wrap = document.createElement('div')
    wrap.id = 'boot-wrap'
    wrap.style.position = 'fixed'
    wrap.style.inset = '0'
    wrap.style.zIndex = '99999'
    wrap.style.background = 'linear-gradient(180deg,#2563eb,#1d4ed8)'
    wrap.innerHTML = `
      <div style="position:absolute;right:12px;top:12px;display:flex;gap:8px">
        <button id="boot-hide" style="background:#0ea5e9;color:#fff;border-radius:8px;border:0;padding:6px 10px">Masquer</button>
        <button id="boot-clear" style="background:#e11d48;color:#fff;border-radius:8px;border:0;padding:6px 10px">Purger SW/caches</button>
      </div>
      <div style="height:100%;display:grid;place-items:center;padding:12px">
        <div style="background:#fff;border-radius:16px;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,.15);max-width:900px;width:100%">
          <b>Démarrage de l’app…</b>
          <pre id="boot-log" style="white-space:pre-wrap;background:#f8fafc;color:#0f172a;border-radius:8px;padding:8px;margin-top:8px;max-height:60vh;overflow:auto"></pre>
          <div id="boot-err" style="white-space:pre-wrap;background:#fef2f2;color:#991b1b;border-radius:8px;padding:8px;margin-top:8px;display:none"></div>
        </div>
      </div>`
    document.body.appendChild(wrap)

    const hideBtn = document.getElementById('boot-hide')!
    hideBtn.addEventListener('click', () => {
      wrap!.style.display = 'none'
      localStorage.setItem('__overlayHidden', '1')
    })
    const clearBtn = document.getElementById('boot-clear')!
    clearBtn.addEventListener('click', async () => {
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
        location.reload()
      } catch (e) {
        console.error('clear failed', e)
      }
    })
  }
  const logEl = document.getElementById('boot-log')!
  const errEl = document.getElementById('boot-err')!
  const append = (el: HTMLElement, msg: string) => {
    el.textContent += (el.textContent ? '\n' : '') + msg
    el.scrollTop = el.scrollHeight
  }
  return {
    show: () => {
      const hidden = localStorage.getItem('__overlayHidden') === '1'
      if (!hidden) (document.getElementById('boot-wrap') as HTMLDivElement).style.display = 'block'
    },
    log: (msg: string) => { console.log('[BOOT]', msg); append(logEl, msg) },
    err: (msg: string) => {
      console.error('[BOOT ERROR]', msg)
      errEl.style.display = 'block'; append(errEl, msg)
      ;(document.getElementById('boot-wrap') as HTMLDivElement).style.display = 'block'
      localStorage.removeItem('__overlayHidden')
    },
  }
}
const overlay = ensureOverlay()
overlay.show()

async function clearSWIfAsked() {
  if (!location.search.includes('clear-sw')) return false
  overlay.log('clear-sw: unregister SW + purge caches…')
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
    overlay.err('clear-sw failed: ' + (e?.message || String(e)))
  }
  const url = location.origin + location.pathname
  location.replace(url)
  return true
}

// Erreurs globales (capturées même après le rendu)
window.addEventListener('error', (e) => overlay.err('Erreur JS globale: ' + (e?.error?.message || e?.message || String(e))))
window.addEventListener('unhandledrejection', (e) => overlay.err('Promesse rejetée: ' + (e?.reason?.message || String(e?.reason || e))))

async function boot() {
  overlay.log('boot: start')
  if (await clearSWIfAsked()) return

  const usp = new URLSearchParams(location.search)
  if (usp.get('minimal') === '1') {
    overlay.log('mode minimal=1: index OK ✅')
    return
  }

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

    overlay.log('render React…')
    const AppComp = (AppModule as any).default
    let rootEl = document.getElementById('root')
    if (!rootEl) { rootEl = document.createElement('div'); rootEl.id = 'root'; document.body.appendChild(rootEl) }
    ReactDOM.createRoot(rootEl!).render(
      React.createElement(React.StrictMode, null,
        React.createElement(ErrorBoundary, null,
          React.createElement(AuthProvider, null,
            React.createElement(AppComp, null)
          )
        )
      )
    )

    // Au lieu de masquer directement, on vérifie que du contenu est bien rendu
    setTimeout(() => {
      const hasChildren = (rootEl as HTMLElement).childElementCount > 0
      if (hasChildren) {
        overlay.log('render OK ✅')
        // Laisse le bouton “Masquer” décider
      } else {
        overlay.err('App n’a rien rendu (root vide). Vérifie App.tsx et ses imports.')
      }
    }, 400)
  } catch (e: any) {
    overlay.err('Échec import/rendu: ' + (e?.message || String(e)))
  }
}

boot()
