// src/lib/enrich.ts
import { supabase } from '../data/supabase'
import { parseLicenceFromUrl } from './parse'

export type ItacProfile = {
  licence_no: string
  last_name?: string
  first_name?: string
  season_label?: string
  valid_flag?: boolean
  photo_url?: string | null
  source_url: string
  valid_until?: string | null
}

const SEASON_END_MONTH = Number(import.meta.env.VITE_SEASON_END_MONTH || 8)  // 8 = août
const SEASON_END_DAY   = Number(import.meta.env.VITE_SEASON_END_DAY   || 31) // 31 août

function computeValidUntil(season_label?: string | null): string | null {
  if (!season_label) return null
  const m = season_label.match(/(\d{4}).*?(\d{4})/)
  if (!m) return null
  const endYear = Number(m[2])
  const mm = String(SEASON_END_MONTH).padStart(2,'0')
  const dd = String(SEASON_END_DAY).padStart(2,'0')
  return `${endYear}-${mm}-${dd}`
}

function badWord(s?: string | null) {
  return !!(s && /(SAISON|LICEN|NUM|N[°o]|VALIDE|VALID|CONTR|CONTRO|FINAL|CARTE|FFTIR|PHOTO|FEDER|ASSUR|CLUB|DISCIPLINE|N[ÉE]E|NEE|DATE)/i.test(s))
}
function plausibleName(s?: string | null) {
  return !!(s && s.length >= 2 && s.length <= 32 && /^[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ' -]+$/.test(s) && !badWord(s))
}

// Fallback texte (no photo) via proxy r.jina.ai
function toProxy(url: string) {
  const u = new URL(url)
  return `https://r.jina.ai/http://${u.host}${u.pathname}${u.search}`
}
async function enrichViaTextProxy(url: string): Promise<ItacProfile | null> {
  try {
    const res = await fetch(toProxy(url))
    if (!res.ok) return null
    const text = await res.text()
    const lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)

    // Saison
    const season = lines.find(l => /^Saison\s+\d{4}\s*-\s*\d{4}$/i.test(l)) || undefined

    // Validité (si le texte “En cours de validité” est visible)
    const valid =
      lines.some(l => /en\s*cours/i.test(l) && /valid/i.test(l)) ||
      false

    // Licence (suite de 6..12 chiffres, première rencontrée)
    const numRe = /^\d{6,12}$/
    let licence: string | undefined
    for (const L of lines) { if (numRe.test(L)) { licence = L; break } }
    if (!licence) {
      // fallback ultime : C ou N depuis l’URL
      licence = parseLicenceFromUrl(url) || undefined
    }

    // Noms : juste après le numéro
    let last: string | undefined, first: string | undefined
    if (licence) {
      const idx = lines.findIndex(l => l === licence)
      if (idx >= 0) {
        for (let i = idx+1; i < Math.min(lines.length, idx+10); i++) {
          const cand = lines[i]
          if (plausibleName(cand)) {
            if (!last) { last = cand; continue }
            if (!first) { first = cand; break }
          }
        }
      }
    }

    const seasonUntil = computeValidUntil(season)
    return {
      licence_no: (licence || '').toUpperCase(),
      last_name: last,
      first_name: first,
      season_label: season,
      valid_flag: valid || (!!seasonUntil && (new Date() <= new Date(`${seasonUntil}T23:59:59Z`))),
      photo_url: null,
      source_url: url,
      valid_until: seasonUntil
    }
  } catch {
    return null
  }
}

export async function fetchItacProfile(url: string): Promise<ItacProfile | null> {
  // 1) Edge Function (source de vérité : champs par IDs + photo Storage)
  try {
    const { data, error } = await supabase.functions.invoke('itac_profile_store', { body: { url } })
    if (!error && data) {
      // licence_no (fallback URL si vide)
      let licence = String(data.licence_no || '').toUpperCase()
      if (!licence) licence = (parseLicenceFromUrl(url) || '').toUpperCase()

      // noms plausibles (sinon on les remettra via fallback texte)
      let first = data.first_name || undefined
      let last  = data.last_name  || undefined
      const namesOK = plausibleName(first) && plausibleName(last)

      // valid_flag : si non fourni (ou faux) et que la saison indique “encore valide”, on corrige côté client
      const season_label: string | undefined = data.season_label || undefined
      const valid_until = computeValidUntil(season_label)
      let valid_flag: boolean =
        data.valid_flag === true
          ? true
          : !!(valid_until && (new Date() <= new Date(`${valid_until}T23:59:59Z`)))

      let result: ItacProfile = {
        licence_no: licence,
        first_name: namesOK ? first : undefined,
        last_name:  namesOK ? last  : undefined,
        season_label,
        valid_flag,
        photo_url: data.photo_url || null,
        source_url: url,
        valid_until
      }

      // 1.b) Fallback noms si Edge n’a pas remonté de valeurs plausibles
      if (!namesOK) {
        const fb = await enrichViaTextProxy(url)
        if (fb) {
          if (!result.first_name && fb.first_name) result.first_name = fb.first_name
          if (!result.last_name  && fb.last_name)  result.last_name  = fb.last_name
          if (!result.season_label && fb.season_label) result.season_label = fb.season_label
          if (!result.valid_until && fb.valid_until) result.valid_until = fb.valid_until
          if (result.valid_flag !== true && fb.valid_flag === true) result.valid_flag = true
        }
      }

      // Dernier filet : si licence encore vide, prends l’ID de l’URL
      if (!result.licence_no) result.licence_no = (parseLicenceFromUrl(url) || '').toUpperCase()

      return result
    }
  } catch {
    // ignore -> on tentera le fallback
  }

  // 2) Fallback : proxy texte
  return await enrichViaTextProxy(url)
}
