import { Check, Copy, Download } from 'lucide-react';
import { BD_STATUS_OPTIONS, BD_STATUS_STYLES } from '../data/initialUnits';
import { BreakdownRecord, FleetGroup, FleetUnit } from '../types/fleet';
import { buildWhatsappReport } from '../utils/fleetUtils';

interface AreaDashboardBdViewProps {
  runningUnits: FleetUnit[];
  bdRecords: BreakdownRecord[];
  totalFleetCount: number;
  onCopyWaReport: () => void;
  onExportCsv: () => void;
  copiedWa: boolean;
  onBackToBoard: () => void;
}

export function AreaDashboardBdView({
  runningUnits,
  bdRecords,
  totalFleetCount,
  onCopyWaReport,
  onExportCsv,
  copiedWa,
  onBackToBoard,
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

  const statusBreakdown = BD_STATUS_OPTIONS.map((st) => {
    const items = bdRecords.filter((b) => b.status === st);
    return {
      status: st,
      count: items.length,
      units: items.map((i) => i.unitCode),
      pct: bdRecords.length > 0 ? (items.length / bdRecords.length) * 100 : 0,
    };
  });

  const waReportText = buildWhatsappReport(runningUnits, bdRecords, totalFleetCount);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Area Dashboard BD</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Rekapitulasi ketersediaan armada per tipe unit, distribusi status BD, dan laporan shift.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToBoard}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
          >
            Kembali ke Board
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={onCopyWaReport}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer whitespace-nowrap shrink-0"
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
            <table className="w-full text-left border-collapse text-xs">
              <thead className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-slate-50/40">
                <tr>
                  <th className="py-2.5 pl-4 pr-2">GRUP UNIT</th>
                  <th className="py-2.5 px-2 text-right">TOTAL</th>
                  <th className="py-2.5 px-2 text-right">RUNNING</th>
                  <th className="py-2.5 px-2 text-right">BD</th>
                  <th className="py-2.5 px-2 text-right">PA %</th>
                  <th className="py-2.5 pl-2 pr-4 w-36">PROPORSI</th>
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
          </section>

          {/* Status BD Breakdown */}
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Distribusi Status Unit BD</h2>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                Total {bdRecords.length} unit BD
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {statusBreakdown.map((item) => {
                const st = BD_STATUS_STYLES[item.status];
                return (
                  <div key={item.status} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className={`font-semibold ${st.text}`}>{item.status}</span>
                      <span className="font-mono tabular-nums text-slate-700 font-semibold">
                        {item.count} unit
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-sm overflow-hidden">
                      <div
                        className={`h-full ${st.bar} transition-all duration-200`}
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                    {item.units.length > 0 && (
                      <p className="text-[11px] font-mono text-slate-500 leading-relaxed">
                        {item.units.join(' · ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right 5 Cols: Shift Handover / WhatsApp Report */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Preview Laporan Shift (WA)</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Otomatis terupdate sesuai data Running &amp; BD terkini
              </p>
            </div>
            <button
              type="button"
              onClick={onCopyWaReport}
              className="text-xs font-semibold text-blue-700 hover:text-blue-800 hover:underline cursor-pointer"
            >
              {copiedWa ? 'Tersalin' : 'Salin Teks'}
            </button>
          </div>
          <div className="p-4">
            <pre className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed max-h-[460px] overflow-auto ops-scroll">
              {waReportText}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}
