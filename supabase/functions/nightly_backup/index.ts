// supabase/functions/nightly_backup/index.ts
// Edge Function: export des entrées + membres en CSV vers storage/backups/yyyy-mm-dd.csv
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import dayjs from 'https://esm.sh/dayjs@1'

function toCSV(rows: any[]) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const esc = (v: any) => {
    if (v == null) return ''
    const s = String(v)
    if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g,'""')}"`
    return s
  }
  return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n')
}

Deno.serve(async (_req) => {
  try {
    // Secrets autorisés (sans préfixe SUPABASE_)
    const url = Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL') // fallback si présent par défaut
    const key = Deno.env.get('SERVICE_ROLE_KEY') // service role pour bypasser RLS

    if (!url || !key) {
      throw new Error('Secrets manquants: PROJECT_URL et/ou SERVICE_ROLE_KEY')
    }

    const supabase = createClient(url, key)

    // Données
    const { data: E, error: e1 } = await supabase
      .from('entries')
      .select('session_id, licence_no, timestamp')
      .order('timestamp', { ascending: true })
    if (e1) throw e1

    const licences = Array.from(new Set((E ?? []).map((x:any)=>x.licence_no)))
    const M = new Map<string, {last_name:string|null, first_name:string|null}>()
    if (licences.length) {
      const { data: MM, error: e2 } = await supabase
        .from('members')
        .select('licence_no, last_name, first_name')
        .in('licence_no', licences)
      if (e2) throw e2
      for (const m of (MM||[])) M.set(m.licence_no, { last_name: m.last_name, first_name: m.first_name })
    }

    const rows = (E||[]).map((e:any) => ({
      last_name:  M.get(e.licence_no)?.last_name  ?? '',
      first_name: M.get(e.licence_no)?.first_name ?? '',
      licence_no: e.licence_no,
      session_id: e.session_id,
      datetime_paris: new Date(e.timestamp).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
      timestamp: e.timestamp,
    }))

    const csv = toCSV(rows)
    const today = dayjs().format('YYYY-MM-DD')
    const path = `backups/${today}.csv`

    const { error: upErr } = await supabase
      .storage.from('backups')
      .upload(path, new Blob([csv], { type: 'text/csv' }), { upsert: true, cacheControl: '3600' })
    if (upErr) throw upErr

    return new Response(JSON.stringify({ ok: true, path }), { headers: { 'content-type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { 'content-type': 'application/json' }
    })
  }
})
