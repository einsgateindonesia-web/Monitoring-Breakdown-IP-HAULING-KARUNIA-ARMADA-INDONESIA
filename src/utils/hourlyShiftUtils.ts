import {
  BreakdownRecord,
  HourlyMonitoringRow,
  HourlySlotOverride,
  RfuHistoryRecord,
} from '../types/fleet';
import { formatReadableDateId, getCurrentDateYYYYMMDD } from './fleetUtils';

function parseDateTimeMs(dateStr: string, timeStr: string): number | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0).getTime();
}

function addDaysYYYYMMDD(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function getCurrentOperationalShiftDate(): string {
  const now = new Date();
  const today = getCurrentDateYYYYMMDD();
  if (now.getHours() < 6) {
    return addDaysYYYYMMDD(today, -1);
  }
  return today;
}

export function buildHourlyShiftRows(params: {
  shiftDate: string;
  totalPopulasi: number;
  bdRecords: BreakdownRecord[];
  rfuHistory: RfuHistoryRecord[];
  overrides: Record<string, HourlySlotOverride>;
  nowMs?: number;
}): HourlyMonitoringRow[] {
  const { shiftDate, totalPopulasi, bdRecords, rfuHistory, overrides, nowMs = Date.now() } = params;

  const [y, m, d] = shiftDate.split('-').map(Number);
  const shiftStartMs = new Date(y, m - 1, d, 6, 0, 0, 0).getTime();

  const rows: HourlyMonitoringRow[] = [];

  for (let slotIndex = 0; slotIndex <= 24; slotIndex++) {
    const slotStartMs = shiftStartMs + slotIndex * 3600 * 1000;
    // Slot 24 represents the exact 06:00 closing checkpoint of Shift 2
    const slotWindowEndMs =
      slotIndex === 24 ? slotStartMs : slotStartMs + 59 * 60 * 1000 + 59 * 1000;

    const slotDateObj = new Date(slotStartMs);
    const hh = String(slotDateObj.getHours()).padStart(2, '0');
    const hourLabel = `${hh}:00`;
    const calendarDate = `${slotDateObj.getFullYear()}-${String(slotDateObj.getMonth() + 1).padStart(2, '0')}-${String(slotDateObj.getDate()).padStart(2, '0')}`;

    const shiftLabel: HourlyMonitoringRow['shiftLabel'] =
      slotIndex < 12 ? 'Shift 1' : slotIndex < 24 ? 'Shift 2' : 'Akhir Shift 2';

    const isElapsed = nowMs >= slotStartMs;
    const isCurrentHour =
      slotIndex < 24
        ? nowMs >= slotStartMs && nowMs < slotStartMs + 3600 * 1000
        : nowMs >= slotStartMs && nowMs < slotStartMs + 3600 * 1000;

    const key = `${shiftDate}__${slotIndex}`;
    const manualOverride = overrides[key];

    // Determine active BD units during this hourly window
    const bdUnitCodesSet = new Set<string>();
    const effectiveEndMs = Math.min(nowMs, slotWindowEndMs);

    if (isElapsed) {
      for (const rec of bdRecords) {
        const bdStartMs = parseDateTimeMs(rec.tanggalBd, rec.jamBd);
        if (bdStartMs !== null && bdStartMs <= effectiveEndMs) {
          bdUnitCodesSet.add(rec.unitCode);
        }
      }

      for (const hist of rfuHistory) {
        const bdStartMs = parseDateTimeMs(hist.tanggalBd, hist.jamBd);
        const rfuMs = parseDateTimeMs(hist.tanggalRfu, hist.jamRfu);
        if (
          bdStartMs !== null &&
          rfuMs !== null &&
          bdStartMs <= effectiveEndMs &&
          rfuMs > slotStartMs
        ) {
          bdUnitCodesSet.add(hist.unitCode);
        }
      }
    }

    const bdUnitCodes = Array.from(bdUnitCodesSet);

    if (manualOverride) {
      const pop = Math.max(0, manualOverride.totalPopulasi);
      const bd = Math.min(pop, Math.max(0, manualOverride.bdCount));
      const running = Math.max(0, pop - bd);
      const paPct = pop > 0 ? (running / pop) * 100 : 0;

      rows.push({
        key,
        slotIndex,
        hourLabel,
        calendarDate,
        shiftLabel,
        isElapsed: true,
        isCurrentHour,
        isManual: true,
        totalPopulasi: pop,
        runningCount: running,
        bdCount: bd,
        paPct,
        bdUnitCodes,
      });
    } else {
      const pop = Math.max(0, totalPopulasi);
      const bd = isElapsed ? Math.min(pop, bdUnitCodes.length) : 0;
      const running = isElapsed ? Math.max(0, pop - bd) : 0;
      const paPct = isElapsed && pop > 0 ? (running / pop) * 100 : 0;

      rows.push({
        key,
        slotIndex,
        hourLabel,
        calendarDate,
        shiftLabel,
        isElapsed,
        isCurrentHour,
        isManual: false,
        totalPopulasi: pop,
        runningCount: running,
        bdCount: bd,
        paPct,
        bdUnitCodes,
      });
    }
  }

  return rows;
}

export function buildHourlyWhatsappReport(
  shiftDate: string,
  rows: HourlyMonitoringRow[]
): string {
  const nextDate = addDaysYYYYMMDD(shiftDate, 1);
  const activeRows = rows.filter((r) => r.isElapsed || r.isManual);
  const shift1Rows = activeRows.filter((r) => r.slotIndex < 12);
  const shift2Rows = activeRows.filter((r) => r.slotIndex >= 12);

  const avgPa = (list: HourlyMonitoringRow[]) =>
    list.length > 0
      ? (list.reduce((acc, r) => acc + r.paPct, 0) / list.length).toFixed(1)
      : '-';

  const lines: string[] = [
    `*MONITORING PA, POPULASI & BD PER JAM*`,
    `Periode Shift: ${formatReadableDateId(shiftDate)} (06:00) s/d ${formatReadableDateId(nextDate)} (06:00)`,
    `Rata-rata PA Shift 1: ${avgPa(shift1Rows)}% | Shift 2: ${avgPa(shift2Rows)}% | Gabungan: ${avgPa(activeRows)}%`,
    ``,
    `JAM | SHIFT | POP | RUN | BD | PA%`,
  ];

  rows.forEach((r) => {
    if (!r.isElapsed && !r.isManual) {
      lines.push(`${r.hourLabel} | ${r.shiftLabel} | - | - | - | -`);
    } else {
      lines.push(
        `${r.hourLabel} | ${r.shiftLabel} | ${r.totalPopulasi} | ${r.runningCount} | ${r.bdCount} | ${r.paPct.toFixed(1)}%`
      );
    }
  });

  return lines.join('\n');
}

export function exportHourlyMonitoringCsv(
  shiftDate: string,
  rows: HourlyMonitoringRow[]
): void {
  const headers = [
    'TANGGAL',
    'JAM',
    'SHIFT',
    'TOTAL POPULASI',
    'UNIT RUNNING',
    'TOTAL BD',
    'PA (%)',
    'UNIT BD TERCATAT',
    'SUMBER DATA',
  ];

  const escapeCsv = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvRows = [headers.map(escapeCsv).join(',')];

  rows.forEach((r) => {
    const active = r.isElapsed || r.isManual;
    csvRows.push(
      [
        r.calendarDate,
        r.hourLabel,
        r.shiftLabel,
        active ? r.totalPopulasi : '',
        active ? r.runningCount : '',
        active ? r.bdCount : '',
        active ? `${r.paPct.toFixed(1)}%` : '',
        r.bdUnitCodes.join('; '),
        r.isManual ? 'Manual' : active ? 'Otomatis' : 'Menunggu',
      ]
        .map(escapeCsv)
        .join(',')
    );
  });

  const csvContent = '\uFEFF' + csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `monitoring-pa-perjam-${shiftDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
