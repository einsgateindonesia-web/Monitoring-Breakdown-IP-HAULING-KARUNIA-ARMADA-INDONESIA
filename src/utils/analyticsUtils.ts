import {
  BdStatus,
  BreakdownRecord,
  FleetGroup,
  HourlySlotOverride,
  RfuHistoryRecord,
} from '../types/fleet';
import {
  calculateDurationMinutes,
  computeBdTimeSplit,
  computeEtrStatus,
  computeRfuTimeSplit,
  formatReadableDateId,
  getCurrentDateYYYYMMDD,
  parseDateTimeToMs,
} from './fleetUtils';
import { buildHistoricalTimeline } from './historicalBdUtils';

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

export interface OverdueEtrItem {
  unitCode: string;
  fleetGroup: FleetGroup;
  status: BdStatus;
  jamBd: string;
  etr: string;
  overdueMinutes: number;
  picMekanik: string;
}

export interface AgingBucketItem {
  id: 'LT6' | 'H6_24' | 'H24_72' | 'GT72';
  label: string;
  count: number;
  pct: number;
  units: string[];
}

export interface WaitingPartUnitItem {
  unitCode: string;
  fleetGroup: FleetGroup;
  partName: string;
  waitingMinutes: number;
  totalMinutes: number;
  isWaitingNow: boolean;
}

export interface ShiftPerformanceSummary {
  shift1BdIn: number;
  shift1RfuOut: number;
  shift1MttrMinutes: number | null;
  shift2BdIn: number;
  shift2RfuOut: number;
  shift2MttrMinutes: number | null;
}

export interface RepeatBdDashboardSummary {
  repeatCount: number;
  sameComponentRepeatCount: number;
  repeatRatePct: number;
  topRepeatUnits: Array<{
    unitCode: string;
    fleetGroup: FleetGroup;
    repeatCount: number;
    latestGapMinutes: number | null;
    isActiveNow: boolean;
  }>;
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

  // Tahap 1 + Waiting Part vs Active Repair Intelligence
  totalActiveRepairMinutes: number;
  totalWaitingPartMinutes: number;
  activeWaitingPartCount: number;
  b1EventsCount: number;
  b1DowntimeMinutes: number;
  topWaitingPartUnits: WaitingPartUnitItem[];

  scheduledCount: number;
  scheduledMinutes: number;
  unscheduledCount: number;
  unscheduledMinutes: number;

  activeWithEtrCount: number;
  overdueEtrUnits: OverdueEtrItem[];
  rfuWithEtrCount: number;
  rfuOnTimeEtrCount: number;
  etrAccuracyPct: number | null;

  agingBuckets: AgingBucketItem[];
  shiftPerformance: ShiftPerformanceSummary;
  repeatSummary: RepeatBdDashboardSummary;
}

