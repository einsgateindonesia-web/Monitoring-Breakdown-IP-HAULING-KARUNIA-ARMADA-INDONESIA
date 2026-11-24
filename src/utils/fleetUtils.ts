import { BreakdownRecord, FleetUnit, RfuHistoryRecord } from '../types/fleet';

export function getCurrentTimeHHMM(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function getCurrentDateYYYYMMDD(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatReadableDateId(yyyyMmDd: string): string {
  if (!yyyyMmDd) return '-';
  const parts = yyyyMmDd.split('-');
  if (parts.length !== 3) return yyyyMmDd;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function buildWhatsappReport(
  runningUnits: FleetUnit[],
  bdRecords: BreakdownRecord[],
  totalFleetCount: number
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timeStr = getCurrentTimeHHMM();
  const paPct =
    totalFleetCount > 0 ? ((runningUnits.length / totalFleetCount) * 100).toFixed(1) : '0.0';

  const pmscTotal =
    runningUnits.filter((u) => u.fleetGroup === 'PMSC').length +
    bdRecords.filter((b) => b.fleetGroup === 'PMSC').length;
  const pmscRun = runningUnits.filter((u) => u.fleetGroup === 'PMSC').length;
  const pmscBd = bdRecords.filter((b) => b.fleetGroup === 'PMSC').length;

  const pmvvTotal =
    runningUnits.filter((u) => u.fleetGroup === 'PMVV').length +
    bdRecords.filter((b) => b.fleetGroup === 'PMVV').length;
  const pmvvRun = runningUnits.filter((u) => u.fleetGroup === 'PMVV').length;
  const pmvvBd = bdRecords.filter((b) => b.fleetGroup === 'PMVV').length;

  const lines: string[] = [
    `*LAPORAN STATUS ARMADA & UNIT BD*`,
    `Tanggal: ${dateStr} | Pukul: ${timeStr}`,
    ``,
    `*RINGKASAN AREA DASHBOARD BD*`,
    `Total Armada : ${totalFleetCount} Unit`,
    `Unit Running : ${runningUnits.length} Unit (${paPct}%)`,
    `Unit BD      : ${bdRecords.length} Unit`,
    `- PMSC: ${pmscRun}/${pmscTotal} Running (${pmscBd} BD)`,
    `- PMVV: ${pmvvRun}/${pmvvTotal} Running (${pmvvBd} BD)`,
    ``,
    `*DAFTAR UNIT BD (${bdRecords.length})*`,
  ];

  if (bdRecords.length === 0) {
    lines.push('Tidak ada unit BD (100% Running).');
  } else {
    bdRecords.forEach((rec, idx) => {
      const ket = rec.keterangan.trim() ? rec.keterangan.trim() : '-';
      lines.push(`${idx + 1}. ${rec.unitCode} | Jam BD: ${rec.jamBd} | ${rec.status} | Ket: ${ket}`);
    });
  }

  return lines.join('\n');
}

function escapeCsvCell(val: string | number): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportBoardCsv(runningUnits: FleetUnit[], bdRecords: BreakdownRecord[]): void {
  const maxRows = Math.max(runningUnits.length, bdRecords.length, 1);
  const headers = [
    'NO',
    'UNIT RUNNING',
    '',
    'NO BD',
    'UNIT BD',
    'JAM BD',
    'TANGGAL BD',
    'KETERANGAN',
    'STATUS',
  ];

  const rows: string[] = [headers.map(escapeCsvCell).join(',')];

  for (let i = 0; i < maxRows; i++) {
    const run = runningUnits[i];
    const bd = bdRecords[i];
    rows.push(
      [
        run ? i + 1 : '',
        run ? run.code : '',
        '',
        bd ? i + 1 : '',
        bd ? bd.unitCode : '',
        bd ? bd.jamBd : '',
        bd ? bd.tanggalBd : '',
        bd ? bd.keterangan : '',
        bd ? bd.status : '',
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }

  const csvContent = '\uFEFF' + rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fleet-bd-board-${getCurrentDateYYYYMMDD()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportRfuHistoryCsv(history: RfuHistoryRecord[]): void {
  const headers = [
    'NO',
    'UNIT',
    'GRUP',
    'TANGGAL BD',
    'JAM BD',
    'TANGGAL RFU',
    'JAM RFU',
    'KETERANGAN',
    'STATUS TERAKHIR',
  ];

  const rows: string[] = [headers.map(escapeCsvCell).join(',')];
  history.forEach((h, idx) => {
    rows.push(
      [
        idx + 1,
        h.unitCode,
        h.fleetGroup,
        h.tanggalBd,
        h.jamBd,
        h.tanggalRfu,
        h.jamRfu,
        h.keterangan,
        h.lastStatus,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  });

  const csvContent = '\uFEFF' + rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `riwayat-rfu-${getCurrentDateYYYYMMDD()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const IGNORED_HEADERS = new Set([
  'NO',
  'UNIT',
  'UNIT RUNNING',
  'UNIT BD',
  'KODE UNIT',
  'KODE',
  'ARMADA',
  'POPULASI',
  'GRUP',
]);

export function parseFleetPopulationText(rawText: string): {
  codes: string[];
  duplicateInInput: number;
} {
  const lines = rawText.split(/\r?\n/);
  const seen = new Set<string>();
  const codes: string[] = [];
  let duplicateInInput = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Support Tab (Excel paste), Comma, or Semicolon separated columns
    const cells = line
      .split(/[\t,;]+/)
      .map((c) => c.replace(/^["']|["']$/g, '').trim())
      .filter(Boolean);

    if (cells.length === 0) continue;

    // If first cell is purely numeric (row number NO) and there is a second cell, take second cell
    let candidate = cells[0];
    if (/^\d+$/.test(cells[0]) && cells.length >= 2) {
      candidate = cells[1];
    }

    const normalized = candidate.toUpperCase().replace(/\s+/g, ' ').trim();
    if (!normalized || IGNORED_HEADERS.has(normalized) || /^\d+$/.test(normalized)) {
      continue;
    }

    if (seen.has(normalized)) {
      duplicateInInput += 1;
      continue;
    }

    seen.add(normalized);
    codes.push(normalized);
  }

  return { codes, duplicateInInput };
}

export function exportPopulationCsv(masterUnits: FleetUnit[]): void {
  const headers = ['NO', 'KODE UNIT', 'GRUP'];
  const rows: string[] = [headers.map(escapeCsvCell).join(',')];

  masterUnits.forEach((u, idx) => {
    rows.push([idx + 1, u.code, u.fleetGroup].map(escapeCsvCell).join(','));
  });

  const csvContent = '\uFEFF' + rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `populasi-unit-${getCurrentDateYYYYMMDD()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

