import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, PackageCheck, Search, Wrench } from 'lucide-react';
import {
  BD_STATUS_LABELS,
  PART_STATUS_CATALOG,
  PART_STATUS_STYLES,
} from '../data/initialUnits';
import { BreakdownRecord, PartStatus } from '../types/fleet';
import {
  buildSparepartWhatsappReport,
  computeBdTimeSplit,
  formatDurationId,
  getAgingSeverity,
  normalizeMrList,
} from '../utils/fleetUtils';
import { InlineTableMrCell } from './MrListInput';

interface SparepartMrTrackingSectionProps {
  bdRecords: BreakdownRecord[];
  onUpdateBd: (
    id: string,
    patch: Partial<
      Pick<
        BreakdownRecord,
        | 'jamBd'
        | 'lokasi'
        | 'mrNumbers'
        | 'partName'
        | 'keterangan'
        | 'status'
        | 'picMekanik'
        | 'etr'
        | 'partStatus'
        | 'partNote'
      >
    >
  ) => void;
}

type PartFilter = 'ALL' | 'B1_NO_MR' | PartStatus;

export function SparepartMrTrackingSection({
  bdRecords,
  onUpdateBd,
}: SparepartMrTrackingSectionProps) {
  const [search, setSearch] = useState('');
  const [partFilter, setPartFilter] = useState<PartFilter>('ALL');
  const [copiedPartWa, setCopiedPartWa] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const trackedRecords = useMemo(
    () =>
      bdRecords.filter(
        (rec) =>
          rec.status === 'B1' ||
          normalizeMrList(rec.mrNumbers).length > 0 ||
          Boolean(rec.partStatus) ||
          Boolean(rec.partNote?.trim())
      ),
    [bdRecords]
  );

  const summary = useMemo(() => {
    const totalUnits = trackedRecords.length;
    const totalMrCount = trackedRecords.reduce(
      (sum, rec) => sum + normalizeMrList(rec.mrNumbers).length,
      0
    );
    const b1MissingMr = trackedRecords.filter(
      (rec) => rec.status === 'B1' && normalizeMrList(rec.mrNumbers).length === 0
    ).length;
    const readyWarehouse = trackedRecords.filter(
      (rec) => rec.partStatus === 'READY_WAREHOUSE'
    ).length;

    return { totalUnits, totalMrCount, b1MissingMr, readyWarehouse };
  }, [trackedRecords]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trackedRecords.filter((rec) => {
      const mrs = normalizeMrList(rec.mrNumbers);
      const pStatus = rec.partStatus ?? '';
      if (partFilter === 'B1_NO_MR') {
        if (!(rec.status === 'B1' && mrs.length === 0)) return false;
      } else if (partFilter !== 'ALL') {
        if (pStatus !== partFilter) return false;
      }

      if (!q) return true;
      return (
        rec.unitCode.toLowerCase().includes(q) ||
        mrs.join(' ').toLowerCase().includes(q) ||
        (rec.partName ?? '').toLowerCase().includes(q) ||
        rec.keterangan.toLowerCase().includes(q) ||
        (rec.partNote ?? '').toLowerCase().includes(q) ||
        (rec.picMekanik ?? '').toLowerCase().includes(q)
      );
    });
  }, [trackedRecords, search, partFilter]);

  const handleCopyPartWa = async () => {
    const text = buildSparepartWhatsappReport(bdRecords);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPartWa(true);
      setTimeout(() => setCopiedPartWa(false), 2200);
    } catch {
      // Clipboard blocked
    }
  };

  return (
    <section
      aria-label="Tracking Sparepart & Nomor MR"
      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      {/* Header */}
      <div className="px-3.5 sm:px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <div className="flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-900">
              Tracking Sparepart &amp; Nomor MR Aktif
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Pantau unit B1 (Waiting Part), Nomor MR, Nama Part Utama, serta durasi tunggu part vs kerja mekanik.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleCopyPartWa()}
          disabled={trackedRecords.length === 0}
          className="min-h-[38px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
        >
          {copiedPartWa ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              <span className="text-emerald-700">Ringkasan Part Tersalin</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span>Salin WA Part &amp; MR</span>
            </>
          )}
        </button>
      </div>

      {/* 4-Metric Mini KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-200 border-b border-slate-200">
        <div className="bg-white px-3.5 py-2.5">
          <p className="text-[11px] font-medium text-slate-500">Unit Terkait Part/MR</p>
          <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
            {summary.totalUnits}
          </p>
        </div>
        <div className="bg-white px-3.5 py-2.5">
          <p className="text-[11px] font-medium text-slate-500">Total Nomor MR Aktif</p>
          <p className="text-lg font-bold font-mono tabular-nums text-blue-700 mt-0.5">
            {summary.totalMrCount}
          </p>
        </div>
        <div className="bg-white px-3.5 py-2.5">
          <p className="text-[11px] font-medium text-slate-500">B1 Belum Ada MR</p>
          <p
            className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
              summary.b1MissingMr > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {summary.b1MissingMr}
          </p>
        </div>
        <div className="bg-white px-3.5 py-2.5">
          <p className="text-[11px] font-medium text-slate-500">Part Ready Gudang</p>
          <p className="text-lg font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
            {summary.readyWarehouse}
          </p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="px-3.5 sm:px-4 py-2.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari unit, nomor MR, catatan part..."
            aria-label="Filter tracking part dan MR"
            className="w-full pl-8 pr-3 py-2 md:py-1 text-sm md:text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <label htmlFor="part-status-filter" className="text-slate-500 shrink-0">
            Status Part:
          </label>
          <select
            id="part-status-filter"
            value={partFilter}
            onChange={(e) => setPartFilter(e.target.value as PartFilter)}
            className="flex-1 sm:flex-initial px-2.5 py-2 md:px-2 md:py-1 text-sm md:text-xs bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="ALL">Semua ({trackedRecords.length})</option>
            <option value="B1_NO_MR">B1 Belum Ada MR ({summary.b1MissingMr})</option>
            <option value="">Belum Diatur</option>
            {PART_STATUS_CATALOG.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Empty State */}
      {filteredRecords.length === 0 ? (
        <div className="py-10 px-4 text-center">
          <div className="max-w-sm mx-auto space-y-1.5">
            <div className="w-9 h-9 mx-auto rounded-md bg-slate-100 flex items-center justify-center text-slate-500">
              <Wrench className="w-4 h-4" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-slate-800">
              {trackedRecords.length === 0
                ? 'Belum ada unit BD waiting part atau nomor MR aktif'
                : 'Tidak ada data part/MR yang cocok dengan filter'}
            </p>
            <p className="text-xs text-slate-500">
              {trackedRecords.length === 0
                ? 'Unit dengan status B1 atau yang diisi Nomor MR di daftar BD akan otomatis muncul di tracking ini.'
                : 'Ubah kata kunci pencarian atau pilih filter Status Part Semua.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Mobile Cards (< md) */}
          <div className="md:hidden divide-y divide-slate-200">
            {filteredRecords.map((rec, idx) => {
              const pStatus = rec.partStatus ?? '';
              const pStyle = PART_STATUS_STYLES[pStatus];
              const mrs = normalizeMrList(rec.mrNumbers);
              const missingMrAlert = rec.status === 'B1' && mrs.length === 0;
              const split = computeBdTimeSplit(rec, nowMs);
              const severity = getAgingSeverity(split.totalMinutes);

              return (
                <div key={rec.id} className="p-3.5 space-y-2.5 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono tabular-nums text-slate-400">
                          #{idx + 1}
                        </span>
                        <span className="text-sm font-mono font-bold text-slate-900">
                          {rec.unitCode}
                        </span>
                        <span className="text-[11px] font-mono font-semibold text-red-700">
                          {rec.status}
                        </span>
                        {missingMrAlert && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200 rounded">
                            Butuh MR
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {BD_STATUS_LABELS[rec.status]} · {rec.keterangan || 'Tanpa keterangan'}
                      </p>
                      {(split.waitingPartMinutes > 0 || split.isWaitingNow) && (
                        <p className="text-[11px] font-mono tabular-nums mt-0.5 text-amber-800">
                          Tunggu Part: <strong>{formatDurationId(split.waitingPartMinutes)}</strong>
                          {split.isWaitingNow ? ' (berjalan)' : ''} · Kerja:{' '}
                          <strong className="text-slate-800">
                            {formatDurationId(split.activeRepairMinutes)}
                          </strong>
                        </p>
                      )}
                    </div>

                    <span
                      className={`px-1.5 py-0.5 text-[11px] font-mono tabular-nums rounded border shrink-0 ${
                        severity === 'critical'
                          ? 'bg-red-50 text-red-700 border-red-200 font-semibold'
                          : severity === 'warning'
                          ? 'bg-amber-50 text-amber-800 border-amber-200 font-medium'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {formatDurationId(split.totalMinutes)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                        NOMOR MR
                      </label>
                      <InlineTableMrCell
                        unitCode={rec.unitCode}
                        value={mrs}
                        onChange={(nextMr) => onUpdateBd(rec.id, { mrNumbers: nextMr })}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                        NAMA PART UTAMA
                      </label>
                      <input
                        type="text"
                        value={rec.partName ?? ''}
                        aria-label={`Nama part utama ${rec.unitCode}`}
                        placeholder="Nama sparepart yang dipesan..."
                        onChange={(e) => onUpdateBd(rec.id, { partName: e.target.value })}
                        className="w-full px-2.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-blue-600 focus:outline-none text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                        STATUS PROSES SPAREPART
                      </label>
                      <select
                        value={pStatus}
                        aria-label={`Status part ${rec.unitCode}`}
                        onChange={(e) =>
                          onUpdateBd(rec.id, { partStatus: e.target.value as PartStatus })
                        }
                        className={`w-full px-2.5 py-2 text-sm font-medium rounded-md border focus:outline-none focus:ring-2 focus:ring-blue-600 ${pStyle.bg} ${pStyle.text} ${pStyle.border}`}
                      >
                        <option value="" className="bg-white text-slate-700">
                          -- Pilih Status Part --
                        </option>
                        {PART_STATUS_CATALOG.map((item) => (
                          <option key={item.code} value={item.code} className="bg-white text-slate-900">
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                        CATATAN PART / ETA PENGIRIMAN
                      </label>
                      <input
                        type="text"
                        value={rec.partNote ?? ''}
                        aria-label={`Catatan part ${rec.unitCode}`}
                        placeholder="Contoh: PO #4412, ETA tiba sore ini..."
                        onChange={(e) => onUpdateBd(rec.id, { partNote: e.target.value })}
                        className="w-full px-2.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-blue-600 focus:outline-none text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table (md+) */}
          <div className="hidden md:block overflow-x-auto ops-scroll">
            <table className="w-full text-left border-collapse min-w-[960px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                <tr>
                  <th className="py-2 pl-4 pr-2 w-10 font-mono">NO</th>
                  <th className="py-2 px-2 w-28">UNIT BD</th>
                  <th className="py-2 px-2 w-36">AGING &amp; TUNGGU PART</th>
                  <th className="py-2 px-2 w-44">NOMOR MR</th>
                  <th className="py-2 px-2 w-44">NAMA PART UTAMA</th>
                  <th className="py-2 px-2 w-44">STATUS SPAREPART</th>
                  <th className="py-2 px-2 w-48">CATATAN PART / ETA</th>
                  <th className="py-2 pl-2 pr-4">PROBLEM &amp; PIC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredRecords.map((rec, idx) => {
                  const pStatus = rec.partStatus ?? '';
                  const pStyle = PART_STATUS_STYLES[pStatus];
                  const mrs = normalizeMrList(rec.mrNumbers);
                  const missingMrAlert = rec.status === 'B1' && mrs.length === 0;
                  const split = computeBdTimeSplit(rec, nowMs);
                  const severity = getAgingSeverity(split.totalMinutes);

                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors align-top">
                      <td className="py-2 pl-4 pr-2 font-mono tabular-nums text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        <div className="font-mono font-semibold text-slate-900">{rec.unitCode}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-mono text-red-700 font-semibold">
                            {rec.status}
                          </span>
                          {missingMrAlert && (
                            <span className="px-1 py-px text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200 rounded">
                              Belum ada MR
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        <span
                          className={`inline-block px-1.5 py-0.5 text-[11px] font-mono tabular-nums rounded border ${
                            severity === 'critical'
                              ? 'bg-red-50 text-red-700 border-red-200 font-semibold'
                              : severity === 'warning'
                              ? 'bg-amber-50 text-amber-800 border-amber-200 font-medium'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}
                        >
                          Total {formatDurationId(split.totalMinutes)}
                        </span>
                        {(split.waitingPartMinutes > 0 || split.isWaitingNow) && (
                          <div className="mt-1 space-y-0.5 text-[10px] font-mono tabular-nums">
                            <div className={split.isWaitingNow ? 'text-amber-700 font-semibold' : 'text-amber-700'}>
                              Part: {formatDurationId(split.waitingPartMinutes)}
                              {split.isWaitingNow ? ' ●' : ''}
                            </div>
                            <div className="text-slate-500">
                              Kerja: {formatDurationId(split.activeRepairMinutes)}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <InlineTableMrCell
                          unitCode={rec.unitCode}
                          value={mrs}
                          onChange={(nextMr) => onUpdateBd(rec.id, { mrNumbers: nextMr })}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={rec.partName ?? ''}
                          aria-label={`Nama part utama ${rec.unitCode}`}
                          placeholder="Nama part..."
                          onChange={(e) => onUpdateBd(rec.id, { partName: e.target.value })}
                          className="w-full px-2 py-1 text-xs bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-blue-600 rounded focus:outline-none text-slate-900 placeholder:text-slate-400"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <select
                          value={pStatus}
                          aria-label={`Status part ${rec.unitCode}`}
                          onChange={(e) =>
                            onUpdateBd(rec.id, { partStatus: e.target.value as PartStatus })
                          }
                          className={`w-full px-2 py-1 text-xs font-medium rounded border focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer ${pStyle.bg} ${pStyle.text} ${pStyle.border}`}
                        >
                          <option value="" className="bg-white text-slate-700">
                            -- Pilih Status Part --
                          </option>
                          {PART_STATUS_CATALOG.map((item) => (
                            <option
                              key={item.code}
                              value={item.code}
                              className="bg-white text-slate-900"
                            >
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={rec.partNote ?? ''}
                          aria-label={`Catatan part ${rec.unitCode}`}
                          placeholder="Catatan PO / ETA..."
                          onChange={(e) => onUpdateBd(rec.id, { partNote: e.target.value })}
                          className="w-full px-2 py-1 text-xs bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-blue-600 rounded focus:outline-none text-slate-800 placeholder:text-slate-400"
                        />
                      </td>
                      <td className="py-2 pl-2 pr-4 text-slate-600">
                        <p className="truncate max-w-[260px]" title={rec.keterangan}>
                          {rec.keterangan || '—'}
                        </p>
                        {(rec.picMekanik?.trim() || rec.etr?.trim()) && (
                          <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                            {rec.picMekanik?.trim() ? `PIC: ${rec.picMekanik.trim()}` : ''}
                            {rec.picMekanik?.trim() && rec.etr?.trim() ? ' · ' : ''}
                            {rec.etr?.trim() ? `ETR: ${rec.etr.trim()}` : ''}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