function addDays(yyyyMmDd: string, deltaDays: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function getShiftFromHHMM(hhmm?: string): 1 | 2 {
  const parts = (hhmm ?? '00:00').trim().split(':').map(Number);
  const hh = Number.isFinite(parts[0]) ? parts[0] : 0;
  // Shift 1: 06:00 - 17:59, Shift 2: 18:00 - 05:59
  return hh >= 6 && hh < 18 ? 1 : 2;
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

  // 1. MTTR, Total Downtime, Active Repair vs Waiting Part, Scheduled (BS) vs Unscheduled, Shift Comparison
  const validRfuDurations: number[] = [];
  let totalDowntimeMinutes = 0;
  let totalWaitingPartMinutes = 0;
  let totalActiveRepairMinutes = 0;
  let activeWaitingPartCount = 0;
  let b1EventsCount = 0;
  let b1DowntimeMinutes = 0;

  let scheduledCount = 0;
  let scheduledMinutes = 0;
  let unscheduledCount = 0;
  let unscheduledMinutes = 0;

  let rfuWithEtrCount = 0;
  let rfuOnTimeEtrCount = 0;

  let shift1BdIn = 0;
  let shift1RfuOut = 0;
  const shift1RepairMins: number[] = [];
  let shift2BdIn = 0;
  let shift2RfuOut = 0;
  const shift2RepairMins: number[] = [];

  const waitingUnitMap = new Map<string, WaitingPartUnitItem>();

  for (const rfu of filteredRfu) {
    const split = computeRfuTimeSplit(rfu);
    if (split.totalMinutes > 0 || (rfu.tanggalBd && rfu.tanggalRfu)) {
      validRfuDurations.push(split.totalMinutes);
      totalDowntimeMinutes += split.totalMinutes;
      totalWaitingPartMinutes += split.waitingPartMinutes;
      totalActiveRepairMinutes += split.activeRepairMinutes;
    }

    if (rfu.lastStatus === 'BS') {
      scheduledCount += 1;
      scheduledMinutes += split.totalMinutes;
    } else {
      unscheduledCount += 1;
      unscheduledMinutes += split.totalMinutes;
    }

    if (rfu.lastStatus === 'B1') {
      b1EventsCount += 1;
      b1DowntimeMinutes += split.totalMinutes;
    }

    if (split.waitingPartMinutes > 0) {
      const code = rfu.unitCode.trim().toUpperCase();
      const prev = waitingUnitMap.get(code) ?? {
        unitCode: code,
        fleetGroup: rfu.fleetGroup,
        partName: rfu.partName?.trim() || '',
        waitingMinutes: 0,
        totalMinutes: 0,
        isWaitingNow: false,
      };
      prev.waitingMinutes += split.waitingPartMinutes;
      prev.totalMinutes += split.totalMinutes;
      if (!prev.partName && rfu.partName?.trim()) prev.partName = rfu.partName.trim();
      waitingUnitMap.set(code, prev);
    }

    if (rfu.etr?.trim()) {
      const rfuMs = parseDateTimeToMs(rfu.tanggalRfu, rfu.jamRfu);
      if (rfuMs !== null) {
        const etrEval = computeEtrStatus(rfu.tanggalBd, rfu.jamBd, rfu.etr, rfuMs);
        if (etrEval) {
          rfuWithEtrCount += 1;
          if (!etrEval.isOverdue) {
            rfuOnTimeEtrCount += 1;
          }
        }
      }
    }

    const bdShift = getShiftFromHHMM(rfu.jamBd);
    if (!cutoffDate || rfu.tanggalBd >= cutoffDate) {
      if (bdShift === 1) shift1BdIn += 1;
      else shift2BdIn += 1;
    }
    const rfuShift = getShiftFromHHMM(rfu.jamRfu);
    if (rfuShift === 1) {
      shift1RfuOut += 1;
      shift1RepairMins.push(split.totalMinutes);
    } else {
      shift2RfuOut += 1;
      shift2RepairMins.push(split.totalMinutes);
    }
  }

  // Active BD aging, ETR overdue, Aging Buckets & active waiting part
  const activeDurations: number[] = [];
  let activeWithEtrCount = 0;
  const overdueEtrUnits: OverdueEtrItem[] = [];

  const lt6Units: string[] = [];
  const h6_24Units: string[] = [];
  const h24_72Units: string[] = [];
  const gt72Units: string[] = [];

  for (const bd of bdRecords) {
    const split = computeBdTimeSplit(bd, nowMs);
    activeDurations.push(split.totalMinutes);
    totalDowntimeMinutes += split.totalMinutes;
    totalWaitingPartMinutes += split.waitingPartMinutes;
    totalActiveRepairMinutes += split.activeRepairMinutes;

    if (split.isWaitingNow) {
      activeWaitingPartCount += 1;
    }

    if (bd.status === 'BS') {
      scheduledCount += 1;
      scheduledMinutes += split.totalMinutes;
    } else {
      unscheduledCount += 1;
      unscheduledMinutes += split.totalMinutes;
    }

    if (bd.status === 'B1') {
      b1EventsCount += 1;
      b1DowntimeMinutes += split.totalMinutes;
    }

    if (split.waitingPartMinutes > 0 || split.isWaitingNow) {
      const code = bd.unitCode.trim().toUpperCase();
      const prev = waitingUnitMap.get(code) ?? {
        unitCode: code,
        fleetGroup: bd.fleetGroup,
        partName: bd.partName?.trim() || '',
        waitingMinutes: 0,
        totalMinutes: 0,
        isWaitingNow: false,
      };
      prev.waitingMinutes += split.waitingPartMinutes;
      prev.totalMinutes += split.totalMinutes;
      prev.isWaitingNow = prev.isWaitingNow || split.isWaitingNow;
      if (bd.partName?.trim()) prev.partName = bd.partName.trim();
      waitingUnitMap.set(code, prev);
    }

    // Overdue ETR check
    if (bd.etr?.trim()) {
      const etrEval = computeEtrStatus(bd.tanggalBd, bd.jamBd, bd.etr, nowMs);
      if (etrEval) {
        activeWithEtrCount += 1;
        if (etrEval.isOverdue) {
          overdueEtrUnits.push({
            unitCode: bd.unitCode,
            fleetGroup: bd.fleetGroup,
            status: bd.status,
            jamBd: bd.jamBd,
            etr: bd.etr.trim(),
            overdueMinutes: etrEval.deltaMinutes,
            picMekanik: bd.picMekanik?.trim() || '',
          });
        }
      }
    }

    // Aging bucket classification
    if (split.totalMinutes < 6 * 60) {
      lt6Units.push(bd.unitCode);
    } else if (split.totalMinutes < 24 * 60) {
      h6_24Units.push(bd.unitCode);
    } else if (split.totalMinutes <= 72 * 60) {
      h24_72Units.push(bd.unitCode);
    } else {
      gt72Units.push(bd.unitCode);
    }

    if (!cutoffDate || bd.tanggalBd >= cutoffDate) {
      const bdShift = getShiftFromHHMM(bd.jamBd);
      if (bdShift === 1) shift1BdIn += 1;
      else shift2BdIn += 1;
    }
  }

  overdueEtrUnits.sort((a, b) => b.overdueMinutes - a.overdueMinutes);

  const totalActiveCount = Math.max(1, bdRecords.length);
  const agingBuckets: AgingBucketItem[] = [
    {
      id: 'LT6',
      label: '< 6 Jam (Quick)',
      count: lt6Units.length,
      pct: bdRecords.length > 0 ? (lt6Units.length / totalActiveCount) * 100 : 0,
      units: lt6Units,
    },
    {
      id: 'H6_24',
      label: '6 – 24 Jam',
      count: h6_24Units.length,
      pct: bdRecords.length > 0 ? (h6_24Units.length / totalActiveCount) * 100 : 0,
      units: h6_24Units,
    },
    {
      id: 'H24_72',
      label: '24 – 72 Jam',
      count: h24_72Units.length,
      pct: bdRecords.length > 0 ? (h24_72Units.length / totalActiveCount) * 100 : 0,
      units: h24_72Units,
    },
    {
      id: 'GT72',
      label: '> 72 Jam (Long BD)',
      count: gt72Units.length,
      pct: bdRecords.length > 0 ? (gt72Units.length / totalActiveCount) * 100 : 0,
      units: gt72Units,
    },
  ];

  const topWaitingPartUnits = Array.from(waitingUnitMap.values())
    .sort((a, b) => {
      if (b.waitingMinutes !== a.waitingMinutes) return b.waitingMinutes - a.waitingMinutes;
      return Number(b.isWaitingNow) - Number(a.isWaitingNow);
    })
    .slice(0, 5);

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

  const etrAccuracyPct =
    rfuWithEtrCount > 0 ? (rfuOnTimeEtrCount / rfuWithEtrCount) * 100 : null;

  const shiftPerformance: ShiftPerformanceSummary = {
    shift1BdIn,
    shift1RfuOut,
    shift1MttrMinutes:
      shift1RepairMins.length > 0
        ? Math.round(shift1RepairMins.reduce((s, v) => s + v, 0) / shift1RepairMins.length)
        : null,
    shift2BdIn,
    shift2RfuOut,
    shift2MttrMinutes:
      shift2RepairMins.length > 0
        ? Math.round(shift2RepairMins.reduce((s, v) => s + v, 0) / shift2RepairMins.length)
        : null,
  };

  // Repeat BD (<= 72 Jam) Summary in Period
  const timeline = buildHistoricalTimeline(bdRecords, rfuHistory, nowMs);
  const periodTimeline = cutoffDate
    ? timeline.filter(
        (ev) =>
          ev.isActiveBd ||
          ev.tanggalBd >= cutoffDate ||
          (ev.tanggalRfu ?? ev.tanggalBd) >= cutoffDate
      )
    : timeline;
  const repeatEvents = periodTimeline.filter((ev) => ev.isRepeatBd);
  const sameComponentRepeatCount = repeatEvents.filter((ev) => ev.isSameComponentRepeat).length;

  const repeatByUnitMap = new Map<
    string,
    {
      unitCode: string;
      fleetGroup: FleetGroup;
      repeatCount: number;
      latestGapMinutes: number | null;
      isActiveNow: boolean;
    }
  >();
  for (const ev of repeatEvents) {
    const prev = repeatByUnitMap.get(ev.unitCode) ?? {
      unitCode: ev.unitCode,
      fleetGroup: ev.fleetGroup,
      repeatCount: 0,
      latestGapMinutes: ev.repeatGapMinutes,
      isActiveNow: ev.isActiveBd,
    };
    prev.repeatCount += 1;
    if (ev.isActiveBd) prev.isActiveNow = true;
    repeatByUnitMap.set(ev.unitCode, prev);
  }

  const topRepeatUnits = Array.from(repeatByUnitMap.values())
    .sort((a, b) => {
      if (b.repeatCount !== a.repeatCount) return b.repeatCount - a.repeatCount;
      return Number(b.isActiveNow) - Number(a.isActiveNow);
    })
    .slice(0, 4);

  const repeatSummary: RepeatBdDashboardSummary = {
    repeatCount: repeatEvents.length,
    sameComponentRepeatCount,
    repeatRatePct:
      periodTimeline.length > 0 ? (repeatEvents.length / periodTimeline.length) * 100 : 0,
    topRepeatUnits,
  };

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
    totalActiveRepairMinutes,
    totalWaitingPartMinutes,
    activeWaitingPartCount,
    b1EventsCount,
    b1DowntimeMinutes,
    topWaitingPartUnits,
    scheduledCount,
    scheduledMinutes,
    unscheduledCount,
    unscheduledMinutes,
    activeWithEtrCount,
    overdueEtrUnits,
    rfuWithEtrCount,
    rfuOnTimeEtrCount,
    etrAccuracyPct,
    agingBuckets,
    shiftPerformance,
    repeatSummary,
  };
}
