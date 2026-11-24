import { BreakdownRecord, FleetUnit } from '../types/fleet';

interface DashboardSummaryStripProps {
  runningUnits: FleetUnit[];
  bdRecords: BreakdownRecord[];
  totalFleetCount: number;
  targetPaPct?: number;
  onOpenDashboardTab: () => void;
}

export function DashboardSummaryStrip({
  runningUnits,
  bdRecords,
  totalFleetCount,
  targetPaPct = 90,
  onOpenDashboardTab,
}: DashboardSummaryStripProps) {
  const runningCount = runningUnits.length;
  const bdCount = bdRecords.length;
  const availabilityNum = totalFleetCount > 0 ? (runningCount / totalFleetCount) * 100 : 0;
  const availabilityPct = totalFleetCount > 0 ? availabilityNum.toFixed(1) : '0.0';
  const bdPct = totalFleetCount > 0 ? ((bdCount / totalFleetCount) * 100).toFixed(1) : '0.0';
  const paStatusColor =
    totalFleetCount === 0
      ? 'text-slate-900'
      : availabilityNum >= targetPaPct
      ? 'text-emerald-700'
      : availabilityNum >= targetPaPct - 10
      ? 'text-amber-700'
      : 'text-red-700';

  const pmscRun = runningUnits.filter((u) => u.fleetGroup === 'PMSC').length;
  const pmscBd = bdRecords.filter((b) => b.fleetGroup === 'PMSC').length;
  const pmvvRun = runningUnits.filter((u) => u.fleetGroup === 'PMVV').length;
  const pmvvBd = bdRecords.filter((b) => b.fleetGroup === 'PMVV').length;

  return (
    <section
      aria-label="Area Dashboard BD"
      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      <div className="px-3.5 sm:px-4 py-2.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
          <h2 className="text-xs font-semibold tracking-wide text-slate-900">
            Area Dashboard BD
          </h2>
          <span className="hidden sm:inline" aria-hidden="true">·</span>
          <span className="hidden sm:inline">Ringkasan langsung armada PMSC &amp; PMVV</span>
        </div>
        <button
          type="button"
          onClick={onOpenDashboardTab}
          className="text-xs font-medium text-blue-700 hover:text-blue-800 hover:underline cursor-pointer whitespace-nowrap shrink-0 py-0.5"
        >
          Dashboard BD &amp; PA Per Jam →
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200">
        {/* KPI 1: Total Armada */}
        <div className="bg-white px-3.5 py-3 sm:px-4 sm:py-3.5">
          <p className="text-[11px] sm:text-xs font-medium text-slate-500">Total Armada</p>
          <div className="mt-1 flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900">
              {totalFleetCount}
            </span>
            <span className="text-xs text-slate-500">unit</span>
          </div>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500 tabular-nums">
            PMSC {pmscRun + pmscBd} · PMVV {pmvvRun + pmvvBd}
          </p>
        </div>

        {/* KPI 2: Unit Running */}
        <div className="bg-white px-3.5 py-3 sm:px-4 sm:py-3.5">
          <p className="text-[11px] sm:text-xs font-medium text-slate-500">Unit Running</p>
          <div className="mt-1 flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-emerald-700">
              {runningCount}
            </span>
            <span className={`text-[11px] sm:text-xs font-medium tabular-nums ${paStatusColor}`}>
              {availabilityPct}% PA
            </span>
          </div>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500 tabular-nums">
            PMSC {pmscRun} · PMVV {pmvvRun}
          </p>
        </div>

        {/* KPI 3: Unit BD */}
        <div className="bg-white px-3.5 py-3 sm:px-4 sm:py-3.5">
          <p className="text-[11px] sm:text-xs font-medium text-slate-500">Unit BD Aktif</p>
          <div className="mt-1 flex items-baseline gap-1.5 sm:gap-2">
            <span
              className={`text-xl sm:text-2xl font-bold font-mono tabular-nums ${
                bdCount > 0 ? 'text-red-700' : 'text-slate-900'
              }`}
            >
              {bdCount}
            </span>
            <span className="text-[11px] sm:text-xs font-medium text-slate-500 tabular-nums">
              {bdPct}% BD
            </span>
          </div>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500 tabular-nums">
            PMSC {pmscBd} · PMVV {pmvvBd}
          </p>
        </div>

        {/* KPI 4: Physical Availability Progress */}
        <div className="bg-white px-3.5 py-3 sm:px-4 sm:py-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs">
            <span className="font-medium text-slate-500 truncate">
              PA Fisik <span className="font-mono text-slate-400">· Target {targetPaPct}%</span>
            </span>
            <span className={`font-mono font-semibold tabular-nums shrink-0 ${paStatusColor}`}>
              {availabilityPct}%
            </span>
          </div>
          <div className="mt-2.5 w-full h-2 bg-slate-100 rounded-sm overflow-hidden flex relative">
            <div
              className="bg-emerald-600 transition-all duration-200"
              style={{ width: `${totalFleetCount > 0 ? (runningCount / totalFleetCount) * 100 : 0}%` }}
            />
            <div
              className="bg-red-600 transition-all duration-200"
              style={{ width: `${totalFleetCount > 0 ? (bdCount / totalFleetCount) * 100 : 0}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
            <span>Run: {runningCount}</span>
            <span>BD: {bdCount}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
