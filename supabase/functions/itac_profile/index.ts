// supabase/functions/itac_profile_store/index.ts
// Edge Function: lit la page itac.pro, extrait infos + photo, upload la photo dans Storage, renvoie JSON.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = Deno.env.get("PHOTOS_BUCKET") || "photos";
const supabaseUrl = Deno.env.get("SB_URL")!;               // ✅ secrets autorisés (pas SUPABASE_*)
const serviceKey  = Deno.env.get("SB_SERVICE_ROLE_KEY")!;  // ✅
const supabase = createClient(supabaseUrl, serviceKey);

function abs(base: string, src: string) { try { return new URL(src, base).toString(); } catch { return null; } }
function extractAll(regex: RegExp, text: string): string[] { const out: string[] = []; for (const m of text.matchAll(regex)) out.push(m[1] ?? m[0]); return out; }
function extFromContentType(ct?: string | null) { if (!ct) return "jpg"; if (ct.includes("png")) return "png"; if (ct.includes("webp")) return "webp"; if (ct.includes("gif")) return "gif"; return "jpg"; }

serve(async (req) => {
  try {
    const contentType = req.headers.get("content-type") || "";
    let url = "";
    if (contentType.includes("application/json")) { const body = await req.json().catch(()=>({})); url = String(body?.url || ""); }
    else { const u = new URL(req.url); url = String(u.searchParams.get("url") || ""); }
    if (!url || !/^https?:\/\/(www\.)?itac\.pro\//i.test(url)) return new Response(JSON.stringify({ error: "invalid_url" }), { status: 400, headers: { "content-type": "application/json" } });

    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) return new Response(JSON.stringify({ error: "fetch_failed", status: res.status }), { status: 502, headers: { "content-type": "application/json" } });
    const html = await res.text();

    const season = (html.match(/Saison\s+(\d{4})\s*[-\/]\s*(\d{4})/i) || null);
    const season_label = season ? `Saison ${season[1]} - ${season[2]}` : null;
    const valid_flag = /en\s+cours\s+de\s+validit[eé]/i.test(html);

    const licence_candidates = extractAll(/\b(\d{6,})\b/g, html);
    const licence_no = licence_candidates.length ? licence_candidates[0] : null;

    let first_name: string | null = null, last_name: string | null = null;
    if (licence_no) {
      const idx = html.indexOf(licence_no);
      const start = Math.max(0, idx - 800), end = Math.min(html.length, idx + 800);
      const window = html.slice(start, end).replace(/<[^>]+>/g, "\n");
      const lines = window.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      const nameRe = /^[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ' -]{2,}$/;
      const ups = lines.filter(l => nameRe.test(l));
      if (ups.length >= 2) { last_name = ups[0] || null; first_name = ups[1] || null; }
    }

    const imgSrcs = extractAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, html).map(s => abs(url, s)).filter(Boolean) as string[];
    const photo_src = (imgSrcs || []).find(s => !/logo|favicon|sprite|icon|pixel|blank/i.test(s)) || null;

    let photo_url: string | null = null;
    if (photo_src && licence_no) {
      const imgRes = await fetch(photo_src);
      if (imgRes.ok) {
        const buf = new Uint8Array(await imgRes.arrayBuffer());
        const ct = imgRes.headers.get("content-type") || "image/jpeg";
        const ext = extFromContentType(ct);
        const path = `members/${licence_no}.${ext}`;
        const up = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: ct, upsert: true });
        if (!up.error) {
          const pub = supabase.storage.from(BUCKET).getPublicUrl(path);
          photo_url = pub.data.publicUrl || null;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, source_url: url, licence_no, season_label, valid_flag, first_name, last_name, photo_url }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: "exception", message: String(e?.message || e) }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
