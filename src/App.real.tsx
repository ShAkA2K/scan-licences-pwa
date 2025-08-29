// src/App.real.tsx
import React from 'react'
import { supabase } from './data/supabase'
import { getTodaySession, openTodaySession, parisDateStr } from './lib/session'

// -----------------------
// Types
// -----------------------
type SessionRow = { id: string; date: string }
type EntryRow = { id: string; session_id: string; licence_no: string; created_at?: string; source_url?: string | null }
type Member = { licence_no: string; first_name: string | null; last_name: string | null; photo_url: string | null; source_url?: string | null }
type ExportFormat = 'pdf' | 'xlsx' | 'csv'

// -----------------------
// Utils UI
// -----------------------
function cls(...parts: (string | false | undefined | null)[]) { return parts.filter(Boolean).join(' ') }

function Icon({ name, className }: { name: 'user' | 'list' | 'logout' | 'refresh' | 'external' | 'plus' | 'scan' | 'download'; className?: string }) {
  const path =
    name === 'user' ? "M12 12a5 5 0 100-10 5 5 0 000 10zm-9 9a9 9 0 1118 0H3z" :
    name === 'list' ? "M4 6h16M4 12h16M4 18h7" :
    name === 'logout' ? "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" :
    name === 'refresh' ? "M4 4v6h6M20 20v-6h-6M20 8a8 8 0 10-3.3 6.5" :
    name === 'external' ? "M10 6h8m0 0v8m0-8L9 15" :
    name === 'plus' ? "M12 4v16m8-8H4" :
    name === 'download' ? "M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" :
    /* scan */       "M3 7V5a2 2 0 012-2h2M21 7V5a2 2 0 00-2-2h-2M3 17v2a2 2 0 002 2h2M21 17v2a2 2 0 01-2 2h-2"
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cls("h-5 w-5 stroke-[2] stroke-current", className)}>
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
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

