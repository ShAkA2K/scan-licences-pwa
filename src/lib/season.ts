// Fin de saison: 31 août (Europe/Paris)
export const SEASON_END_MONTH = 8; // août (numérique 1-12)
export const SEASON_END_DAY   = 31;

export function seasonLabelFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1..12
  // Saison: 1 sept (Y) -> 31 août (Y+1)
  // Donc si mois >= 9 => fin = Y+1, sinon fin = Y
  const end = (m >= 9) ? y + 1 : y;
  const start = end - 1;
  return `${start} - ${end}`;
}

export function seasonRange(label: string): { start: string; end: string } {
  // "2024 - 2025" -> start: 2024-09-01, end: 2025-08-31
  const m = label.match(/(\d{4})\s*-\s*(\d{4})/);
  if (!m) throw new Error('Saison invalide');
  const startY = Number(m[1]);
  const endY   = Number(m[2]);
  return {
    start: `${startY}-09-01`,
    end:   `${endY}-08-${String(SEASON_END_DAY).padStart(2,'0')}`,
  };
}

// YYYY-MM-DD HH:mm en Europe/Paris
export function formatParisDateTime(dateISO: string | Date): string {
  const d = typeof dateISO === 'string' ? new Date(dateISO) : dateISO;
  // On génère "dd/mm/yyyy HH:mm", puis on convertit en "yyyy-mm-dd HH:mm" (plus pratique pour CSV/XLS triables)
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  };
  const fr = new Intl.DateTimeFormat('fr-FR', opts).format(d); // 27/08/2025 16:42
  const [dd, mm, yyyyAndTime] = fr.split('/');
  const [yyyy, time] = yyyyAndTime.split(' ');
  return `${yyyy}-${mm}-${dd} ${time}`;
}
