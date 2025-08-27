// supabase/functions/itac_profile_store/index.ts
// Parsing dirigé par IDs connus de la page itac.pro (robuste):
// - licence_no   : <span id="lb_res_licence">82936384</span>
// - last_name    : <span id="lb_res_nom">BRANLE</span>
// - first_name   : <span id="lb_res_prenom">GREGORY</span>
// - season_label : <span id="lb_saison">Saison 2024 - 2025</span>
// - valid_flag   : <span id="lb_resultat">En cours de validité</span>  -> true
// - photo_url    : <img id="img_photo" src="viewDocument.aspx?PHOTO=..."> (résolution URL + Referer)
//
// Secrets requis (via `supabase secrets set`):
//   SB_URL="https://<project-ref>.supabase.co"
//   SB_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY>"
// Optionnels:
//   PHOTOS_BUCKET="photos" (défaut)
//   SEASON_END_MONTH="8", SEASON_END_DAY="31" (si jamais lb_resultat absent)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = Deno.env.get("PHOTOS_BUCKET") || "photos";
const supabaseUrl = Deno.env.get("SB_URL")!;
const serviceKey  = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const supa = createClient(supabaseUrl, serviceKey);

const SEASON_END_MONTH = Number(Deno.env.get("SEASON_END_MONTH") || "8");   // août
const SEASON_END_DAY   = Number(Deno.env.get("SEASON_END_DAY")   || "31");

function abs(base: string, src: string) { try { return new URL(src, base).toString(); } catch { return src; } }
function extFromContentType(ct?: string | null) {
  if (!ct) return "jpg"; if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp"; if (ct.includes("gif")) return "gif";
  return "jpg";
}
function folded(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function getByIdText(html: string, id: string): string | null {
  // Capture le texte immédiat entre >...< du node qui contient id="..."
  const re = new RegExp(`id=["']${id}["'][^>]*>([^<]*)<`, "i");
  const m = html.match(re);
  if (!m) return null;
  const v = (m[1] || "").trim();
  return v || null;
}
function computeValidFromSeason(season_label: string | null): boolean | null {
  if (!season_label) return null;
  const m = season_label.match(/(\d{4}).*?(\d{4})/);
  if (!m) return null;
  const endYear = Number(m[2]);
  const mm = String(SEASON_END_MONTH).padStart(2, "0");
  const dd = String(SEASON_END_DAY).padStart(2, "0");
  const end = new Date(`${endYear}-${mm}-${dd}T23:59:59Z`);
  return new Date() <= end;
}

async function fetchAndStorePhoto(src: string, pageUrl: string, licence_no: string) {
  const headers: Record<string, string> = {
    "user-agent": "Mozilla/5.0",
    "referer": pageUrl,
    "accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  };
  let buf: Uint8Array, ct = "image/jpeg", ext = "jpg";
  if (src.startsWith("data:image/")) {
    const m = src.match(/^data:(image\/[^;]+);base64,(.+)$/i);
    if (!m) throw new Error("bad data url");
    ct = m[1] || ct;
    ext = /png/.test(ct) ? "png" : /webp/.test(ct) ? "webp" : /gif/.test(ct) ? "gif" : "jpg";
    buf = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
  } else {
    const res = await fetch(src, { headers });
    if (!res.ok) throw new Error(`img fetch ${res.status}`);
    ct = res.headers.get("content-type") || ct;
    ext = /png/.test(ct) ? "png" : /webp/.test(ct) ? "webp" : /gif/.test(ct) ? "gif" : "jpg";
    buf = new Uint8Array(await res.arrayBuffer());
  }
  const path = `members/${licence_no}.${ext}`;
  const up = await supa.storage.from(BUCKET).upload(path, buf, { contentType: ct, upsert: true });
  if (up.error) throw up.error;
  const pub = supa.storage.from(BUCKET).getPublicUrl(path);
  return pub.data.publicUrl || null;
}

serve(async (req) => {
  try {
    // Lire l’URL (body JSON ou query ?url=)
    const ct = req.headers.get("content-type") || "";
    let url = "";
    if (ct.includes("application/json")) {
      const body = await req.json().catch(()=>({}));
      url = String(body?.url || "");
    } else {
      const u = new URL(req.url);
      url = String(u.searchParams.get("url") || "");
    }
    if (!url || !/^https?:\/\/(www\.)?itac\.pro\//i.test(url)) {
      return new Response(JSON.stringify({ error: "invalid_url" }), { status: 400, headers: { "content-type": "application/json" } });
    }

    // Récupère la page (avec UA)
    const page = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!page.ok) {
      return new Response(JSON.stringify({ error: "fetch_failed", status: page.status }), { status: 502, headers: { "content-type": "application/json" } });
    }
    const html = await page.text();

    // 1) Champs dirigés par ID
    const raw_lic  = getByIdText(html, "lb_res_licence");
    const raw_nom  = getByIdText(html, "lb_res_nom");
    const raw_pre  = getByIdText(html, "lb_res_prenom");
    const raw_sais = getByIdText(html, "lb_saison");          // "Saison 2024 - 2025"
    const raw_val  = getByIdText(html, "lb_resultat");        // "En cours de validité"

    const licence_no   = raw_lic || null;
    const last_name    = raw_nom || null;
    const first_name   = raw_pre || null;
    const season_label = raw_sais || null;

    // 2) valid_flag : priorité au texte du label, sinon calcul saison
    let valid_flag = false;
    if (raw_val) {
      const f = folded(raw_val);
      valid_flag = /\ben\s*cours\b/.test(f) && /\bvalid/.test(f); // "en cours ... valid(e/ité)"
    } else {
      const bySeason = computeValidFromSeason(season_label);
      valid_flag = !!bySeason;
    }

    // 3) Photo: <img id="img_photo" src="..."> (résolution relative + Referer)
    let photo_url: string | null = null;
    if (licence_no) {
      const m = html.match(/<img[^>]+id=["']img_photo["'][^>]*src=["']([^"']+)["'][^>]*>/i);
      if (m?.[1]) {
        const src = abs(url, m[1]);
        try {
          photo_url = await fetchAndStorePhoto(src, url, licence_no);
        } catch {
          photo_url = null; // si l'image refuse le fetch, on laisse vide
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      source_url: url,
      licence_no,
      season_label,
      valid_flag,
      first_name,
      last_name,
      photo_url
    }), { status: 200, headers: { "content-type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: "exception", message: String((e as any)?.message || e) }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
