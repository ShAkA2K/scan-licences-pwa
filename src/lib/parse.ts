// src/lib/parse.ts
export function parseLicenceFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.toLowerCase().endsWith('itac.pro') && u.pathname.toLowerCase().endsWith('/f.aspx')) {
      const c = u.searchParams.get('C') || u.searchParams.get('c')
      if (c) return c.toUpperCase()
      const n = u.searchParams.get('N') || u.searchParams.get('n')
      if (n) return n.toUpperCase()
    }
    const m = u.pathname.match(/licen[cs]e\/(\w{5,})/i)
    if (m?.[1]) return m[1].toUpperCase()
    const qp = u.searchParams.get('licence') || u.searchParams.get('license')
    if (qp) return qp.toUpperCase()
    const any = (url.match(/([A-Z0-9]{5,})/i) || [])[1]
    return any ? any.toUpperCase() : null
  } catch { return null }
}
