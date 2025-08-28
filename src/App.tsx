import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, FileDown, Users, Download, Calendar, ChevronRight, Shield, LineChart } from 'lucide-react'
import { supabase } from './data/supabase'
import AuthBar from './components/AuthBar'
import KioskBar from './components/KioskBar'
import QrScanBox from './components/QrScanBox'
import TodayEntries from './components/TodayEntries'
import MembersDialog from './components/MembersDialog'
import MembersAdminDialog from './components/MembersAdminDialog'
import StatsPanel from './components/StatsPanel'
import AccessGuard from './components/AccessGuard'
import { exportCSV, exportPDF, exportXLS } from './lib/exporters'
import { isAdmin } from './lib/admin'

function todayInParisISODate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function formatParisDate(d: string|Date) {
  const dt = typeof d === 'string' ? new Date(d + 'T00:00:00') : d
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(dt)
}
function seasonRange(label: string) {
  const m = label.match(/^(\d{4})\s*-\s*(\d{4})$/)
  if (!m) throw new Error('Saison invalide')
  const y1 = Number(m[1]); const y2 = Number(m[2])
  const start = new Date(Date.UTC(y1, 8, 1, 0, 0, 0))
  const end   = new Date(Date.UTC(y2, 7, 31, 23, 59, 59))
  return { start: start.toISOString(), end: end.toISOString() }
}
function defaultSeasonLabel() {
  const now = new Date(), y = now.getUTCFullYear(), m = now.getUTCMonth()
  return (m < 8) ? `${y-1}-${y}` : `${y}-${y+1}`
}
type SessionRow = { id: string; date: string }
type ExportFormat = 'csv'|'xlsx'|'pdf'

async function exportSession(sessionId: string, fmt: ExportFormat) {
  const { data: entries, error: e1 } = await supabase.from('entries').select('licence_no, timestamp, source_url').eq('session_id', sessionId).order('timestamp', { ascending: true })
  if (e1) throw e1
  const licences = Array.from(new Set((entries ?? []).map(e => e.licence_no))).filter(Boolean)
  const members = new Map<string, { last_name: string|null; first_name: string|null }>()
  if (licences.length) {
    const { data: M, error: e2 } = await supabase.from('members').select('licence_no, last_name, first_name').in('licence_no', licences)
    if (e2) throw e2
    for (const m of (M ?? []) as any[]) members.set(m.licence_no, { last_name: m.last_name, first_name: m.first_name })
  }
  const rows = (entries ?? []).map(e => ({
    last_name:  members.get(e.licence_no)?.last_name  ?? '',
    first_name: members.get(e.licence_no)?.first_name ?? '',
    licence_no: e.licence_no,
    datetime:   new Date(e.timestamp).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
  }))
  const filename = `session-${sessionId}`
  if (fmt === 'csv') return exportCSV(rows, `${filename}.csv`)
  if (fmt === 'xlsx') return exportXLS(rows, filename)
  return exportPDF(rows, filename)
}
async function exportSeason(seasonLabel: string, fmt: ExportFormat) {
  const { start, end } = seasonRange(seasonLabel)
  const { data: entries, error: e1 } = await supabase.from('entries').select('licence_no, timestamp').gte('timestamp', start).lte('timestamp', end).order('timestamp', { ascending: true })
  if (e1) throw e1
  const licences = Array.from(new Set((entries ?? []).map(e => e.licence_no))).filter(Boolean)
  const members = new Map<string, { last_name: string|null; first_name: string|null }>()
  if (licences.length) {
    const { data: M, error: e2 } = await supabase.from('members').select('licence_no, last_name, first_name').in('licence_no', licences)
    if (e2) throw e2
    for (const m of (M ?? []) as any[]) members.set(m.licence_no, { last_name: m.last_name, first_name: m.first_name })
  }
  const rows = (entries ?? []).map(e => ({
    last_name:  members.get(e.licence_no)?.last_name  ?? '',
    first_name: members.get(e.licence_no)?.first_name ?? '',
    licence_no: e.licence_no,
    datetime:   new Date(e.timestamp).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
  }))
  const filename = `saison-${seasonLabel.replace(/\s+/g,'')}`
  if (fmt === 'csv') return exportCSV(rows, `${filename}.csv`)
  if (fmt === 'xlsx') return exportXLS(rows, filename)
  return exportPDF(rows, filename)
}

