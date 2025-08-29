// src/lib/session.ts
import { supabase } from '../data/supabase'

/** "YYYY-MM-DD" au fuseau Europe/Paris */
export function parisDateStr(d = new Date()): string {
  return d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
}

/** Récupère la session du jour (Europe/Paris), ou null si absente */
export async function getTodaySession() {
  const today = parisDateStr()
  const { data, error } = await supabase
    .from('sessions')
    .select('id, date')
    .eq('date', today)
    .maybeSingle()
  if (error) throw error
  return data // null si pas de session
}

/** Ouvre la session du jour (idempotent grâce à l'unicité sur date) et renvoie la ligne */
export async function openTodaySession() {
  const today = parisDateStr()
  // on tente l'insert; si elle existe déjà, on ignore l'erreur unique
  const { error: insErr } = await supabase
    .from('sessions')
    .insert({ date: today })
  if (insErr && (insErr as any).code !== '23505') {
    // 23505 = unique_violation => OK, quelqu'un l'a déjà ouverte
    throw insErr
  }
  // on relit proprement
  const { data, error } = await supabase
    .from('sessions')
    .select('id, date')
    .eq('date', today)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Assure qu'une session existe, sinon l'ouvre; renvoie la session du jour */
export async function ensureTodaySession() {
  const s = await getTodaySession()
  if (s) return s
  return await openTodaySession()
}
