import { useEffect, useMemo, useState } from 'react';
import { FileText, Printer, X } from 'lucide-react';
import {
  BD_STATUS_CATALOG,
  BD_STATUS_LABELS,
  PART_STATUS_LABELS,
  formatBdStatus,
} from '../data/initialUnits';
import { BreakdownRecord, FleetGroup, FleetUnit, RfuHistoryRecord } from '../types/fleet';
import {
  calculateDurationMinutes,
  formatDurationId,
  formatMrNumbers,
  formatReadableDateId,
  getCurrentDateYYYYMMDD,
  getCurrentTimeHHMM,
  normalizeMrList,
} from '../utils/fleetUtils';

interface PdfReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  runningUnits: FleetUnit[];
  bdRecords: BreakdownRecord[];
  rfuHistory: RfuHistoryRecord[];
  totalFleetCount: number;
  targetPaPct: number;
  preparedByName?: string;
}

type RfuPeriodFilter = 'TODAY' | '7D' | '30D' | 'ALL';

const PERIOD_LABELS: Record<RfuPeriodFilter, string> = {
  TODAY: 'Hari Ini',
  '7D': '7 Hari Terakhir',
  '30D': '30 Hari Terakhir',
  ALL: 'Semua Riwayat',
};

function isDateWithinDays(yyyyMmDd: string, days: number, todayStr: string): boolean {
  if (!yyyyMmDd) return false;
  if (days === 0) return yyyyMmDd === todayStr;
  const todayMs = new Date(`${todayStr}T00:00:00`).getTime();
  const targetMs = new Date(`${yyyyMmDd}T00:00:00`).getTime();
  if (!Number.isFinite(todayMs) || !Number.isFinite(targetMs)) return false;
  const diffDays = (todayMs - targetMs) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= days;
}

