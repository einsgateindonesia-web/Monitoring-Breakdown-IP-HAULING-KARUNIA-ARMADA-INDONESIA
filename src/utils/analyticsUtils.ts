import {
  BreakdownRecord,
  FleetGroup,
  HourlySlotOverride,
  RfuHistoryRecord,
} from '../types/fleet';
import {
  calculateDurationMinutes,
  formatReadableDateId,
  getCurrentDateYYYYMMDD,
  parseDateTimeToMs,
} from './fleetUtils';

export type AnalyticsPeriod = '7D' | '30D' | 'ALL';

export interface BadActorItem {
  unitCode: string;
  fleetGroup: FleetGroup;
  bdCount: number;
  activeCount: number;
  totalMinutes: number;
  avgMinutes: number;
}

export interface ParetoComponentItem {
  komponen: string;
  count: number;
  sharePct: number;
  cumulativePct: number;
  totalMinutes: number;
}

export interface DailyPaTrendPoint {
  date: string; // YYYY-MM-DD
  shortLabel: string; // DD/MM
  paPct: number;
  bdEventsCount: number;
  downtimeHours: number;
  source: 'hourly_manual' | 'estimated';
}

export interface FleetAnalyticsSummary {
  periodEventCount: number;
  rfuCountInPeriod: number;
  uncategorizedRfuCount: number;
  mttrMinutes: number | null;
  activeAvgAgingMinutes: number | null;
  totalDowntimeMinutes: number;
  badActors: BadActorItem[];
  paretoComponents: ParetoComponentItem[];
  dailyTrend: DailyPaTrendPoint[];
  avgPeriodPaPct: number | null;
}

