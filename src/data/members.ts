// src/data/members.ts
import { supabase } from './supabase'

export type MemberUpsert = {
  licence_no: string
  first_name?: string | null
  last_name?: string | null
  valid_until?: string | null
  season_label?: string | null
  photo_url?: string | null
}

export async function upsertMemberDetails(m: MemberUpsert) {
  const payload: any = {
    licence_no: m.licence_no,
    first_name: m.first_name ?? '',
    last_name: m.last_name ?? '',
    valid_until: m.valid_until ?? null,
    season_label: m.season_label ?? null,
    photo_url: m.photo_url ?? null,
  };
  // @ts-ignore
  return await supabase.from('members').upsert(payload, { onConflict: 'licence_no' } as any);
}
