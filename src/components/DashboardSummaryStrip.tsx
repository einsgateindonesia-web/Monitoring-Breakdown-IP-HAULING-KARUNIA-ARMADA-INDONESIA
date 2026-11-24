import { BreakdownRecord, FleetUnit } from '../types/fleet';

interface DashboardSummaryStripProps {
  runningUnits: FleetUnit[];
  bdRecords: BreakdownRecord[];
  totalFleetCount: number;
  onOpenDashboardTab: () => void;
}

export function DashboardSummaryStrip({
  runningUnits,
  bdRecords,
  totalFleetCount,
  onOpenDashboardTab,
}: DashboardSummaryStripProps) {
  const runningCount = runningUnits.length;
  const bdCount = bdRecords.length;
  const availabilityPct =
    totalFleetCount > 0 ? ((runningCount / totalFleetCount) * 100).toFixed(1) : '0.0';
  const bdPct = totalFleetCount > 0 ? ((bdCount / totalFleetCount) * 100).toFixed(1) : '0.0';

  const pmscRun = runningUnits.filter((u) => u.fleetGroup === 'PMSC').length;
  const pmscBd = bdRecords.filter((b) => b.fleetGroup === 'PMSC').length;
  const pmvvRun = runningUnits.filter((u) => u.fleetGroup === 'PMVV').length;
  const pmvvBd = bdRecords.filter((b) => b.fleetGroup === 'PMVV').length;

  return (
    <section
      aria-label="Area Dashboard BD"
      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <h2 className="text-xs font-semibold tracking-wide text-slate-900">
            Area Dashboard BD
          </h2>
          <span aria-hidden="true">·</span>
          <span>Ringkasan langsung armada PMSC &amp; PMVV</span>
        </div>
        <button
          type="button"
          onClick={onOpenDashboardTab}
          className="text-xs font-medium text-blue-700 hover:text-blue-800 hover:underline cursor-pointer whitespace-nowrap shrink-0"
        >
          Lihat detail &amp; laporan WA →
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        {/* KPI 1: Total Armada */}
        <div className="px-4 py-3.5">
          <p className="text-xs font-medium text-slate-500">Total Armada Terdaftar</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {totalFleetCount}
            </span>
            <span className="text-xs text-slate-500">unit</span>
          </div>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            PMSC {pmscRun + pmscBd} · PMVV {pmvvRun + pmvvBd}
          </p>
        </div>

        {/* KPI 2: Unit Running */}
        <div className="px-4 py-3.5">
          <p className="text-xs font-medium text-slate-500">Unit Running</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
              {runningCount}
            </span>
            <span className="text-xs font-medium text-emerald-700 tabular-nums">
              {availabilityPct}% PA
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            PMSC {pmscRun} · PMVV {pmvvRun}
          </p>
        </div>

        {/* KPI 3: Unit BD */}
        <div className="px-4 py-3.5">
          <p className="text-xs font-medium text-slate-500">Unit BD Aktif</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tabular-nums ${
                bdCount > 0 ? 'text-red-700' : 'text-slate-900'
              }`}
            >
              {bdCount}
            </span>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              {bdPct}% BD
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            PMSC {pmscBd} · PMVV {pmvvBd}
          </p>
        </div>

        {/* KPI 4: Physical Availability Progress */}
        <div className="px-4 py-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-500">Ketersediaan Fisik (PA)</span>
            <span className="font-mono font-semibold tabular-nums text-slate-900">
              {availabilityPct}%
            </span>
          </div>
          <div className="mt-2.5 w-full h-2 bg-slate-100 rounded-sm overflow-hidden flex">
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
            <span>Running: {runningCount}</span>
            <span>Breakdown: {bdCount}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
