import { supabase } from '../data/supabase'

export async function isAllowed(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession()
  const email = session?.user?.email
  if (!email) return false
  const { data, error } = await supabase.from('allowed_emails').select('email').eq('email', email).limit(1)
  if (error) return false
  return (data?.length ?? 0) > 0
}

export async function isAdmin(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession()
  const email = session?.user?.email
  if (!email) return false
  const { data, error } = await supabase.from('admin_emails').select('email').eq('email', email).limit(1)
  if (error) return false
  return (data?.length ?? 0) > 0
}
