import { supabase } from './supabase'

export async function withTimeout<T>(p: Promise<T>, ms = 8000): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), ms))
  ]) as T
}

// Upsert minimal d'un membre pour satisfaire la FK. Nécessite une policy INSERT sur public.members.
export async function ensureMember(licence_no: string): Promise<'ok'|'forbidden'|'error'> {
  try {
    const { error } = await withTimeout(
      supabase
        .from('members')
        .upsert({ licence_no }, { onConflict: 'licence_no', ignoreDuplicates: true } as any) // supabase v2: onConflict option
    );
    if (!error) return 'ok';
    // @ts-ignore
    const code = error?.code || error?.status;
    if (code === '403') return 'forbidden';
    return 'error';
  } catch {
    return 'error';
  }
}

// Insert d'entrée avec rattrapage auto FK -> upsert member -> retry
export async function insertEntryImmediate(payload: any): Promise<'ok'|'duplicate'|'fk_error'|'members_rls'|'rls_forbidden'|'error'> {
  async function doInsert(): Promise<{status:'ok'|'duplicate'|'fk_error'|'rls_forbidden'|'error'}> {
    try {
      const { data, error } = await withTimeout(
        supabase.from('entries').insert(payload).select('id').single()
      );
      if (!error) return { status:'ok' };
      // @ts-ignore
      const code = error?.code || error?.status;
      if (code === '23505') return { status:'duplicate' };     // unique violation
      if (code === '23503') return { status:'fk_error' };      // foreign key
      if (code === '403')   return { status:'rls_forbidden' }; // RLS
      return { status:'error' };
    } catch {
      return { status:'error' };
    }
  }

  // 1) Essai direct
  let first = await doInsert();
  if (first.status !== 'fk_error') {
    return first.status as any;
  }

  // 2) FK: on tente de créer le membre minimal, puis on réessaie une fois
  const ensured = await ensureMember(payload.licence_no);
  if (ensured === 'ok') {
    const second = await doInsert();
    return second.status as any;
  }
  if (ensured === 'forbidden') return 'members_rls'; // policy manquante sur members
  return 'fk_error';
}