export function PdfReportModal({
  isOpen,
  onClose,
  runningUnits,
  bdRecords,
  rfuHistory,
  totalFleetCount,
  targetPaPct,
  preparedByName = '',
}: PdfReportModalProps) {
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeBdList, setIncludeBdList] = useState(true);
  const [includeRfuList, setIncludeRfuList] = useState(true);
  const [rfuPeriod, setRfuPeriod] = useState<RfuPeriodFilter>('7D');
  const [groupFilter, setGroupFilter] = useState<'ALL' | FleetGroup>('ALL');
  const [authorName, setAuthorName] = useState(preparedByName);
  const [shiftNote, setShiftNote] = useState('');

  useEffect(() => {
    if (isOpen && preparedByName && !authorName) {
      setAuthorName(preparedByName);
    }
  }, [isOpen, preparedByName, authorName]);

  const todayStr = getCurrentDateYYYYMMDD();
  const nowTimeStr = getCurrentTimeHHMM();
  const readablePrintDate = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const periodCounts = useMemo(() => {
    const groupMatch = (grp: FleetGroup) => groupFilter === 'ALL' || grp === groupFilter;
    const base = rfuHistory.filter((item) => groupMatch(item.fleetGroup));
    return {
      TODAY: base.filter((h) => isDateWithinDays(h.tanggalRfu, 0, todayStr)).length,
      '7D': base.filter((h) => isDateWithinDays(h.tanggalRfu, 6, todayStr)).length,
      '30D': base.filter((h) => isDateWithinDays(h.tanggalRfu, 29, todayStr)).length,
      ALL: base.length,
    };
  }, [rfuHistory, groupFilter, todayStr]);

  const filteredRunning = useMemo(
    () =>
      groupFilter === 'ALL'
        ? runningUnits
        : runningUnits.filter((u) => u.fleetGroup === groupFilter),
    [runningUnits, groupFilter]
  );

  const filteredBd = useMemo(
    () =>
      groupFilter === 'ALL'
        ? bdRecords
        : bdRecords.filter((b) => b.fleetGroup === groupFilter),
    [bdRecords, groupFilter]
  );

  const filteredRfu = useMemo(() => {
    return rfuHistory.filter((h) => {
      if (groupFilter !== 'ALL' && h.fleetGroup !== groupFilter) return false;
      if (rfuPeriod === 'TODAY') return isDateWithinDays(h.tanggalRfu, 0, todayStr);
      if (rfuPeriod === '7D') return isDateWithinDays(h.tanggalRfu, 6, todayStr);
      if (rfuPeriod === '30D') return isDateWithinDays(h.tanggalRfu, 29, todayStr);
      return true;
    });
  }, [rfuHistory, groupFilter, rfuPeriod, todayStr]);

  const scopedTotalFleet =
    groupFilter === 'ALL' ? totalFleetCount : filteredRunning.length + filteredBd.length;

  const scopedPaPct =
    scopedTotalFleet > 0 ? (filteredRunning.length / scopedTotalFleet) * 100 : 0;

  const nowMs = Date.now();
  const agingOver6hCount = useMemo(
    () =>
      filteredBd.filter((rec) => {
        const mins = calculateDurationMinutes(rec.tanggalBd, rec.jamBd, undefined, undefined, nowMs);
        return mins !== null && mins >= 360;
      }).length,
    [filteredBd, nowMs]
  );

  const avgMttrMinutes = useMemo(() => {
    const durations = filteredRfu
      .map((h) => calculateDurationMinutes(h.tanggalBd, h.jamBd, h.tanggalRfu, h.jamRfu))
      .filter((d): d is number => d !== null);
    if (durations.length === 0) return null;
    const sum = durations.reduce((acc, v) => acc + v, 0);
    return Math.round(sum / durations.length);
  }, [filteredRfu]);

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
        const items = filteredBd.filter((b) => b.status === meta.code);
        return {
          code: meta.code,
          label: meta.label,
          count: items.length,
          units: items.map((i) => i.unitCode),
        };
      }).filter((row) => row.count > 0),
    [filteredBd]
  );

  if (!isOpen) return null;

  const nothingSelected = !includeSummary && !includeBdList && !includeRfuList;

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
                  Unduh Laporan PDF (BD &amp; Riwayat RFU)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Atur isi laporan, lalu klik <strong className="text-slate-700">Cetak / Simpan PDF</strong> dan pilih{' '}
                  <strong className="text-slate-700">Save as PDF / Simpan sebagai PDF</strong> untuk dibagikan via Email atau WhatsApp.
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

          {/* Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-1 border-t border-slate-200/80 text-xs">
            <div className="lg:col-span-5 space-y-1.5">
              <span className="block text-[11px] font-semibold text-slate-600">
                BAGIAN LAPORAN YANG DISERTAKAN
              </span>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeSummary}
                    onChange={(e) => setIncludeSummary(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <span className="font-medium text-slate-800">Ringkasan &amp; PA</span>
                </label>

                <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeBdList}
                    onChange={(e) => setIncludeBdList(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <span className="font-medium text-slate-800">
                    Unit BD ({filteredBd.length})
                  </span>
                </label>

                <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeRfuList}
                    onChange={(e) => setIncludeRfuList(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <span className="font-medium text-slate-800">
                    Riwayat RFU ({filteredRfu.length})
                  </span>
                </label>
              </div>
            </div>

            <div className="lg:col-span-4 space-y-1.5">
              <span className="block text-[11px] font-semibold text-slate-600">
                PERIODE RIWAYAT RFU &amp; GRUP ARMADA
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="inline-flex items-center p-0.5 bg-slate-200/70 rounded">
                  {(['TODAY', '7D', '30D', 'ALL'] as const).map((period) => (
                    <button
                      key={period}
                      type="button"
                      onClick={() => setRfuPeriod(period)}
                      className={`px-2 py-1 text-[11px] font-medium rounded cursor-pointer whitespace-nowrap tabular-nums transition-colors ${
                        rfuPeriod === period
                          ? 'bg-white text-slate-900 shadow-xs font-semibold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {period === 'TODAY'
                        ? `Hari Ini (${periodCounts.TODAY})`
                        : period === '7D'
                        ? `7H (${periodCounts['7D']})`
                        : period === '30D'
                        ? `30H (${periodCounts['30D']})`
                        : `Semua (${periodCounts.ALL})`}
                    </button>
                  ))}
                </div>

                <select
                  aria-label="Filter grup armada untuk PDF"
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value as 'ALL' | FleetGroup)}
                  className="px-2 py-1 text-[11px] font-medium bg-white border border-slate-300 rounded text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="ALL">Semua Grup</option>
                  <option value="PMSC">PMSC</option>
                  <option value="PMVV">PMVV</option>
                  <option value="LAINNYA">LAINNYA</option>
                </select>
              </div>
            </div>

            <div className="lg:col-span-3 flex flex-col sm:flex-row lg:flex-col justify-end gap-2">
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
                  placeholder="Catatan shift (opsional)"
                  aria-label="Catatan shift"
                  className="px-2 py-1.5 text-[11px] bg-white border border-slate-300 rounded text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
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
                Centang minimal satu bagian di toolbar atas (Ringkasan, Unit BD, atau Riwayat RFU) untuk melihat pratinjau PDF.
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
                    LAPORAN STATUS UNIT BREAKDOWN &amp; RIWAYAT RFU
                  </h1>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Cakupan Armada: <strong className="text-slate-900">{groupFilter === 'ALL' ? 'Seluruh Armada (PMSC & PMVV)' : `Grup ${groupFilter}`}</strong>
                    {' · '}Periode RFU: <strong className="text-slate-900">{PERIOD_LABELS[rfuPeriod]}</strong>
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

              {/* Section 1: Summary & KPI */}
              {includeSummary && (
                <section className="space-y-3 print-avoid-break">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-l-3 border-blue-700 pl-2">
                    1. Ringkasan Ketersediaan Armada (Physical Availability)
                  </h2>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-2.5 border border-slate-200 rounded bg-slate-50/70">
                      <span className="block text-[10px] font-semibold uppercase text-slate-500">
                        Total Populasi
                      </span>
                      <span className="block text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                        {scopedTotalFleet} Unit
                      </span>
                      <span className="block text-[10px] text-slate-500 mt-0.5">
                        Terdaftar aktif
                      </span>
                    </div>

                    <div className="p-2.5 border border-slate-200 rounded bg-slate-50/70">
                      <span className="block text-[10px] font-semibold uppercase text-slate-500">
                        Unit Running &amp; PA
                      </span>
                      <span
                        className={`block text-base font-bold font-mono tabular-nums mt-0.5 ${
                          scopedPaPct >= targetPaPct ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {filteredRunning.length} ({scopedPaPct.toFixed(1)}%)
                      </span>
                      <span className="block text-[10px] text-slate-500 mt-0.5 tabular-nums">
                        Target PA ≥ {targetPaPct.toFixed(1)}%
                      </span>
                    </div>

                    <div className="p-2.5 border border-slate-200 rounded bg-slate-50/70">
                      <span className="block text-[10px] font-semibold uppercase text-slate-500">
                        Unit BD Aktif
                      </span>
                      <span className="block text-base font-bold font-mono tabular-nums text-red-700 mt-0.5">
                        {filteredBd.length} Unit
                      </span>
                      <span className="block text-[10px] text-slate-500 mt-0.5 tabular-nums">
                        Aging ≥ 6 jam: {agingOver6hCount} unit
                      </span>
                    </div>

                    <div className="p-2.5 border border-slate-200 rounded bg-slate-50/70">
                      <span className="block text-[10px] font-semibold uppercase text-slate-500">
                        RFU ({PERIOD_LABELS[rfuPeriod]})
                      </span>
                      <span className="block text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                        {filteredRfu.length} Kali
                      </span>
                      <span className="block text-[10px] text-slate-500 mt-0.5 tabular-nums">
                        MTTR rata-rata: {formatDurationId(avgMttrMinutes)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Group Table */}
                    <div className="border border-slate-200 rounded overflow-hidden">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead className="bg-slate-100 border-b border-slate-200 text-[10px] font-semibold text-slate-600">
                          <tr>
                            <th className="py-1.5 px-2.5">GRUP UNIT</th>
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

                    {/* Status Distribution Compact Box */}
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
                </section>
              )}

              {/* Section 2: Active Breakdown Units */}
              {includeBdList && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-l-3 border-red-600 pl-2">
                      {includeSummary ? '2.' : '1.'} Daftar Unit Breakdown Aktif ({filteredBd.length} Unit)
                    </h2>
                    <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                      Posisi &amp; status per {nowTimeStr}
                    </span>
                  </div>

                  {filteredBd.length === 0 ? (
                    <div className="border border-slate-200 rounded p-4 text-center text-xs text-slate-500">
                      Tidak ada unit berstatus Breakdown (BD) saat laporan dicetak.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded overflow-hidden">
                      <table className="w-full text-left border-collapse text-[10px] leading-snug">
                        <thead className="bg-slate-100 border-b border-slate-300 font-semibold text-slate-700 uppercase">
                          <tr>
                            <th className="py-1.5 pl-2 pr-1 w-7 font-mono">No</th>
                            <th className="py-1.5 px-1.5 w-[74px]">Unit</th>
                            <th className="py-1.5 px-1.5 w-[74px]">Mulai BD</th>
                            <th className="py-1.5 px-1.5 w-[52px]">Durasi</th>
                            <th className="py-1.5 px-1.5 w-[76px]">Lokasi</th>
                            <th className="py-1.5 px-1.5 w-[88px]">MR &amp; Part</th>
                            <th className="py-1.5 px-1.5 w-[78px]">PIC / ETR</th>
                            <th className="py-1.5 px-1.5">Keterangan Problem</th>
                            <th className="py-1.5 pl-1.5 pr-2 w-[108px]">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {filteredBd.map((rec, idx) => {
                            const durMin = calculateDurationMinutes(
                              rec.tanggalBd,
                              rec.jamBd,
                              undefined,
                              undefined,
                              nowMs
                            );
                            const mrText = formatMrNumbers(rec.mrNumbers, '—');
                            const partStatusLabel = rec.partStatus
                              ? PART_STATUS_LABELS[rec.partStatus]
                              : '';

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
                                <td className="py-1.5 px-1.5 font-mono tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                                  {formatDurationId(durMin)}
                                </td>
                                <td className="py-1.5 px-1.5 text-slate-700 break-words">
                                  {rec.lokasi?.trim() || '—'}
                                </td>
                                <td className="py-1.5 px-1.5 break-words">
                                  <div className="font-mono font-medium text-slate-900">
                                    {mrText}
                                  </div>
                                  {partStatusLabel && (
                                    <div className="text-[9px] text-slate-600 mt-0.5">
                                      {partStatusLabel}
                                    </div>
                                  )}
                                  {rec.partNote?.trim() && (
                                    <div className="text-[9px] text-slate-500">
                                      {rec.partNote.trim()}
                                    </div>
                                  )}
                                </td>
                                <td className="py-1.5 px-1.5 break-words">
                                  <div className="text-slate-800">
                                    {rec.picMekanik?.trim() || '—'}
                                  </div>
                                  {rec.etr?.trim() && (
                                    <div className="font-mono text-[9px] text-slate-500">
                                      ETR: {rec.etr.trim()}
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

              {/* Section 3: RFU History */}
              {includeRfuList && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-l-3 border-emerald-600 pl-2">
                      {(includeSummary ? 1 : 0) + (includeBdList ? 1 : 0) + 1}. Riwayat Unit Ready For Use / RFU ({filteredRfu.length} Catatan)
                    </h2>
                    <span className="text-[10px] font-mono text-slate-500">
                      Filter: {PERIOD_LABELS[rfuPeriod]}
                    </span>
                  </div>

                  {filteredRfu.length === 0 ? (
                    <div className="border border-slate-200 rounded p-4 text-center text-xs text-slate-500">
                      Belum ada catatan unit RFU pada periode {PERIOD_LABELS[rfuPeriod].toLowerCase()}.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded overflow-hidden">
                      <table className="w-full text-left border-collapse text-[10px] leading-snug">
                        <thead className="bg-slate-100 border-b border-slate-300 font-semibold text-slate-700 uppercase">
                          <tr>
                            <th className="py-1.5 pl-2 pr-1 w-7 font-mono">No</th>
                            <th className="py-1.5 px-1.5 w-[74px]">Unit / PIC</th>
                            <th className="py-1.5 px-1.5 w-[96px]">BD → RFU</th>
                            <th className="py-1.5 px-1.5 w-[52px]">Durasi</th>
                            <th className="py-1.5 px-1.5 w-[86px]">Lokasi &amp; MR</th>
                            <th className="py-1.5 px-1.5 w-[170px]">Komponen &amp; Activity</th>
                            <th className="py-1.5 pl-1.5 pr-2">Problem &amp; Status Akhir</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {filteredRfu.map((item, idx) => {
                            const durText = formatDurationId(
                              calculateDurationMinutes(
                                item.tanggalBd,
                                item.jamBd,
                                item.tanggalRfu,
                                item.jamRfu
                              )
                            );
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
                                <td className="py-1.5 px-1.5 font-mono tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                                  {durText}
                                </td>
                                <td className="py-1.5 px-1.5 break-words">
                                  <div className="text-slate-800">
                                    {item.lokasi?.trim() || '—'}
                                  </div>
                                  <div className="font-mono text-[9px] text-slate-500 mt-0.5">
                                    MR: {mrText}
                                  </div>
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
                  Monitoring Breakdown IP HAULING — Karunia Armada Indonesia
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
            Tips: Pada dialog cetak browser, pilih tujuan <strong className="text-slate-700">Save as PDF / Simpan sebagai PDF</strong>.
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
              <span>Cetak / Simpan PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
