import { useEffect, useState } from 'react';
import { Check, Copy, Download, FileText } from 'lucide-react';
import { BD_STATUS_CATALOG, BD_STATUS_STYLES } from '../data/initialUnits';
import {
  BreakdownRecord,
  FleetGroup,
  FleetUnit,
  HourlySlotOverride,
  RfuHistoryRecord,
} from '../types/fleet';
import { buildWhatsappReport } from '../utils/fleetUtils';
import { AnalyticsParetoSection } from './AnalyticsParetoSection';
import { HourlyPaMonitoringSection } from './HourlyPaMonitoringSection';

interface AreaDashboardBdViewProps {
  runningUnits: FleetUnit[];
  bdRecords: BreakdownRecord[];
  rfuHistory: RfuHistoryRecord[];
  totalFleetCount: number;
  targetPaPct: number;
  isOwnerOrAdmin: boolean;
  onUpdateTargetPa: (nextTarget: number) => void;
  shiftDate: string;
  onChangeShiftDate: (date: string) => void;
  hourlyOverrides: Record<string, HourlySlotOverride>;
  onSetHourlyOverride: (slot: {
    shiftDate: string;
    slotIndex: number;
    totalPopulasi: number;
    bdCount: number;
  }) => void;
  onClearHourlyOverride: (key: string) => void;
  onCopyWaReport: (opts?: { includeReadyUnits?: boolean; includePicEtr?: boolean }) => void;
  onExportCsv: () => void;
  onOpenPdfReport: () => void;
  copiedWa: boolean;
  onBackToBoard: () => void;
  onOpenHistoricalTab?: () => void;
}

