import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
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
}

export function AnalyticsParetoSection({
  bdRecords,
  rfuHistory,
  hourlyOverrides,
  totalFleetCount,
  targetPaPct,
}: AnalyticsParetoSectionProps) {
  const [period, setPeriod] = useState<AnalyticsPeriod>('30D');
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const analytics = useMemo(
    () =>
      computeFleetAnalytics({
        period,
        bdRecords,
        rfuHistory,
        hourlyOverrides,
        totalFleetCount,
      }),
    [period, bdRecords, rfuHistory, hourlyOverrides, totalFleetCount]
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

  return (
    <section
      aria-label="Analitik Pareto & Bad Actor"
      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      {/* Header */}
      <div className="px-3.5 sm:px-4 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start gap-2">
          <BarChart3 className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Analitik Manajemen: Pareto Problem, Bad Actor &amp; MTTR
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Dihitung otomatis dari catatan Riwayat RFU, unit BD aktif, dan rekaman PA harian.
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

      {/* 4 KPI Strip */}
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
            {bdRecords.length} unit masih breakdown
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
            Akumulasi {analytics.periodEventCount} kejadian BD
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
            {analytics.dailyTrend.length} hari pengamatan
          </p>
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
