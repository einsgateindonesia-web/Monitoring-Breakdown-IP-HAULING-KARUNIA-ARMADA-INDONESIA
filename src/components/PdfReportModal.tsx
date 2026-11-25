import { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, FileText, Printer, X } from 'lucide-react';
import {
  BD_STATUS_CATALOG,
  BD_STATUS_LABELS,
  PART_STATUS_LABELS,
  formatBdStatus,
} from '../data/initialUnits';
import {
  BreakdownRecord,
  FleetGroup,
  FleetUnit,
  HourlySlotOverride,
  RfuHistoryRecord,
} from '../types/fleet';
import {
  computeBdTimeSplit,
  computeEtrStatus,
  computeRfuTimeSplit,
  formatDurationId,
  formatMrNumbers,
  formatReadableDateId,
  getCurrentDateYYYYMMDD,
  getCurrentTimeHHMM,
  normalizeMrList,
  parseDateTimeToMs,
} from '../utils/fleetUtils';
import { buildHistoricalTimeline } from '../utils/historicalBdUtils';
import { buildHourlyShiftRows, getCurrentOperationalShiftDate } from '../utils/hourlyShiftUtils';

interface PdfReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  runningUnits: FleetUnit[];
  bdRecords: BreakdownRecord[];
  rfuHistory: RfuHistoryRecord[];
  hourlyOverrides: Record<string, HourlySlotOverride>;
  totalFleetCount: number;
  targetPaPct: number;
  defaultShiftDate?: string;
  preparedByName?: string;
}

export type PdfReportMode = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

const MODE_LABELS: Record<PdfReportMode, string> = {
  HOURLY: 'Per Jam',
  DAILY: 'Per Hari',
  WEEKLY: 'Per 7 Hari',
  MONTHLY: 'Per Bulan',
};

const DOCUMENT_TITLES: Record<PdfReportMode, string> = {
  HOURLY: 'LAPORAN MONITORING PA & STATUS UNIT PER JAM (SHIFT 1 & 2)',
  DAILY: 'LAPORAN HARIAN STATUS UNIT BREAKDOWN & RIWAYAT RFU',
  WEEKLY: 'LAPORAN MINGGUAN (7 HARI) KINERJA ARMADA, BD & RFU',
  MONTHLY: 'LAPORAN BULANAN KINERJA ARMADA, BREAKDOWN & RIWAYAT RFU',
};

