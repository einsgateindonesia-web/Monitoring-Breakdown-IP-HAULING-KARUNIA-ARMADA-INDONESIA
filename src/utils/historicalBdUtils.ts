import { formatBdStatus } from '../data/initialUnits';
import {
  BdStatus,
  BreakdownRecord,
  FleetGroup,
  RfuHistoryRecord,
} from '../types/fleet';
import {
  calculateDurationMinutes,
  formatDurationId,
  formatMrNumbers,
  formatReadableDateId,
  getCurrentDateYYYYMMDD,
  normalizeMrList,
  parseDateTimeToMs,
} from './fleetUtils';

export const REPEAT_BD_THRESHOLD_HOURS = 72;
export const REPEAT_BD_THRESHOLD_MINUTES = REPEAT_BD_THRESHOLD_HOURS * 60;

export interface HistoricalEvent {
  id: string;
  source: 'ACTIVE_BD' | 'RFU_HISTORY';
  isActiveBd: boolean;
  unitCode: string;
  fleetGroup: FleetGroup;
  tanggalBd: string;
  jamBd: string;
  tanggalRfu: string | null;
  jamRfu: string | null;
  bdStartMs: number | null;
  rfuEndMs: number | null;
  durationMinutes: number | null;
  lokasi: string;
  mrNumbers: string[];
  keterangan: string;
  komponen: string;
  subKomponen: string;
  detailSubKomponen: string;
  activityPerbaikan: string;
  status: BdStatus;
  picMekanik: string;
  etr: string;
  // Repeat Breakdown (<= 72 hours after previous RFU of the same unit)
  isRepeatBd: boolean;
  repeatGapMinutes: number | null;
  isSameComponentRepeat: boolean;
  prevRfuKomponen: string;
  prevRfuTanggal: string;
  prevRfuJam: string;
}

export interface UnitHealthSummary {
  unitCode: string;
  fleetGroup: FleetGroup;
  totalEvents: number;
  activeBdCount: number;
  rfuCount: number;
  repeatBdCount: number;
  sameComponentRepeatCount: number;
  totalDowntimeMinutes: number;
  mttrMinutes: number | null;
  mtbfMinutes: number | null;
  topComponents: { name: string; count: number }[];
  mrList: string[];
  isCurrentlyBd: boolean;
  lastBdDate: string;
}