function addDays(yyyyMmDd: string, deltaDays: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function computeFleetAnalytics(params: {
  period: AnalyticsPeriod;
  bdRecords: BreakdownRecord[];
  rfuHistory: RfuHistoryRecord[];
  hourlyOverrides: Record<string, HourlySlotOverride>;
  totalFleetCount: number;
  nowMs?: number;
}): FleetAnalyticsSummary {
  const {
    period,
    bdRecords,
    rfuHistory,
    hourlyOverrides,
    totalFleetCount,
    nowMs = Date.now(),
  } = params;

  const today = getCurrentDateYYYYMMDD();
  const cutoffDate =
    period === '7D'
      ? addDays(today, -6)
      : period === '30D'
      ? addDays(today, -29)
      : null;

  const filteredRfu = cutoffDate
    ? rfuHistory.filter((item) => {
        const refDate = item.tanggalRfu || item.tanggalBd;
        return refDate >= cutoffDate;
      })
    : rfuHistory;

  // 1. MTTR & Total Downtime from RFU records
  const validRfuDurations: number[] = [];
  let totalDowntimeMinutes = 0;

  for (const rfu of filteredRfu) {
    const mins = calculateDurationMinutes(
      rfu.tanggalBd,
      rfu.jamBd,
      rfu.tanggalRfu,
      rfu.jamRfu
    );
    if (mins !== null && mins >= 0 && mins <= 60 * 24 * 60) {
      validRfuDurations.push(mins);
      totalDowntimeMinutes += mins;
    }
  }

  // Active BD aging
  const activeDurations: number[] = [];
  for (const bd of bdRecords) {
    const mins = calculateDurationMinutes(bd.tanggalBd, bd.jamBd, undefined, undefined, nowMs);
    if (mins !== null && mins >= 0 && mins <= 60 * 24 * 60) {
      activeDurations.push(mins);
      totalDowntimeMinutes += mins;
    }
  }

  const mttrMinutes =
    validRfuDurations.length > 0
      ? Math.round(
          validRfuDurations.reduce((sum, v) => sum + v, 0) / validRfuDurations.length
        )
      : null;

  const activeAvgAgingMinutes =
    activeDurations.length > 0
      ? Math.round(activeDurations.reduce((sum, v) => sum + v, 0) / activeDurations.length)
      : null;

  // 2. Top 5 Bad Actor Units (combining RFU in period + active BD)
  const unitMap = new Map<string, BadActorItem>();
  for (const rfu of filteredRfu) {
    const code = rfu.unitCode.trim().toUpperCase();
    if (!code) continue;
    const mins =
      calculateDurationMinutes(rfu.tanggalBd, rfu.jamBd, rfu.tanggalRfu, rfu.jamRfu) ?? 0;
    const safeMins = mins >= 0 && mins <= 60 * 24 * 60 ? mins : 0;
    const existing = unitMap.get(code) ?? {
      unitCode: code,
      fleetGroup: rfu.fleetGroup,
      bdCount: 0,
      activeCount: 0,
      totalMinutes: 0,
      avgMinutes: 0,
    };
    existing.bdCount += 1;
    existing.totalMinutes += safeMins;
    unitMap.set(code, existing);
  }

  for (const bd of bdRecords) {
    const code = bd.unitCode.trim().toUpperCase();
    if (!code) continue;
    const mins =
      calculateDurationMinutes(bd.tanggalBd, bd.jamBd, undefined, undefined, nowMs) ?? 0;
    const safeMins = mins >= 0 && mins <= 60 * 24 * 60 ? mins : 0;
    const existing = unitMap.get(code) ?? {
      unitCode: code,
      fleetGroup: bd.fleetGroup,
      bdCount: 0,
      activeCount: 0,
      totalMinutes: 0,
      avgMinutes: 0,
    };
    existing.bdCount += 1;
    existing.activeCount += 1;
    existing.totalMinutes += safeMins;
    unitMap.set(code, existing);
  }

  const badActors = Array.from(unitMap.values())
    .map((item) => ({
      ...item,
      avgMinutes: item.bdCount > 0 ? Math.round(item.totalMinutes / item.bdCount) : 0,
    }))
    .sort((a, b) => {
      if (b.bdCount !== a.bdCount) return b.bdCount - a.bdCount;
      return b.totalMinutes - a.totalMinutes;
    })
    .slice(0, 5);

  // 3. Top 5 Pareto Komponen Bermasalah (from RFU history in period)
  const compMap = new Map<string, { count: number; totalMinutes: number }>();
  let categorizedCount = 0;
  let uncategorizedRfuCount = 0;

  for (const rfu of filteredRfu) {
    const comp = (rfu.komponen ?? '').trim();
    if (!comp) {
      uncategorizedRfuCount += 1;
      continue;
    }
    categorizedCount += 1;
    const mins =
      calculateDurationMinutes(rfu.tanggalBd, rfu.jamBd, rfu.tanggalRfu, rfu.jamRfu) ?? 0;
    const safeMins = mins >= 0 && mins <= 60 * 24 * 60 ? mins : 0;
    const entry = compMap.get(comp) ?? { count: 0, totalMinutes: 0 };
    entry.count += 1;
    entry.totalMinutes += safeMins;
    compMap.set(comp, entry);
  }

  let runningShare = 0;
  const paretoComponents: ParetoComponentItem[] = Array.from(compMap.entries())
    .map(([komponen, val]) => ({
      komponen,
      count: val.count,
      totalMinutes: val.totalMinutes,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.totalMinutes - a.totalMinutes;
    })
    .slice(0, 5)
    .map((item) => {
      const sharePct = categorizedCount > 0 ? (item.count / categorizedCount) * 100 : 0;
      runningShare += sharePct;
      return {
        komponen: item.komponen,
        count: item.count,
        sharePct,
        cumulativePct: Math.min(100, runningShare),
        totalMinutes: item.totalMinutes,
      };
    });

  // 4. Daily PA Trend
  // Determine dates array: 7D -> last 7 days, 30D -> last 14 days (clean chart) or 30 days, ALL -> last 14 days or earliest date up to 30 days
  let trendDaysCount = 7;
  if (period === '30D') trendDaysCount = 14;
  if (period === 'ALL') {
    const allDates = [
      ...filteredRfu.map((r) => r.tanggalBd),
      ...bdRecords.map((b) => b.tanggalBd),
      ...Object.values(hourlyOverrides).map((o) => o.shiftDate),
    ].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (allDates.length > 0) {
      const minDate = allDates.sort()[0];
      const minMs = parseDateTimeToMs(minDate, '00:00');
      const todayMs = parseDateTimeToMs(today, '00:00');
      if (minMs !== null && todayMs !== null) {
        const span = Math.floor((todayMs - minMs) / (24 * 3600 * 1000)) + 1;
        trendDaysCount = Math.min(30, Math.max(7, span));
      }
    }
  }

  const overridesByDate = new Map<string, HourlySlotOverride[]>();
  for (const ov of Object.values(hourlyOverrides)) {
    if (!ov.shiftDate) continue;
    const list = overridesByDate.get(ov.shiftDate) ?? [];
    list.push(ov);
    overridesByDate.set(ov.shiftDate, list);
  }

  const dailyTrend: DailyPaTrendPoint[] = [];
  const safeFleet = Math.max(1, totalFleetCount);

  for (let offset = trendDaysCount - 1; offset >= 0; offset--) {
    const dateStr = addDays(today, -offset);
    const dayStartMs = parseDateTimeToMs(dateStr, '00:00') ?? nowMs;
    const dayEndMs = Math.min(nowMs, dayStartMs + 24 * 3600 * 1000);
    const elapsedDayHours = Math.max(1, (dayEndMs - dayStartMs) / (3600 * 1000));

    let bdEventsCount = 0;
    let downtimeMs = 0;

    for (const rfu of rfuHistory) {
      const sMs = parseDateTimeToMs(rfu.tanggalBd, rfu.jamBd);
      const eMs = parseDateTimeToMs(rfu.tanggalRfu, rfu.jamRfu);
      if (sMs === null || eMs === null) continue;
      if (rfu.tanggalBd === dateStr) bdEventsCount += 1;
      const overlapStart = Math.max(dayStartMs, sMs);
      const overlapEnd = Math.min(dayEndMs, eMs);
      if (overlapEnd > overlapStart) {
        downtimeMs += overlapEnd - overlapStart;
      }
    }

    for (const bd of bdRecords) {
      const sMs = parseDateTimeToMs(bd.tanggalBd, bd.jamBd);
      if (sMs === null) continue;
      if (bd.tanggalBd === dateStr) bdEventsCount += 1;
      const overlapStart = Math.max(dayStartMs, sMs);
      const overlapEnd = dayEndMs;
      if (overlapEnd > overlapStart) {
        downtimeMs += overlapEnd - overlapStart;
      }
    }

    const downtimeHours = downtimeMs / (3600 * 1000);
    const dayOverrides = overridesByDate.get(dateStr) ?? [];

    let paPct: number;
    let source: DailyPaTrendPoint['source'] = 'estimated';

    if (dayOverrides.length > 0) {
      const sumPa = dayOverrides.reduce((acc, ov) => {
        const pop = Math.max(1, ov.totalPopulasi);
        const run = Math.max(0, pop - Math.min(pop, ov.bdCount));
        return acc + (run / pop) * 100;
      }, 0);
      paPct = sumPa / dayOverrides.length;
      source = 'hourly_manual';
    } else {
      const maxFleetHours = safeFleet * elapsedDayHours;
      paPct = Math.max(0, Math.min(100, ((maxFleetHours - downtimeHours) / maxFleetHours) * 100));
    }

    dailyTrend.push({
      date: dateStr,
      shortLabel: formatReadableDateId(dateStr).slice(0, 5),
      paPct,
      bdEventsCount,
      downtimeHours,
      source,
    });
  }

  const avgPeriodPaPct =
    dailyTrend.length > 0
      ? dailyTrend.reduce((acc, d) => acc + d.paPct, 0) / dailyTrend.length
      : null;

  return {
    periodEventCount: filteredRfu.length + bdRecords.length,
    rfuCountInPeriod: filteredRfu.length,
    uncategorizedRfuCount,
    mttrMinutes,
    activeAvgAgingMinutes,
    totalDowntimeMinutes,
    badActors,
    paretoComponents,
    dailyTrend,
    avgPeriodPaPct,
  };
}
