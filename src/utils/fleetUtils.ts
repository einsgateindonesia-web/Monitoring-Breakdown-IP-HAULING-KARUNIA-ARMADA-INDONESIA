import { formatBdStatus, PART_STATUS_LABELS } from '../data/initialUnits';
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

export function parseDateTimeToMs(dateStr?: string, timeStr?: string): number | null {
  if (!dateStr) return null;
  const parts = dateStr.trim().split('-').map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  const [y, m, d] = parts;
  const timeParts = (timeStr || '00:00').trim().split(':').map(Number);
  const hh = Number.isFinite(timeParts[0]) ? timeParts[0] : 0;
  const mm = Number.isFinite(timeParts[1]) ? timeParts[1] : 0;
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

export function calculateDurationMinutes(
  startDate?: string,
  startTime?: string,
  endDate?: string,
  endTime?: string,
  nowMs: number = Date.now()
): number | null {
  const startMs = parseDateTimeToMs(startDate, startTime);
  if (startMs === null) return null;
  const endMs =
    endDate && endTime
      ? parseDateTimeToMs(endDate, endTime)
      : endDate
      ? parseDateTimeToMs(endDate, '23:59')
      : nowMs;
  if (endMs === null) return null;
  const diffMin = Math.floor((endMs - startMs) / 60000);
  return Math.max(0, diffMin);
}

export function formatDurationId(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return '—';
  if (minutes < 60) return `${minutes}m`;
  const totalHours = Math.floor(minutes / 60);
  const remMins = minutes % 60;
  if (totalHours < 24) {
    return remMins > 0 ? `${totalHours}j ${remMins}m` : `${totalHours}j`;
  }
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours > 0 ? `${days}h ${remHours}j` : `${days}h`;
}

export function getAgingSeverity(minutes: number | null): 'normal' | 'warning' | 'critical' {
  if (minutes === null) return 'normal';
  if (minutes >= 12 * 60) return 'critical';
  if (minutes >= 6 * 60) return 'warning';
  return 'normal';
}

export function normalizeMrList(list?: string[] | null): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    const clean = String(item ?? '').trim().toUpperCase();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
  }
  return result;
}

export function parseMrInput(raw: string): string[] {
  if (!raw) return [];
  const parts = raw.split(/[,;\r\n]+/);
  return normalizeMrList(parts);
}

export function formatMrNumbers(mrNumbers?: string[] | null, emptyFallback = '-'): string {
  const normalized = normalizeMrList(mrNumbers);
  return normalized.length > 0 ? normalized.join(', ') : emptyFallback;
}

export function buildWhatsappReport(
  runningUnits: FleetUnit[],
  bdRecords: BreakdownRecord[],
  totalFleetCount: number
): string {
  const now = new Date();
  const nowMs = now.getTime();
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

  const agingOver6h = bdRecords.filter((r) => {
    const mins = calculateDurationMinutes(r.tanggalBd, r.jamBd, undefined, undefined, nowMs);
    return mins !== null && mins >= 360;
  }).length;
  const waitingPartCount = bdRecords.filter(
    (r) => r.status === 'B1' || normalizeMrList(r.mrNumbers).length > 0
  ).length;

  const lines: string[] = [
    `*LAPORAN STATUS ARMADA & UNIT BD*`,
    `Tanggal: ${dateStr} | Pukul: ${timeStr}`,
    ``,
    `*RINGKASAN AREA DASHBOARD BD*`,
    `Total Armada : ${totalFleetCount} Unit`,
    `Unit Running : ${runningUnits.length} Unit (${paPct}%)`,
    `Unit BD      : ${bdRecords.length} Unit (Aging ≥6j: ${agingOver6h} | Track Part/MR: ${waitingPartCount})`,
    `- PMSC: ${pmscRun}/${pmscTotal} Running (${pmscBd} BD)`,
    `- PMVV: ${pmvvRun}/${pmvvTotal} Running (${pmvvBd} BD)`,
    ``,
    `*DAFTAR UNIT BD (${bdRecords.length})*`,
  ];

  if (bdRecords.length === 0) {
    lines.push('Tidak ada unit BD (100% Running).');
  } else {
    bdRecords.forEach((rec, idx) => {
      const lok = rec.lokasi?.trim() ? rec.lokasi.trim() : '-';
      const mrText = formatMrNumbers(rec.mrNumbers, '-');
      const ket = rec.keterangan.trim() ? rec.keterangan.trim() : '-';
      const durMin = calculateDurationMinutes(rec.tanggalBd, rec.jamBd, undefined, undefined, nowMs);
      const durText = formatDurationId(durMin);
      const extras: string[] = [`Dur: ${durText}`];
      if (rec.picMekanik?.trim()) extras.push(`PIC: ${rec.picMekanik.trim()}`);
      if (rec.etr?.trim()) extras.push(`ETR: ${rec.etr.trim()}`);
      if (rec.partStatus) extras.push(`Part: ${PART_STATUS_LABELS[rec.partStatus]}`);

      lines.push(
        `${idx + 1}. ${rec.unitCode} | Jam BD: ${rec.jamBd} (${extras.join(' · ')}) | Posisi: ${lok} | MR: ${mrText} | ${formatBdStatus(rec.status)} | Ket: ${ket}`
      );
    });
  }

  return lines.join('\n');
}

