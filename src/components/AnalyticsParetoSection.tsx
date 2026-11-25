import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Clock,
  PackageSearch,
  Timer,
  Wrench,
} from 'lucide-react';
import {
  BreakdownRecord,
  HourlySlotOverride,
  RfuHistoryRecord,
} from '../types/fleet';
import { AnalyticsPeriod, computeFleetAnalytics } from '../utils/analyticsUtils';
import { formatDurationId, formatReadableDateId } from '../utils/fleetUtils';

interface AnalyticsParetoSectionProps {
  bdRecords: BreakdownRecord[];
  rfuHistory: RfuHistoryRecord[];
  hourlyOverrides: Record<string, HourlySlotOverride>;
  totalFleetCount: number;
  targetPaPct: number;
  onOpenHistoricalTab?: () => void;
}

export function AnalyticsParetoSection({
  bdRecords,
  rfuHistory,
  hourlyOverrides,
  totalFleetCount,
  targetPaPct,
  onOpenHistoricalTab,
}: AnalyticsParetoSectionProps) {
  const [period, setPeriod] = useState<AnalyticsPeriod>('30D');
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const analytics = useMemo(
    () =>
      computeFleetAnalytics({
        period,
        bdRecords,
        rfuHistory,
        hourlyOverrides,
        totalFleetCount,
        nowMs,
      }),
    [period, bdRecords, rfuHistory, hourlyOverrides, totalFleetCount, nowMs]
  );

  const maxBadActorCount =
    analytics.badActors.length > 0
      ? Math.max(...analytics.badActors.map((b) => b.bdCount))
      : 1;
  const maxParetoCount =
    analytics.paretoComponents.length > 0
      ? Math.max(...analytics.paretoComponents.map((p) => p.count))
      : 1;

  const hoveredPoint = hoveredDate
    ? analytics.dailyTrend.find((d) => d.date === hoveredDate) ?? null
    : null;

  const avgPaColor =
    analytics.avgPeriodPaPct === null
      ? 'text-slate-900'
      : analytics.avgPeriodPaPct >= targetPaPct
      ? 'text-emerald-700'
      : analytics.avgPeriodPaPct >= targetPaPct - 10
      ? 'text-amber-700'
      : 'text-red-700';

  const totalSplitMins =
    analytics.totalActiveRepairMinutes + analytics.totalWaitingPartMinutes;
  const waitPartPct =
    totalSplitMins > 0 ? (analytics.totalWaitingPartMinutes / totalSplitMins) * 100 : 0;
  const activeRepairPct =
    totalSplitMins > 0 ? (analytics.totalActiveRepairMinutes / totalSplitMins) * 100 : 0;

  const totalSchedCount = analytics.scheduledCount + analytics.unscheduledCount;
  const schedCountPct =
    totalSchedCount > 0 ? (analytics.scheduledCount / totalSchedCount) * 100 : 0;
  const unschedCountPct =
    totalSchedCount > 0 ? (analytics.unscheduledCount / totalSchedCount) * 100 : 0;

  const maxShiftVolume = Math.max(
    1,
    analytics.shiftPerformance.shift1BdIn,
    analytics.shiftPerformance.shift1RfuOut,
    analytics.shiftPerformance.shift2BdIn,
    analytics.shiftPerformance.shift2RfuOut
  );

  return (
    <section
      aria-label="Analitik Manajemen & Operasional"
      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      {/* Header */}
      <div className="px-3.5 sm:px-4 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start gap-2">
          <BarChart3 className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Analitik Manajemen: Kontrol Downtime, Waiting Part, Shift &amp; Pareto
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Otomatis menghitung MTTR, Active Repair vs Waiting Part, Overdue ETR, Aging Bucket, Shift 1 vs 2, dan Repeat BD.
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-md self-start sm:self-auto">
          {(
            [
              { id: '7D', label: '7 Hari' },
              { id: '30D', label: '30 Hari' },
              { id: 'ALL', label: 'Semua' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPeriod(item.id)}
              className={`min-h-[34px] sm:min-h-0 px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                period === item.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Primary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border-b border-slate-200">
        <div className="bg-white px-4 py-3">
          <p className="text-xs font-medium text-slate-500">MTTR (Rata-rata Repair)</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono tabular-nums text-slate-900">
              {formatDurationId(analytics.mttrMinutes)}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            Dari {analytics.rfuCountInPeriod} unit selesai RFU
          </p>
        </div>

        <div className="bg-white px-4 py-3">
          <p className="text-xs font-medium text-slate-500">Rata-rata Aging BD Aktif</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-xl font-bold font-mono tabular-nums ${
                (analytics.activeAvgAgingMinutes ?? 0) >= 720
                  ? 'text-red-700'
                  : (analytics.activeAvgAgingMinutes ?? 0) >= 360
                  ? 'text-amber-700'
                  : 'text-slate-900'
              }`}
            >
              {formatDurationId(analytics.activeAvgAgingMinutes)}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {bdRecords.length} unit aktif · {analytics.overdueEtrUnits.length} lewat ETR
          </p>
        </div>

        <div className="bg-white px-4 py-3">
          <p className="text-xs font-medium text-slate-500">Total Downtime Periode</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono tabular-nums text-slate-900">
              {formatDurationId(analytics.totalDowntimeMinutes)}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {analytics.periodEventCount} kejadian · Tunggu Part {formatDurationId(analytics.totalWaitingPartMinutes)}
          </p>
        </div>

        <div className="bg-white px-4 py-3">
          <p className="text-xs font-medium text-slate-500">Rata-rata PA Periode</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`text-xl font-bold font-mono tabular-nums ${avgPaColor}`}>
              {analytics.avgPeriodPaPct !== null
                ? `${analytics.avgPeriodPaPct.toFixed(1)}%`
                : '—'}
            </span>
            <span className="text-[11px] font-mono text-slate-500 tabular-nums">
              Target {targetPaPct}%
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {analytics.dailyTrend.length} hari · Repeat BD ≤72j: {analytics.repeatSummary.repeatCount}x
          </p>
        </div>
      </div>

      {/* Row 2: Active Repair vs Waiting Part + Scheduled vs Unscheduled & Repeat BD */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 border-b border-slate-200">
        {/* Card A: Active Repair Time vs Waiting Part Time */}
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <PackageSearch className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">
                Active Repair Time vs Waiting Part Time
              </h3>
            </div>
            <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
              {analytics.activeWaitingPartCount} unit B1/part aktif
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md">
              <p className="text-[11px] text-slate-500">Kerja Mekanik (Active Repair)</p>
              <div className="mt-0.5 flex items-baseline justify-between gap-2">
                <span className="text-base font-bold font-mono tabular-nums text-blue-700">
                  {formatDurationId(analytics.totalActiveRepairMinutes)}
                </span>
                <span className="text-[11px] font-mono font-semibold text-blue-700 tabular-nums">
                  {activeRepairPct.toFixed(0)}%
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-md">
              <p className="text-[11px] text-amber-900">Tunggu Sparepart (B1 → Ready)</p>
              <div className="mt-0.5 flex items-baseline justify-between gap-2">
                <span className="text-base font-bold font-mono tabular-nums text-amber-800">
                  {formatDurationId(analytics.totalWaitingPartMinutes)}
                </span>
                <span className="text-[11px] font-mono font-semibold text-amber-800 tabular-nums">
                  {waitPartPct.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="w-full h-2.5 bg-slate-100 rounded-sm overflow-hidden flex">
              <div
                className="bg-blue-700 transition-all"
                style={{ width: `${totalSplitMins > 0 ? activeRepairPct : 100}%` }}
                title={`Active Repair: ${activeRepairPct.toFixed(1)}%`}
              />
              <div
                className="bg-amber-500 transition-all"
                style={{ width: `${waitPartPct}%` }}
                title={`Waiting Part: ${waitPartPct.toFixed(1)}%`}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
              <span>Status B1 periode ini: {analytics.b1EventsCount} kejadian ({formatDurationId(analytics.b1DowntimeMinutes)})</span>
              <span>Timer otomatis saat B1 → Ready</span>
            </div>
          </div>

          {analytics.topWaitingPartUnits.length > 0 && (
            <div className="pt-1 border-t border-slate-100 space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-600">
                Unit dengan Waktu Tunggu Part Terlama:
              </p>
              <div className="space-y-1">
                {analytics.topWaitingPartUnits.map((item) => (
                  <div
                    key={item.unitCode}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono font-semibold text-slate-900 shrink-0">
                        {item.unitCode}
                      </span>
                      {item.isWaitingNow && (
                        <span className="px-1 py-px text-[10px] font-semibold bg-amber-100 text-amber-800 rounded shrink-0">
                          Aktif
                        </span>
                      )}
                      {item.partName && (
                        <span className="text-slate-500 truncate">· {item.partName}</span>
                      )}
                    </div>
                    <span className="font-mono tabular-nums font-semibold text-amber-800 shrink-0">
                      {formatDurationId(item.waitingMinutes)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Card B: Scheduled (BS) vs Unscheduled + Repeat BD 72h Alarm */}
        <div className="p-4 space-y-4">
          {/* Scheduled vs Unscheduled */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-slate-700 shrink-0" aria-hidden="true" />
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">
                  Scheduled Service (BS) vs Unscheduled BD (B0–B10)
                </h3>
              </div>
              <span className="text-[11px] font-mono tabular-nums text-slate-500">
                {totalSchedCount} kejadian
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="px-2.5 py-2 bg-emerald-50/70 border border-emerald-200 rounded-md">
                <span className="text-[11px] text-emerald-900">Scheduled (BS)</span>
                <div className="mt-0.5 flex items-baseline justify-between font-mono tabular-nums">
                  <strong className="text-sm text-emerald-800">{analytics.scheduledCount}x</strong>
                  <span className="text-[11px] text-emerald-700">
                    {schedCountPct.toFixed(0)}% · {formatDurationId(analytics.scheduledMinutes)}
                  </span>
                </div>
              </div>
              <div className="px-2.5 py-2 bg-red-50/70 border border-red-200 rounded-md">
                <span className="text-[11px] text-red-900">Unscheduled (B0–B10)</span>
                <div className="mt-0.5 flex items-baseline justify-between font-mono tabular-nums">
                  <strong className="text-sm text-red-800">{analytics.unscheduledCount}x</strong>
                  <span className="text-[11px] text-red-700">
                    {unschedCountPct.toFixed(0)}% · {formatDurationId(analytics.unscheduledMinutes)}
                  </span>
                </div>
              </div>
            </div>

            <div className="w-full h-2 bg-slate-100 rounded-sm overflow-hidden flex">
              <div
                className="bg-emerald-600"
                style={{ width: `${schedCountPct}%` }}
                title={`Scheduled (BS): ${schedCountPct.toFixed(1)}%`}
              />
              <div
                className="bg-red-600"
                style={{ width: `${unschedCountPct}%` }}
                title={`Unscheduled (B0-B10): ${unschedCountPct.toFixed(1)}%`}
              />
            </div>
          </div>

          {/* Summary Repeat BD <= 72 Jam */}
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">
                  Ringkasan Repeat BD (≤ 72 Jam Setelah RFU)
                </h3>
              </div>
              {onOpenHistoricalTab && (
                <button
                  type="button"
                  onClick={onOpenHistoricalTab}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-800 hover:underline cursor-pointer whitespace-nowrap"
                >
                  <span>Historical BD</span>
                  <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="font-mono tabular-nums">
                Total Repeat:{' '}
                <strong
                  className={
                    analytics.repeatSummary.repeatCount > 0 ? 'text-amber-800' : 'text-slate-900'
                  }
                >
                  {analytics.repeatSummary.repeatCount}x ({analytics.repeatSummary.repeatRatePct.toFixed(1)}%)
                </strong>
              </span>
              <span className="text-slate-500 font-mono tabular-nums">
                Komponen Sama:{' '}
                <strong className="text-red-700">
                  {analytics.repeatSummary.sameComponentRepeatCount}x
                </strong>
              </span>
            </div>

            {analytics.repeatSummary.topRepeatUnits.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                Tidak ada unit mengalami Repeat BD ≤ 72 jam pada periode terpilih.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {analytics.repeatSummary.topRepeatUnits.map((u) => (
                  <span
                    key={u.unitCode}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono rounded border ${
                      u.isActiveNow
                        ? 'bg-red-50 text-red-800 border-red-200'
                        : 'bg-amber-50 text-amber-900 border-amber-200'
                    }`}
                  >
                    <strong>{u.unitCode}</strong>
                    <span>{u.repeatCount}x</span>
                    {u.latestGapMinutes !== null && (
                      <span className="text-[10px] opacity-80">
                        (jeda {formatDurationId(u.latestGapMinutes)})
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: 3-Column Operational Control: Overdue ETR | Aging Bucket | Shift 1 vs 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 border-b border-slate-200">
        {/* Col 1: Alarm Overdue ETR */}
        <div className="p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">
                Alarm Overdue ETR
              </h3>
            </div>
            <span
              className={`text-xs font-mono font-bold tabular-nums ${
                analytics.overdueEtrUnits.length > 0 ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {analytics.overdueEtrUnits.length} unit lewat
            </span>
          </div>

          <p className="text-[11px] text-slate-500 tabular-nums">
            {analytics.activeWithEtrCount} dari {bdRecords.length} BD aktif memiliki target ETR
            {analytics.etrAccuracyPct !== null && (
              <>
                {' '}
                · Ketepatan ETR RFU:{' '}
                <strong className="font-mono text-slate-800">
                  {analytics.etrAccuracyPct.toFixed(0)}%
                </strong>
              </>
            )}
          </p>

          {analytics.overdueEtrUnits.length === 0 ? (
            <p className="text-xs text-emerald-700 bg-emerald-50/70 border border-emerald-200 rounded px-3 py-2">
              Tidak ada unit BD aktif yang melewati estimasi ETR saat ini.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 border border-red-200 bg-red-50/30 rounded-md max-h-44 overflow-auto ops-scroll">
              {analytics.overdueEtrUnits.map((item) => (
                <div
                  key={`${item.unitCode}-${item.jamBd}`}
                  className="px-2.5 py-2 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-900">{item.unitCode}</span>
                      <span className="text-[10px] font-mono text-slate-500">{item.status}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">
                      ETR {item.etr} {item.picMekanik ? `· PIC ${item.picMekanik}` : ''}
                    </p>
                  </div>
                  <span className="font-mono tabular-nums text-[11px] font-semibold text-red-700 shrink-0">
                    +{formatDurationId(item.overdueMinutes)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Col 2: Aging Bucket Unit BD Aktif */}
        <div className="p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-slate-700 shrink-0" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">
                Aging Bucket BD Aktif
              </h3>
            </div>
            <span className="text-[11px] font-mono tabular-nums text-slate-500">
              {bdRecords.length} unit aktif
            </span>
          </div>

          <div className="space-y-2">
            {analytics.agingBuckets.map((bucket) => {
              const barColor =
                bucket.id === 'GT72'
                  ? 'bg-red-700'
                  : bucket.id === 'H24_72'
                  ? 'bg-amber-600'
                  : bucket.id === 'H6_24'
                  ? 'bg-blue-600'
                  : 'bg-emerald-600';
              return (
                <div key={bucket.id} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-700">{bucket.label}</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {bucket.count} unit ({bucket.pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-sm overflow-hidden">
                    <div
                      className={`h-full ${barColor}`}
                      style={{ width: `${bucket.count > 0 ? Math.max(6, bucket.pct) : 0}%` }}
                    />
                  </div>
                  {bucket.count > 0 && (bucket.id === 'H24_72' || bucket.id === 'GT72') && (
                    <p className="text-[10px] font-mono text-red-700 leading-snug">
                      {bucket.units.join(' · ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Col 3: Perbandingan Shift 1 vs Shift 2 */}
        <div className="p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">
              Komparasi Shift 1 vs Shift 2
            </h3>
            <span className="text-[11px] text-slate-500">Masuk BD vs RFU</span>
          </div>

          <div className="space-y-3 text-xs">
            {/* Shift 1 */}
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">Shift 1 (06:00–18:00)</span>
                <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                  MTTR {formatDurationId(analytics.shiftPerformance.shift1MttrMinutes)}
                </span>
              </div>
              <div className="space-y-1 text-[11px] font-mono tabular-nums">
                <div className="flex items-center gap-2">
                  <span className="w-16 text-red-700">BD Masuk</span>
                  <div className="flex-1 h-1.5 bg-slate-200 rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-red-600"
                      style={{
                        width: `${(analytics.shiftPerformance.shift1BdIn / maxShiftVolume) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-7 text-right font-semibold text-slate-900">
                    {analytics.shiftPerformance.shift1BdIn}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 text-emerald-700">RFU Out</span>
                  <div className="flex-1 h-1.5 bg-slate-200 rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-emerald-600"
                      style={{
                        width: `${(analytics.shiftPerformance.shift1RfuOut / maxShiftVolume) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-7 text-right font-semibold text-slate-900">
                    {analytics.shiftPerformance.shift1RfuOut}
                  </span>
                </div>
              </div>
            </div>

            {/* Shift 2 */}
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">Shift 2 (18:00–06:00)</span>
                <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                  MTTR {formatDurationId(analytics.shiftPerformance.shift2MttrMinutes)}
                </span>
              </div>
              <div className="space-y-1 text-[11px] font-mono tabular-nums">
                <div className="flex items-center gap-2">
                  <span className="w-16 text-red-700">BD Masuk</span>
                  <div className="flex-1 h-1.5 bg-slate-200 rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-red-600"
                      style={{
                        width: `${(analytics.shiftPerformance.shift2BdIn / maxShiftVolume) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-7 text-right font-semibold text-slate-900">
                    {analytics.shiftPerformance.shift2BdIn}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 text-emerald-700">RFU Out</span>
                  <div className="flex-1 h-1.5 bg-slate-200 rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-emerald-600"
                      style={{
                        width: `${(analytics.shiftPerformance.shift2RfuOut / maxShiftVolume) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-7 text-right font-semibold text-slate-900">
                    {analytics.shiftPerformance.shift2RfuOut}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Middle 2 Columns: Bad Actors + Pareto Komponen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 border-b border-slate-200">
        {/* Top 5 Bad Actor Units */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">
              Top 5 Unit Sering BD (Bad Actors)
            </h3>
            <span className="text-[11px] text-slate-500">Frekuensi &amp; Downtime</span>
          </div>

          {analytics.badActors.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              Belum ada data kejadian BD/RFU pada periode ini.
            </p>
          ) : (
            <div className="space-y-2.5">
              {analytics.badActors.map((item, idx) => (
                <div key={item.unitCode} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[11px] text-slate-400 w-4">
                        {idx + 1}.
                      </span>
                      <span className="font-mono font-semibold text-slate-900">
                        {item.unitCode}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {item.fleetGroup}
                      </span>
                      {item.activeCount > 0 && (
                        <span className="px-1.5 py-px text-[10px] font-medium bg-red-50 text-red-700 border border-red-200 rounded">
                          Sedang BD
                        </span>
                      )}
                    </div>
                    <div className="text-right font-mono tabular-nums text-[11px] shrink-0">
                      <span className="font-semibold text-slate-900">{item.bdCount}x BD</span>
                      <span className="text-slate-400 mx-1">·</span>
                      <span className="text-slate-600">{formatDurationId(item.totalMinutes)}</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-red-600"
                      style={{
                        width: `${Math.max(8, (item.bdCount / maxBadActorCount) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 5 Pareto Komponen */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">
              Top 5 Komponen Bermasalah (Pareto)
            </h3>
            <span className="text-[11px] text-slate-500">Dari Riwayat RFU</span>
          </div>

          {analytics.paretoComponents.length === 0 ? (
            <div className="py-6 text-center space-y-1">
              <p className="text-xs text-slate-600 font-medium">
                Belum ada komponen perbaikan yang diklasifikasikan pada periode ini.
              </p>
              <p className="text-[11px] text-slate-500">
                Lengkapi kolom Komponen di tab Riwayat RFU agar analisis Pareto terisi otomatis.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {analytics.paretoComponents.map((item, idx) => (
                <div key={item.komponen} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[11px] text-slate-400 w-4">
                        {idx + 1}.
                      </span>
                      <span className="font-medium text-slate-900 truncate">
                        {item.komponen}
                      </span>
                    </div>
                    <div className="text-right font-mono tabular-nums text-[11px] shrink-0">
                      <span className="font-semibold text-slate-900">{item.count}x</span>
                      <span className="text-slate-400 mx-1">·</span>
                      <span className="text-blue-700 font-medium">
                        {item.sharePct.toFixed(0)}%
                      </span>
                      <span className="text-slate-400 ml-1">
                        (Kum {item.cumulativePct.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-blue-700"
                      style={{
                        width: `${Math.max(8, (item.count / maxParetoCount) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}

              {analytics.uncategorizedRfuCount > 0 && (
                <p className="text-[11px] text-slate-500 pt-1">
                  Catatan: {analytics.uncategorizedRfuCount} catatan RFU belum memiliki pilihan komponen.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Daily PA Trend Bar Chart */}
      <div className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="text-xs text-slate-600">
            {hoveredPoint ? (
              <span className="font-medium text-slate-900 tabular-nums">
                {formatReadableDateId(hoveredPoint.date)} · PA{' '}
                <span className="font-mono font-bold">{hoveredPoint.paPct.toFixed(1)}%</span> ·{' '}
                {hoveredPoint.bdEventsCount} kejadian BD baru · Downtime{' '}
                <span className="font-mono">{hoveredPoint.downtimeHours.toFixed(1)}j</span> (
                {hoveredPoint.source === 'hourly_manual' ? 'PA Jam Manual' : 'Estimasi Log BD/RFU'})
              </span>
            ) : (
              <span>
                Tren PA Harian ({analytics.dailyTrend.length} Hari Terakhir) terhadap garis target{' '}
                <strong className="font-mono text-slate-800">{targetPaPct}%</strong>
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400">
            Ketuk/arahkan ke batang tanggal untuk rincian
          </span>
        </div>

        <div className="overflow-x-auto ops-scroll pt-3 pb-1">
          <div className="min-w-[460px]">
            <div className="relative h-28 flex items-end gap-1.5 border-b border-slate-200 px-1">
              <div
                className="absolute left-0 right-0 border-t border-dashed border-slate-400/70 pointer-events-none flex justify-end"
                style={{ bottom: `${targetPaPct}%` }}
              >
                <span className="text-[10px] font-mono text-slate-500 bg-white px-1 -mt-2">
                  Target {targetPaPct}%
                </span>
              </div>

              {analytics.dailyTrend.map((point) => {
                const barColor =
                  point.paPct >= targetPaPct
                    ? 'bg-emerald-600'
                    : point.paPct >= targetPaPct - 10
                    ? 'bg-amber-500'
                    : 'bg-red-600';

                return (
                  <div
                    key={point.date}
                    onClick={() => setHoveredDate(point.date)}
                    onMouseEnter={() => setHoveredDate(point.date)}
                    onMouseLeave={() => setHoveredDate(null)}
                    className="flex-1 h-full flex flex-col justify-end items-center cursor-pointer"
                  >
                    <span className="text-[9px] font-mono tabular-nums text-slate-500 mb-0.5 leading-none">
                      {point.paPct.toFixed(0)}%
                    </span>
                    <div
                      className={`w-full max-w-[34px] rounded-t-xs transition-all ${barColor}`}
                      style={{ height: `${Math.max(6, Math.min(100, point.paPct))}%` }}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5 px-1 mt-1.5">
              {analytics.dailyTrend.map((point) => (
                <div
                  key={`lbl-${point.date}`}
                  className="flex-1 text-center font-mono text-[10px] text-slate-500 tabular-nums"
                >
                  {point.shortLabel}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
