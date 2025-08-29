// src/App.real.tsx
import React from 'react'
import { supabase } from './data/supabase'
import { getTodaySession, openTodaySession, parisDateStr } from './lib/session'

// --- Types simples ---
type SessionRow = { id: string; date: string }
type EntryRow = { id: string; session_id: string; licence_no: string; created_at: string; source_url?: string | null }
type Member = { licence_no: string; first_name: string | null; last_name: string | null; photo_url: string | null; source_url?: string | null }

// --- Utils UI ---
function cls(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(' ')
}
function Avatar({ member }: { member: Member }) {
  const label = `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() || member.licence_no
  const initial = (member.last_name?.[0] || member.first_name?.[0] || member.licence_no?.[0] || '?').toUpperCase()
  if (member.photo_url) {
    return <img src={member.photo_url} alt={label} className="h-10 w-10 rounded-full object-cover ring-1 ring-black/5" />
  }
  return (
    <div className="h-10 w-10 rounded-full bg-blue-600 text-white grid place-items-center font-semibold ring-1 ring-black/5">
      {initial}
    </div>
  )
}
function Icon({ name, className }: { name: 'user' | 'list' | 'logout' | 'refresh' | 'external' | 'plus' | 'scan'; className?: string }) {
  const path =
    name === 'user' ? "M12 12a5 5 0 100-10 5 5 0 000 10zm-9 9a9 9 0 1118 0H3z" :
    name === 'list' ? "M4 6h16M4 12h16M4 18h7" :
    name === 'logout' ? "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" :
    name === 'refresh' ? "M4 4v6h6M20 20v-6h-6M20 8a8 8 0 10-3.3 6.5" :
    name === 'external' ? "M10 6h8m0 0v8m0-8L9 15" :
    name === 'plus' ? "M12 4v16m8-8H4" :
    /* scan */       "M3 7V5a2 2 0 012-2h2M21 7V5a2 2 0 00-2-2h-2M3 17v2a2 2 0 002 2h2M21 17v2a2 2 0 01-2 2h-2"
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cls("h-5 w-5 stroke-[2] stroke-current", className)}>
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// --- HOME (session + entrées du jour) ---
function HomeView() {
  const [loading, setLoading] = React.useState(true)
  const [sess, setSess] = React.useState<SessionRow | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Entrées du jour + map membres
  const [entries, setEntries] = React.useState<(EntryRow & { member?: Member | null })[]>([])
  const [loadingEntries, setLoadingEntries] = React.useState(false)
  const [addingUrl, setAddingUrl] = React.useState(false)
  const [url, setUrl] = React.useState('')
  const [hint, setHint] = React.useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        const s = await getTodaySession()
        if (!alive) return
        setSess(s ?? null)
        setErr(null)
        if (s) await loadEntries(s.id, alive)
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

  async function loadEntries(sessionId: string, alive = true) {
    try {
      setLoadingEntries(true)
      // 1) entries de la session
      const { data: ent, error: e1 } = await supabase
        .from('entries')
        .select('id, session_id, licence_no, created_at, source_url')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
      if (e1) throw e1

      const lis = Array.from(new Set((ent ?? []).map(x => x.licence_no))).filter(Boolean)
      let membersByLic: Record<string, Member> = {}
      if (lis.length) {
        const { data: mem, error: e2 } = await supabase
          .from('members')
          .select('licence_no, first_name, last_name, photo_url, source_url')
          .in('licence_no', lis)
        if (e2) throw e2
        membersByLic = Object.fromEntries((mem ?? []).map(m => [m.licence_no, m as Member]))
      }
      if (!alive) return
      setEntries((ent ?? []).map(e => ({ ...e, member: membersByLic[e.licence_no] || null })))
    } catch (e: any) {
      if (!alive) return
      setErr(e?.message || String(e))
    } finally {
      if (!alive) return
      setLoadingEntries(false)
    }
  }

  async function handleOpenSession() {
    setBusy(true); setErr(null)
    try {
      const s = await openTodaySession()
      setSess(s)
      await loadEntries(s.id)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  async function addByUrl(e: React.FormEvent) {
    e.preventDefault()
    if (!sess) return
    if (!url.trim()) return
    setAddingUrl(true); setHint(null)
    try {
      // Appelle ta Edge Function pour enrichir et stocker le membre
      const { data, error } = await supabase.functions.invoke('itac_profile_store', { body: { url } })
      if (error) throw error
      // data attendu : { ok, licence_no, first_name, last_name, photo_url, source_url, valid_flag, ... }
      if (!data?.licence_no) {
        throw new Error('Réponse invalide de la fonction (licence_no manquant)')
      }
      // Insert l’entrée
      const ins = await supabase.from('entries').insert({
        session_id: sess.id,
        licence_no: data.licence_no,
        source_url: data.source_url ?? url
      }).select('id, session_id, licence_no, created_at, source_url').single()
      if (ins.error) {
        // ignore doublon jour si contrainte côté BDD
        if ((ins.error as any).code !== '23505') throw ins.error
        setHint("Déjà enregistré aujourd’hui pour cette session.")
      }
      setUrl('')
      await loadEntries(sess.id)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setAddingUrl(false)
    }
  }

  function RowEntry({ row }: { row: EntryRow & { member?: Member | null } }) {
    const m = row.member
    const label = m ? `${m.last_name ?? ''} ${m.first_name ?? ''}`.trim() : row.licence_no
    const sub = m ? row.licence_no : '—'
    const link = (m?.source_url || row.source_url || null)
    return (
      <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
        <Avatar member={{ licence_no: row.licence_no, first_name: m?.first_name ?? null, last_name: m?.last_name ?? null, photo_url: m?.photo_url ?? null, source_url: m?.source_url ?? undefined }} />
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{label || row.licence_no}</div>
          <div className="text-xs text-slate-500">{new Date(row.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} • {sub}</div>
        </div>
        {link && (
          <button
            className="rounded-md bg-white px-2 py-1 text-sm ring-1 ring-slate-200 hover:bg-slate-50"
            onClick={() => window.open(link!, '_blank')}
            title="Ouvrir la page licence"
          >
            <Icon name="external" />
          </button>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="rounded-xl bg-white p-4 shadow ring-1 ring-black/5">Chargement…</div>
      </div>
    )
  }

  if (!sess) {
    return (
      <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-black/5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm text-slate-500">Nous sommes le</div>
            <div className="font-semibold">{parisDateStr()} (Europe/Paris)</div>
          </div>
          <button
            onClick={handleOpenSession}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? '…' : (<span className="inline-flex items-center gap-2"><Icon name="plus" /> Ouvrir la session du jour</span>)}
          </button>
        </div>
        {err && <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">Erreur: {err}</div>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-black/5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm text-slate-500">Session du jour</div>
            <div className="font-semibold">{sess.date} — <span className="text-slate-500">id:</span> {sess.id}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => loadEntries(sess.id)} className="rounded-lg bg-white px-3 py-1.5 hover:bg-gray-100 ring-1 ring-gray-200 text-sm">
              <span className="inline-flex items-center gap-2"><Icon name="refresh" /> Rafraîchir</span>
            </button>
          </div>
        </div>

        {/* Ajout par URL (fallback avant le scan QR) */}
        <form onSubmit={addByUrl} className="mt-3 grid gap-2 md:flex">
          <input
            type="url"
            required
            placeholder="Coller l’URL du QR (ex: https://itac.pro/F.aspx?... )"
            value={url}
            onChange={(e)=>setUrl(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={addingUrl}
            className="rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
            title="Ajouter une entrée via l’URL"
          >
            {addingUrl ? '…' : (<span className="inline-flex items-center gap-2"><Icon name="plus" /> Ajouter</span>)}
          </button>
        </form>
        {hint && <div className="mt-2 text-sm text-amber-800 bg-amber-50 p-2 rounded">{hint}</div>}
        {err && <div className="mt-2 text-sm text-red-800 bg-red-50 p-2 rounded">Erreur: {err}</div>}
      </div>

      <div className="rounded-2xl bg-white p-2 shadow ring-1 ring-black/5">
        <div className="px-2 py-2 font-semibold">Entrées du {sess.date}</div>
        {loadingEntries ? (
          <div className="px-2 py-6 text-slate-500">Chargement…</div>
        ) : entries.length === 0 ? (
          <div className="px-2 py-6 text-slate-500">Aucune entrée pour l’instant.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {entries.map((row) => <RowEntry key={row.id} row={row} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// --- MEMBRES (liste + recherche + clic ouvre page licence) ---
function MembersView() {
  const [q, setQ] = React.useState('')
  const [rows, setRows] = React.useState<Member[]>([])
  const [loading, setLoading] = React.useState(true)
  const [err, setErr] = React.useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        // récupère tout; si volumineux, on pourra paginer
        const { data, error } = await supabase
          .from('members')
          .select('licence_no, first_name, last_name, photo_url, source_url')
          .order('last_name', { ascending: true, nullsFirst: false })
          .order('first_name', { ascending: true, nullsFirst: false })
        if (error) throw error
        if (!alive) return
        setRows((data ?? []) as Member[])
        setErr(null)
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

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(m =>
      (m.first_name ?? '').toLowerCase().includes(s) ||
      (m.last_name ?? '').toLowerCase().includes(s) ||
      (m.licence_no ?? '').toLowerCase().includes(s)
    )
  }, [q, rows])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={e=>setQ(e.target.value)}
          placeholder="Rechercher nom, prénom ou N° licence…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </div>

      <div className="rounded-2xl bg-white p-2 shadow ring-1 ring-black/5">
        {loading ? (
          <div className="px-2 py-6 text-slate-500">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="px-2 py-6 text-slate-500">Aucun membre.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(m => (
              <div key={m.licence_no} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg">
                <Avatar member={m} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{[m.last_name, m.first_name].filter(Boolean).join(' ') || m.licence_no}</div>
                  <div className="text-xs text-slate-500">{m.licence_no}</div>
                </div>
                {m.source_url && (
                  <button
                    className="rounded-md bg-white px-2 py-1 text-sm ring-1 ring-slate-200 hover:bg-slate-50"
                    onClick={() => window.open(m.source_url!, '_blank')}
                    title="Ouvrir la page licence"
                  >
                    <Icon name="external" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {err && <div className="m-2 rounded bg-red-50 p-2 text-sm text-red-800">Erreur: {err}</div>}
      </div>
    </div>
  )
}

// --- APP (nav + vues) ---
export default function AppReal() {
  const [view, setView] = React.useState<'home'|'members'>('home')

  async function logout() {
    await supabase.auth.signOut()
    location.href = '/'
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-blue-100">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-5xl p-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-blue-600 text-white grid place-items-center font-bold">T</div>
            <div>
              <div className="text-sm text-slate-500">Club</div>
              <div className="font-semibold">Enregistrement par QR</div>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <button
              onClick={() => setView('home')}
              className={cls(
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 ring-1 text-sm",
                view === 'home' ? "bg-blue-600 text-white ring-blue-600" : "bg-white hover:bg-gray-100 ring-gray-200"
              )}
              title="Entrées du jour"
            >
              <Icon name="list" /> Entrées
            </button>
            <button
              onClick={() => setView('members')}
              className={cls(
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 ring-1 text-sm",
                view === 'members' ? "bg-blue-600 text-white ring-blue-600" : "bg-white hover:bg-gray-100 ring-gray-200"
              )}
              title="Membres"
            >
              <Icon name="user" /> Membres
            </button>
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 ring-1 ring-gray-200 hover:bg-gray-100 text-sm"
              title="Se déconnecter"
            >
              <Icon name="logout" /> Se déconnecter
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4">
        {view === 'home' ? <HomeView /> : <MembersView />}
      </main>
    </div>
  )
}