function addDaysYYYYMMDD(dateStr: string, deltaDays: number): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return dateStr;
  const dt = new Date(parts[0], parts[1] - 1, parts[2] + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function formatMonthLabelId(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  if (!y || !m) return yyyyMm;
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

function getMonthDatesInfo(yyyyMm: string): {
  startDate: string;
  endDate: string;
  daysInMonth: number;
} {
  const [y, m] = yyyyMm.split('-').map(Number);
  const year = Number.isFinite(y) && y > 1990 ? y : new Date().getFullYear();
  const month = Number.isFinite(m) && m >= 1 && m <= 12 ? m : new Date().getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const mmStr = String(month).padStart(2, '0');
  return {
    startDate: `${year}-${mmStr}-01`,
    endDate: `${year}-${mmStr}-${String(daysInMonth).padStart(2, '0')}`,
    daysInMonth,
  };
}

interface DailyRecapRow {
  date: string;
  shortLabel: string;
  bdInCount: number;
  rfuOutCount: number;
  downtimeHours: number;
  paPct: number;
  source: 'hourly_manual' | 'estimated';
}

export function PdfReportModal({
  isOpen,
  onClose,
  runningUnits,
  bdRecords,
  rfuHistory,
  hourlyOverrides,
  totalFleetCount,
  targetPaPct,
  defaultShiftDate,
  preparedByName = '',
}: PdfReportModalProps) {
  const todayStr = getCurrentDateYYYYMMDD();
  const currentOperationalShift = defaultShiftDate || getCurrentOperationalShiftDate();

  const [reportMode, setReportMode] = useState<PdfReportMode>('DAILY');
  const [selectedShiftDate, setSelectedShiftDate] = useState(currentOperationalShift);
  const [selectedDayDate, setSelectedDayDate] = useState(todayStr);
  const [weeklyEndDate, setWeeklyEndDate] = useState(todayStr);
  const [selectedMonth, setSelectedMonth] = useState(todayStr.slice(0, 7));

  const [includeSummary, setIncludeSummary] = useState(true);
  const [includePeriodDetail, setIncludePeriodDetail] = useState(true);
  const [includeBdList, setIncludeBdList] = useState(true);
  const [includeRfuList, setIncludeRfuList] = useState(true);

  const [groupFilter, setGroupFilter] = useState<'ALL' | FleetGroup>('ALL');
  const [authorName, setAuthorName] = useState(preparedByName);
  const [shiftNote, setShiftNote] = useState('');

  useEffect(() => {
    if (isOpen && preparedByName && !authorName) {
      setAuthorName(preparedByName);
    }
  }, [isOpen, preparedByName, authorName]);

  useEffect(() => {
    if (isOpen && defaultShiftDate) {
      setSelectedShiftDate(defaultShiftDate);
    }
  }, [isOpen, defaultShiftDate]);

  const nowMs = Date.now();
  const nowTimeStr = getCurrentTimeHHMM();
  const readablePrintDate = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  // Group-scoped base collections
  const filteredRunning = useMemo(
    () =>
      groupFilter === 'ALL'
        ? runningUnits
        : runningUnits.filter((u) => u.fleetGroup === groupFilter),
    [runningUnits, groupFilter]
  );

  const groupBdAll = useMemo(
    () =>
      groupFilter === 'ALL'
        ? bdRecords
        : bdRecords.filter((b) => b.fleetGroup === groupFilter),
    [bdRecords, groupFilter]
  );

  const groupRfuAll = useMemo(
    () =>
      groupFilter === 'ALL'
        ? rfuHistory
        : rfuHistory.filter((h) => h.fleetGroup === groupFilter),
    [rfuHistory, groupFilter]
  );

  const scopedTotalFleet =
    groupFilter === 'ALL' ? totalFleetCount : filteredRunning.length + groupBdAll.length;

  const livePaPct =
    scopedTotalFleet > 0 ? (filteredRunning.length / scopedTotalFleet) * 100 : 0;

  // Date range resolved for DAILY / WEEKLY / MONTHLY
  const periodRange = useMemo(() => {
    if (reportMode === 'HOURLY') {
      return {
        startDate: selectedShiftDate,
        endDate: addDaysYYYYMMDD(selectedShiftDate, 1),
        displayLabel: `${formatReadableDateId(selectedShiftDate)} (06:00) s/d ${formatReadableDateId(
          addDaysYYYYMMDD(selectedShiftDate, 1)
        )} (06:00)`,
        includesToday:
          selectedShiftDate === currentOperationalShift || selectedShiftDate === todayStr,
      };
    }
    if (reportMode === 'DAILY') {
      return {
        startDate: selectedDayDate,
        endDate: selectedDayDate,
        displayLabel: formatReadableDateId(selectedDayDate),
        includesToday: selectedDayDate === todayStr,
      };
    }
    if (reportMode === 'WEEKLY') {
      const start = addDaysYYYYMMDD(weeklyEndDate, -6);
      return {
        startDate: start,
        endDate: weeklyEndDate,
        displayLabel: `${formatReadableDateId(start)} s/d ${formatReadableDateId(weeklyEndDate)} (7 Hari)`,
        includesToday: start <= todayStr && weeklyEndDate >= todayStr,
      };
    }
    const monthInfo = getMonthDatesInfo(selectedMonth);
    const cappedEnd =
      selectedMonth === todayStr.slice(0, 7)
        ? todayStr
        : monthInfo.endDate;
    return {
      startDate: monthInfo.startDate,
      endDate: cappedEnd,
      fullMonthEnd: monthInfo.endDate,
      displayLabel: formatMonthLabelId(selectedMonth),
      includesToday: selectedMonth === todayStr.slice(0, 7),
    };
  }, [
    reportMode,
    selectedShiftDate,
    selectedDayDate,
    weeklyEndDate,
    selectedMonth,
    currentOperationalShift,
    todayStr,
  ]);

  // 1) HOURLY rows & shift averages
  const hourlyReportData = useMemo(() => {
    const rows = buildHourlyShiftRows({
      shiftDate: selectedShiftDate,
      totalPopulasi: scopedTotalFleet,
      bdRecords: groupBdAll,
      rfuHistory: groupRfuAll,
      overrides: groupFilter === 'ALL' ? hourlyOverrides : {},
      nowMs,
    });

    const activeRows = rows.filter((r) => r.isElapsed || r.isManual);
    const shift1Rows = activeRows.filter((r) => r.slotIndex < 12);
    const shift2Rows = activeRows.filter((r) => r.slotIndex >= 12);

    const avg = (list: typeof activeRows) =>
      list.length > 0 ? list.reduce((s, r) => s + r.paPct, 0) / list.length : null;

    const shiftStartMs = parseDateTimeToMs(selectedShiftDate, '06:00') ?? nowMs;
    const shiftEndMs = shiftStartMs + 24 * 3600 * 1000;

    const shiftRfu = groupRfuAll.filter((h) => {
      const rfuMs = parseDateTimeToMs(h.tanggalRfu, h.jamRfu);
      if (rfuMs === null) return false;
      return rfuMs >= shiftStartMs && rfuMs <= shiftEndMs;
    });

    const shiftBd = groupBdAll.filter((b) => {
      const bdMs = parseDateTimeToMs(b.tanggalBd, b.jamBd);
      if (bdMs === null) return true;
      return bdMs <= shiftEndMs;
    });

    const manualCount = activeRows.filter((r) => r.isManual).length;

    return {
      rows,
      activeCount: activeRows.length,
      manualCount,
      avgShift1: avg(shift1Rows),
      avgShift2: avg(shift2Rows),
      avgCombined: avg(activeRows),
      shiftRfu,
      shiftBd,
    };
  }, [
    selectedShiftDate,
    scopedTotalFleet,
    groupBdAll,
    groupRfuAll,
    groupFilter,
    hourlyOverrides,
    nowMs,
  ]);

  // 2) RFU & BD records scoped to the selected mode
  const scopedRfu = useMemo(() => {
    if (reportMode === 'HOURLY') {
      return hourlyReportData.shiftRfu;
    }
    return groupRfuAll.filter((h) => {
      const refDate = h.tanggalRfu || h.tanggalBd;
      if (!refDate) return false;
      return refDate >= periodRange.startDate && refDate <= periodRange.endDate;
    });
  }, [reportMode, hourlyReportData.shiftRfu, groupRfuAll, periodRange]);

  const scopedBd = useMemo(() => {
    if (reportMode === 'HOURLY') {
      return hourlyReportData.shiftBd;
    }
    return groupBdAll.filter((b) => !b.tanggalBd || b.tanggalBd <= periodRange.endDate);
  }, [reportMode, hourlyReportData.shiftBd, groupBdAll, periodRange.endDate]);

  // 3) Daily Recap Rows (used in DAILY, WEEKLY, MONTHLY)
  const dailyRecapRows = useMemo((): DailyRecapRow[] => {
    if (reportMode === 'HOURLY') return [];

    const overridesByDate = new Map<string, HourlySlotOverride[]>();
    if (groupFilter === 'ALL') {
      for (const ov of Object.values(hourlyOverrides)) {
        if (!ov.shiftDate) continue;
        const list = overridesByDate.get(ov.shiftDate) ?? [];
        list.push(ov);
        overridesByDate.set(ov.shiftDate, list);
      }
    }

    const days: string[] = [];
    let cursor = periodRange.startDate;
    let guard = 0;
    const limitEnd = periodRange.endDate > todayStr ? todayStr : periodRange.endDate;
    while (cursor <= limitEnd && guard < 35) {
      days.push(cursor);
      cursor = addDaysYYYYMMDD(cursor, 1);
      guard += 1;
    }

    const safeFleet = Math.max(1, scopedTotalFleet);

    return days.map((dateStr) => {
      const dayStartMs = parseDateTimeToMs(dateStr, '00:00') ?? nowMs;
      const dayEndMs = Math.min(nowMs, dayStartMs + 24 * 3600 * 1000);
      const elapsedDayHours = Math.max(1, (dayEndMs - dayStartMs) / (3600 * 1000));

      let bdInCount = 0;
      let rfuOutCount = 0;
      let downtimeMs = 0;

      for (const rfu of groupRfuAll) {
        if (rfu.tanggalBd === dateStr) bdInCount += 1;
        if (rfu.tanggalRfu === dateStr) rfuOutCount += 1;
        const sMs = parseDateTimeToMs(rfu.tanggalBd, rfu.jamBd);
        const eMs = parseDateTimeToMs(rfu.tanggalRfu, rfu.jamRfu);
        if (sMs === null || eMs === null) continue;
        const overlapStart = Math.max(dayStartMs, sMs);
        const overlapEnd = Math.min(dayEndMs, eMs);
        if (overlapEnd > overlapStart) {
          downtimeMs += overlapEnd - overlapStart;
        }
      }

      for (const bd of groupBdAll) {
        if (bd.tanggalBd === dateStr) bdInCount += 1;
        const sMs = parseDateTimeToMs(bd.tanggalBd, bd.jamBd);
        if (sMs === null) continue;
        const overlapStart = Math.max(dayStartMs, sMs);
        const overlapEnd = dayEndMs;
        if (overlapEnd > overlapStart) {
          downtimeMs += overlapEnd - overlapStart;
        }
      }

      const downtimeHours = downtimeMs / (3600 * 1000);
      const dayOverrides = overridesByDate.get(dateStr) ?? [];

      let paPct: number;
      let source: DailyRecapRow['source'] = 'estimated';

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

      return {
        date: dateStr,
        shortLabel: formatReadableDateId(dateStr).slice(0, 5),
        bdInCount,
        rfuOutCount,
        downtimeHours,
        paPct,
        source,
      };
    });
  }, [
    reportMode,
    groupFilter,
    hourlyOverrides,
    periodRange.startDate,
    periodRange.endDate,
    todayStr,
    scopedTotalFleet,
    groupRfuAll,
    groupBdAll,
    nowMs,
  ]);

  // 4) Period KPI, Time Split (Active Repair vs Waiting Part), Scheduled vs Unscheduled, Repeat BD, Bad Actors & Pareto
  const periodMetrics = useMemo(() => {
    let totalDowntimeMinutes = 0;
    let totalActiveRepairMinutes = 0;
    let totalWaitingPartMinutes = 0;
    let scheduledCount = 0;
    let unscheduledCount = 0;
    const rfuDurations: number[] = [];

    for (const rfu of scopedRfu) {
      const split = computeRfuTimeSplit(rfu);
      rfuDurations.push(split.totalMinutes);
      totalDowntimeMinutes += split.totalMinutes;
      totalActiveRepairMinutes += split.activeRepairMinutes;
      totalWaitingPartMinutes += split.waitingPartMinutes;
      if (rfu.lastStatus === 'BS') scheduledCount += 1;
      else unscheduledCount += 1;
    }

    let activeWaitingNowCount = 0;
    let overdueEtrCount = 0;
    let agingOver6hCount = 0;

    if (periodRange.includesToday || reportMode === 'HOURLY') {
      for (const bd of scopedBd) {
        const split = computeBdTimeSplit(bd, nowMs);
        totalDowntimeMinutes += split.totalMinutes;
        totalActiveRepairMinutes += split.activeRepairMinutes;
        totalWaitingPartMinutes += split.waitingPartMinutes;
        if (split.isWaitingNow) activeWaitingNowCount += 1;
        if (split.totalMinutes >= 360) agingOver6hCount += 1;
        if (bd.status === 'BS') scheduledCount += 1;
        else unscheduledCount += 1;

        if (bd.etr?.trim()) {
          const etrEval = computeEtrStatus(bd.tanggalBd, bd.jamBd, bd.etr, nowMs);
          if (etrEval?.isOverdue) overdueEtrCount += 1;
        }
      }
    }

    const avgMttrMinutes =
      rfuDurations.length > 0
        ? Math.round(rfuDurations.reduce((s, v) => s + v, 0) / rfuDurations.length)
        : null;

    const avgPeriodPaPct =
      reportMode === 'HOURLY'
        ? hourlyReportData.avgCombined
        : dailyRecapRows.length > 0
        ? dailyRecapRows.reduce((s, d) => s + d.paPct, 0) / dailyRecapRows.length
        : null;

    // Repeat BD (<= 72h) within period
    const timeline = buildHistoricalTimeline(
      periodRange.includesToday || reportMode === 'HOURLY' ? scopedBd : [],
      groupRfuAll,
      nowMs
    );
    const periodEvents = timeline.filter((ev) => {
      if (ev.isActiveBd) return true;
      const ref = ev.tanggalRfu || ev.tanggalBd;
      return ref >= periodRange.startDate && ref <= periodRange.endDate;
    });
    const repeatEventsCount = periodEvents.filter((ev) => ev.isRepeatBd).length;
    const sameCompRepeatCount = periodEvents.filter((ev) => ev.isSameComponentRepeat).length;

    // Bad Actors (Top 5)
    const unitMap = new Map<
      string,
      {
        unitCode: string;
        fleetGroup: FleetGroup;
        bdCount: number;
        activeCount: number;
        totalMinutes: number;
      }
    >();
    for (const rfu of scopedRfu) {
      const split = computeRfuTimeSplit(rfu);
      const prev = unitMap.get(rfu.unitCode) ?? {
        unitCode: rfu.unitCode,
        fleetGroup: rfu.fleetGroup,
        bdCount: 0,
        activeCount: 0,
        totalMinutes: 0,
      };
      prev.bdCount += 1;
      prev.totalMinutes += split.totalMinutes;
      unitMap.set(rfu.unitCode, prev);
    }
    if (periodRange.includesToday || reportMode === 'HOURLY') {
      for (const bd of scopedBd) {
        const split = computeBdTimeSplit(bd, nowMs);
        const prev = unitMap.get(bd.unitCode) ?? {
          unitCode: bd.unitCode,
          fleetGroup: bd.fleetGroup,
          bdCount: 0,
          activeCount: 0,
          totalMinutes: 0,
        };
        prev.bdCount += 1;
        prev.activeCount += 1;
        prev.totalMinutes += split.totalMinutes;
        unitMap.set(bd.unitCode, prev);
      }
    }
    const badActors = Array.from(unitMap.values())
      .sort((a, b) => (b.bdCount !== a.bdCount ? b.bdCount - a.bdCount : b.totalMinutes - a.totalMinutes))
      .slice(0, 5);

    // Pareto Komponen (Top 5 from scopedRfu)
    const compMap = new Map<string, { count: number; totalMinutes: number }>();
    let categorizedCount = 0;
    for (const rfu of scopedRfu) {
      const comp = (rfu.komponen ?? '').trim();
      if (!comp) continue;
      categorizedCount += 1;
      const split = computeRfuTimeSplit(rfu);
      const prev = compMap.get(comp) ?? { count: 0, totalMinutes: 0 };
      prev.count += 1;
      prev.totalMinutes += split.totalMinutes;
      compMap.set(comp, prev);
    }
    const paretoComponents = Array.from(compMap.entries())
      .map(([komponen, v]) => ({
        komponen,
        count: v.count,
        totalMinutes: v.totalMinutes,
        sharePct: categorizedCount > 0 ? (v.count / categorizedCount) * 100 : 0,
      }))
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : b.totalMinutes - a.totalMinutes))
      .slice(0, 5);

    const repairPct =
      totalDowntimeMinutes > 0
        ? Math.round((totalActiveRepairMinutes / totalDowntimeMinutes) * 100)
        : 0;
    const waitingPct =
      totalDowntimeMinutes > 0 ? Math.max(0, 100 - repairPct) : 0;

    return {
      totalDowntimeMinutes,
      totalActiveRepairMinutes,
      totalWaitingPartMinutes,
      repairPct,
      waitingPct,
      scheduledCount,
      unscheduledCount,
      activeWaitingNowCount,
      overdueEtrCount,
      agingOver6hCount,
      avgMttrMinutes,
      avgPeriodPaPct,
      repeatEventsCount,
      sameCompRepeatCount,
      badActors,
      paretoComponents,
    };
  }, [
    scopedRfu,
    scopedBd,
    groupRfuAll,
    periodRange,
    reportMode,
    hourlyReportData.avgCombined,
    dailyRecapRows,
    nowMs,
  ]);

  const groupRows = useMemo(() => {
    const groups: FleetGroup[] =
      groupFilter === 'ALL' ? ['PMSC', 'PMVV', 'LAINNYA'] : [groupFilter];
    return groups
      .map((grp) => {
        const run = runningUnits.filter((u) => u.fleetGroup === grp).length;
        const bd = bdRecords.filter((b) => b.fleetGroup === grp).length;
        const total = run + bd;
        const pa = total > 0 ? ((run / total) * 100).toFixed(1) : '0.0';
        return { grp, run, bd, total, pa };
      })
      .filter((g) => g.total > 0);
  }, [runningUnits, bdRecords, groupFilter]);

  const activeStatusBreakdown = useMemo(
    () =>
      BD_STATUS_CATALOG.map((meta) => {
        const items = scopedBd.filter((b) => b.status === meta.code);
        return {
          code: meta.code,
          label: meta.label,
          count: items.length,
          units: items.map((i) => i.unitCode),
        };
      }).filter((row) => row.count > 0),
    [scopedBd]
  );

  if (!isOpen) return null;

  const hasDetailSection =
    reportMode === 'HOURLY' || reportMode === 'WEEKLY' || reportMode === 'MONTHLY';
  const nothingSelected =
    !includeSummary && !(hasDetailSection && includePeriodDetail) && !includeBdList && !includeRfuList;

  // Dynamic section numbering
  let secIdx = 0;
  const secNumSummary = includeSummary ? ++secIdx : 0;
  const secNumDetail = hasDetailSection && includePeriodDetail ? ++secIdx : 0;
  const secNumBd = includeBdList ? ++secIdx : 0;
  const secNumRfu = includeRfuList ? ++secIdx : 0;

  const handleTriggerPrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center p-2 sm:p-4 print-modal-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-report-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden print-sheet-wrapper">
        {/* Non-Print Configuration Header & Toolbar */}
        <div className="no-print px-4 sm:px-5 py-3.5 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-md bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2
                  id="pdf-report-modal-title"
                  className="text-sm sm:text-base font-bold text-slate-900"
                >
                  Unduh Laporan PDF (Per Jam, Per Hari, Per 7 Hari, Per Bulan)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pilih jenis laporan berkala &amp; tanggal/bulan, lalu klik{' '}
                  <strong className="text-slate-700">Cetak / Simpan PDF</strong> untuk dibagikan via WhatsApp atau Email.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup modal laporan PDF"
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-md cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Row 1: 4 Report Modes + Period Date/Month Picker + Group Filter */}
          <div className="pt-2 border-t border-slate-200/80 grid grid-cols-1 lg:grid-cols-12 gap-2.5 text-xs">
            <div className="lg:col-span-5 space-y-1">
              <span className="block text-[11px] font-semibold text-slate-600">
                JENIS PERIODE LAPORAN PDF
              </span>
              <div className="inline-flex flex-wrap items-center p-0.5 bg-slate-200/80 rounded-md w-full sm:w-auto">
                {(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setReportMode(mode)}
                    className={`flex-1 sm:flex-initial min-h-[34px] sm:min-h-0 px-2.5 py-1.5 text-[11px] font-medium rounded cursor-pointer whitespace-nowrap transition-colors ${
                      reportMode === mode
                        ? 'bg-white text-blue-800 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {MODE_LABELS[mode]}
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-4 space-y-1">
              <span className="block text-[11px] font-semibold text-slate-600">
                {reportMode === 'HOURLY'
                  ? 'TANGGAL SHIFT (06:00 – 06:00)'
                  : reportMode === 'DAILY'
                  ? 'PILIH TANGGAL LAPORAN'
                  : reportMode === 'WEEKLY'
                  ? 'TANGGAL AKHIR (RENTANG 7 HARI)'
                  : 'PILIH BULAN LAPORAN'}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {reportMode === 'HOURLY' && (
                  <div className="inline-flex items-center gap-1.5 bg-white border border-slate-300 rounded px-2 py-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                    <input
                      type="date"
                      value={selectedShiftDate}
                      onChange={(e) => setSelectedShiftDate(e.target.value || currentOperationalShift)}
                      aria-label="Tanggal shift laporan per jam"
                      className="text-[11px] font-mono text-slate-800 bg-transparent focus:outline-none"
                    />
                  </div>
                )}

                {reportMode === 'DAILY' && (
                  <div className="inline-flex items-center gap-1.5 bg-white border border-slate-300 rounded px-2 py-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                    <input
                      type="date"
                      value={selectedDayDate}
                      onChange={(e) => setSelectedDayDate(e.target.value || todayStr)}
                      aria-label="Tanggal laporan harian"
                      className="text-[11px] font-mono text-slate-800 bg-transparent focus:outline-none"
                    />
                  </div>
                )}

                {reportMode === 'WEEKLY' && (
                  <div className="inline-flex items-center gap-1.5 bg-white border border-slate-300 rounded px-2 py-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                    <input
                      type="date"
                      value={weeklyEndDate}
                      onChange={(e) => setWeeklyEndDate(e.target.value || todayStr)}
                      aria-label="Tanggal akhir laporan 7 hari"
                      className="text-[11px] font-mono text-slate-800 bg-transparent focus:outline-none"
                    />
                  </div>
                )}

                {reportMode === 'MONTHLY' && (
                  <div className="inline-flex items-center gap-1.5 bg-white border border-slate-300 rounded px-2 py-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value || todayStr.slice(0, 7))}
                      aria-label="Bulan laporan bulanan"
                      className="text-[11px] font-mono text-slate-800 bg-transparent focus:outline-none"
                    />
                  </div>
                )}

                <select
                  aria-label="Filter grup armada untuk PDF"
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value as 'ALL' | FleetGroup)}
                  className="px-2 py-1.5 text-[11px] font-medium bg-white border border-slate-300 rounded text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="ALL">Semua Grup</option>
                  <option value="PMSC">PMSC</option>
                  <option value="PMVV">PMVV</option>
                  <option value="LAINNYA">LAINNYA</option>
                </select>
              </div>
            </div>

            <div className="lg:col-span-3 space-y-1">
              <span className="block text-[11px] font-semibold text-slate-600">
                PENYUSUN &amp; CATATAN
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Disusun oleh..."
                  aria-label="Disusun oleh"
                  className="px-2 py-1.5 text-[11px] bg-white border border-slate-300 rounded text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <input
                  type="text"
                  value={shiftNote}
                  onChange={(e) => setShiftNote(e.target.value)}
                  placeholder="Catatan shift/catatan..."
                  aria-label="Catatan shift"
                  className="px-2 py-1.5 text-[11px] bg-white border border-slate-300 rounded text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Sections included */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[11px] font-semibold text-slate-600 mr-1">
              ISI LAPORAN:
            </span>

            <label className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeSummary}
                onChange={(e) => setIncludeSummary(e.target.checked)}
                className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span className="font-medium text-slate-800">Ringkasan &amp; KPI</span>
            </label>

            {hasDetailSection && (
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includePeriodDetail}
                  onChange={(e) => setIncludePeriodDetail(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span className="font-medium text-slate-800">
                  {reportMode === 'HOURLY'
                    ? 'Tabel PA Per Jam (25 Slot)'
                    : 'Rekap Harian & Top Masalah'}
                </span>
              </label>
            )}

            <label className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeBdList}
                onChange={(e) => setIncludeBdList(e.target.checked)}
                className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span className="font-medium text-slate-800">
                Unit BD Aktif ({scopedBd.length})
              </span>
            </label>

            <label className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeRfuList}
                onChange={(e) => setIncludeRfuList(e.target.checked)}
                className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span className="font-medium text-slate-800">
                Riwayat RFU ({scopedRfu.length})
              </span>
            </label>
          </div>
        </div>

        {/* Scrollable Preview Area (Becomes Full Unbounded Print Document on Print) */}
        <div className="flex-1 overflow-y-auto ops-scroll bg-slate-100/80 p-3 sm:p-6 print-sheet-wrapper">
          {nothingSelected ? (
            <div className="no-print max-w-md mx-auto my-12 bg-white border border-slate-200 rounded-lg p-6 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-900">
                Belum ada bagian laporan yang dipilih
              </p>
              <p className="text-xs text-slate-500">
                Centang minimal satu bagian di toolbar atas untuk melihat pratinjau PDF.
              </p>
            </div>
          ) : (
            <div
              id="pdf-print-sheet"
              className="max-w-[820px] mx-auto bg-white border border-slate-200 rounded-md shadow-xs p-5 sm:p-8 text-slate-900 space-y-5 print-sheet-wrapper"
            >
              {/* Formal Document Letterhead */}
              <header className="border-b-2 border-slate-900 pb-3.5 flex flex-col sm:flex-row sm:items-end justify-between gap-3 print-avoid-break">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
                    PT KARUNIA ARMADA INDONESIA · IP HAULING
                  </p>
                  <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 mt-0.5">
                    {DOCUMENT_TITLES[reportMode]}
                  </h1>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Periode:{' '}
                    <strong className="text-slate-900">{periodRange.displayLabel}</strong>
                    {' · '}Cakupan:{' '}
                    <strong className="text-slate-900">
                      {groupFilter === 'ALL' ? 'Seluruh Armada (PMSC & PMVV)' : `Grup ${groupFilter}`}
                    </strong>
                  </p>
                </div>

                <div className="text-[11px] text-slate-600 sm:text-right space-y-0.5 font-mono tabular-nums shrink-0">
                  <div>
                    <span className="font-sans text-slate-500">Tanggal Cetak: </span>
                    <span className="font-semibold text-slate-900">{readablePrintDate}</span>
                  </div>
                  <div>
                    <span className="font-sans text-slate-500">Pukul: </span>
                    <span className="font-semibold text-slate-900">{nowTimeStr}</span>
                    <span className="font-sans text-slate-400"> · </span>
                    <span className="font-sans text-slate-500">Target PA: </span>
                    <span className="font-semibold text-slate-900">{targetPaPct.toFixed(1)}%</span>
                  </div>
                  {authorName.trim() && (
                    <div className="font-sans">
                      <span className="text-slate-500">Disusun oleh: </span>
                      <span className="font-semibold text-slate-900">{authorName.trim()}</span>
                    </div>
                  )}
                </div>
              </header>

              {shiftNote.trim() && (
                <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-700 print-avoid-break">
                  <span className="font-semibold text-slate-900">Catatan Shift / Manajemen: </span>
                  <span>{shiftNote.trim()}</span>
                </div>
              )}

              {/* Section: Summary & KPI */}
              {includeSummary && (
                <section className="space-y-3 print-avoid-break">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-l-3 border-blue-700 pl-2">
                    {secNumSummary}. Ringkasan Kinerja &amp; Ketersediaan Armada ({MODE_LABELS[reportMode]})
                  </h2>

                  {reportMode === 'HOURLY' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="p-2.5 border border-slate-200 rounded bg-slate-50/70">
                        <span className="block text-[10px] font-semibold uppercase text-slate-500">
                          Total Populasi
                        </span>
                        <span className="block text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                          {scopedTotalFleet} Unit
                        </span>
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          Slot terisi: {hourlyReportData.activeCount}/25 jam
                        </span>
                      </div>

                      <div className="p-2.5 border border-slate-200 rounded bg-slate-50/70">
                        <span className="block text-[10px] font-semibold uppercase text-slate-500">
                          Rata-rata PA Shift 1
                        </span>
                        <span
                          className={`block text-base font-bold font-mono tabular-nums mt-0.5 ${
                            hourlyReportData.avgShift1 !== null &&
                            hourlyReportData.avgShift1 >= targetPaPct
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {hourlyReportData.avgShift1 !== null
                            ? `${hourlyReportData.avgShift1.toFixed(1)}%`
                            : '—'}
                        </span>
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          Jam 06:00 – 17:00
                        </span>
                      </div>

                      <div className="p-2.5 border border-slate-200 rounded bg-slate-50/70">
                        <span className="block text-[10px] font-semibold uppercase text-slate-500">
                          Rata-rata PA Shift 2
                        </span>
                        <span
                          className={`block text-base font-bold font-mono tabular-nums mt-0.5 ${
                            hourlyReportData.avgShift2 !== null &&
                            hourlyReportData.avgShift2 >= targetPaPct
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {hourlyReportData.avgShift2 !== null
                            ? `${hourlyReportData.avgShift2.toFixed(1)}%`
                            : '—'}
                        </span>
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          Jam 18:00 – 06:00
                        </span>
                      </div>

                      <div className="p-2.5 border border-slate-200 rounded bg-slate-50/70">
                        <span className="block text-[10px] font-semibold uppercase text-slate-500">
                          PA Gabungan 24 Jam
                        </span>
                        <span
                          className={`block text-base font-bold font-mono tabular-nums mt-0.5 ${
                            hourlyReportData.avgCombined !== null &&
                            hourlyReportData.avgCombined >= targetPaPct
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {hourlyReportData.avgCombined !== null
                            ? `${hourlyReportData.avgCombined.toFixed(1)}%`
                            : '—'}
                        </span>
                        <span className="block text-[10px] text-slate-500 mt-0.5 tabular-nums">
                          RFU shift: {scopedRfu.length}x · Input manual: {hourlyReportData.manualCount}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="p-2.5 border border-slate-200 rounded bg-slate-50/70">
                        <span className="block text-[10px] font-semibold uppercase text-slate-500">
                          {reportMode === 'DAILY' && periodRange.includesToday
                            ? 'PA Saat Ini & Populasi'
                            : `Rata-rata PA (${MODE_LABELS[reportMode]})`}
                        </span>
                        <span
                          className={`block text-base font-bold font-mono tabular-nums mt-0.5 ${
                            (reportMode === 'DAILY' && periodRange.includesToday
                              ? livePaPct
                              : periodMetrics.avgPeriodPaPct ?? 0) >= targetPaPct
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {reportMode === 'DAILY' && periodRange.includesToday
                            ? `${livePaPct.toFixed(1)}%`
                            : periodMetrics.avgPeriodPaPct !== null
                            ? `${periodMetrics.avgPeriodPaPct.toFixed(1)}%`
                            : '—'}
                        </span>
                        <span className="block text-[10px] text-slate-500 mt-0.5 tabular-nums">
                          Populasi: {scopedTotalFleet} unit · Target ≥ {targetPaPct.toFixed(1)}%
                        </span>
                      </div>

                      <div className="p-2.5 border border-slate-200 rounded bg-slate-50/70">
                        <span className="block text-[10px] font-semibold uppercase text-slate-500">
                          RFU Selesai &amp; MTTR
                        </span>
                        <span className="block text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                          {scopedRfu.length} Kali
                        </span>
                        <span className="block text-[10px] text-slate-500 mt-0.5 tabular-nums">
                          MTTR rata-rata: {formatDurationId(periodMetrics.avgMttrMinutes)}
                        </span>
                      </div>

                      <div className="p-2.5 border border-slate-200 rounded bg-slate-50/70">
                        <span className="block text-[10px] font-semibold uppercase text-slate-500">
                          Kerja Mekanik vs Part
                        </span>
                        <span className="block text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                          {formatDurationId(periodMetrics.totalActiveRepairMinutes)}{' '}
                          <span className="text-slate-400 font-normal">/</span>{' '}
                          <span className="text-amber-700">
                            {formatDurationId(periodMetrics.totalWaitingPartMinutes)}
                          </span>
                        </span>
                        <span className="block text-[10px] text-slate-500 mt-0.5 tabular-nums">
                          Porsi Mekanik {periodMetrics.repairPct}% · Tunggu Part {periodMetrics.waitingPct}%
                        </span>
                      </div>

                      <div className="p-2.5 border border-slate-200 rounded bg-slate-50/70">
                        <span className="block text-[10px] font-semibold uppercase text-slate-500">
                          {periodRange.includesToday ? 'BD Aktif & Overdue ETR' : 'Repeat BD & Jenis'}
                        </span>
                        {periodRange.includesToday ? (
                          <>
                            <span className="block text-base font-bold font-mono tabular-nums text-red-700 mt-0.5">
                              {scopedBd.length} Unit BD
                            </span>
                            <span className="block text-[10px] text-slate-500 mt-0.5 tabular-nums">
                              Overdue ETR: {periodMetrics.overdueEtrCount} · Repeat ≤72j: {periodMetrics.repeatEventsCount}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="block text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                              {periodMetrics.repeatEventsCount} Repeat BD
                            </span>
                            <span className="block text-[10px] text-slate-500 mt-0.5 tabular-nums">
                              BS: {periodMetrics.scheduledCount} · Unsched: {periodMetrics.unscheduledCount}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Group Snapshot & Active BD Code Distribution (shown when current status relevant) */}
                  {(periodRange.includesToday || reportMode === 'HOURLY') && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="border border-slate-200 rounded overflow-hidden">
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead className="bg-slate-100 border-b border-slate-200 text-[10px] font-semibold text-slate-600">
                            <tr>
                              <th className="py-1.5 px-2.5">GRUP UNIT (POSISI SAAT INI)</th>
                              <th className="py-1.5 px-2 text-right">TOTAL</th>
                              <th className="py-1.5 px-2 text-right">RUN</th>
                              <th className="py-1.5 px-2 text-right">BD</th>
                              <th className="py-1.5 px-2.5 text-right">PA %</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {groupRows.map((g) => (
                              <tr key={g.grp}>
                                <td className="py-1.5 px-2.5 font-mono font-semibold text-slate-900">
                                  {g.grp}
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                                  {g.total}
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                                  {g.run}
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono tabular-nums text-red-700 font-semibold">
                                  {g.bd}
                                </td>
                                <td className="py-1.5 px-2.5 text-right font-mono tabular-nums font-bold">
                                  {g.pa}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="border border-slate-200 rounded overflow-hidden">
                        <div className="bg-slate-100 border-b border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 uppercase">
                          Distribusi Kode Status BD Aktif
                        </div>
                        {activeStatusBreakdown.length === 0 ? (
                          <div className="p-3 text-[11px] text-slate-500">
                            Seluruh unit sedang beroperasi normal (100% Running).
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {activeStatusBreakdown.map((st) => (
                              <div
                                key={st.code}
                                className="px-2.5 py-1.5 flex items-start justify-between gap-2 text-[11px]"
                              >
                                <div className="min-w-0">
                                  <span className="font-mono font-bold text-slate-900">
                                    {st.code}
                                  </span>{' '}
                                  <span className="text-slate-700">{st.label}</span>
                                  <p className="text-[10px] font-mono text-slate-500 truncate">
                                    {st.units.join(', ')}
                                  </p>
                                </div>
                                <span className="font-mono font-semibold tabular-nums text-red-700 shrink-0">
                                  {st.count} unit
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Section: Mode-Specific Period Table (HOURLY 25-row OR WEEKLY/MONTHLY Daily Recap & Top Problems) */}
              {hasDetailSection && includePeriodDetail && reportMode === 'HOURLY' && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-l-3 border-indigo-700 pl-2">
                      {secNumDetail}. Tabel Monitoring PA, Populasi &amp; BD Per Jam (06:00 – 06:00)
                    </h2>
                    <span className="text-[10px] font-mono text-slate-500">
                      {groupFilter === 'ALL' ? 'Auto + Override Manual' : `Otomatis Grup ${groupFilter}`}
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded overflow-hidden">
                    <table className="w-full text-left border-collapse text-[10px] leading-tight">
                      <thead className="bg-slate-100 border-b border-slate-300 font-semibold text-slate-700 uppercase">
                        <tr>
                          <th className="py-1.5 pl-2 pr-1 w-[46px]">Jam</th>
                          <th className="py-1.5 px-1.5 w-[72px]">Tanggal</th>
                          <th className="py-1.5 px-1.5 w-[74px]">Shift</th>
                          <th className="py-1.5 px-1.5 w-[42px] text-right">Pop</th>
                          <th className="py-1.5 px-1.5 w-[42px] text-right">Run</th>
                          <th className="py-1.5 px-1.5 w-[40px] text-right">BD</th>
                          <th className="py-1.5 px-1.5 w-[52px] text-right">PA %</th>
                          <th className="py-1.5 px-1.5 w-[56px]">Sumber</th>
                          <th className="py-1.5 pl-1.5 pr-2">Unit BD Tercatat</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {hourlyReportData.rows.map((row) => {
                          const active = row.isElapsed || row.isManual;
                          const belowTarget = active && row.paPct < targetPaPct;
                          return (
                            <tr
                              key={row.key}
                              className={
                                row.slotIndex === 12
                                  ? 'border-t-2 border-slate-300 bg-slate-50/40'
                                  : undefined
                              }
                            >
                              <td className="py-1 pl-2 pr-1 font-mono font-bold text-slate-900 whitespace-nowrap">
                                {row.hourLabel}
                              </td>
                              <td className="py-1 px-1.5 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                                {formatReadableDateId(row.calendarDate)}
                              </td>
                              <td className="py-1 px-1.5 whitespace-nowrap">
                                <span
                                  className={`font-medium ${
                                    row.slotIndex < 12 ? 'text-blue-800' : 'text-indigo-800'
                                  }`}
                                >
                                  {row.shiftLabel}
                                </span>
                              </td>
                              <td className="py-1 px-1.5 text-right font-mono tabular-nums text-slate-700">
                                {active ? row.totalPopulasi : '—'}
                              </td>
                              <td className="py-1 px-1.5 text-right font-mono tabular-nums font-semibold text-emerald-700">
                                {active ? row.runningCount : '—'}
                              </td>
                              <td className="py-1 px-1.5 text-right font-mono tabular-nums font-semibold text-red-700">
                                {active ? row.bdCount : '—'}
                              </td>
                              <td
                                className={`py-1 px-1.5 text-right font-mono tabular-nums font-bold ${
                                  !active
                                    ? 'text-slate-400'
                                    : belowTarget
                                    ? 'text-amber-700'
                                    : 'text-emerald-700'
                                }`}
                              >
                                {active ? `${row.paPct.toFixed(1)}%` : '—'}
                              </td>
                              <td className="py-1 px-1.5 text-[9px] text-slate-600 whitespace-nowrap">
                                {row.isManual ? 'Manual' : active ? 'Otomatis' : 'Menunggu'}
                              </td>
                              <td className="py-1 pl-1.5 pr-2 font-mono text-[9.5px] text-slate-700 break-words">
                                {active
                                  ? row.bdUnitCodes.length > 0
                                    ? row.bdUnitCodes.join(', ')
                                    : 'Nihil (100% Running)'
                                  : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {hasDetailSection &&
                includePeriodDetail &&
                (reportMode === 'WEEKLY' || reportMode === 'MONTHLY') && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-l-3 border-indigo-700 pl-2">
                        {secNumDetail}. Rekap Harian, Top Bad Actors &amp; Pareto Komponen ({MODE_LABELS[reportMode]})
                      </h2>
                      <span className="text-[10px] font-mono text-slate-500">
                        {dailyRecapRows.length} Hari Tercatat
                      </span>
                    </div>

                    {dailyRecapRows.length === 0 ? (
                      <div className="border border-slate-200 rounded p-4 text-center text-xs text-slate-500">
                        Belum ada data operasional pada periode {periodRange.displayLabel}.
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded overflow-hidden">
                        <table className="w-full text-left border-collapse text-[10px] leading-tight">
                          <thead className="bg-slate-100 border-b border-slate-300 font-semibold text-slate-700 uppercase">
                            <tr>
                              <th className="py-1.5 pl-2.5 pr-1.5">Tanggal</th>
                              <th className="py-1.5 px-2 text-right">BD Masuk</th>
                              <th className="py-1.5 px-2 text-right">RFU Selesai</th>
                              <th className="py-1.5 px-2 text-right">Downtime (Jam)</th>
                              <th className="py-1.5 px-2 text-right">PA Harian %</th>
                              <th className="py-1.5 pl-2 pr-2.5">Basis Perhitungan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {dailyRecapRows.map((d) => (
                              <tr key={d.date}>
                                <td className="py-1 pl-2.5 pr-1.5 font-mono font-medium text-slate-900">
                                  {formatReadableDateId(d.date)}
                                </td>
                                <td className="py-1 px-2 text-right font-mono tabular-nums text-red-700 font-semibold">
                                  {d.bdInCount}
                                </td>
                                <td className="py-1 px-2 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                                  {d.rfuOutCount}
                                </td>
                                <td className="py-1 px-2 text-right font-mono tabular-nums text-slate-700">
                                  {d.downtimeHours.toFixed(1)} jam
                                </td>
                                <td
                                  className={`py-1 px-2 text-right font-mono tabular-nums font-bold ${
                                    d.paPct >= targetPaPct ? 'text-emerald-700' : 'text-amber-700'
                                  }`}
                                >
                                  {d.paPct.toFixed(1)}%
                                </td>
                                <td className="py-1 pl-2 pr-2.5 text-[9.5px] text-slate-500">
                                  {d.source === 'hourly_manual'
                                    ? 'Input Manual Per Jam'
                                    : 'Estimasi Downtime Armada'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Top Bad Actors & Top Pareto Components side-by-side */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 print-avoid-break">
                      <div className="border border-slate-200 rounded overflow-hidden">
                        <div className="bg-slate-100 border-b border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 uppercase">
                          Top 5 Unit Bad Actor (Frekuensi &amp; Downtime)
                        </div>
                        {periodMetrics.badActors.length === 0 ? (
                          <div className="p-3 text-[11px] text-slate-500">
                            Tidak ada kejadian breakdown pada periode ini.
                          </div>
                        ) : (
                          <table className="w-full text-left border-collapse text-[10px]">
                            <thead className="border-b border-slate-200 text-slate-500">
                              <tr>
                                <th className="py-1 px-2">Unit</th>
                                <th className="py-1 px-2 text-right">Kejadian</th>
                                <th className="py-1 px-2 text-right">Total Durasi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {periodMetrics.badActors.map((u) => (
                                <tr key={u.unitCode}>
                                  <td className="py-1 px-2 font-mono font-bold text-slate-900">
                                    {u.unitCode}{' '}
                                    <span className="font-sans font-normal text-[9px] text-slate-400">
                                      ({u.fleetGroup})
                                    </span>
                                  </td>
                                  <td className="py-1 px-2 text-right font-mono tabular-nums text-red-700 font-semibold">
                                    {u.bdCount}x
                                  </td>
                                  <td className="py-1 px-2 text-right font-mono tabular-nums text-slate-700">
                                    {formatDurationId(u.totalMinutes)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      <div className="border border-slate-200 rounded overflow-hidden">
                        <div className="bg-slate-100 border-b border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 uppercase">
                          Top 5 Pareto Komponen Bermasalah (RFU)
                        </div>
                        {periodMetrics.paretoComponents.length === 0 ? (
                          <div className="p-3 text-[11px] text-slate-500">
                            Belum ada data kategori komponen pada periode ini.
                          </div>
                        ) : (
                          <table className="w-full text-left border-collapse text-[10px]">
                            <thead className="border-b border-slate-200 text-slate-500">
                              <tr>
                                <th className="py-1 px-2">Komponen</th>
                                <th className="py-1 px-2 text-right">Kasus</th>
                                <th className="py-1 px-2 text-right">Porsi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {periodMetrics.paretoComponents.map((c) => (
                                <tr key={c.komponen}>
                                  <td className="py-1 px-2 font-medium text-slate-800">
                                    {c.komponen}
                                  </td>
                                  <td className="py-1 px-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                                    {c.count}x
                                  </td>
                                  <td className="py-1 px-2 text-right font-mono tabular-nums text-slate-600">
                                    {c.sharePct.toFixed(0)}%
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </section>
                )}

              {/* Section: Active Breakdown Units */}
              {includeBdList && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-l-3 border-red-600 pl-2">
                      {secNumBd}. Daftar Unit Breakdown Aktif ({scopedBd.length} Unit)
                    </h2>
                    <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                      Posisi &amp; status per {nowTimeStr}
                    </span>
                  </div>

                  {scopedBd.length === 0 ? (
                    <div className="border border-slate-200 rounded p-4 text-center text-xs text-slate-500">
                      Tidak ada unit berstatus Breakdown (BD) aktif pada cakupan periode ini.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded overflow-hidden">
                      <table className="w-full text-left border-collapse text-[10px] leading-snug">
                        <thead className="bg-slate-100 border-b border-slate-300 font-semibold text-slate-700 uppercase">
                          <tr>
                            <th className="py-1.5 pl-2 pr-1 w-6 font-mono">No</th>
                            <th className="py-1.5 px-1.5 w-[70px]">Unit</th>
                            <th className="py-1.5 px-1.5 w-[72px]">Mulai BD</th>
                            <th className="py-1.5 px-1.5 w-[72px]">Durasi &amp; Split</th>
                            <th className="py-1.5 px-1.5 w-[70px]">Lokasi</th>
                            <th className="py-1.5 px-1.5 w-[96px]">MR &amp; Sparepart</th>
                            <th className="py-1.5 px-1.5 w-[76px]">PIC / ETR</th>
                            <th className="py-1.5 px-1.5">Keterangan Problem</th>
                            <th className="py-1.5 pl-1.5 pr-2 w-[96px]">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {scopedBd.map((rec, idx) => {
                            const split = computeBdTimeSplit(rec, nowMs);
                            const mrText = formatMrNumbers(rec.mrNumbers, '—');
                            const partStatusLabel = rec.partStatus
                              ? PART_STATUS_LABELS[rec.partStatus]
                              : '';
                            const etrEval = rec.etr?.trim()
                              ? computeEtrStatus(rec.tanggalBd, rec.jamBd, rec.etr, nowMs)
                              : null;

                            return (
                              <tr key={rec.id} className="align-top">
                                <td className="py-1.5 pl-2 pr-1 font-mono tabular-nums text-slate-500">
                                  {idx + 1}
                                </td>
                                <td className="py-1.5 px-1.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                                  <div>{rec.unitCode}</div>
                                  <div className="text-[9px] font-sans font-normal text-slate-400">
                                    {rec.fleetGroup}
                                  </div>
                                </td>
                                <td className="py-1.5 px-1.5 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                                  <div>{rec.jamBd}</div>
                                  <div className="text-[9px] text-slate-400">
                                    {formatReadableDateId(rec.tanggalBd)}
                                  </div>
                                </td>
                                <td className="py-1.5 px-1.5 font-mono tabular-nums whitespace-nowrap">
                                  <div className="font-semibold text-slate-900">
                                    {formatDurationId(split.totalMinutes)}
                                  </div>
                                  {split.waitingPartMinutes > 0 && (
                                    <div className="text-[8.5px] font-sans text-slate-500">
                                      Mek: {formatDurationId(split.activeRepairMinutes)} · Part:{' '}
                                      <span className="text-amber-700 font-semibold">
                                        {formatDurationId(split.waitingPartMinutes)}
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td className="py-1.5 px-1.5 text-slate-700 break-words">
                                  {rec.lokasi?.trim() || '—'}
                                </td>
                                <td className="py-1.5 px-1.5 break-words">
                                  <div className="font-mono font-medium text-slate-900">
                                    {mrText}
                                  </div>
                                  {rec.partName?.trim() && (
                                    <div className="text-[9px] font-semibold text-slate-700">
                                      {rec.partName.trim()}
                                    </div>
                                  )}
                                  {partStatusLabel && (
                                    <div className="text-[9px] text-slate-600 mt-0.5">
                                      {partStatusLabel}
                                    </div>
                                  )}
                                  {rec.partNote?.trim() && (
                                    <div className="text-[8.5px] text-slate-500">
                                      {rec.partNote.trim()}
                                    </div>
                                  )}
                                </td>
                                <td className="py-1.5 px-1.5 break-words">
                                  <div className="text-slate-800">
                                    {rec.picMekanik?.trim() || '—'}
                                  </div>
                                  {rec.etr?.trim() && (
                                    <div
                                      className={`font-mono text-[9px] ${
                                        etrEval?.isOverdue
                                          ? 'text-red-700 font-bold'
                                          : 'text-slate-500'
                                      }`}
                                    >
                                      ETR: {rec.etr.trim()}
                                      {etrEval?.isOverdue ? ' (LEWAT)' : ''}
                                    </div>
                                  )}
                                </td>
                                <td className="py-1.5 px-1.5 text-slate-800 break-words">
                                  {rec.keterangan?.trim() || '—'}
                                </td>
                                <td className="py-1.5 pl-1.5 pr-2 text-slate-800 break-words">
                                  <span className="font-mono font-bold text-slate-900">
                                    {rec.status}
                                  </span>{' '}
                                  <span className="text-[9px] text-slate-600">
                                    {BD_STATUS_LABELS[rec.status]}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}

              {/* Section: RFU History */}
              {includeRfuList && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-l-3 border-emerald-600 pl-2">
                      {secNumRfu}. Riwayat Unit Ready For Use / RFU ({scopedRfu.length} Catatan)
                    </h2>
                    <span className="text-[10px] font-mono text-slate-500">
                      Periode: {periodRange.displayLabel}
                    </span>
                  </div>

                  {scopedRfu.length === 0 ? (
                    <div className="border border-slate-200 rounded p-4 text-center text-xs text-slate-500">
                      Belum ada catatan unit RFU pada periode {periodRange.displayLabel}.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded overflow-hidden">
                      <table className="w-full text-left border-collapse text-[10px] leading-snug">
                        <thead className="bg-slate-100 border-b border-slate-300 font-semibold text-slate-700 uppercase">
                          <tr>
                            <th className="py-1.5 pl-2 pr-1 w-6 font-mono">No</th>
                            <th className="py-1.5 px-1.5 w-[72px]">Unit / PIC</th>
                            <th className="py-1.5 px-1.5 w-[92px]">BD → RFU</th>
                            <th className="py-1.5 px-1.5 w-[72px]">Durasi &amp; Split</th>
                            <th className="py-1.5 px-1.5 w-[90px]">Lokasi, MR &amp; Part</th>
                            <th className="py-1.5 px-1.5 w-[160px]">Komponen &amp; Activity</th>
                            <th className="py-1.5 pl-1.5 pr-2">Problem &amp; Status Akhir</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {scopedRfu.map((item, idx) => {
                            const split = computeRfuTimeSplit(item);
                            const componentPath = [
                              item.komponen?.trim(),
                              item.subKomponen?.trim(),
                              item.detailSubKomponen?.trim(),
                            ]
                              .filter(Boolean)
                              .join(' → ');
                            const mrText = formatMrNumbers(normalizeMrList(item.mrNumbers), '—');

                            return (
                              <tr key={item.id} className="align-top">
                                <td className="py-1.5 pl-2 pr-1 font-mono tabular-nums text-slate-500">
                                  {idx + 1}
                                </td>
                                <td className="py-1.5 px-1.5 break-words">
                                  <div className="font-mono font-bold text-slate-900">
                                    {item.unitCode}
                                  </div>
                                  {item.picMekanik?.trim() && (
                                    <div className="text-[9px] text-slate-500">
                                      PIC: {item.picMekanik.trim()}
                                    </div>
                                  )}
                                </td>
                                <td className="py-1.5 px-1.5 font-mono tabular-nums whitespace-nowrap">
                                  <div className="text-slate-600">
                                    BD: {formatReadableDateId(item.tanggalBd).slice(0, 5)} {item.jamBd}
                                  </div>
                                  <div className="text-emerald-700 font-semibold">
                                    RFU: {formatReadableDateId(item.tanggalRfu).slice(0, 5)} {item.jamRfu}
                                  </div>
                                </td>
                                <td className="py-1.5 px-1.5 font-mono tabular-nums whitespace-nowrap">
                                  <div className="font-semibold text-slate-900">
                                    {formatDurationId(split.totalMinutes)}
                                  </div>
                                  {split.waitingPartMinutes > 0 && (
                                    <div className="text-[8.5px] font-sans text-slate-500">
                                      Mek: {formatDurationId(split.activeRepairMinutes)} · Part:{' '}
                                      <span className="text-amber-700 font-semibold">
                                        {formatDurationId(split.waitingPartMinutes)}
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td className="py-1.5 px-1.5 break-words">
                                  <div className="text-slate-800">
                                    {item.lokasi?.trim() || '—'}
                                  </div>
                                  <div className="font-mono text-[9px] text-slate-500 mt-0.5">
                                    MR: {mrText}
                                  </div>
                                  {item.partName?.trim() && (
                                    <div className="text-[9px] font-medium text-slate-700">
                                      Part: {item.partName.trim()}
                                    </div>
                                  )}
                                </td>
                                <td className="py-1.5 px-1.5 break-words">
                                  {componentPath ? (
                                    <div className="font-semibold text-slate-800">
                                      {componentPath}
                                    </div>
                                  ) : (
                                    <div className="text-slate-400">—</div>
                                  )}
                                  {item.activityPerbaikan?.trim() && (
                                    <div className="text-slate-600 mt-0.5">
                                      Act: {item.activityPerbaikan.trim()}
                                    </div>
                                  )}
                                </td>
                                <td className="py-1.5 pl-1.5 pr-2 break-words">
                                  <div className="text-slate-800">
                                    {item.keterangan?.trim() || '—'}
                                  </div>
                                  <div className="text-[9px] text-slate-500 mt-0.5">
                                    Status: {formatBdStatus(item.lastStatus)}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}

              {/* Formal Document Footer */}
              <footer className="border-t border-slate-200 pt-2.5 flex items-center justify-between text-[10px] text-slate-500 print-avoid-break">
                <span>
                  Monitoring Breakdown IP HAULING — Karunia Armada Indonesia ({MODE_LABELS[reportMode]})
                </span>
                <span className="font-mono tabular-nums">
                  Dicetak: {formatReadableDateId(todayStr)} {nowTimeStr}
                </span>
              </footer>
            </div>
          )}
        </div>

        {/* Non-Print Footer Action Bar */}
        <div className="no-print px-4 sm:px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <p className="hidden sm:block text-[11px] text-slate-500">
            Tips: Pada dialog cetak browser, pilih tujuan{' '}
            <strong className="text-slate-700">Save as PDF / Simpan sebagai PDF</strong>.
          </p>
          <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] sm:min-h-0 px-4 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleTriggerPrint}
              disabled={nothingSelected}
              className="min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Cetak / Simpan PDF ({MODE_LABELS[reportMode]})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
