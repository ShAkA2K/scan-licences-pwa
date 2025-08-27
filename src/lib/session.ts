import { supabase } from '../data/supabase'

export async function openTodaySession(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('NOT_AUTHENTICATED')

  const today = new Date().toISOString().slice(0,10)

  // 1) SELECT
  const sel = await supabase.from('sessions').select('id').eq('date', today).maybeSingle()
  // PGRST116 = no rows
  if (sel.error && sel.error.code !== 'PGRST116') throw sel.error
  if (sel.data?.id) return sel.data.id

  // 2) INSERT (unique on date)
  const ins = await supabase.from('sessions').insert({ id: crypto.randomUUID(), date: today }).select('id').single()
  if (ins.error) throw ins.error
  return ins.data.id
}
