// src/App.tsx
import React from 'react'
import { supabase } from './data/supabase'

// ⚠️ C'est TON App d'origine, que tu as renommée en App.real.tsx à l'étape précédente.
import RealApp from './App.real'

/**
 * Ce wrapper monte ton App réelle, puis vérifie si elle a rendu quelque chose.
 * Si rien n'est rendu (blanc), il affiche un fallback avec:
 *  - état de session
 *  - bouton "Ouvrir la session du jour"
 *  - actions secours (clear SW, se déconnecter)
 */
export default function App() {
  const mountRef = React.useRef<HTMLDivElement>(null)
  const [hasContent, setHasContent] = React.useState<boolean | null>(null)
  const [probing, setProbing] = React.useState(true)
  const [probeMsg, setProbeMsg] = React.useState<string>('…')
  const [session, setSession] = React.useState<any>(null)
  const [busy, setBusy] = React.useState(false)
  const [actionMsg, setActionMsg] = React.useState<string | null>(null)

  // 1) récupère la session au boot
  React.useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => alive && setSession(data.session ?? null))
    const unsub = supabase.auth.onAuthStateChange((_evt, s) => setSession(s ?? null)).data
    return () => { alive = false; unsub?.subscription.unsubscribe() }
  }, [])

  // 2) après le premier rendu de RealApp, regarde s'il y a du contenu
  React.useEffect(() => {
    const t = setTimeout(() => {
      const el = mountRef.current
      setHasContent(!!el && el.childElementCount > 0)
    }, 80)
    return () => clearTimeout(t)
  }, [])

  // 3) petite sonde pour diagnostiquer si l'app réelle ne s'affiche pas
  React.useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from('sessions').select('id').limit(1)
        if (error) setProbeMsg(`DB probe: ${error.message}${(error as any).code ? ' (code ' + (error as any).code + ')' : ''}`)
        else setProbeMsg(data?.length ? 'DB probe: OK (sessions existantes)' : 'DB probe: OK (table vide)')
      } catch (e: any) {
        setProbeMsg('DB probe: ' + (e?.message || String(e)))
      } finally {
        setProbing(false)
      }
    })()
  }, [])

  async function openTodaySession() {
    setBusy(true); setActionMsg(null)
    try {
      // Date locale Paris → 'YYYY-MM-DD'
      const paris = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
      const { error } = await supabase.from('sessions').insert({ date: paris })
      if (error) throw error
      setActionMsg('Session du jour ouverte ✅ — recharge en cours…')
      setTimeout(() => location.reload(), 600)
    } catch (e: any) {
      setActionMsg('Ouverture session: ' + (e?.message || String(e)))
    } finally {
      setBusy(false)
    }
  }

  async function clearSW() {
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
  }

  async function logout() {
    await supabase.auth.signOut()
    location.href = '/'
  }

  // ——— UI
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#eff6ff,#dbeafe)' }}>
      {/* Ta vraie App se rend ici */}
      <div ref={mountRef}>
        <RealApp />
      </div>

      {/* Fallback affiché uniquement si RealApp n'a rien rendu */}
      {hasContent === false && (
        <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 16, background: 'linear-gradient(180deg,#2563eb,#1d4ed8)' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 10px 30px rgba(0,0,0,.15)', maxWidth: 860, width: '100%' }}>
            <h1 style={{ margin: 0 }}>Écran de secours — l’application n’a rien rendu</h1>
            <p style={{ marginTop: 6, color: '#334155' }}>
              Tout est OK côté hébergement (ENV/DB/Session). Si cette carte apparaît, c’est que l’UI de l’app réelle
              n’a renvoyé aucun contenu. Utilise les actions ci-dessous.
            </p>

            <div style={{ marginTop: 8, background: '#f8fafc', padding: 10, borderRadius: 10, color: '#0f172a' }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Diagnostic</div>
              <div>Session: <b>{session ? 'connecté' : 'aucune'}</b></div>
              <div>{probing ? 'Sonde DB: …' : probeMsg}</div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <button onClick={openTodaySession} disabled={busy} style={{ padding: '8px 12px', border: 0, borderRadius: 10, background: '#22c55e', color: '#fff', fontWeight: 600 }}>
                Ouvrir la session du jour
              </button>
              <button onClick={clearSW} style={{ padding: '8px 12px', border: 0, borderRadius: 10, background: '#0ea5e9', color: '#fff', fontWeight: 600 }}>
                Purger SW & caches
              </button>
              <button onClick={() => location.reload()} style={{ padding: '8px 12px', border: 0, borderRadius: 10, background: '#6366f1', color: '#fff', fontWeight: 600 }}>
                Recharger
              </button>
              {session && (
                <button onClick={logout} style={{ padding: '8px 12px', border: 0, borderRadius: 10, background: '#ef4444', color: '#fff', fontWeight: 600 }}>
                  Se déconnecter
                </button>
              )}
            </div>

            {actionMsg && (
              <div style={{ marginTop: 10, whiteSpace: 'pre-wrap', background: '#fefce8', color: '#713f12', padding: 10, borderRadius: 10 }}>
                {actionMsg}
              </div>
            )}

            <div style={{ marginTop: 12, color: '#334155', fontSize: 14 }}>
              Astuce : si ta vraie app attend des données (ex: une “session ouverte”) et renvoie <code>null</code>, pense à afficher un état vide (“Aucune session — cliquez pour ouvrir”)
              plutôt que de ne rien rendre.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
