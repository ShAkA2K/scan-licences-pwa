// src/App.tsx
import React from 'react'
import { supabase } from './data/supabase'

export default function App() {
  const [envOk, setEnvOk] = React.useState<boolean | null>(null)
  const [session, setSession] = React.useState<any>(null)
  const [probe, setProbe] = React.useState<{ ok: boolean; msg: string } | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    // 1) Vérif ENV (montre clairement si Vercel n’a pas les variables)
    const url = (import.meta as any).env?.VITE_SUPABASE_URL
    const anon = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY
    setEnvOk(Boolean(url && anon))

    // 2) Session actuelle
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))

    // 3) Sonde DB (sessions) — n’empêche jamais l’affichage
    ;(async () => {
      try {
        const { data, error } = await supabase.from('sessions').select('id, date').limit(1)
        if (error) {
          setProbe({ ok: false, msg: `${error.message}${(error as any).code ? ' (code '+(error as any).code+')' : ''}` })
        } else {
          setProbe({ ok: true, msg: data && data.length ? `OK, ex: ${data[0].id}` : 'OK, table vide' })
        }
      } catch (e: any) {
        setProbe({ ok: false, msg: e?.message || String(e) })
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    location.href = '/'
  }

  const card: React.CSSProperties = { background:'#fff', borderRadius:16, padding:16, boxShadow:'0 10px 30px rgba(0,0,0,.15)', maxWidth:800, width:'100%' }
  const line: React.CSSProperties = { display:'flex', justifyContent:'space-between', gap:12, padding:'8px 0', borderBottom:'1px solid #e5e7eb' }
  const pill = (ok?: boolean) => ({
    display:'inline-block', padding:'2px 8px', borderRadius:999,
    background: ok===true ? '#dcfce7' : ok===false ? '#fee2e2' : '#e5e7eb',
    color: ok===true ? '#166534' : ok===false ? '#991b1b' : '#334155', fontWeight:600
  } as React.CSSProperties)

  return (
    <div style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'linear-gradient(180deg,#2563eb,#1d4ed8)',padding:16}}>
      <div style={card}>
        <h1 style={{margin:0}}>App minimale — Diagnostic</h1>
        <p style={{marginTop:6, color:'#334155'}}>Cette page s’affiche **toujours** pour éliminer l’écran blanc. On vérifie l’ENV, la session et un accès DB.</p>

        <div style={line}>
          <div>Variables d’env (Vercel) :</div>
          <div style={pill(envOk ?? undefined)}>{envOk ? 'OK' : envOk===false ? 'MANQUANTES' : '...'}</div>
        </div>

        <div style={line}>
          <div>Session Supabase :</div>
          <div style={pill(session ? true : false)}>{session ? 'OK (connecté)' : 'AUCUNE'}</div>
        </div>

        <div style={line}>
          <div>Sonde DB (select sur <code>sessions</code>) :</div>
          <div style={pill(probe?.ok)}>{loading ? '...' : (probe?.ok ? 'OK' : 'ERREUR')}</div>
        </div>

        {!loading && probe && (
          <pre style={{whiteSpace:'pre-wrap', background:'#f8fafc', color:'#0f172a', borderRadius:8, padding:8, marginTop:10}}>
            {probe.ok ? `✅ ${probe.msg}` : `❌ ${probe.msg}`}
          </pre>
        )}

        <div style={{display:'flex', gap:8, marginTop:16, flexWrap:'wrap'}}>
          <a href="/?clear-sw" style={{textDecoration:'none'}}>
            <button style={{padding:'8px 12px', border:0, borderRadius:10, background:'#0ea5e9', color:'#fff', fontWeight:600}}>
              Purger SW & caches
            </button>
          </a>
          <button onClick={()=>location.reload()} style={{padding:'8px 12px', border:0, borderRadius:10, background:'#6366f1', color:'#fff', fontWeight:600}}>
            Recharger
          </button>
          {session && (
            <button onClick={logout} style={{padding:'8px 12px', border:0, borderRadius:10, background:'#ef4444', color:'#fff', fontWeight:600}}>
              Se déconnecter
            </button>
          )}
        </div>

        <div style={{marginTop:16, color:'#334155', fontSize:14}}>
          Quand tout est vert, on remettra ton <code>App.real.tsx</code> d’origine.
        </div>
      </div>
    </div>
  )
}
