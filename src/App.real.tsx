// src/App.tsx
import React from 'react'
import { supabase } from './data/supabase'
import { getTodaySession, openTodaySession, parisDateStr } from './lib/session'
import QrScanner from './components/QrScanner'
import { useWakeLock } from './hooks/useWakeLock'
import { useBeep } from './hooks/useBeep'
import { addToOutbox, outboxCount, onOutboxChange, startOutboxAutoFlush, flushOutbox } from './data/outbox'

// ------- Types -------
type SessionRow = { id: string; date: string }
type EntryRow = { id: string; session_id: string; licence_no: string; created_at?: string; source_url?: string | null }
type Member = { licence_no: string; first_name: string | null; last_name: string | null; photo_url: string | null; source_url?: string | null }
type ExportFormat = 'pdf' | 'xlsx' | 'csv'

// ------- Utils UI -------
function cls(...parts: (string | false | undefined | null)[]) { return parts.filter(Boolean).join(' ') }
function Icon({ name, className }: { name: 'user' | 'list' | 'logout' | 'refresh' | 'external' | 'plus' | 'download' | 'camera' | 'cloud-off'; className?: string }) {
  const path =
    name === 'user' ? "M12 12a5 5 0 100-10 5 5 0 000 10zm-9 9a9 9 0 1118 0H3z" :
    name === 'list' ? "M4 6h16M4 12h16M4 18h7" :
    name === 'logout' ? "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" :
    name === 'refresh' ? "M4 4v6h6M20 20v-6h-6M20 8a8 8 0 10-3.3 6.5" :
    name === 'external' ? "M10 6h8m0 0v8m0-8L9 15" :
    name === 'plus' ? "M12 4v16m8-8H4" :
    name === 'download' ? "M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" :
    name === 'cloud-off' ? "M3 15a4 4 0 014-4h1a7 7 0 1113 3M3 15a4 4 0 004 4h9" :
    /* camera */ "M3 7V5a2 2 0 012-2h2M21 7V5a2 2 0 00-2-2h-2M3 17v2a2 2 0 002 2h2M21 17v2a2 2 0 01-2 2h-2"
  return <svg viewBox="0 0 24 24" fill="none" className={cls("h-5 w-5 stroke-[2] stroke-current", className)}><path d={path} strokeLinecap="round" strokeLinejoin="round" /></svg>
}

