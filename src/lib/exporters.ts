import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export type ExportRow = {
  last_name: string;
  first_name: string;
  licence_no: string;
  recorded_at: string; // "YYYY-MM-DD HH:mm" Europe/Paris
};

function downloadBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export async function exportCSV(rows: ExportRow[], filename = 'export.csv') {
  const header = ['Nom', 'Prénom', 'Licence', 'Date/Heure'];
  // séparateur ; pour un CSV FR
  const lines = [header.join(';'), ...rows.map(r => [
    r.last_name ?? '', r.first_name ?? '', r.licence_no ?? '', r.recorded_at ?? ''
  ].map(s => String(s).replace(/;/g, ',')).join(';'))];
  const csv = lines.join('\r\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
}

export async function exportXLS(rows: ExportRow[], filename = 'export.xlsx') {
  const { utils, write } = await import('xlsx');
  const data = [
    ['Nom', 'Prénom', 'Licence', 'Date/Heure'],
    ...rows.map(r => [r.last_name, r.first_name, r.licence_no, r.recorded_at]),
  ];
  const ws = utils.aoa_to_sheet(data);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Enregistrements');
  const out = write(wb, { type: 'array', bookType: 'xlsx' });
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

export async function exportPDF(rows: ExportRow[], filename = 'export.pdf') {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  doc.setFontSize(12);
  doc.text('Enregistrements', 40, 40);

  autoTable(doc, {
    startY: 60,
    head: [['Nom', 'Prénom', 'Licence', 'Date/Heure']],
    body: rows.map(r => [r.last_name, r.first_name, r.licence_no, r.recorded_at]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: { 0: { cellWidth: 150 }, 1: { cellWidth: 150 }, 2: { cellWidth: 120 }, 3: { cellWidth: 140 } },
  });

  downloadBlob(doc.output('blob'), filename);
}
