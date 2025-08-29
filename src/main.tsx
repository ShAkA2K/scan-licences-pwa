// src/main.tsx
import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import ErrorBoundary from './components/ErrorBoundary'
import { supabase } from './data/supabase'

/** Écran de login (magic link) pour éviter tout écran vide si pas de session) */
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

/** Écran diagnostic lisible si la sonde Supabase échoue (évite le blanc) */
function DiagScreen({ title, detail }: { title: string; detail?: string }) {
  return (
    <div style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'linear-gradient(180deg,#2563eb,#1d4ed8)',padding:16}}>
      <div style={{background:'#fff',borderRadius:16,padding:20,boxShadow:'0 10px 30px rgba(0,0,0,.15)',maxWidth:760,width:'100%'}}>
        <h1 style={{margin:0,fontSize:18}}>{title}</h1>
        {detail && (
          <pre style={{whiteSpace:'pre-wrap',background:'#fef2f2',color:'#991b1b',borderRadius:8,padding:8,marginTop:10}}>
            {detail}
          </pre>
        )}
        <div style={{marginTop:10,color:'#334155',fontSize:14}}>
          Vérifie sur Vercel les variables <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> (Production),
          et les politiques RLS en prod. Essaie aussi <code>/?clear-sw</code>.
        </div>
      </div>
    </div>
  )
}

// Secours : purge SW/caches via ?clear-sw
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

/** Monte un composant React de manière sûre */
function render(element: React.ReactNode) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>{element}</ErrorBoundary>
    </React.StrictMode>
  )
}

async function boot() {
  if (await maybeClearSW()) return

  // 1) Session ?
  let { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    render(<LoginScreen />)
    // attend l’auth pour monter l’app
    supabase.auth.onAuthStateChange((_evt, sess) => { if (sess) safeMountApp() })
  } else {
    safeMountApp()
  }
}

/** Sonde Supabase AVANT de charger App : si ça plante, on affiche Diag */
async function safeMountApp() {
  try {
    // 2) Test court: lire 1 ligne (ou 0) sans casser l’UI si table vide
    // Choisis une table accessible aux utilisateurs connectés (ex: sessions)
    const probe = await supabase.from('sessions').select('id').limit(1)
    if (probe.error) {
      render(<DiagScreen title="Sonde Supabase en échec" detail={`${probe.error.message}\n(code: ${(probe.error as any).code || 'N/A'})`} />)
      return
    }

    // 3) Si la sonde passe, on importe App et AuthProvider
    const App = (await import('./App')).default
    const { AuthProvider } = await import('./auth/AuthProvider')

    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    )

    // 4) Sécurité : si l’app ne rend “rien” (root vide) au bout de 1s -> diag
    setTimeout(() => {
      const root = document.getElementById('root') as HTMLElement
      if (!root || root.childElementCount === 0) {
        render(<DiagScreen title="App a rendu un écran vide" detail={'Le composant App() ne produit aucun contenu.\nVérifie App.tsx et ses imports.'} />)
      }
    }, 1000)

  } catch (e: any) {
    render(<DiagScreen title="Erreur de démarrage" detail={e?.message || String(e)} />)
  }
}

boot()
