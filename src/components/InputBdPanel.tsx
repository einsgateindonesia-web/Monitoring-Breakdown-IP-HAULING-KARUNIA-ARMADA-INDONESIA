import { useMemo, useState } from 'react';
import { Check, ChevronDown, Copy, Download, RotateCcw, Search, Trash2, Wrench } from 'lucide-react';
import { BD_STATUS_OPTIONS, BD_STATUS_STYLES } from '../data/initialUnits';
import { BdStatus, BreakdownRecord, FleetUnit } from '../types/fleet';
import { getCurrentTimeHHMM } from '../utils/fleetUtils';

interface InputBdPanelProps {
  runningUnits: FleetUnit[];
  bdRecords: BreakdownRecord[];
  onAddBd: (payload: {
    unitCode: string;
    jamBd: string;
    keterangan: string;
    status: BdStatus;
  }) => { ok: boolean; message?: string };
  onUpdateBd: (
    id: string,
    patch: Partial<Pick<BreakdownRecord, 'jamBd' | 'keterangan' | 'status'>>
  ) => void;
  onMarkRfu: (id: string) => void;
  onCancelBd: (id: string) => void;
  onCopyWaReport: () => void;
  onExportCsv: () => void;
  copiedWa: boolean;
}

export function InputBdPanel({
  runningUnits,
  bdRecords,
  onAddBd,
  onUpdateBd,
  onMarkRfu,
  onCancelBd,
  onCopyWaReport,
  onExportCsv,
  copiedWa,
}: InputBdPanelProps) {
  const [unitInput, setUnitInput] = useState('');
  const [jamBd, setJamBd] = useState(getCurrentTimeHHMM());
  const [keterangan, setKeterangan] = useState('');
  const [status, setStatus] = useState<BdStatus>('Diagnosa');
  const [formError, setFormError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [bdSearch, setBdSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | BdStatus>('ALL');

  const unitSuggestions = useMemo(() => {
    const q = unitInput.trim().toLowerCase();
    if (!q) return runningUnits;
    return runningUnits.filter((u) => u.code.toLowerCase().includes(q));
  }, [unitInput, runningUnits]);

  const filteredBdRecords = useMemo(() => {
    const q = bdSearch.trim().toLowerCase();
    return bdRecords.filter((rec) => {
      const matchStatus = statusFilter === 'ALL' || rec.status === statusFilter;
      const matchSearch =
        !q ||
        rec.unitCode.toLowerCase().includes(q) ||
        rec.keterangan.toLowerCase().includes(q) ||
        rec.status.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [bdRecords, bdSearch, statusFilter]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = onAddBd({
      unitCode: unitInput,
      jamBd: jamBd || getCurrentTimeHHMM(),
      keterangan,
      status,
    });
    if (!res.ok) {
      setFormError(res.message ?? 'Gagal menginput unit BD.');
      return;
    }
    setUnitInput('');
    setKeterangan('');
    setJamBd(getCurrentTimeHHMM());
    setStatus('Diagnosa');
    setFormError('');
    setShowSuggestions(false);
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg flex flex-col min-h-[540px] lg:h-[calc(100vh-250px)]">
      {/* Header & Export Actions */}
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Input BD Unit</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Unit yang terinput di sini otomatis berpindah dari daftar Unit Running ke tabel BD.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onCopyWaReport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {copiedWa ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                <span className="text-emerald-700">Tersalin</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                <span>Salin Laporan WA</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Fast Spreadsheet-Style Input Bar */}
      <form
        onSubmit={handleSubmit}
        className="px-4 py-3 bg-slate-50 border-b border-slate-200"
      >
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
          {/* UNIT BD Combobox */}
          <div className="sm:col-span-3 relative">
            <label
              htmlFor="quick-unit-bd"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              UNIT BD
            </label>
            <div className="relative">
              <input
                id="quick-unit-bd"
                type="text"
                value={unitInput}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 160)}
                onChange={(e) => {
                  setUnitInput(e.target.value.toUpperCase());
                  setFormError('');
                  setShowSuggestions(true);
                }}
                placeholder={`Pilih dari ${runningUnits.length} unit...`}
                autoComplete="off"
                className="w-full pl-2.5 pr-7 py-1.5 text-xs font-mono font-semibold bg-white border border-slate-300 rounded-md text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label="Tampilkan semua populasi unit running"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setShowSuggestions((prev) => !prev);
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
            {showSuggestions && (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-md shadow-md overflow-hidden">
                <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-[11px] font-medium text-slate-500 flex items-center justify-between tabular-nums">
                  <span>Populasi Running</span>
                  <span className="font-mono text-slate-700">
                    {unitSuggestions.length} / {runningUnits.length}
                  </span>
                </div>
                <div className="max-h-64 overflow-auto ops-scroll divide-y divide-slate-100">
                  {unitSuggestions.length === 0 ? (
                    <div className="px-3 py-2.5 text-xs text-slate-500">
                      Unit tidak ditemukan di daftar Running.
                    </div>
                  ) : (
                    unitSuggestions.map((u, idx) => (
                      <button
                        key={u.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setUnitInput(u.code);
                          setFormError('');
                          setShowSuggestions(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs font-mono font-medium text-slate-800 hover:bg-blue-50 hover:text-blue-800 flex items-center justify-between cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 tabular-nums w-5">
                            {idx + 1}.
                          </span>
                          <span>{u.code}</span>
                        </span>
                        <span className="text-[11px] font-sans text-slate-400">Running</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* JAM BD */}
          <div className="sm:col-span-2">
            <label
              htmlFor="quick-jam-bd"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              JAM BD
            </label>
            <input
              id="quick-jam-bd"
              type="time"
              value={jamBd}
              onChange={(e) => setJamBd(e.target.value)}
              className="w-full px-2 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          {/* KETERANGAN */}
          <div className="sm:col-span-3">
            <label
              htmlFor="quick-ket-bd"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              KETERANGAN
            </label>
            <input
              id="quick-ket-bd"
              type="text"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Keluhan / kerusakan unit..."
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          {/* STATUS */}
          <div className="sm:col-span-2">
            <label
              htmlFor="quick-status-bd"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              STATUS
            </label>
            <select
              id="quick-status-bd"
              value={status}
              onChange={(e) => setStatus(e.target.value as BdStatus)}
              className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            >
              {BD_STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* Submit */}
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="w-full px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Pindah ke BD
            </button>
          </div>
        </div>
        {formError && (
          <p className="mt-2 text-xs text-red-600 font-medium">{formError}</p>
        )}
      </form>

      {/* Filter Toolbar for BD Table */}
      <div className="px-4 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            value={bdSearch}
            onChange={(e) => setBdSearch(e.target.value)}
            placeholder="Filter unit BD atau keterangan..."
            aria-label="Filter unit BD"
            className="w-full pl-8 pr-3 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <label htmlFor="bd-status-filter" className="text-slate-500">
            Status:
          </label>
          <select
            id="bd-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | BdStatus)}
            className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="ALL">Semua ({bdRecords.length})</option>
            {BD_STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt} ({bdRecords.filter((r) => r.status === opt).length})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Inline Editable Spreadsheet Table */}
      <div className="flex-1 overflow-auto ops-scroll">
        <table className="w-full text-left border-collapse min-w-[660px]">
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
            <tr>
              <th className="py-2 pl-4 pr-2 w-10 font-mono">NO</th>
              <th className="py-2 px-2 w-28">UNIT BD</th>
              <th className="py-2 px-2 w-24">JAM BD</th>
              <th className="py-2 px-2">KETERANGAN</th>
              <th className="py-2 px-2 w-40">STATUS</th>
              <th className="py-2 pl-2 pr-4 text-right w-32">AKSI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {filteredBdRecords.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 px-4 text-center">
                  <div className="max-w-sm mx-auto space-y-2">
                    <div className="w-9 h-9 mx-auto rounded-md bg-slate-100 flex items-center justify-center text-slate-500">
                      <Wrench className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-medium text-slate-800">
                      {bdRecords.length === 0
                        ? 'Belum ada unit BD saat ini'
                        : 'Tidak ada data BD yang sesuai filter'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {bdRecords.length === 0
                        ? 'Pilih unit dari panel Unit Running di sebelah kiri atau ketik kode unit pada form di atas untuk memindahkannya ke daftar BD.'
                        : 'Ubah kata kunci pencarian atau pilih filter status Semua.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredBdRecords.map((rec, idx) => {
                const stStyle = BD_STATUS_STYLES[rec.status];
                return (
                  <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 pl-4 pr-2 font-mono tabular-nums text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-2 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {rec.unitCode}
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="time"
                        value={rec.jamBd}
                        aria-label={`Jam BD ${rec.unitCode}`}
                        onChange={(e) => onUpdateBd(rec.id, { jamBd: e.target.value })}
                        className="w-full px-1.5 py-1 text-xs font-mono tabular-nums bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-blue-600 rounded focus:outline-none"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        value={rec.keterangan}
                        aria-label={`Keterangan BD ${rec.unitCode}`}
                        placeholder="Isi keterangan..."
                        onChange={(e) => onUpdateBd(rec.id, { keterangan: e.target.value })}
                        className="w-full px-2 py-1 text-xs bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-blue-600 rounded focus:outline-none text-slate-800 placeholder:text-slate-400"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <select
                        value={rec.status}
                        aria-label={`Status BD ${rec.unitCode}`}
                        onChange={(e) =>
                          onUpdateBd(rec.id, { status: e.target.value as BdStatus })
                        }
                        className={`w-full px-2 py-1 text-xs font-medium rounded border focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer ${stStyle.bg} ${stStyle.text} ${stStyle.border}`}
                      >
                        {BD_STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt} className="bg-white text-slate-900">
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pl-2 pr-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onMarkRfu(rec.id)}
                          title="Unit selesai perbaikan (RFU) & kembali ke Unit Running"
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <RotateCcw className="w-3 h-3" aria-hidden="true" />
                          <span>RFU</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onCancelBd(rec.id)}
                          title="Batalkan input BD & kembalikan ke Unit Running"
                          aria-label={`Batalkan BD ${rec.unitCode}`}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