export function buildHistoricalTimeline(
  bdRecords: BreakdownRecord[],
  rfuHistory: RfuHistoryRecord[],
  nowMs: number = Date.now()
): HistoricalEvent[] {
  const combined: HistoricalEvent[] = [];

  for (const r of bdRecords) {
    const bdStartMs = parseDateTimeToMs(r.tanggalBd, r.jamBd);
    const durationMinutes = calculateDurationMinutes(
      r.tanggalBd,
      r.jamBd,
      undefined,
      undefined,
      nowMs
    );
    combined.push({
      id: `active:${r.id}`,
      source: 'ACTIVE_BD',
      isActiveBd: true,
      unitCode: r.unitCode.trim().toUpperCase(),
      fleetGroup: r.fleetGroup,
      tanggalBd: r.tanggalBd,
      jamBd: r.jamBd,
      tanggalRfu: null,
      jamRfu: null,
      bdStartMs,
      rfuEndMs: null,
      durationMinutes,
      lokasi: r.lokasi ?? '',
      mrNumbers: normalizeMrList(r.mrNumbers),
      keterangan: r.keterangan ?? '',
      komponen: '',
      subKomponen: '',
      detailSubKomponen: '',
      activityPerbaikan: '',
      status: r.status,
      picMekanik: r.picMekanik ?? '',
      etr: r.etr ?? '',
      isRepeatBd: false,
      repeatGapMinutes: null,
      isSameComponentRepeat: false,
      prevRfuKomponen: '',
      prevRfuTanggal: '',
      prevRfuJam: '',
    });
  }

  for (const h of rfuHistory) {
    const bdStartMs = parseDateTimeToMs(h.tanggalBd, h.jamBd);
    const rfuEndMs = parseDateTimeToMs(h.tanggalRfu, h.jamRfu);
    const durationMinutes = calculateDurationMinutes(
      h.tanggalBd,
      h.jamBd,
      h.tanggalRfu,
      h.jamRfu
    );
    combined.push({
      id: `rfu:${h.id}`,
      source: 'RFU_HISTORY',
      isActiveBd: false,
      unitCode: h.unitCode.trim().toUpperCase(),
      fleetGroup: h.fleetGroup,
      tanggalBd: h.tanggalBd,
      jamBd: h.jamBd,
      tanggalRfu: h.tanggalRfu,
      jamRfu: h.jamRfu,
      bdStartMs,
      rfuEndMs,
      durationMinutes,
      lokasi: h.lokasi ?? '',
      mrNumbers: normalizeMrList(h.mrNumbers),
      keterangan: h.keterangan ?? '',
      komponen: h.komponen ?? '',
      subKomponen: h.subKomponen ?? '',
      detailSubKomponen: h.detailSubKomponen ?? '',
      activityPerbaikan: h.activityPerbaikan ?? '',
      status: h.lastStatus,
      picMekanik: h.picMekanik ?? '',
      etr: '',
      isRepeatBd: false,
      repeatGapMinutes: null,
      isSameComponentRepeat: false,
      prevRfuKomponen: '',
      prevRfuTanggal: '',
      prevRfuJam: '',
    });
  }

  // Group by unitCode chronologically (oldest -> newest) to detect Repeat Breakdown <= 72h after RFU
  const byUnit = new Map<string, HistoricalEvent[]>();
  for (const ev of combined) {
    const bucket = byUnit.get(ev.unitCode) ?? [];
    bucket.push(ev);
    byUnit.set(ev.unitCode, bucket);
  }

  for (const unitEvents of byUnit.values()) {
    unitEvents.sort((a, b) => {
      const aStamp = a.bdStartMs ?? 0;
      const bStamp = b.bdStartMs ?? 0;
      if (aStamp !== bStamp) return aStamp - bStamp;
      // Completed RFU precedes active BD if identical timestamp
      if (a.isActiveBd !== b.isActiveBd) return a.isActiveBd ? 1 : -1;
      return a.id.localeCompare(b.id);
    });

    let lastCompletedEvent: HistoricalEvent | null = null;
    for (const curr of unitEvents) {
      if (
        lastCompletedEvent &&
        lastCompletedEvent.rfuEndMs !== null &&
        curr.bdStartMs !== null
      ) {
        const gapMs = curr.bdStartMs - lastCompletedEvent.rfuEndMs;
        if (gapMs >= 0) {
          const gapMinutes = Math.floor(gapMs / 60000);
          if (gapMinutes <= REPEAT_BD_THRESHOLD_MINUTES) {
            curr.isRepeatBd = true;
            curr.repeatGapMinutes = gapMinutes;
            curr.prevRfuKomponen = lastCompletedEvent.komponen;
            curr.prevRfuTanggal = lastCompletedEvent.tanggalRfu ?? '';
            curr.prevRfuJam = lastCompletedEvent.jamRfu ?? '';
            const prevComp = lastCompletedEvent.komponen.trim().toLowerCase();
            const currComp = curr.komponen.trim().toLowerCase();
            curr.isSameComponentRepeat = Boolean(prevComp && currComp && prevComp === currComp);
          }
        }
      }

      if (!curr.isActiveBd && curr.rfuEndMs !== null) {
        lastCompletedEvent = curr;
      }
    }
  }

  // Sort newest BD start first for table display
  return combined.sort((a, b) => {
    const aMs = a.bdStartMs ?? 0;
    const bMs = b.bdStartMs ?? 0;
    if (aMs !== bMs) return bMs - aMs;
    if (a.isActiveBd !== b.isActiveBd) return a.isActiveBd ? -1 : 1;
    return a.unitCode.localeCompare(b.unitCode);
  });
}

