import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../data/supabase'
import { exportCSV, exportPDF, exportXLS, ExportRow } from '../lib/exporters'
import { formatParisDateTime, seasonLabelFromDate, seasonRange } from '../lib/season'
import { Download, FileSpreadsheet, FileText, X, CalendarDays } from 'lucide-react'

type SessionRow = { id: string; date: string }
type Member = { licence_no: string; last_name: string | null; first_name: string | null }
type EntryRow = { licence_no: string; recorded_at: string }
type Format = 'csv' | 'xls' | 'pdf'

const CLUB = (import.meta.env.VITE_CLUB_NAME || 'TirClub').replace(/\s+/g,'_')

export default function SessionsTable() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Export session
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [format, setFormat] = useState<Format>('csv')
  const [busy, setBusy] = useState(false)
  const [previewRows, setPreviewRows] = useState<ExportRow[] | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Export saison
  const seasons = useMemo(() => {
    const labels = new Set<string>()
    for (const s of sessions) labels.add(seasonLabelFromDate(new Date(s.date + 'T00:00:00Z')))
    return Array.from(labels).sort().reverse()
  }, [sessions])
  const [season, setSeason] = useState<string | null>(null)
  const [seasonFormat, setSeasonFormat] = useState<Format>('csv')
  const [seasonBusy, setSeasonBusy] = useState(false)
  const [seasonPreviewRows, setSeasonPreviewRows] = useState<ExportRow[] | null>(null)
  const [seasonPreviewLoading, setSeasonPreviewLoading] = useState(false)

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null)
      const { data, error } = await supabase
        .from('sessions')
        .select('id,date')
        .order('date', { ascending: false })
      if (error) setErr(error.message)
      else setSessions((data || []) as SessionRow[])
      setLoading(false)
    })()
  }, [])

  async function fetchRowsForSession(sessionId: string): Promise<ExportRow[]> {
    const { data: entries, error: e1 } = await supabase
      .from('entries')
      .select('licence_no, recorded_at:timestamp')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true })
    if (e1) throw e1
    const E = (entries || []) as EntryRow[]
    if (E.length === 0) return []

    const licences = Array.from(new Set(E.map(x => x.licence_no))).filter(Boolean)
    const { data: members, error: e2 } = await supabase
      .from('members')
      .select('licence_no, last_name, first_name')
      .in('licence_no', licences)
    if (e2) throw e2
    const map = new Map<string, Member>()
    for (const m of (members || []) as Member[]) map.set(m.licence_no, m)

    return E.map(e => {
      const m = map.get(e.licence_no)
      return {
        last_name:  m?.last_name  || '',
        first_name: m?.first_name || '',
        licence_no: e.licence_no,
        recorded_at: formatParisDateTime(e.recorded_at),
      }
    })
  }

  async function fetchRowsForSeason(label: string): Promise<ExportRow[]> {
    const { start, end } = seasonRange(label)
    const { data: entries, error: e1 } = await supabase
      .from('entries')
      .select('licence_no, recorded_at:timestamp, entry_day')
      .gte('entry_day', start)
      .lte('entry_day', end)
      .order('timestamp', { ascending: true })
    if (e1) throw e1
    const E = (entries || []) as (EntryRow & { entry_day: string })[]
    if (E.length === 0) return []

    const licences = Array.from(new Set(E.map(x => x.licence_no))).filter(Boolean)
    const { data: members, error: e2 } = await supabase
      .from('members')
      .select('licence_no, last_name, first_name')
      .in('licence_no', licences)
    if (e2) throw e2
    const map = new Map<string, Member>()
    for (const m of (members || []) as Member[]) map.set(m.licence_no, m)

    return E.map(e => {
      const m = map.get(e.licence_no)
      return {
        last_name:  m?.last_name  || '',
        first_name: m?.first_name || '',
        licence_no: e.licence_no,
        recorded_at: formatParisDateTime(e.recorded_at),
      }
    })
  }

  async function openSessionExport(sessionId: string) {
    setExportingId(sessionId)
    setPreviewRows(null)
    setPreviewLoading(true)
    try {
      const rows = await fetchRowsForSession(sessionId)
      setPreviewRows(rows)
    } catch (e: any) {
      setPreviewRows([])
      alert('Prévisualisation: ' + (e?.message || String(e)))
    } finally {
      setPreviewLoading(false)
    }
  }

  async function confirmExportSession() {
    if (!exportingId || !previewRows) return
    setBusy(true)
    try {
      const sess = sessions.find(s => s.id === exportingId)
      const base = `${CLUB}_${sess?.date || 'jour'}_session`
      if (format === 'csv')      await exportCSV(previewRows, `${base}.csv`)
      else if (format === 'xls') await exportXLS(previewRows, `${base}.xlsx`)
      else                       await exportPDF(previewRows, `${base}.pdf`)
      setExportingId(null)
    } catch (e: any) {
      alert('Export session: ' + (e?.message || String(e)))
    } finally {
      setBusy(false)
    }
  }

  async function previewSeason() {
    if (!season) return
    setSeasonPreviewRows(null)
    setSeasonPreviewLoading(true)
    try {
      const rows = await fetchRowsForSeason(season)
      setSeasonPreviewRows(rows)
    } catch (e: any) {
      setSeasonPreviewRows([])
      alert('Prévisualisation saison: ' + (e?.message || String(e)))
    } finally {
      setSeasonPreviewLoading(false)
    }
  }

  async function exportSeason() {
    if (!season || !seasonPreviewRows) return
    setSeasonBusy(true)
    try {
      const base = `${CLUB}_${season.replace(/\s+/g,'')}_saison`
      if (seasonFormat === 'csv')      await exportCSV(seasonPreviewRows, `${base}.csv`)
      else if (seasonFormat === 'xls') await exportXLS(seasonPreviewRows, `${base}.xlsx`)
      else                             await exportPDF(seasonPreviewRows, `${base}.pdf`)
    } catch (e: any) {
      alert('Export saison: ' + (e?.message || String(e)))
    } finally {
      setSeasonBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Barre d’actions saison */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Historique des sessions</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm">Saison</label>
          <select
            className="rounded-xl border px-3 py-1.5 text-sm"
            value={season ?? ''}
            onChange={e=>setSeason(e.target.value || null)}
          >
            <option value="">— choisir —</option>
            {seasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <label className="text-sm">Format</label>
          <select
            className="rounded-xl border px-3 py-1.5 text-sm"
            value={seasonFormat}
            onChange={e=>setSeasonFormat(e.target.value as Format)}
          >
            <option value="csv">CSV</option>
            <option value="xls">XLS</option>
            <option value="pdf">PDF</option>
          </select>

          <button
            onClick={previewSeason}
            disabled={!season || seasonPreviewLoading}
            className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            title="Prévisualiser"
          >
            {seasonPreviewLoading ? '...' : 'Prévisualiser'}
          </button>

          <button
            onClick={exportSeason}
            disabled={!season || !seasonPreviewRows || seasonBusy}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700 disabled:opacity-50"
            title="Exporter saison"
          >
            <Download className="h-4 w-4" />
            {seasonBusy ? '...' : 'Exporter'}
          </button>
        </div>
      </div>

      {/* Table sessions */}
      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-blue-50 text-blue-900">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-right font-medium">Exporter</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="px-3 py-4" colSpan={2}>Chargement…</td></tr>}
            {!loading && err && <tr><td className="px-3 py-4 text-red-600" colSpan={2}>Erreur: {err}</td></tr>}
            {!loading && !err && sessions.length === 0 && <tr><td className="px-3 py-4" colSpan={2}>Aucune session.</td></tr>}
            {sessions.map(s => (
              <tr key={s.id} className="border-t">
                <td className="px-3 py-2">
                  {new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long' })
                    .format(new Date(s.date + 'T00:00:00Z'))}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 hover:bg-gray-50"
                    onClick={() => openSessionExport(s.id)}
                    title="Exporter cette session"
                  >
                    <Download className="h-4 w-4" /> Exporter
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal export session */}
      {exportingId && (
        <div className="fixed inset-0 z-20 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="text-lg font-semibold">Exporter la session</h3>
              <button className="rounded-lg p-1 hover:bg-gray-100" onClick={()=>setExportingId(null)} aria-label="Fermer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4">
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Nom</th>
                      <th className="px-3 py-2 text-left font-medium">Prénom</th>
                      <th className="px-3 py-2 text-left font-medium">Licence</th>
                      <th className="px-3 py-2 text-left font-medium">Date/Heure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewLoading && <tr><td className="px-3 py-4" colSpan={4}>Chargement…</td></tr>}
                    {!previewLoading && previewRows && previewRows.length === 0 && (
                      <tr><td className="px-3 py-4" colSpan={4}>Aucune donnée.</td></tr>
                    )}
                    {!previewLoading && previewRows && previewRows.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">{r.last_name}</td>
                        <td className="px-3 py-2">{r.first_name}</td>
                        <td className="px-3 py-2">{r.licence_no}</td>
                        <td className="px-3 py-2">{r.recorded_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t">
              <div className="flex items-center gap-3">
                <label className="text-sm">Format</label>
                <div className="flex overflow-hidden rounded-xl border">
                  <button
                    className={`px-3 py-1.5 text-sm ${format==='csv' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}
                    onClick={()=>setFormat('csv')}
                  >
                    <FileText className="inline h-4 w-4 mr-1" /> CSV
                  </button>
                  <button
                    className={`px-3 py-1.5 text-sm ${format==='xls' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}
                    onClick={()=>setFormat('xls')}
                  >
                    <FileSpreadsheet className="inline h-4 w-4 mr-1" /> XLS
                  </button>
                  <button
                    className={`px-3 py-1.5 text-sm ${format==='pdf' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}
                    onClick={()=>setFormat('pdf')}
                  >
                    <FileText className="inline h-4 w-4 mr-1" /> PDF
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <button className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={()=>setExportingId(null)} disabled={busy}>Annuler</button>
                <button
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                  onClick={confirmExportSession}
                  disabled={busy || previewLoading || !previewRows || previewRows.length===0}
                >
                  <Download className="h-4 w-4" /> {busy ? '...' : 'Exporter'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal preview saison */}
      {seasonPreviewRows && (
        <div className="fixed inset-0 z-20 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="text-lg font-semibold">Prévisualisation – Saison {season}</h3>
              <button className="rounded-lg p-1 hover:bg-gray-100" onClick={()=>setSeasonPreviewRows(null)} aria-label="Fermer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4">
              <div className="overflow-hidden rounded-xl border max-h-[60vh]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Nom</th>
                      <th className="px-3 py-2 text-left font-medium">Prénom</th>
                      <th className="px-3 py-2 text-left font-medium">Licence</th>
                      <th className="px-3 py-2 text-left font-medium">Date/Heure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasonPreviewRows.length === 0 && <tr><td className="px-3 py-4" colSpan={4}>Aucune donnée.</td></tr>}
                    {seasonPreviewRows.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">{r.last_name}</td>
                        <td className="px-3 py-2">{r.first_name}</td>
                        <td className="px-3 py-2">{r.licence_no}</td>
                        <td className="px-3 py-2">{r.recorded_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t">
              <div className="flex items-center gap-3">
                <label className="text-sm">Format</label>
                <div className="flex overflow-hidden rounded-xl border">
                  <button
                    className={`px-3 py-1.5 text-sm ${seasonFormat==='csv' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}
                    onClick={()=>setSeasonFormat('csv')}
                  >
                    <FileText className="inline h-4 w-4 mr-1" /> CSV
                  </button>
                  <button
                    className={`px-3 py-1.5 text-sm ${seasonFormat==='xls' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}
                    onClick={()=>setSeasonFormat('xls')}
                  >
                    <FileSpreadsheet className="inline h-4 w-4 mr-1" /> XLS
                  </button>
                  <button
                    className={`px-3 py-1.5 text-sm ${seasonFormat==='pdf' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}
                    onClick={()=>setSeasonFormat('pdf')}
                  >
                    <FileText className="inline h-4 w-4 mr-1" /> PDF
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <button className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={()=>setSeasonPreviewRows(null)} disabled={seasonBusy}>Fermer</button>
                <button
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-50"
                  onClick={exportSeason}
                  disabled={seasonBusy || seasonPreviewRows.length===0}
                >
                  <Download className="h-4 w-4" /> {seasonBusy ? '...' : 'Exporter saison'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