export default function App() {
  const CLUB = import.meta.env.VITE_CLUB_NAME ?? 'Scan Licences'
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [isAdm, setIsAdm] = useState(false)

  const [membersOpen, setMembersOpen] = useState(false)
  const [membersAdminOpen, setMembersAdminOpen] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [continuous, setContinuous] = useState(true)

  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [errSessions, setErrSessions] = useState<string | null>(null)

  const seasons = useMemo(() => {
    const now = new Date(), y = now.getUTCFullYear()
    return [`${y-1}-${y}`, `${y}-${y+1}`, `${y+1}-${y+2}`].reverse().sort().reverse()
  }, [])
  const [selSeason, setSelSeason] = useState<string>(defaultSeasonLabel())
  const [selFmt, setSelFmt] = useState<ExportFormat>('csv')

  useEffect(() => { isAdmin().then(setIsAdm).catch(()=>setIsAdm(false)) }, [])

  async function loadSessions() {
    setLoadingSessions(true); setErrSessions(null)
    try {
      const { data, error } = await supabase.from('sessions').select('id, date').order('date', { ascending: false }).limit(60)
      if (error) throw error
      setSessions((data ?? []) as SessionRow[])
    } catch (e: any) {
      setErrSessions(e?.message || String(e))
    } finally {
      setLoadingSessions(false)
    }
  }
  useEffect(() => { loadSessions() }, [])

  async function openSessionDuJour() {
    setBusy(true); setMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setMsg('Veuillez vous connecter avant d’ouvrir la session.'); return }
      const date = todayInParisISODate()
      const { data, error } = await supabase.from('sessions').upsert({ date }, { onConflict: 'date' }).select('id').single()
      if (error) throw error
      setSessionId(data!.id); setMsg('Session ouverte ✅'); await loadSessions()
    } catch (e: any) {
      setMsg('Erreur ouverture session: ' + (e?.message || String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AccessGuard>
      <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-700">
        {/* Header */}
        <header className="bg-blue-700/60 backdrop-blur sticky top-0 z-30 border-b border-white/10">
          <div className="mx-auto max-w-[720px] px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-white text-lg font-semibold truncate">{CLUB}</h1>
              <p className="text-white/80 text-xs">Enregistrement des tireurs par QR</p>
            </div>
            <div className="shrink-0"><AuthBar /></div>
          </div>

          {/* Actions */}
          <div className="mx-auto max-w-[720px] -mt-2 px-3 sm:px-6 pb-3">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button onClick={openSessionDuJour} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-white hover:bg-white/20 disabled:opacity-50">
                <CalendarPlus className="h-4 w-4" /> Ouvrir la session du jour
              </button>

              {/* Export saison */}
              <div className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-2 py-2 text-white">
                <Calendar className="h-4 w-4" />
                <select className="rounded-lg bg-transparent px-2 py-1 text-white outline-none" value={selSeason} onChange={e => setSelSeason(e.target.value)} title="Saison">
                  {seasons.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="rounded-lg bg-transparent px-2 py-1 text-white outline-none" value={selFmt} onChange={e => setSelFmt(e.target.value as ExportFormat)} title="Format">
                  <option value="csv">CSV</option><option value="xlsx">XLS</option><option value="pdf">PDF</option>
                </select>
                <button onClick={()=>exportSeason(selSeason, selFmt)} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 hover:bg-white/20" title="Exporter la saison">
                  <FileDown className="h-4 w-4" /> Export
                </button>
              </div>

              <button onClick={() => setMembersOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-white hover:bg-white/20" title="Voir les membres">
                <Users className="h-4 w-4" /> Membres
              </button>

              {isAdm && (
                <>
                  <button onClick={() => setMembersAdminOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-white hover:bg-white/20" title="Administration membres">
                    <Shield className="h-4 w-4" /> Admin Membres
                  </button>
                  <button onClick={() => setShowStats(v=>!v)} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-white hover:bg-white/20" title="Stats">
                    <LineChart className="h-4 w-4" /> Stats
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Contenu */}
        <main className="mx-auto max-w-[720px] px-3 sm:px-6 py-6 space-y-8">
          {/* Info session */}
          <section className="rounded-2xl border border-white/20 bg-white/10 p-4 text-white">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Enregistrement – Session du jour</h2>
                {sessionId ? <p className="text-sm text-white/80">Session: {sessionId}</p> : <p className="text-sm text-white/80">Aucune session en cours</p>}
              </div>
              {msg && <div className="text-sm">{msg}</div>}
            </div>
            <div className="mt-3">
              <KioskBar continuous={continuous} onToggleContinuous={() => setContinuous(v=>!v)} />
            </div>
          </section>

          {/* Scanner */}
          {sessionId ? (
            <section className="rounded-2xl bg-white p-4 shadow ring-1 ring-black/5">
              <QrScanBox sessionId={sessionId} continuous={continuous} />
            </section>
          ) : (
            <section className="rounded-2xl bg-white/10 p-4 text-white ring-1 ring-white/20">
              <p>Ouvre d’abord la session du jour pour activer le scanner.</p>
            </section>
          )}

          {/* Entrées du jour */}
          <section className="rounded-2xl bg-white p-4 shadow ring-1 ring-black/5">
            <TodayEntries sessionId={sessionId ?? '—'} />
          </section>

          {/* Sessions (liste + export par ligne) */}
          <section className="space-y-3">
            <h3 className="text-white/95 font-semibold">Toutes les sessions</h3>
            <div className="grid sm:hidden grid-cols-1 gap-3">
              {loadingSessions && <div className="rounded-xl border bg-white px-3 py-4">Chargement…</div>}
              {!loadingSessions && errSessions && <div className="rounded-xl border bg-white px-3 py-4 text-red-600">Erreur: {errSessions}</div>}
              {!loadingSessions && !errSessions && sessions.length === 0 && <div className="rounded-xl border bg-white px-3 py-4">Aucune session.</div>}
              {sessions.map(s => (
                <div key={s.id} className="rounded-xl border bg-white p-3 flex items-center gap-3">
                  <div className="min-w-0"><div className="font-medium text-gray-900">Session du {formatParisDate(s.date)}</div><div className="text-xs text-gray-500 break-all">{s.id}</div></div>
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => exportSession(s.id, selFmt)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50" title="Exporter la session"><Download className="h-4 w-4" /> Export</button>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-hidden rounded-xl border bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-blue-50 text-blue-900">
                    <tr><th className="px-3 py-2 text-left font-medium">Date</th><th className="px-3 py-2 text-left font-medium">Session ID</th><th className="px-3 py-2 text-right font-medium">Export</th></tr>
                  </thead>
                  <tbody>
                    {loadingSessions && <tr><td className="px-3 py-4" colSpan={3}>Chargement…</td></tr>}
                    {!loadingSessions && errSessions && <tr><td className="px-3 py-4 text-red-600" colSpan={3}>Erreur: {errSessions}</td></tr>}
                    {!loadingSessions && !errSessions && sessions.length === 0 && <tr><td className="px-3 py-4" colSpan={3}>Aucune session.</td></tr>}
                    {sessions.map(s => (
                      <tr key={s.id} className="border-t">
                        <td className="px-3 py-2">{formatParisDate(s.date)}</td>
                        <td className="px-3 py-2 font-mono">{s.id}</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => exportSession(s.id, selFmt)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 hover:bg-gray-50" title="Exporter la session">
                            <FileDown className="h-4 w-4" /> Export ({selFmt.toUpperCase()})
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Stats (admin) */}
          {isAdm && showStats && <StatsPanel />}
        </main>

        {/* Modales */}
        <MembersDialog open={membersOpen} onClose={() => setMembersOpen(false)} />
        <MembersAdminDialog open={membersAdminOpen} onClose={() => setMembersAdminOpen(false)} />
      </div>
    </AccessGuard>
  )
}
