export function exportEntriesCsv(rows: any[], filename = 'feuille_du_jour.csv') {
  const headers = Object.keys(rows[0] ?? { timestamp:'', licence_no:'', range_lane:'', valid_flag:'' });
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
