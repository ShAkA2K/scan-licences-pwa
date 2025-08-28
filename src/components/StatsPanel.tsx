import { useEffect, useState } from 'react'
import { supabase } from '../data/supabase'
import { CalendarDays, Users } from 'lucide-react'

export default function StatsPanel() {
  const [byDay, setByDay] = useState<{ day: string; count: number }[]>([])
  const [top, setTop] = useState<{ licence_no: string; n: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true); setErr(null)
      try {
        // fréquentation par jour (30 derniers jours)
        const { data: A, error: e1 } = await supabase
          .rpc('entries_count_by_day', {})  // si tu as une RPC, sinon fallback ci-dessous
        if (!e1 && A) {
          setByDay(A as any)
        } else {
          // Fallback client: group by jour local (si colonne entry_day existe)
          const { data } = await supabase.from('entries')
            .select('entry_day').gte('entry_day', new Date(Date.now()-30*864e5).toISOString().slice(0,10))
          const map = new Map<string, number>()
          for (const r of (data || []) as any[]) map.set(r.entry_day, (map.get(r.entry_day)||0)+1)
          setByDay(Array.from(map, ([day, count]) => ({ day, count })).sort((a,b)=>a.day.localeCompare(b.day)))
        }

        // top licenciés (30 jours)
        const since = new Date(Date.now()-30*864e5).toISOString()
        const { data: E } = await supabase.from('entries').select('licence_no,timestamp').gte('timestamp', since)
        const m = new Map<string, number>()
        for (const e of (E || []) as any[]) m.set(e.licence_no, (m.get(e.licence_no)||0)+1)
        const arr = Array.from(m, ([licence_no, n]) => ({ licence_no, n })).sort((a,b)=>b.n-a.n).slice(0,10)
        setTop(arr)
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-black/5 space-y-4">
      <h3 className="text-base font-semibold text-gray-900">Statistiques (30 jours)</h3>
      {loading && <div>Chargement…</div>}
      {err && <div className="text-red-600">Erreur: {err}</div>}
      {!loading && !err && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl border">
            <div className="px-3 py-2 bg-blue-50 text-blue-900 flex items-center gap-2"><CalendarDays className="h-4 w-4"/> Par jour</div>
            <table className="w-full text-sm">
              <tbody>
                {byDay.map(r => (
                  <tr key={r.day} className="border-t">
                    <td className="px-3 py-1.5">{new Date(r.day).toLocaleDateString('fr-FR')}</td>
                    <td className="px-3 py-1.5 text-right">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border">
            <div className="px-3 py-2 bg-blue-50 text-blue-900 flex items-center gap-2"><Users className="h-4 w-4"/> Top licenciés</div>
            <table className="w-full text-sm">
              <tbody>
                {top.map(r => (
                  <tr key={r.licence_no} className="border-t">
                    <td className="px-3 py-1.5 font-mono">{r.licence_no}</td>
                    <td className="px-3 py-1.5 text-right">{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