export function buildSparepartWhatsappReport(bdRecords: BreakdownRecord[]): string {
  const now = new Date();
  const nowMs = now.getTime();
  const dateStr = now.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timeStr = getCurrentTimeHHMM();

  const partUnits = bdRecords.filter(
    (rec) =>
      rec.status === 'B1' ||
      normalizeMrList(rec.mrNumbers).length > 0 ||
      Boolean(rec.partStatus) ||
      Boolean(rec.partNote?.trim())
  );

  const lines: string[] = [
    `*TRACKING SPAREPART & NOMOR MR*`,
    `Tanggal: ${dateStr} | Pukul: ${timeStr}`,
    `Total Unit Terkait Part/MR: ${partUnits.length} Unit`,
    ``,
  ];

  if (partUnits.length === 0) {
    lines.push('Tidak ada unit BD dengan waiting part atau nomor MR aktif.');
  } else {
    partUnits.forEach((rec, idx) => {
      const mrText = formatMrNumbers(rec.mrNumbers, 'BELUM ADA MR');
      const partLabel = PART_STATUS_LABELS[rec.partStatus ?? ''] || 'Belum Diatur';
      const durMin = calculateDurationMinutes(rec.tanggalBd, rec.jamBd, undefined, undefined, nowMs);
      const durText = formatDurationId(durMin);
      const note = rec.partNote?.trim() ? ` | Catatan: ${rec.partNote.trim()}` : '';
      lines.push(
        `${idx + 1}. ${rec.unitCode} (${rec.status}, Aging ${durText}) | MR: ${mrText} | Status Part: ${partLabel}${note} | Problem: ${rec.keterangan || '-'}`
      );
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
  const nowMs = Date.now();
  const maxRows = Math.max(runningUnits.length, bdRecords.length, 1);
  const headers = [
    'NO',
    'UNIT RUNNING',
    '',
    'NO BD',
    'UNIT BD',
    'JAM BD',
    'TANGGAL BD',
    'DURASI BD',
    'POSISI / LOKASI BD',
    'NOMOR MR',
    'PIC MEKANIK',
    'ETR',
    'STATUS PART',
    'CATATAN PART',
    'KETERANGAN',
    'STATUS',
  ];

  const rows: string[] = [headers.map(escapeCsvCell).join(',')];

  for (let i = 0; i < maxRows; i++) {
    const run = runningUnits[i];
    const bd = bdRecords[i];
    const durStr = bd
      ? formatDurationId(
          calculateDurationMinutes(bd.tanggalBd, bd.jamBd, undefined, undefined, nowMs)
        )
      : '';

    rows.push(
      [
        run ? i + 1 : '',
        run ? run.code : '',
        '',
        bd ? i + 1 : '',
        bd ? bd.unitCode : '',
        bd ? bd.jamBd : '',
        bd ? bd.tanggalBd : '',
        durStr,
        bd ? bd.lokasi ?? '' : '',
        bd ? formatMrNumbers(bd.mrNumbers, '') : '',
        bd ? bd.picMekanik ?? '' : '',
        bd ? bd.etr ?? '' : '',
        bd && bd.partStatus ? PART_STATUS_LABELS[bd.partStatus] : '',
        bd ? bd.partNote ?? '' : '',
        bd ? bd.keterangan : '',
        bd ? formatBdStatus(bd.status) : '',
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
    'DURASI PERBAIKAN',
    'POSISI / LOKASI BD',
    'NOMOR MR',
    'PIC MEKANIK',
    'KETERANGAN PROBLEM',
    'KOMPONEN',
    'SUB KOMPONEN',
    'DETAIL SUB KOMPONEN',
    'ACTIVITY PERBAIKAN',
    'STATUS TERAKHIR',
  ];

  const rows: string[] = [headers.map(escapeCsvCell).join(',')];
  history.forEach((h, idx) => {
    const durText = formatDurationId(
      calculateDurationMinutes(h.tanggalBd, h.jamBd, h.tanggalRfu, h.jamRfu)
    );
    rows.push(
      [
        idx + 1,
        h.unitCode,
        h.fleetGroup,
        h.tanggalBd,
        h.jamBd,
        h.tanggalRfu,
        h.jamRfu,
        durText,
        h.lokasi ?? '',
        formatMrNumbers(h.mrNumbers, ''),
        h.picMekanik ?? '',
        h.keterangan,
        h.komponen ?? '',
        h.subKomponen ?? '',
        h.detailSubKomponen ?? '',
        h.activityPerbaikan ?? '',
        formatBdStatus(h.lastStatus),
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