export function AreaDashboardBdView({
  runningUnits,
  bdRecords,
  rfuHistory,
  totalFleetCount,
  targetPaPct,
  isOwnerOrAdmin,
  onUpdateTargetPa,
  shiftDate,
  onChangeShiftDate,
  hourlyOverrides,
  onSetHourlyOverride,
  onClearHourlyOverride,
  onCopyWaReport,
  onExportCsv,
  onOpenPdfReport,
  copiedWa,
  onBackToBoard,
  onOpenHistoricalTab,
}: AreaDashboardBdViewProps) {
  const groups: FleetGroup[] = ['PMSC', 'PMVV', 'LAINNYA'];
  const groupStats = groups
    .map((grp) => {
      const run = runningUnits.filter((u) => u.fleetGroup === grp).length;
      const bd = bdRecords.filter((b) => b.fleetGroup === grp).length;
      const total = run + bd;
      const pa = total > 0 ? ((run / total) * 100).toFixed(1) : '0.0';
      return { grp, run, bd, total, pa };
    })
    .filter((s) => s.total > 0);

  const statusBreakdown = BD_STATUS_CATALOG.map((meta) => {
    const items = bdRecords.filter((b) => b.status === meta.code);
    return {
      no: meta.no,
      code: meta.code,
      label: meta.label,
      count: items.length,
      units: items.map((i) => i.unitCode),
      pct: bdRecords.length > 0 ? (items.length / bdRecords.length) * 100 : 0,
    };
  });

  const positionBreakdown = (() => {
    const map = new Map<string, BreakdownRecord[]>();
    bdRecords.forEach((rec) => {
      const key = rec.lokasi?.trim() ? rec.lokasi.trim() : 'Belum Diisi';
      const existing = map.get(key) ?? [];
      existing.push(rec);
      map.set(key, existing);
    });
    return Array.from(map.entries())
      .map(([posisi, items]) => ({
        posisi,
        count: items.length,
        units: items.map((i) => `${i.unitCode} (${i.jamBd})`),
      }))
      .sort((a, b) => b.count - a.count);
  })();

  const [includeReadyInWa, setIncludeReadyInWa] = useState(true);
  const [includePicEtrInWa, setIncludePicEtrInWa] = useState(true);
  const [waClockTick, setWaClockTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setWaClockTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  void waClockTick;
  const waReportText = buildWhatsappReport(runningUnits, bdRecords, totalFleetCount, {
    includeReadyUnits: includeReadyInWa,
    includePicEtr: includePicEtrInWa,
    shiftDate,
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">Area Dashboard BD</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Rekapitulasi ketersediaan armada per tipe unit, distribusi status BD, dan laporan shift.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBackToBoard}
            className="min-h-[40px] sm:min-h-0 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0 text-center"
          >
            Kembali ke Board
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            className="min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={onOpenPdfReport}
            className="min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileText className="w-3.5 h-3.5 text-red-600" aria-hidden="true" />
            <span>Unduh PDF</span>
          </button>
          <button
            type="button"
            onClick={() =>
              onCopyWaReport({
                includeReadyUnits: includeReadyInWa,
                includePicEtr: includePicEtrInWa,
              })
            }
            className="col-span-2 sm:col-span-1 min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer whitespace-nowrap shrink-0"
          >
            {copiedWa ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                <span>Laporan Tersalin</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Salin Laporan WA</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Grid: Fleet Group Availability + Status Distribution + WA Report Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Cols: Fleet Group & Status Breakdown */}
        <div className="lg:col-span-7 space-y-6">
          {/* Fleet Group Table */}
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
              <h2 className="text-sm font-semibold text-slate-900">
                Ketersediaan Berdasarkan Grup Armada
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[460px]">
                <thead className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-slate-50/40">
                  <tr>
                    <th className="py-2.5 pl-4 pr-2">GRUP UNIT</th>
                    <th className="py-2.5 px-2 text-right">TOTAL</th>
                    <th className="py-2.5 px-2 text-right">RUNNING</th>
                    <th className="py-2.5 px-2 text-right">BD</th>
                    <th className="py-2.5 px-2 text-right">PA %</th>
                    <th className="py-2.5 pl-2 pr-4 w-32 sm:w-36">PROPORSI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groupStats.map((g) => (
                    <tr key={g.grp} className="hover:bg-slate-50/80">
                      <td className="py-3 pl-4 pr-2 font-mono font-semibold text-slate-900">
                        {g.grp}
                      </td>
                      <td className="py-3 px-2 text-right font-mono tabular-nums text-slate-700">
                        {g.total}
                      </td>
                      <td className="py-3 px-2 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {g.run}
                      </td>
                      <td className="py-3 px-2 text-right font-mono tabular-nums font-semibold text-red-700">
                        {g.bd}
                      </td>
                      <td className="py-3 px-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {g.pa}%
                      </td>
                      <td className="py-3 pl-2 pr-4">
                        <div className="w-full h-2 bg-slate-100 rounded-sm overflow-hidden flex">
                          <div
                            className="bg-emerald-600"
                            style={{ width: `${g.total > 0 ? (g.run / g.total) * 100 : 0}%` }}
                          />
                          <div
                            className="bg-red-600"
                            style={{ width: `${g.total > 0 ? (g.bd / g.total) * 100 : 0}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Status BD Breakdown */}
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Distribusi Status Unit BD</h2>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                Total {bdRecords.length} unit BD
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-slate-50/40">
                  <tr>
                    <th className="py-2 pl-4 pr-2 w-10 font-mono">NO</th>
                    <th className="py-2 px-2 w-16 font-mono">CODE</th>
                    <th className="py-2 px-2">DISTRIBUSI STATUS UNIT BD</th>
                    <th className="py-2 px-2 w-20 text-right">UNIT</th>
                    <th className="py-2 pl-2 pr-4 w-28">PROPORSI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {statusBreakdown.map((item) => {
                    const st = BD_STATUS_STYLES[item.code];
                    return (
                      <tr key={item.code} className="hover:bg-slate-50/80">
                        <td className="py-2 pl-4 pr-2 font-mono tabular-nums text-slate-400">
                          {item.no}
                        </td>
                        <td className="py-2 px-2 font-mono font-bold">
                          <span className={st.text}>{item.code}</span>
                        </td>
                        <td className="py-2 px-2">
                          <p className="font-medium text-slate-900">{item.label}</p>
                          {item.units.length > 0 && (
                            <p className="text-[11px] font-mono text-slate-500 mt-0.5 leading-relaxed">
                              {item.units.join(' · ')}
                            </p>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {item.count}
                        </td>
                        <td className="py-2 pl-2 pr-4">
                          <div className="w-full h-1.5 bg-slate-100 rounded-sm overflow-hidden">
                            <div
                              className={`h-full ${st.bar} transition-all duration-200`}
                              style={{ width: `${item.pct}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Posisi / Lokasi Unit BD Breakdown */}
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Sebaran Posisi / Lokasi Unit BD
              </h2>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {positionBreakdown.length} titik lokasi
              </span>
            </div>
            {positionBreakdown.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500">
                Belum ada unit BD aktif saat ini.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {positionBreakdown.map((loc) => (
                  <div
                    key={loc.posisi}
                    className="px-4 py-2.5 flex items-start justify-between gap-4 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{loc.posisi}</p>
                      <p className="text-[11px] font-mono text-slate-500 mt-0.5 leading-relaxed">
                        {loc.units.join(' · ')}
                      </p>
                    </div>
                    <span className="font-mono tabular-nums font-semibold text-red-700 shrink-0">
                      {loc.count} unit
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right 5 Cols: Shift Handover / WhatsApp Report */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Preview Laporan Shift (WA)</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Otomatis terupdate sesuai data Running/Ready &amp; BD terkini
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onCopyWaReport({
                    includeReadyUnits: includeReadyInWa,
                    includePicEtr: includePicEtrInWa,
                  })
                }
                className="text-xs font-semibold text-blue-700 hover:text-blue-800 hover:underline cursor-pointer shrink-0"
              >
                {copiedWa ? 'Tersalin' : 'Salin Teks'}
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includePicEtrInWa}
                  onChange={(e) => setIncludePicEtrInWa(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-600 cursor-pointer"
                />
                <span>Tampilkan Nama PIC &amp; Estimasi Ready Unit ({bdRecords.length} unit)</span>
              </label>
              <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeReadyInWa}
                  onChange={(e) => setIncludeReadyInWa(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                />
                <span>Tampilkan Daftar Unit Ready / Running ({runningUnits.length} unit)</span>
              </label>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <pre className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed max-h-[520px] overflow-auto ops-scroll">
              {waReportText}
            </pre>
          </div>
        </section>
      </div>

      {/* Management Analytics: Pareto, Bad Actors, MTTR & Daily PA Trend */}
      <AnalyticsParetoSection
        bdRecords={bdRecords}
        rfuHistory={rfuHistory}
        hourlyOverrides={hourlyOverrides}
        totalFleetCount={totalFleetCount}
        targetPaPct={targetPaPct}
        onOpenHistoricalTab={onOpenHistoricalTab}
      />

      {/* Hourly PA, Total Population & BD Monitoring (06:00 Shift 1 - 06:00 Shift 2) */}
      <HourlyPaMonitoringSection
        shiftDate={shiftDate}
        onChangeShiftDate={onChangeShiftDate}
        totalPopulasi={totalFleetCount}
        targetPaPct={targetPaPct}
        isOwnerOrAdmin={isOwnerOrAdmin}
        onUpdateTargetPa={onUpdateTargetPa}
        bdRecords={bdRecords}
        rfuHistory={rfuHistory}
        overrides={hourlyOverrides}
        onSetOverride={onSetHourlyOverride}
        onClearOverride={onClearHourlyOverride}
      />
    </div>
  );
}