// -----------------------
// Export helper (tolérant)
// -----------------------
async function exportRows(format: ExportFormat, filename: string, rows: Array<{ last_name: string; first_name: string; licence_no: string; created_at: string }>) {
  try {
    const mod: any = await import('./lib/exporters')
    // Essaye signatures fréquentes
    if (format === 'pdf') {
      if (typeof mod.exportRowsToPdf === 'function') return mod.exportRowsToPdf(filename, rows)
      if (typeof mod.exportEntriesToPdf === 'function') return mod.exportEntriesToPdf(filename, rows)
      if (typeof mod.exportToPdf === 'function') return mod.exportToPdf(filename, rows)
    }
    if (format === 'xlsx') {
      if (typeof mod.exportRowsToXlsx === 'function') return mod.exportRowsToXlsx(filename, rows)
      if (typeof mod.exportEntriesToXlsx === 'function') return mod.exportEntriesToXlsx(filename, rows)
      if (typeof mod.exportToXlsx === 'function') return mod.exportToXlsx(filename, rows)
    }
    if (format === 'csv') {
      if (typeof mod.exportRowsToCsv === 'function') return mod.exportRowsToCsv(filename, rows)
      if (typeof mod.exportEntriesToCsv === 'function') return mod.exportEntriesToCsv(filename, rows)
      if (typeof mod.exportToCsv === 'function') return mod.exportToCsv(filename, rows)
    }
  } catch {
    // pas de lib exporters → on tombe sur CSV simple
  }
  // Fallback CSV simple
  const header = 'Nom;Prénom;Licence;Horodatage'
  const body = rows.map(r => [
    (r.last_name || '').replace(/;/g, ','),
    (r.first_name || '').replace(/;/g, ','),
    r.licence_no,
    new Date(r.created_at).toLocaleString('fr-FR')
  ].join(';')).join('\n')
  const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

// -----------------------
// Vues
// -----------------------
function HomeView() {
  const [loading, setLoading] = React.useState(true)
  const [sess, setSess] = React.useState<SessionRow | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Entrées du jour
  const [entries, setEntries] = React.useState<(EntryRow & { member?: Member | null })[]>([])
  const [loadingEntries, setLoadingEntries] = React.useState(false)

  // Ajout via URL (fallback avant le scan)
  const [url, setUrl] = React.useState('')
  const [addingUrl, setAddingUrl] = React.useState(false)
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
      const sel = supabase.from('entries')
        .select('id, session_id, licence_no, created_at, source_url')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
      const { data: ent, error: e1 } = await sel
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
      const res = await supabase.functions.invoke('itac_profile_store', { body: { url } })
      if (res.error) {
        const status = (res.error as any)?.context?.response?.status
        throw new Error(`Edge function ${status ?? ''}: ${res.error.message}`)
      }
      const payload = res.data as any
      if (!payload?.ok) throw new Error(payload?.error || 'Edge function non-OK')

      const ins = await supabase.from('entries').insert({
        session_id: sess.id,
        licence_no: payload.licence_no,
        source_url: payload.source_url ?? url
      }).select('id, session_id, licence_no, created_at, source_url').single()

      if (ins.error) {
        // doublon journalier (23505) => on affiche juste l’info
        if ((ins.error as any).code === '23505') {
          setHint("Déjà enregistré aujourd’hui pour cette session.")
        } else {
          throw ins.error
        }
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
    const label = [m?.last_name, m?.first_name].filter(Boolean).join(' ') || row.licence_no
    const sub = m ? row.licence_no : '—'
    const time = row.created_at ? new Date(row.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'
    const link = (m?.source_url || row.source_url || null)
    return (
      <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
        <Avatar member={{ licence_no: row.licence_no, first_name: m?.first_name ?? null, last_name: m?.last_name ?? null, photo_url: m?.photo_url ?? null, source_url: m?.source_url ?? undefined }} />
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{label}</div>
          <div className="text-xs text-slate-500">{time} • {sub}</div>
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

  // Rendu
  return (
    <div className="space-y-4">
      {!sess ? (
        <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-black/5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-sm text-slate-500">Nous sommes le</div>
              <div className="font-semibold">{parisDateStr()} (Europe/Paris)</div>
            </div>
            <button
              onClick={handleOpenSession}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? '…' : (<><Icon name="plus" /> Ouvrir la session du jour</>)}
            </button>
          </div>
          {err && <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">Erreur: {err}</div>}
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-black/5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
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

            {/* Ajout par URL */}
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
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
                title="Ajouter une entrée via l’URL"
              >
                {addingUrl ? '…' : (<><Icon name="plus" /> Ajouter</>)}
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
        </>
      )}
    </div>
  )
}

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

function SessionsView() {
  const [sessions, setSessions] = React.useState<SessionRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [err, setErr] = React.useState<string | null>(null)

  // format global pour les exports de session
  const [fmt, setFmt] = React.useState<ExportFormat>('pdf')

  // Export saison
  const [season, setSeason] = React.useState<string>(computeDefaultSeasonLabel())
  const [seasonFmt, setSeasonFmt] = React.useState<ExportFormat>('xlsx')
  const [busySeason, setBusySeason] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('sessions')
          .select('id, date')
          .order('date', { ascending: false })
        if (error) throw error
        if (!alive) return
        setSessions((data ?? []) as SessionRow[])
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

  async function exportOne(session: SessionRow) {
    try {
      // entries de la session
      const { data: ent, error: e1 } = await supabase
        .from('entries')
        .select('licence_no, created_at')
        .eq('session_id', session.id)
        .order('created_at', { ascending: true })
      if (e1) throw e1
      const licences = Array.from(new Set((ent ?? []).map(x => x.licence_no))).filter(Boolean)

      let membersByLic: Record<string, Member> = {}
      if (licences.length) {
        const { data: mem, error: e2 } = await supabase
          .from('members')
          .select('licence_no, first_name, last_name')
          .in('licence_no', licences)
        if (e2) throw e2
        membersByLic = Object.fromEntries((mem ?? []).map(m => [m.licence_no, m as Member]))
      }

      const rows = (ent ?? []).map(e => ({
        last_name: membersByLic[e.licence_no]?.last_name ?? '',
        first_name: membersByLic[e.licence_no]?.first_name ?? '',
        licence_no: e.licence_no,
        created_at: e.created_at || new Date().toISOString()
      }))
      await exportRows(fmt, `session-${session.date}`, rows)
    } catch (e: any) {
      alert(`Export session: ${e?.message || e}`)
    }
  }

  async function exportSeason() {
    try {
      setBusySeason(true)
      const { start, end } = computeSeasonRange(season)
      // entries entre start/end
      const { data: ent, error: e1 } = await supabase
        .from('entries')
        .select('licence_no, created_at')
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: true })
      if (e1) throw e1
      const licences = Array.from(new Set((ent ?? []).map(x => x.licence_no))).filter(Boolean)
      let membersByLic: Record<string, Member> = {}
      if (licences.length) {
        const { data: mem, error: e2 } = await supabase
          .from('members')
          .select('licence_no, first_name, last_name')
          .in('licence_no', licences)
        if (e2) throw e2
        membersByLic = Object.fromEntries((mem ?? []).map(m => [m.licence_no, m as Member]))
      }
      const rows = (ent ?? []).map(e => ({
        last_name: membersByLic[e.licence_no]?.last_name ?? '',
        first_name: membersByLic[e.licence_no]?.first_name ?? '',
        licence_no: e.licence_no,
        created_at: e.created_at || new Date().toISOString()
      }))
      await exportRows(seasonFmt, `saison-${season}`, rows)
    } catch (e: any) {
      alert(`Export saison: ${e?.message || e}`)
    } finally {
      setBusySeason(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Bloc Export Saison */}
      <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-black/5">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-sm text-slate-600">Saison</label>
            <select value={season} onChange={e=>setSeason(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              {buildSeasonOptions().map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-600">Format</label>
            <select value={seasonFmt} onChange={e=>setSeasonFmt(e.target.value as ExportFormat)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="pdf">PDF</option>
              <option value="xlsx">XLSX</option>
              <option value="csv">CSV</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={exportSeason}
              disabled={busySeason}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-60 w-full md:w-auto"
            >
              {busySeason ? '…' : (<><Icon name="download" /> Exporter la saison</>)}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">Colonnes : Nom, Prénom, Licence, Date & heure d’enregistrement.</p>
      </div>

      {/* Liste des sessions avec export par ligne */}
      <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-black/5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">Toutes les sessions</h3>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Format</label>
            <select value={fmt} onChange={e=>setFmt(e.target.value as ExportFormat)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
              <option value="pdf">PDF</option>
              <option value="xlsx">XLSX</option>
              <option value="csv">CSV</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-6 text-slate-500">Chargement…</div>
        ) : sessions.length === 0 ? (
          <div className="py-6 text-slate-500">Aucune session.</div>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">ID</th>
                  <th className="px-2 py-2 text-right">Export</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-2 py-2 whitespace-nowrap">{s.date}</td>
                    <td className="px-2 py-2">{s.id}</td>
                    <td className="px-2 py-2 text-right">
                      <button
                        onClick={() => exportOne(s)}
                        className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200 hover:bg-gray-50"
                        title="Exporter cette session"
                      >
                        <Icon name="download" /> Exporter
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {err && <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">Erreur: {err}</div>}
      </div>
    </div>
  )
}

// -----------------------
// App globale + Nav
// -----------------------
export default function AppReal() {
  const [view, setView] = React.useState<'home'|'members'|'sessions'>('home')

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
              onClick={() => setView('sessions')}
              className={cls(
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 ring-1 text-sm",
                view === 'sessions' ? "bg-blue-600 text-white ring-blue-600" : "bg-white hover:bg-gray-100 ring-gray-200"
              )}
              title="Sessions & exports"
            >
              <Icon name="download" /> Sessions
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
        {view === 'home' ? <HomeView /> : view === 'members' ? <MembersView /> : <SessionsView />}
      </main>
    </div>
  )
}

// -----------------------
// Saisons (utilitaires)
// -----------------------
function computeDefaultSeasonLabel(): string {
  // Saison sportive FR: 1er septembre -> 31 août (N -> N+1)
  const now = new Date()
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  return `${y}-${y+1}`
}
function buildSeasonOptions(): string[] {
  const current = parseInt(computeDefaultSeasonLabel().slice(0,4), 10)
  const years: number[] = []
  for (let y=current+1; y>=current-2; y--) years.push(y-1) // propose quelques saisons autour
  const labels = new Set<string>()
  years.forEach(y => labels.add(`${y}-${y+1}`))
  return Array.from(labels).sort().reverse()
}
function computeSeasonRange(label: string): { start: string; end: string } {
  // Saison N-N+1 : [N-09-01 00:00:00, (N+1)-09-01 00:00:00[
  const [a,b] = label.split('-').map(x=>parseInt(x,10))
  const start = new Date(Date.UTC(a, 8, 1, 0,0,0))  // 1 sept a
  const end   = new Date(Date.UTC(a+1, 8, 1, 0,0,0))// 1 sept a+1
  return { start: start.toISOString(), end: end.toISOString() }
}