// Reconstruit l’URL publique si `photo_url` est un chemin relatif du bucket
function resolvePhotoUrl(photoUrl?: string | null): string | null {
  if (!photoUrl) return null
  if (/^https?:\/\//i.test(photoUrl)) return photoUrl
  const base = (import.meta as any).env?.VITE_SUPABASE_URL || ''
  const root = String(base).replace(/\/$/, '')
  const path = String(photoUrl).replace(/^\/+/, '')
  return `${root}/storage/v1/object/public/${path}`
}
function Avatar({ member }: { member: Member }) {
  const [broken, setBroken] = React.useState(false)
  const label = `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() || member.licence_no
  const initial = (member.last_name?.[0] || member.first_name?.[0] || member.licence_no?.[0] || '?').toUpperCase()
  const src = !broken ? resolvePhotoUrl(member.photo_url || undefined) : null
  if (src) {
    return <img src={src} alt={label} onError={() => setBroken(true)} className="h-10 w-10 rounded-full object-cover ring-1 ring-black/5" />
  }
  return <div className="h-10 w-10 rounded-full bg-blue-600 text-white grid place-items-center font-semibold ring-1 ring-black/5">{initial}</div>
}

// ------- Export helpers -------
async function exportRows(format: ExportFormat, filename: string, rows: Array<{ last_name: string; first_name: string; licence_no: string; created_at: string }>) {
  try {
    const mod: any = await import('./lib/exporters')
    if (format === 'pdf')  return (mod.exportRowsToPdf || mod.exportEntriesToPdf || mod.exportToPdf)?.(filename, rows)
    if (format === 'xlsx') return (mod.exportRowsToXlsx || mod.exportEntriesToXlsx || mod.exportToXlsx)?.(filename, rows)
    if (format === 'csv')  return (mod.exportRowsToCsv || mod.exportEntriesToCsv || mod.exportToCsv)?.(filename, rows)
  } catch {}
  const header = 'Nom;Prénom;Licence;Horodatage'
  const body = rows.map(r => [(r.last_name||'').replace(/;/g, ','),(r.first_name||'').replace(/;/g,','),r.licence_no,new Date(r.created_at).toLocaleString('fr-FR')].join(';')).join('\n')
  const blob = new Blob([header+'\n'+body], { type:'text/csv;charset=utf-8' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download=`${filename}.csv`; a.click(); URL.revokeObjectURL(a.href)
}

// ===================== Home (Entrées) =====================
function HomeView({ kiosk, noScan }: { kiosk: boolean; noScan: boolean }) {
  const [sess, setSess] = React.useState<SessionRow | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const [entries, setEntries] = React.useState<(EntryRow & { member?: Member | null })[]>([])
  const [loadingEntries, setLoadingEntries] = React.useState(false)

  const [url, setUrl] = React.useState('')
  const [addingUrl, setAddingUrl] = React.useState(false)
  const [hint, setHint] = React.useState<string | null>(null)

  const [scannerOn, setScannerOn] = React.useState(kiosk && !noScan)

  const [isOnline, setIsOnline] = React.useState(navigator.onLine)
  const [pending, setPending] = React.useState(outboxCount())

  const { beepOk, beepWarn, beepError } = useBeep()

  // Écouteurs réseau + outbox
  React.useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const un = onOutboxChange(() => setPending(outboxCount()))
    const stop = startOutboxAutoFlush(supabase)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); un(); stop() }
  }, [])

  React.useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        let s = await getTodaySession()
        if (!s && kiosk) {
          try { s = await openTodaySession() } catch {}
        }
        if (!alive) return
        setSess(s ?? null)
        setErr(null)
        if (s) await loadEntries(s.id, alive)
      } catch (e: any) {
        if (!alive) return
        setErr(e?.message || String(e))
      }
    })()
    return () => { alive = false }
  }, [kiosk])

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
          .from('members').select('licence_no, first_name, last_name, photo_url, source_url')
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

  // appelée par le scanner OU le formulaire URL
  async function addByUrlInternal(inputUrl: string) {
    if (!sess) return
    // Offline → outbox
    if (!navigator.onLine) {
      addToOutbox(sess.id, inputUrl)
      setPending(outboxCount())
      setHint("Hors-ligne : l’entrée a été mise en attente et sera synchronisée automatiquement.")
      beepWarn()
      return
    }

    setAddingUrl(true); setHint(null)
    try {
      const res = await supabase.functions.invoke('itac_profile_store', { body: { url: inputUrl } })
      if (res.error) {
        const status = (res.error as any)?.context?.response?.status
        throw new Error(`Edge function ${status ?? ''}: ${res.error.message}`)
      }
      const payload = res.data as any
      if (!payload?.ok) throw new Error(payload?.error || 'Edge function non-OK')

      const ins = await supabase.from('entries').insert({
        session_id: sess.id,
        licence_no: payload.licence_no,
        source_url: payload.source_url ?? inputUrl
      }).select('id, session_id, licence_no, created_at, source_url').single()

      if (ins.error) {
        if ((ins.error as any).code === '23505') {
          setHint("Déjà enregistré aujourd’hui pour cette session.")
          beepWarn()
        } else {
          throw ins.error
        }
      } else {
        beepOk()
      }
      await loadEntries(sess.id)
    } catch (e: any) {
      // si erreur réseau, on bascule en outbox
      if (!navigator.onLine) {
        addToOutbox(sess.id, inputUrl)
        setPending(outboxCount())
        setHint("Hors-ligne : l’entrée a été mise en attente et sera synchronisée automatiquement.")
        beepWarn()
      } else {
        setErr(e?.message || String(e))
        beepError()
      }
    } finally {
      setAddingUrl(false)
    }
  }

  async function addByUrl(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    await addByUrlInternal(url.trim())
    setUrl('')
  }

  const onDetect = React.useCallback((text: string) => {
    if (!/^https?:\/\//i.test(text)) return
    addByUrlInternal(text).catch(()=>{})
  }, [sess])

  function RowEntry({ row }: { row: EntryRow & { member?: Member | null } }) {
    const m = row.member
    const label = [m?.last_name, m?.first_name].filter(Boolean).join(' ') || row.licence_no
    const sub = m ? row.licence_no : '—'
    const time = row.created_at ? new Date(row.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'
    const link = (m?.source_url || row.source_url || null)
    const memberForAvatar: Member = { licence_no: row.licence_no, first_name: m?.first_name ?? null, last_name: m?.last_name ?? null, photo_url: m?.photo_url ?? null, source_url: m?.source_url ?? undefined }
    return (
      <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
        <Avatar member={memberForAvatar} />
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{label}</div>
          <div className="text-xs text-slate-500">{time} • {sub}</div>
        </div>
        {link && (
          <button className="rounded-md bg-white px-2 py-1 text-sm ring-1 ring-slate-200 hover:bg-slate-50" onClick={() => window.open(link!, '_blank')} title="Ouvrir la page licence">
            <Icon name="external" />
          </button>
        )}
      </div>
    )
  }

  async function forceSync() {
    if (!sess) return
    await flushOutbox(supabase)
    await loadEntries(sess.id)
    setPending(outboxCount())
  }

  return (
    <div className="space-y-4">
      {/* Bandeau état réseau / outbox */}
      <div className="flex flex-wrap items-center gap-2">
        {!isOnline && (
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 text-amber-900 px-3 py-1 text-sm">
            <Icon name="cloud-off" /> Hors-ligne
          </div>
        )}
        {pending > 0 && (
          <button onClick={forceSync} className="inline-flex items-center gap-2 rounded-full bg-blue-100 text-blue-900 px-3 py-1 text-sm hover:bg-blue-200">
            {isOnline ? 'À synchroniser' : 'En attente'} • {pending}
          </button>
        )}
      </div>

      {!sess ? (
        <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-black/5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-sm text-slate-500">Nous sommes le</div>
              <div className="font-semibold">{parisDateStr()} (Europe/Paris)</div>
            </div>
            <button onClick={handleOpenSession} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-60">
              {busy ? '…' : (<><Icon name="plus" /> Ouvrir la session du jour</>)}
            </button>
          </div>
          {err && <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">Erreur: {err}</div>}
        </div>
      ) : (
        <>
          {/* Bloc Scan */}
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
                {!noScan && (
                  <button onClick={() => setScannerOn(s => !s)} className={cls("rounded-lg px-3 py-1.5 text-sm ring-1", scannerOn ? "bg-blue-600 text-white ring-blue-600" : "bg-white ring-gray-200 hover:bg-gray-100")}>
                    <span className="inline-flex items-center gap-2"><Icon name="camera" /> {scannerOn ? 'Scanner ON' : 'Scanner OFF'}</span>
                  </button>
                )}
              </div>
            </div>

            {(!noScan && scannerOn) && (
              <div className="mt-3">
                <QrScanner onDetect={onDetect} paused={!scannerOn} className="overflow-hidden rounded-xl ring-1 ring-black/5" />
                <div className="mt-2 text-xs text-slate-500">Appuie sur “Démarrer la caméra”. Torche et choix caméra disponibles pendant le scan.</div>
              </div>
            )}
            {noScan && (
              <div className="mt-2 text-sm text-blue-900 bg-blue-50 p-2 rounded">Mode sans scanner (?noscan=1). Utilise l’URL de secours ci-dessous.</div>
            )}

            {/* Ajout par URL (fallback) */}
            <form onSubmit={addByUrl} className="mt-3 grid gap-2 md:flex">
              <input type="url" required placeholder="Coller l’URL du QR (ex: https://itac.pro/F.aspx?... )" value={url} onChange={(e)=>setUrl(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              <button type="submit" disabled={addingUrl} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-60" title="Ajouter une entrée via l’URL">
                {addingUrl ? '…' : (<><Icon name="plus" /> Ajouter</>)}
              </button>
            </form>

            {hint && <div className="mt-2 text-sm text-amber-800 bg-amber-50 p-2 rounded">{hint}</div>}
            {err && <div className="mt-2 text-sm text-red-800 bg-red-50 p-2 rounded">Erreur: {err}</div>}
          </div>

          {/* Liste du jour */}
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

// ===================== Membres =====================
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
          .order('last_name', { ascending: true }).order('first_name', { ascending: true })
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
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher nom, prénom ou N° licence…" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
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
                  <button className="rounded-md bg-white px-2 py-1 text-sm ring-1 ring-slate-200 hover:bg-slate-50" onClick={() => window.open(m.source_url!, '_blank')} title="Ouvrir la page licence">
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

// ===================== Sessions & Exports =====================
function SessionsView() {
  const [sessions, setSessions] = React.useState<SessionRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [err, setErr] = React.useState<string | null>(null)
  const [fmt, setFmt] = React.useState<ExportFormat>('pdf')

  const [season, setSeason] = React.useState<string>(computeDefaultSeasonLabel())
  const [seasonFmt, setSeasonFmt] = React.useState<ExportFormat>('xlsx')
  const [busySeason, setBusySeason] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase.from('sessions').select('id, date').order('date', { ascending: false })
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
      const { data: ent, error: e1 } = await supabase.from('entries').select('licence_no, created_at').eq('session_id', session.id).order('created_at', { ascending: true })
      if (e1) throw e1
      const licences = Array.from(new Set((ent ?? []).map(x => x.licence_no))).filter(Boolean)
      let membersByLic: Record<string, Member> = {}
      if (licences.length) {
        const { data: mem, error: e2 } = await supabase.from('members').select('licence_no, first_name, last_name').in('licence_no', licences)
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
      const { data: ent, error: e1 } = await supabase.from('entries').select('licence_no, created_at').gte('created_at', start).lt('created_at', end).order('created_at', { ascending: true })
      if (e1) throw e1
      const licences = Array.from(new Set((ent ?? []).map(x => x.licence_no))).filter(Boolean)
      let membersByLic: Record<string, Member> = {}
      if (licences.length) {
        const { data: mem, error: e2 } = await supabase.from('members').select('licence_no, first_name, last_name').in('licence_no', licences)
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
            <button onClick={exportSeason} disabled={busySeason} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-60 w-full md:w-auto">
              {busySeason ? '…' : (<><Icon name="download" /> Exporter la saison</>)}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">Colonnes : Nom, Prénom, Licence, Date & heure d’enregistrement.</p>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-black/5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">Toutes les sessions</h3>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Format</label>
            <select className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" disabled>
              <option>Choix dans l’export</option>
            </select>
          </div>
        </div>
        <SessionsTable onExport={exportOne} />
        {err && <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">Erreur: {err}</div>}
      </div>
    </div>
  )
}

function SessionsTable({ onExport }: { onExport: (s: { id: string; date: string }) => void }) {
  const [sessions, setSessions] = React.useState<SessionRow[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        const { data } = await supabase.from('sessions').select('id, date').order('date', { ascending: false })
        if (!alive) return
        setSessions((data ?? []) as SessionRow[])
      } finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [])

  if (loading) return <div className="py-6 text-slate-500">Chargement…</div>
  if (!sessions.length) return <div className="py-6 text-slate-500">Aucune session.</div>

  return (
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
                <button onClick={() => onExport(s)} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200 hover:bg-gray-50" title="Exporter cette session">
                  <Icon name="download" /> Exporter
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ===================== App (kiosque + nav + hash-routing) =====================
export default function App() {
  const params = new URLSearchParams(location.search)
  const kiosk = params.get('kiosk') === '1'
  const noScan = params.get('noscan') === '1'

  // Hash routing pour fiabiliser le switch des vues
  const initialView = ((): 'home'|'members'|'sessions' => {
    const v = location.hash.replace('#','')
    return (v === 'members' || v === 'sessions' || v === 'home') ? v : 'home'
  })()
  const [view, setView] = React.useState<'home'|'members'|'sessions'>(initialView)
  React.useEffect(() => {
    const onHash = () => {
      const v = location.hash.replace('#','')
      if (v === 'members' || v === 'sessions' || v === 'home') setView(v)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  function navTo(v: 'home'|'members'|'sessions') {
    if (location.hash !== `#${v}`) location.hash = v
    setView(v)
  }

  // Wake lock + plein écran en kiosque
  useWakeLock(kiosk)
  React.useEffect(() => {
    if (!kiosk) return
    const goFS = async () => {
      try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen() } catch {}
      // @ts-ignore
      try { await (screen as any)?.orientation?.lock?.('portrait-primary') } catch {}
    }
    goFS()
  }, [kiosk])

  async function logout() {
    await supabase.auth.signOut()
    location.href = '/'
  }

  // Sortie kiosque (appui long sur le logo)
  const pressTimer = React.useRef<number | null>(null)
  const [exitHint, setExitHint] = React.useState(false)
  function startPress() {
    if (!kiosk) return
    pressTimer.current = window.setTimeout(() => setExitHint(true), 1800)
  }
  function endPress() {
    if (!kiosk) return
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null }
  }
  function exitKiosk() {
    const u = new URL(location.href); u.searchParams.delete('kiosk'); location.href = u.toString()
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-blue-100">
      <header className={cls("sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200")}>
        <div className="mx-auto max-w-5xl p-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 select-none" onMouseDown={startPress} onMouseUp={endPress} onTouchStart={startPress} onTouchEnd={endPress}>
            <div className="h-8 w-8 rounded-xl bg-blue-600 text-white grid place-items-center font-bold">T</div>
            <div>
              <div className="text-sm text-slate-500">Club</div>
              <div className="font-semibold">Enregistrement par QR</div>
            </div>
          </div>
          {!kiosk && (
            <nav className="flex items-center gap-2">
              <button onClick={() => navTo('home')} className={cls("inline-flex items-center gap-2 rounded-lg px-3 py-1.5 ring-1 text-sm", view === 'home' ? "bg-blue-600 text-white ring-blue-600" : "bg-white hover:bg-gray-100 ring-gray-200")} title="Entrées du jour">
                <Icon name="list" /> Entrées
              </button>
              <button onClick={() => navTo('members')} className={cls("inline-flex items-center gap-2 rounded-lg px-3 py-1.5 ring-1 text-sm", view === 'members' ? "bg-blue-600 text-white ring-blue-600" : "bg-white hover:bg-gray-100 ring-gray-200")} title="Membres">
                <Icon name="user" /> Membres
              </button>
              <button onClick={() => navTo('sessions')} className={cls("inline-flex items-center gap-2 rounded-lg px-3 py-1.5 ring-1 text-sm", view === 'sessions' ? "bg-blue-600 text-white ring-blue-600" : "bg-white hover:bg-gray-100 ring-gray-200")} title="Sessions & exports">
                <Icon name="download" /> Sessions
              </button>
              <button onClick={logout} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 ring-1 ring-gray-200 hover:bg-gray-100 text-sm" title="Se déconnecter">
                <Icon name="logout" /> Se déconnecter
              </button>
            </nav>
          )}
        </div>
      </header>

      {kiosk && exitHint && (
        <div className="fixed inset-0 z-20 bg-black/50 grid place-items-center p-4">
          <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-black/10 max-w-sm w-full space-y-3">
            <div className="font-semibold">Mode kiosque</div>
            <p className="text-sm text-slate-600">Appuie sur “Quitter le kiosque” pour revenir au mode normal.</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={()=>setExitHint(false)} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200 hover:bg-gray-50">Rester</button>
              <button onClick={exitKiosk} className="rounded-lg bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-700">Quitter le kiosque</button>
            </div>
          </div>
        </div>
      )}

      <main className={cls("mx-auto max-w-5xl p-4", kiosk && "max-w-3xl")}>
        {view === 'home'     && <HomeView kiosk={kiosk} noScan={noScan} />}
        {(!kiosk && view === 'members')  && <MembersView />}
        {(!kiosk && view === 'sessions') && <SessionsView />}
      </main>
    </div>
  )
}

// ------- Saisons utils -------
function computeDefaultSeasonLabel(): string {
  const now = new Date()
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  return `${y}-${y+1}`
}
function buildSeasonOptions(): string[] {
  const current = parseInt(computeDefaultSeasonLabel().slice(0,4), 10)
  const years: number[] = []
  for (let y=current+1; y>=current-2; y--) years.push(y-1)
  const labels = new Set<string>()
  years.forEach(y => labels.add(`${y}-${y+1}`))
  return Array.from(labels).sort().reverse()
}
function computeSeasonRange(label: string): { start: string; end: string } {
  const [a] = label.split('-').map(x=>parseInt(x,10))
  const start = new Date(Date.UTC(a, 8, 1, 0,0,0))
  const end   = new Date(Date.UTC(a+1, 8, 1, 0,0,0))
  return { start: start.toISOString(), end: end.toISOString() }
}
