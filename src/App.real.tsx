// src/App.real.tsx
import React from 'react'
import { getTodaySession, openTodaySession, parisDateStr } from './lib/session'
import { supabase } from './data/supabase'

type SessionRow = { id: string; date: string }

export default function AppReal() {
  const [loading, setLoading] = React.useState(true)
  const [sess, setSess] = React.useState<SessionRow | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Au premier rendu : on essaie juste de lire la session du jour
  React.useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        const s = await getTodaySession()
        if (!alive) return
        setSess(s ?? null)
      } catch (e: any) {
        if (!alive) return
        setErr(e?.message || String(e))
      } finally {
        if (!alive) return
        setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  async function handleOpen() {
    setBusy(true); setErr(null)
    try {
      const s = await openTodaySession()
      setSess(s)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    location.href = '/'
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-b from-blue-50 to-blue-100 p-4">
        <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-black/5">Chargement…</div>
      </div>
    )
  }

  if (!sess) {
    // Aucune session ouverte pour aujourd’hui
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-b from-blue-50 to-blue-100 p-4">
        <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-lg ring-1 ring-black/5">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-lg font-semibold">Aucune session ouverte</h1>
            <button
              onClick={logout}
              className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-gray-100 ring-1 ring-gray-200"
            >
              Se déconnecter
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Nous sommes le <b>{parisDateStr()}</b> (Europe/Paris). Ouvre la session du jour pour commencer les enregistrements.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={handleOpen}
              disabled={busy}
              className="rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? '…' : 'Ouvrir la session du jour'}
            </button>
            <button
              onClick={() => location.reload()}
              className="rounded-lg bg-white px-3 py-2 hover:bg-gray-100 ring-1 ring-gray-200"
            >
              Recharger
            </button>
          </div>

          {err && (
            <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              Ouverture impossible : {err}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Il y a une session ouverte aujourd’hui
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-blue-100">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-5xl p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-blue-600 text-white grid place-items-center font-bold">T</div>
            <div>
              <div className="text-sm text-slate-500">Session du jour</div>
              <div className="font-semibold">{sess.date} — <span className="text-slate-500">id:</span> {sess.id}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => location.reload()}
              className="rounded-lg bg-white px-3 py-1.5 hover:bg-gray-100 ring-1 ring-gray-200 text-sm"
            >
              Rafraîchir
            </button>
            <button
              onClick={logout}
              className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-gray-100 ring-1 ring-gray-200 text-sm"
            >
              Se déconnecter
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4">
        {/* Place ici tes composants existants : scan, liste des entrées, exports, etc. */}
        <section className="rounded-2xl bg-white p-4 shadow ring-1 ring-black/5">
          <h2 className="text-lg font-semibold">Entrées du {sess.date}</h2>
          <p className="mt-1 text-sm text-slate-600">
            Utilise le scan QR pour enregistrer les licenciés, ou parcours les membres.
          </p>
          {/* Ex : <EntriesToday sessionId={sess.id} /> */}
        </section>
      </main>
    </div>
  )
}
