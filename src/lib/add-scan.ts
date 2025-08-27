import { supabase } from '../data/supabase'
import { fetchItacProfile } from './enrich'

export async function addScan(url: string, sessionId: string) {
  const profile = await fetchItacProfile(url)
  if (!profile) throw new Error('Profil introuvable')

  // 1) Upsert membre
  const upMember = {
    licence_no: profile.licence_no,
    last_name: profile.last_name ?? null,
    first_name: profile.first_name ?? null,
    season_label: profile.season_label ?? null,
    valid_until: profile.valid_until ?? null,
    photo_url: profile.photo_url ?? null,
    valid_flag: profile.valid_flag ?? null,
  }
  {
    const { error } = await supabase.from('members').upsert(upMember, { onConflict: 'licence_no' })
    if (error) throw error
  }

  // 2) Insert entry (doublon journalier géré par l’index unique)
  const entry = {
    session_id: sessionId,
    licence_no: profile.licence_no,
    source_url: profile.source_url,
  }
  const { error } = await supabase.from('entries').insert(entry)
  if (error) {
    if ((error as any).code === '23505') {
      return { duplicated: true, profile }
    }
    throw error
  }
  return { duplicated: false, profile }
}
