import { supabase } from '../data/supabase'

export async function uploadMemberPhoto(licence_no: string, file: File): Promise<string> {
  const path = `members/${licence_no}.jpg`
  const { error } = await supabase.storage.from('photos').upload(path, file, { upsert: true, cacheControl: '3600' })
  if (error) throw error
  const { data } = supabase.storage.from('photos').getPublicUrl(path)
  return data.publicUrl
}
