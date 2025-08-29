// src/main.tsx
import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import ErrorBoundary from './components/ErrorBoundary'
import { supabase } from './data/supabase'

function LoginScreen() {
  const [email, setEmail] = React.useState('')
  const [sent, setSent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin }
      })
      if (error) throw error
      setSent(true)
    } catch (err: any) {
      setError(err?.message ?? String(err))
    }
  }

  return (
    <div style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'linear-gradient(180deg,#2563eb,#1d4ed8)',padding:16}}>
      <div style={{background:'#fff',borderRadius:16,padding:20,boxShadow:'0 10px 30px rgba(0,0,0,.15)',maxWidth:460,width:'100%'}}>
        <h1 style={{margin:0,fontSize:18}}>Connexion nécessaire</h1>
        <p style={{marginTop:8,color:'#334155'}}>Entrez votre email pour recevoir un lien de connexion.</p>
        <form onSubmit={sendMagicLink} style={{marginTop:12,display:'grid',gap:8}}>
          <input
            type="email"
            required
            placeholder="prenom.nom@exemple.com"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            style={{padding:'10px 12px',borderRadius:10,border:'1px solid #cbd5e1'}}
          />
          <button type="submit" style={{padding:'10px 12px',border:'0',borderRadius:10,background:'#0ea5e9',color:'#fff',fontWeight:600}}>
            Envoyer le lien
          </button>
          {sent && <div style={{color:'#166534',background:'#dcfce7',padding:8,borderRadius:8}}>Lien envoyé. Ouvrez votre email puis revenez ici.</div>}
          {error && <div style={{color:'#991b1b',background:'#fee2e2',padding:8,borderRadius:8}}>Erreur: {error}</div>}
        </form>
      </div>
    </div>
  )
}

// clear SW & caches via ?clear-sw (secours)
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
  } finally {
    const url = location.origin + location.pathname
    location.replace(url)
  }
  return true
}

window.addEventListener('error', (e) => console.error('window.onerror', e?.error || e?.message || e))
window.addEventListener('unhandledrejection', (e) => console.error('unhandledrejection', e?.reason || e))

async function boot() {
  if (await maybeClearSW()) return

  // 1) On regarde s’il existe une session
  let { data: { session } } = await supabase.auth.getSession()

  // 2) On monte soit la LoginScreen, soit l’app
  if (!session) {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <ErrorBoundary>
          <LoginScreen />
        </ErrorBoundary>
      </React.StrictMode>
    )
    // 3) On écoute l’auth et on remonte l’app dès qu’on reçoit la session
    supabase.auth.onAuthStateChange(async (_event, sess) => {
      if (sess) mountApp()
    })
  } else {
    mountApp()
  }
}

async function mountApp() {
  // import dynamique d'App et de l’AuthProvider (pour éviter un crash au boot)
  const App = (await import('./App')).default
  const { AuthProvider } = await import('./auth/AuthProvider')
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