export function buildUnitHealthSummary(
  unitCode: string,
  events: HistoricalEvent[]
): UnitHealthSummary | null {
  const unitEvents = events.filter(
    (e) => e.unitCode === unitCode.trim().toUpperCase()
  );
  if (unitEvents.length === 0) return null;

  const chrono = [...unitEvents].sort(
    (a, b) => (a.bdStartMs ?? 0) - (b.bdStartMs ?? 0)
  );
  const first = chrono[0];
  const latest = chrono[chrono.length - 1];

  let activeBdCount = 0;
  let rfuCount = 0;
  let repeatBdCount = 0;
  let sameComponentRepeatCount = 0;
  let totalDowntimeMinutes = 0;
  let rfuDurationSum = 0;
  let rfuDurationCount = 0;

  const compCounts = new Map<string, number>();
  const mrSet = new Set<string>();

  for (const ev of chrono) {
    if (ev.isActiveBd) activeBdCount += 1;
    else rfuCount += 1;

    if (ev.isRepeatBd) repeatBdCount += 1;
    if (ev.isSameComponentRepeat) sameComponentRepeatCount += 1;

    if (ev.durationMinutes !== null) {
      totalDowntimeMinutes += ev.durationMinutes;
      if (!ev.isActiveBd) {
        rfuDurationSum += ev.durationMinutes;
        rfuDurationCount += 1;
      }
    }

    const comp = ev.komponen.trim();
    if (comp) {
      compCounts.set(comp, (compCounts.get(comp) ?? 0) + 1);
    }
    for (const mr of ev.mrNumbers) {
      mrSet.add(mr);
    }
  }

  // MTBF: average minutes between consecutive BD starts (or RFU -> next BD)
  let mtbfGapSum = 0;
  let mtbfGapCount = 0;
  for (let i = 1; i < chrono.length; i++) {
    const prev = chrono[i - 1];
    const curr = chrono[i];
    const anchorMs = prev.rfuEndMs ?? prev.bdStartMs;
    if (anchorMs !== null && curr.bdStartMs !== null && curr.bdStartMs >= anchorMs) {
      mtbfGapSum += Math.floor((curr.bdStartMs - anchorMs) / 60000);
      mtbfGapCount += 1;
    }
  }

  const topComponents = Array.from(compCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    unitCode: first.unitCode,
    fleetGroup: first.fleetGroup,
    totalEvents: chrono.length,
    activeBdCount,
    rfuCount,
    repeatBdCount,
    sameComponentRepeatCount,
    totalDowntimeMinutes,
    mttrMinutes: rfuDurationCount > 0 ? Math.round(rfuDurationSum / rfuDurationCount) : null,
    mtbfMinutes: mtbfGapCount > 0 ? Math.round(mtbfGapSum / mtbfGapCount) : null,
    topComponents,
    mrList: Array.from(mrSet),
    isCurrentlyBd: activeBdCount > 0,
    lastBdDate: latest.tanggalBd,
  };
}

export function buildAllUnitSummaries(events: HistoricalEvent[]): UnitHealthSummary[] {
  const codes = Array.from(new Set(events.map((e) => e.unitCode)));
  const summaries: UnitHealthSummary[] = [];
  for (const code of codes) {
    const s = buildUnitHealthSummary(code, events);
    if (s) summaries.push(s);
  }
  return summaries.sort((a, b) => {
    if (b.repeatBdCount !== a.repeatBdCount) return b.repeatBdCount - a.repeatBdCount;
    if (b.totalEvents !== a.totalEvents) return b.totalEvents - a.totalEvents;
    return b.totalDowntimeMinutes - a.totalDowntimeMinutes;
  });
}

function escapeCsvCell(val: string | number): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportHistoricalBdCsv(
  events: HistoricalEvent[],
  fileSuffix = 'semua'
): void {
  const headers = [
    'NO',
    'UNIT',
    'GRUP',
    'KONDISI',
    'REPEAT BD <= 72 JAM',
    'JEDA PASCA RFU',
    'TANGGAL BD',
    'JAM BD',
    'TANGGAL RFU',
    'JAM RFU',
    'DURASI DOWNTIME',
    'POSISI / LOKASI',
    'NOMOR MR',
    'PIC MEKANIK',
    'KETERANGAN PROBLEM',
    'KOMPONEN',
    'SUB KOMPONEN',
    'DETAIL SUB KOMPONEN',
    'ACTIVITY PERBAIKAN',
    'STATUS',
  ];

  const rows: string[] = [headers.map(escapeCsvCell).join(',')];

  events.forEach((ev, idx) => {
    rows.push(
      [
        idx + 1,
        ev.unitCode,
        ev.fleetGroup,
        ev.isActiveBd ? 'MASIH BD' : 'SELESAI RFU',
        ev.isRepeatBd
          ? ev.isSameComponentRepeat
            ? 'YA (KOMPONEN SAMA)'
            : 'YA'
          : 'TIDAK',
        ev.isRepeatBd && ev.repeatGapMinutes !== null
          ? formatDurationId(ev.repeatGapMinutes)
          : '',
        formatReadableDateId(ev.tanggalBd),
        ev.jamBd,
        ev.tanggalRfu ? formatReadableDateId(ev.tanggalRfu) : 'Masih BD',
        ev.jamRfu ?? '',
        formatDurationId(ev.durationMinutes),
        ev.lokasi,
        formatMrNumbers(ev.mrNumbers, ''),
        ev.picMekanik,
        ev.keterangan,
        ev.komponen,
        ev.subKomponen,
        ev.detailSubKomponen,
        ev.activityPerbaikan,
        formatBdStatus(ev.status),
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
  const safeSuffix = fileSuffix.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  a.download = `historical-breakdown-${safeSuffix}-${getCurrentDateYYYYMMDD()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
