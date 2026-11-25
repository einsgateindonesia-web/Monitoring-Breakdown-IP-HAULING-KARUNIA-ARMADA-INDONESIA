import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileText,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  Wrench,
} from 'lucide-react';
import {
  BD_LOCATION_SUGGESTIONS,
  BD_STATUS_CATALOG,
  BD_STATUS_LABELS,
  BD_STATUS_STYLES,
} from '../data/initialUnits';
import { BdStatus, BreakdownRecord, FleetGroup, FleetUnit } from '../types/fleet';
import {
  calculateDurationMinutes,
  computeBdTimeSplit,
  computeEtrStatus,
  formatDurationId,
  getAgingSeverity,
  getCurrentTimeHHMM,
  normalizeMrList,
} from '../utils/fleetUtils';
import { CompactMrInput, InlineTableMrCell } from './MrListInput';
import { Time24Input } from './Time24Input';

const PANEL_DRAFT_KEY = 'fleetbd_draft_input_bd_panel_v1';

interface InputBdPanelDraft {
  unitInput: string;
  jamBd: string;
  lokasi: string;
  mrNumbers: string[];
  partName: string;
  keterangan: string;
  status: BdStatus;
  picMekanik: string;
  etr: string;
}

function loadPanelDraft(): InputBdPanelDraft | null {
  try {
    const raw = localStorage.getItem(PANEL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<InputBdPanelDraft>;
    if (!parsed || typeof parsed !== 'object') return null;
    const draft: InputBdPanelDraft = {
      unitInput: String(parsed.unitInput ?? ''),
      jamBd: String(parsed.jamBd ?? ''),
      lokasi: String(parsed.lokasi ?? ''),
      mrNumbers: Array.isArray(parsed.mrNumbers)
        ? parsed.mrNumbers.filter((x): x is string => typeof x === 'string')
        : [],
      partName: String(parsed.partName ?? ''),
      keterangan: String(parsed.keterangan ?? ''),
      status: (parsed.status as BdStatus) || 'B0',
      picMekanik: String(parsed.picMekanik ?? ''),
      etr: String(parsed.etr ?? ''),
    };
    const hasContent = Boolean(
      draft.unitInput.trim() ||
        draft.lokasi.trim() ||
        draft.mrNumbers.length > 0 ||
        draft.partName.trim() ||
        draft.keterangan.trim() ||
        draft.picMekanik.trim() ||
        draft.etr.trim() ||
        draft.status !== 'B0'
    );
    return hasContent ? draft : null;
  } catch {
    return null;
  }
}

function savePanelDraft(draft: InputBdPanelDraft): void {
  try {
    localStorage.setItem(PANEL_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage quota error
  }
}

function clearPanelDraft(): void {
  try {
    localStorage.removeItem(PANEL_DRAFT_KEY);
  } catch {
    // Ignore storage error
  }
}

interface InputBdPanelProps {
  runningUnits: FleetUnit[];
  bdRecords: BreakdownRecord[];
  onAddBd: (payload: {
    unitCode: string;
    jamBd: string;
    lokasi: string;
    mrNumbers: string[];
    partName?: string;
    keterangan: string;
    status: BdStatus;
    picMekanik?: string;
    etr?: string;
  }) => { ok: boolean; message?: string };
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
  onMarkRfu: (id: string) => void;
  onCancelBd: (id: string) => void;
  onCopyWaReport: () => void;
  onExportCsv: () => void;
  onOpenUploadBd: () => void;
  onOpenPdfReport: () => void;
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
  onOpenUploadBd,
  onOpenPdfReport,
  copiedWa,
}: InputBdPanelProps) {
  const [initialDraft] = useState<InputBdPanelDraft | null>(() => loadPanelDraft());
  const [unitInput, setUnitInput] = useState(() => initialDraft?.unitInput ?? '');
  const [jamBd, setJamBd] = useState(() => initialDraft?.jamBd || getCurrentTimeHHMM());
  const [lokasi, setLokasi] = useState(() => initialDraft?.lokasi ?? '');
  const [mrNumbers, setMrNumbers] = useState<string[]>(() => initialDraft?.mrNumbers ?? []);
  const [partName, setPartName] = useState(() => initialDraft?.partName ?? '');
  const [keterangan, setKeterangan] = useState(() => initialDraft?.keterangan ?? '');
  const [status, setStatus] = useState<BdStatus>(() => initialDraft?.status ?? 'B0');
  const [picMekanik, setPicMekanik] = useState(() => initialDraft?.picMekanik ?? '');
  const [etr, setEtr] = useState(() => initialDraft?.etr ?? '');
  const [restoredDraft, setRestoredDraft] = useState(() => Boolean(initialDraft));
  const [formError, setFormError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mobileFormOpen, setMobileFormOpen] = useState(() => Boolean(initialDraft));

  useEffect(() => {
    const hasContent = Boolean(
      unitInput.trim() ||
        lokasi.trim() ||
        mrNumbers.length > 0 ||
        partName.trim() ||
        keterangan.trim() ||
        picMekanik.trim() ||
        etr.trim() ||
        status !== 'B0'
    );
    if (hasContent) {
      savePanelDraft({
        unitInput,
        jamBd,
        lokasi,
        mrNumbers,
        partName,
        keterangan,
        status,
        picMekanik,
        etr,
      });
    } else {
      clearPanelDraft();
    }
  }, [unitInput, jamBd, lokasi, mrNumbers, partName, keterangan, status, picMekanik, etr]);

  const [bdSearch, setBdSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | BdStatus>('ALL');
  const [groupFilter, setGroupFilter] = useState<'ALL' | FleetGroup>('ALL');
  const [onlyWithMr, setOnlyWithMr] = useState(false);
  const [onlyAgingOver6h, setOnlyAgingOver6h] = useState(false);

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const unitSuggestions = useMemo(() => {
    const q = unitInput.trim().toLowerCase();
    if (!q) return runningUnits;
    return runningUnits.filter((u) => u.code.toLowerCase().includes(q));
  }, [unitInput, runningUnits]);

  const filteredBdRecords = useMemo(() => {
    const q = bdSearch.trim().toLowerCase();
    return bdRecords.filter((rec) => {
      if (statusFilter !== 'ALL' && rec.status !== statusFilter) return false;
      if (groupFilter !== 'ALL' && rec.fleetGroup !== groupFilter) return false;
      if (onlyWithMr && normalizeMrList(rec.mrNumbers).length === 0) return false;
      if (onlyAgingOver6h) {
        const mins = calculateDurationMinutes(rec.tanggalBd, rec.jamBd, undefined, undefined, nowMs);
        if (mins === null || mins < 360) return false;
      }

      if (!q) return true;
      const statusLabel = (BD_STATUS_LABELS[rec.status] ?? '').toLowerCase();
      const mrJoined = (rec.mrNumbers ?? []).join(' ').toLowerCase();
      return (
        rec.unitCode.toLowerCase().includes(q) ||
        (rec.lokasi ?? '').toLowerCase().includes(q) ||
        mrJoined.includes(q) ||
        (rec.partName ?? '').toLowerCase().includes(q) ||
        rec.keterangan.toLowerCase().includes(q) ||
        (rec.picMekanik ?? '').toLowerCase().includes(q) ||
        (rec.partNote ?? '').toLowerCase().includes(q) ||
        rec.status.toLowerCase().includes(q) ||
        statusLabel.includes(q)
      );
    });
  }, [bdRecords, bdSearch, statusFilter, groupFilter, onlyWithMr, onlyAgingOver6h, nowMs]);

  const agingOver6hCount = useMemo(
    () =>
      bdRecords.filter((rec) => {
        const mins = calculateDurationMinutes(rec.tanggalBd, rec.jamBd, undefined, undefined, nowMs);
        return mins !== null && mins >= 360;
      }).length,
    [bdRecords, nowMs]
  );

  const withMrCount = useMemo(
    () => bdRecords.filter((rec) => normalizeMrList(rec.mrNumbers).length > 0).length,
    [bdRecords]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = onAddBd({
      unitCode: unitInput,
      jamBd: jamBd || getCurrentTimeHHMM(),
      lokasi,
      mrNumbers,
      partName,
      keterangan,
      status,
      picMekanik,
      etr,
    });
    if (!res.ok) {
      setFormError(res.message ?? 'Gagal menginput unit BD.');
      return;
    }
    clearPanelDraft();
    setRestoredDraft(false);
    setUnitInput('');
    setLokasi('');
    setMrNumbers([]);
    setPartName('');
    setKeterangan('');
    setPicMekanik('');
    setEtr('');
    setJamBd(getCurrentTimeHHMM());
    setStatus('B0');
    setFormError('');
    setShowSuggestions(false);
    setMobileFormOpen(false);
  };

  const handleClearDraft = () => {
    clearPanelDraft();
    setRestoredDraft(false);
    setUnitInput('');
    setLokasi('');
    setMrNumbers([]);
    setPartName('');
    setKeterangan('');
    setPicMekanik('');
    setEtr('');
    setJamBd(getCurrentTimeHHMM());
    setStatus('B0');
    setFormError('');
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg flex flex-col min-h-[420px] xl:min-h-[560px] xl:h-[calc(100vh-245px)]">
      {/* Header & Export Actions */}
      <div className="px-3.5 sm:px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Input BD Unit</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Unit yang terinput di sini otomatis berpindah dari Unit Running ke tabel BD (dilengkapi Durasi BD real-time, PIC &amp; ETR).
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenUploadBd}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Upload Excel BD</span>
            <span className="sm:hidden">Upload XL</span>
          </button>

          <button
            type="button"
            onClick={onOpenPdfReport}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileText className="w-3.5 h-3.5 text-red-600" aria-hidden="true" />
            <span className="hidden sm:inline">Laporan PDF</span>
            <span className="sm:hidden">PDF</span>
          </button>

          <button
            type="button"
            onClick={onCopyWaReport}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {copiedWa ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                <span className="text-emerald-700">Tersalin</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                <span className="hidden sm:inline">Salin Laporan WA</span>
                <span className="sm:hidden">Salin WA</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">CSV</span>
          </button>
        </div>
      </div>

      {/* Mobile Collapsible Quick Form Toggle */}
      <div className="md:hidden px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMobileFormOpen((prev) => !prev)}
          className="w-full inline-flex items-center justify-between px-3 py-2 min-h-[42px] text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-md cursor-pointer"
        >
          <span className="inline-flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-blue-700" aria-hidden="true" />
            <span>Tambah Unit BD Cepat</span>
          </span>
          {mobileFormOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-500" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Fast Spreadsheet-Style Input Bar */}
      <form
        onSubmit={handleSubmit}
        className={`${
          mobileFormOpen ? 'block' : 'hidden'
        } md:block px-3.5 sm:px-4 py-3 bg-slate-50 border-b border-slate-200 space-y-2`}
      >
        <datalist id="bd-location-suggestions">
          {BD_LOCATION_SUGGESTIONS.map((loc) => (
            <option key={loc} value={loc} />
          ))}
        </datalist>

        {/* Row 1: Unit Identity, Time, Location, MR, Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.1fr_0.75fr_1.15fr_1.2fr_1.35fr] gap-2.5 items-end">
          {/* UNIT BD Combobox */}
          <div className="relative">
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
                placeholder={`Pilih (${runningUnits.length})...`}
                autoComplete="off"
                className="w-full pl-2.5 pr-8 py-2 md:py-1.5 text-sm md:text-xs font-mono font-semibold bg-white border border-slate-300 rounded-md text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label="Tampilkan semua populasi unit running"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setShowSuggestions((prev) => !prev);
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <ChevronDown className="w-4 h-4 md:w-3.5 md:h-3.5" aria-hidden="true" />
              </button>
            </div>
            {showSuggestions && (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-md shadow-md overflow-hidden min-w-[210px]">
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
                        className="w-full text-left px-3 py-2 md:py-1.5 text-xs font-mono font-medium text-slate-800 hover:bg-blue-50 hover:text-blue-800 flex items-center justify-between cursor-pointer"
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

          {/* JAM BD (24 Jam) */}
          <div>
            <label
              htmlFor="quick-jam-bd"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              JAM BD
            </label>
            <Time24Input
              id="quick-jam-bd"
              value={jamBd}
              onChange={setJamBd}
              placeholder="00:00"
              className="w-full px-2.5 py-2 md:py-1.5 text-sm md:text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          {/* POSISI / LOKASI BD */}
          <div>
            <label
              htmlFor="quick-lokasi-bd"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              POSISI / LOKASI
            </label>
            <input
              id="quick-lokasi-bd"
              type="text"
              list="bd-location-suggestions"
              value={lokasi}
              onChange={(e) => setLokasi(e.target.value)}
              placeholder="KM 12 / Pit..."
              className="w-full px-2.5 py-2 md:py-1.5 text-sm md:text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          {/* NOMOR MR */}
          <div>
            <label
              htmlFor="quick-mr-bd"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              NOMOR MR
            </label>
            <CompactMrInput
              id="quick-mr-bd"
              value={mrNumbers}
              onChange={setMrNumbers}
              placeholder="MR-001..."
              ariaLabel="Nomor MR Unit BD"
            />
          </div>

          {/* STATUS */}
          <div className="sm:col-span-2 lg:col-span-1">
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
              className="w-full px-2.5 py-2 md:px-2 md:py-1.5 text-sm md:text-xs bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            >
              {BD_STATUS_CATALOG.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} - {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Wide Keterangan, Nama Part Utama, PIC Mekanik, ETR & Submit */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1.1fr_0.9fr_0.65fr_auto] gap-2.5 items-end pt-0.5">
          {/* KETERANGAN (Luas & Nyaman dibaca) */}
          <div className="sm:col-span-2 lg:col-span-1">
            <label
              htmlFor="quick-ket-bd"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              KETERANGAN PROBLEM / KELUHAN
            </label>
            <input
              id="quick-ket-bd"
              type="text"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Tulis detail keluhan / problem mekanikal secara lengkap..."
              className="w-full px-3 py-2 md:py-1.5 text-sm md:text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          <div>
            <label
              htmlFor="quick-part-name"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              NAMA PART UTAMA
            </label>
            <input
              id="quick-part-name"
              type="text"
              value={partName}
              onChange={(e) => setPartName(e.target.value)}
              placeholder="Part yang ditunggu (opsional)"
              aria-label="Nama Part Utama"
              className="w-full px-2.5 py-2 md:py-1.5 text-sm md:text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="quick-pic-mekanik"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              PIC MEKANIK
            </label>
            <input
              id="quick-pic-mekanik"
              type="text"
              value={picMekanik}
              onChange={(e) => setPicMekanik(e.target.value)}
              placeholder="Nama mekanik"
              aria-label="PIC Mekanik"
              className="w-full px-2.5 py-2 md:py-1.5 text-sm md:text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="quick-etr-bd"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              ETR SIAP (24:00)
            </label>
            <Time24Input
              id="quick-etr-bd"
              value={etr}
              onChange={setEtr}
              placeholder="HH:mm"
              ariaLabel="Estimasi Ready ETR"
              className="w-full px-2.5 py-2 md:py-1.5 text-sm md:text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-1">
            <button
              type="submit"
              className="w-full px-4 py-2.5 md:py-1.5 min-h-[42px] md:min-h-[30px] text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Pindah ke BD
            </button>
          </div>
        </div>

        {formError && (
          <p className="text-xs text-red-600 font-medium">{formError}</p>
        )}

        {restoredDraft && (
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900">
            <span>Draf input BD terakhir dipulihkan otomatis.</span>
            <button
              type="button"
              onClick={handleClearDraft}
              className="inline-flex items-center gap-1 font-semibold text-amber-950 hover:underline cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>Bersihkan Draf</span>
            </button>
          </div>
        )}
      </form>

      {/* Filter Toolbar for BD Table */}
      <div className="px-3.5 sm:px-4 py-2.5 border-b border-slate-200 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={bdSearch}
              onChange={(e) => setBdSearch(e.target.value)}
              placeholder="Cari unit, lokasi, MR, PIC, keterangan..."
              aria-label="Filter unit BD"
              className="w-full pl-8 pr-3 py-2 md:py-1 text-sm md:text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="inline-flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-md">
              {(['ALL', 'PMSC', 'PMVV'] as const).map((grp) => (
                <button
                  key={grp}
                  type="button"
                  onClick={() => setGroupFilter(grp)}
                  className={`min-h-[32px] md:min-h-0 px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    groupFilter === grp
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {grp === 'ALL' ? 'Semua' : grp}
                </button>
              ))}
            </div>

            <select
              id="bd-status-filter"
              aria-label="Filter status unit BD"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | BdStatus)}
              className="flex-1 sm:flex-initial px-2.5 py-1.5 md:px-2 md:py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 sm:max-w-[210px]"
            >
              <option value="ALL">Status: Semua ({bdRecords.length})</option>
              {BD_STATUS_CATALOG.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} - {item.label} ({bdRecords.filter((r) => r.status === item.code).length})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setOnlyWithMr((prev) => !prev)}
              className={`min-h-[30px] md:min-h-0 px-2.5 py-1 font-medium rounded border transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                onlyWithMr
                  ? 'bg-blue-50 text-blue-800 border-blue-300 font-semibold'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Ada Nomor MR ({withMrCount})
            </button>

            <button
              type="button"
              onClick={() => setOnlyAgingOver6h((prev) => !prev)}
              className={`min-h-[30px] md:min-h-0 px-2.5 py-1 font-medium rounded border transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                onlyAgingOver6h
                  ? 'bg-amber-50 text-amber-800 border-amber-300 font-semibold'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Aging ≥ 6 Jam ({agingOver6hCount})
            </button>
          </div>

          <span className="font-mono tabular-nums text-slate-500">
            Menampilkan {filteredBdRecords.length} dari {bdRecords.length} unit BD
          </span>
        </div>
      </div>

      {/* MOBILE CARD LIST VIEW (< md) */}
      <div className="md:hidden divide-y divide-slate-200">
        {filteredBdRecords.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <div className="max-w-xs mx-auto space-y-2">
              <div className="w-10 h-10 mx-auto rounded-md bg-slate-100 flex items-center justify-center text-slate-500">
                <Wrench className="w-5 h-5" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-slate-800">
                {bdRecords.length === 0
                  ? 'Belum ada unit BD saat ini'
                  : 'Tidak ada data BD yang sesuai filter'}
              </p>
              <p className="text-xs text-slate-500">
                {bdRecords.length === 0
                  ? 'Ketuk Tambah Unit BD Cepat di atas atau tombol Input BD di bawah layar.'
                  : 'Ubah kata kunci pencarian atau reset filter di atas.'}
              </p>
            </div>
          </div>
        ) : (
          filteredBdRecords.map((rec, idx) => {
            const stStyle = BD_STATUS_STYLES[rec.status];
            const split = computeBdTimeSplit(rec, nowMs);
            const severity = getAgingSeverity(split.totalMinutes);
            const etrStatus = computeEtrStatus(rec.tanggalBd, rec.jamBd, rec.etr, nowMs);

            return (
              <div key={rec.id} className="p-3.5 space-y-3 bg-white">
                {/* Card Top Row: No, Unit, Durasi, & RFU / Delete Actions */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center flex-wrap gap-1.5 min-w-0">
                    <span className="text-xs font-mono tabular-nums text-slate-400">
                      #{idx + 1}
                    </span>
                    <span className="text-sm font-mono font-bold text-slate-900 truncate">
                      {rec.unitCode}
                    </span>
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
                    {etrStatus?.isOverdue && (
                      <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-red-50 text-red-700 border border-red-200 rounded shrink-0">
                        Lewat ETR +{formatDurationId(etrStatus.deltaMinutes)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onMarkRfu(rec.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[38px] text-xs font-semibold text-emerald-800 bg-emerald-50 active:bg-emerald-100 border border-emerald-200 rounded-md cursor-pointer whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>RFU</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onCancelBd(rec.id)}
                      aria-label={`Batalkan BD ${rec.unitCode}`}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-md cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Jam BD & Status Row */}
                <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                      JAM BD
                    </label>
                    <Time24Input
                      value={rec.jamBd}
                      ariaLabel={`Jam BD ${rec.unitCode}`}
                      onChange={(val) => onUpdateBd(rec.id, { jamBd: val })}
                      className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                      STATUS
                    </label>
                    <select
                      value={rec.status}
                      aria-label={`Status BD ${rec.unitCode}`}
                      onChange={(e) =>
                        onUpdateBd(rec.id, { status: e.target.value as BdStatus })
                      }
                      className={`w-full px-2.5 py-2 text-sm font-medium rounded-md border focus:outline-none focus:ring-2 focus:ring-blue-600 ${stStyle.bg} ${stStyle.text} ${stStyle.border}`}
                    >
                      {BD_STATUS_CATALOG.map((item) => (
                        <option key={item.code} value={item.code} className="bg-white text-slate-900">
                          {item.code} - {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* PIC Mekanik & ETR */}
                <div className="grid grid-cols-[1fr_100px] gap-2 items-center">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                      PIC MEKANIK
                    </label>
                    <input
                      type="text"
                      value={rec.picMekanik ?? ''}
                      aria-label={`PIC mekanik ${rec.unitCode}`}
                      placeholder="Nama mekanik..."
                      onChange={(e) => onUpdateBd(rec.id, { picMekanik: e.target.value })}
                      className="w-full px-2.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-blue-600 focus:outline-none text-slate-900 placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                      ETR (24:00)
                    </label>
                    <Time24Input
                      value={rec.etr ?? ''}
                      ariaLabel={`ETR ${rec.unitCode}`}
                      placeholder="HH:mm"
                      onChange={(val) => onUpdateBd(rec.id, { etr: val })}
                      className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Lokasi & Nomor MR */}
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                      POSISI / LOKASI
                    </label>
                    <input
                      type="text"
                      list="bd-location-suggestions"
                      value={rec.lokasi ?? ''}
                      aria-label={`Posisi atau lokasi BD ${rec.unitCode}`}
                      placeholder="Isi posisi / lokasi..."
                      onChange={(e) => onUpdateBd(rec.id, { lokasi: e.target.value })}
                      className="w-full px-2.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-blue-600 focus:outline-none text-slate-900 placeholder:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                      NOMOR MR
                    </label>
                    <InlineTableMrCell
                      unitCode={rec.unitCode}
                      value={rec.mrNumbers ?? []}
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
                      placeholder="Nama part yang dibutuhkan..."
                      onChange={(e) => onUpdateBd(rec.id, { partName: e.target.value })}
                      className="w-full px-2.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-blue-600 focus:outline-none text-slate-900 placeholder:text-slate-400"
                    />
                  </div>

                  {(split.waitingPartMinutes > 0 || split.isWaitingNow) && (
                    <div className="px-2.5 py-1.5 bg-amber-50/70 border border-amber-200 rounded text-[11px] font-mono tabular-nums text-amber-900">
                      Tunggu Part: <strong>{formatDurationId(split.waitingPartMinutes)}</strong>
                      {split.isWaitingNow ? ' (aktif)' : ''} · Kerja Mekanik:{' '}
                      <strong>{formatDurationId(split.activeRepairMinutes)}</strong>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                      KETERANGAN
                    </label>
                    <input
                      type="text"
                      value={rec.keterangan}
                      aria-label={`Keterangan BD ${rec.unitCode}`}
                      placeholder="Isi keterangan..."
                      onChange={(e) => onUpdateBd(rec.id, { keterangan: e.target.value })}
                      className="w-full px-2.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-blue-600 focus:outline-none text-slate-900 placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DESKTOP INLINE EDITABLE SPREADSHEET TABLE (md+) */}
      <div className="hidden md:block flex-1 overflow-auto ops-scroll">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
            <tr>
              <th className="py-2 pl-3.5 pr-1.5 w-9 font-mono">NO</th>
              <th className="py-2 px-1.5 w-[96px]">UNIT BD</th>
              <th className="py-2 px-1.5 w-[86px]">JAM &amp; DURASI</th>
              <th className="py-2 px-1.5 w-[112px] xl:w-[126px]">POSISI / LOKASI</th>
              <th className="py-2 px-1.5 w-[140px] xl:w-[158px]">MR &amp; NAMA PART</th>
              <th className="py-2 px-1.5 w-[116px] xl:w-[130px]">PIC &amp; ETR</th>
              <th className="py-2 px-1.5 min-w-[200px]">KETERANGAN</th>
              <th className="py-2 px-1.5 w-[146px] xl:w-[172px]">STATUS</th>
              <th className="py-2 pl-1.5 pr-3.5 text-right w-[78px]">AKSI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {filteredBdRecords.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 px-4 text-center">
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
                        ? 'Pilih unit dari panel Unit Running atau ketik kode unit pada form di atas untuk memindahkannya ke daftar BD.'
                        : 'Ubah kata kunci pencarian atau reset filter di atas.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredBdRecords.map((rec, idx) => {
                const stStyle = BD_STATUS_STYLES[rec.status];
                const split = computeBdTimeSplit(rec, nowMs);
                const severity = getAgingSeverity(split.totalMinutes);
                const etrStatus = computeEtrStatus(rec.tanggalBd, rec.jamBd, rec.etr, nowMs);

                return (
                  <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors align-top">
                    <td className="py-2.5 pl-3.5 pr-1.5 font-mono tabular-nums text-slate-400">
                      {idx + 1}
                    </td>

                    <td className="py-2.5 px-1.5 whitespace-nowrap">
                      <div className="font-mono font-semibold text-slate-900">
                        {rec.unitCode}
                      </div>
                      <div className="text-[10px] font-medium text-slate-400">
                        {rec.fleetGroup}
                      </div>
                    </td>

                    <td className="py-2 px-1.5">
                      <div className="space-y-1">
                        <Time24Input
                          value={rec.jamBd}
                          ariaLabel={`Jam BD ${rec.unitCode}`}
                          onChange={(val) => onUpdateBd(rec.id, { jamBd: val })}
                          className="w-full px-1.5 py-0.5 text-xs font-mono tabular-nums bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-blue-600 rounded focus:outline-none"
                        />
                        <span
                          title={`BD sejak ${rec.tanggalBd} ${rec.jamBd}`}
                          className={`inline-block px-1.5 py-0.5 text-[10px] font-mono tabular-nums rounded border whitespace-nowrap ${
                            severity === 'critical'
                              ? 'bg-red-50 text-red-700 border-red-200 font-semibold'
                              : severity === 'warning'
                              ? 'bg-amber-50 text-amber-800 border-amber-200 font-medium'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}
                        >
                          {formatDurationId(split.totalMinutes)}
                        </span>
                        {(split.waitingPartMinutes > 0 || split.isWaitingNow) && (
                          <div className="text-[10px] font-mono tabular-nums leading-tight space-y-0.5">
                            <div className="text-amber-700 font-medium">
                              Part: {formatDurationId(split.waitingPartMinutes)}
                              {split.isWaitingNow ? '●' : ''}
                            </div>
                            <div className="text-slate-500">
                              Kerja: {formatDurationId(split.activeRepairMinutes)}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="py-2 px-1.5">
                      <input
                        type="text"
                        list="bd-location-suggestions"
                        value={rec.lokasi ?? ''}
                        aria-label={`Posisi atau lokasi BD ${rec.unitCode}`}
                        placeholder="Lokasi..."
                        onChange={(e) => onUpdateBd(rec.id, { lokasi: e.target.value })}
                        className="w-full px-1.5 py-1 text-xs bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-blue-600 rounded focus:outline-none text-slate-800 placeholder:text-slate-400"
                      />
                    </td>

                    <td className="py-2 px-1.5 space-y-1">
                      <InlineTableMrCell
                        unitCode={rec.unitCode}
                        value={rec.mrNumbers ?? []}
                        onChange={(nextMr) => onUpdateBd(rec.id, { mrNumbers: nextMr })}
                      />
                      <input
                        type="text"
                        value={rec.partName ?? ''}
                        aria-label={`Nama part utama ${rec.unitCode}`}
                        placeholder="Nama part..."
                        onChange={(e) => onUpdateBd(rec.id, { partName: e.target.value })}
                        className="w-full px-1.5 py-0.5 text-[11px] bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-blue-600 rounded focus:outline-none text-slate-700 placeholder:text-slate-400"
                      />
                    </td>

                    <td className="py-2 px-1.5">
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={rec.picMekanik ?? ''}
                          aria-label={`PIC Mekanik ${rec.unitCode}`}
                          placeholder="PIC mekanik..."
                          onChange={(e) => onUpdateBd(rec.id, { picMekanik: e.target.value })}
                          className="w-full px-1.5 py-0.5 text-xs bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-blue-600 rounded focus:outline-none text-slate-800 placeholder:text-slate-400"
                        />
                        <div className="flex items-center gap-1 px-1.5">
                          <span className="text-[10px] font-medium text-slate-400 shrink-0">
                            ETR
                          </span>
                          <Time24Input
                            value={rec.etr ?? ''}
                            ariaLabel={`ETR ${rec.unitCode}`}
                            placeholder="--:--"
                            onChange={(val) => onUpdateBd(rec.id, { etr: val })}
                            className={`w-full px-1 py-0.5 text-[11px] font-mono tabular-nums bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-blue-600 rounded focus:outline-none ${
                              etrStatus?.isOverdue ? 'text-red-700 font-semibold' : 'text-slate-700'
                            }`}
                          />
                        </div>
                        {etrStatus?.isOverdue && (
                          <div className="px-1.5 text-[10px] font-mono font-semibold text-red-700">
                            +{formatDurationId(etrStatus.deltaMinutes)} lewat ETR
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="py-2 px-1.5">
                      <textarea
                        rows={2}
                        value={rec.keterangan}
                        aria-label={`Keterangan BD ${rec.unitCode}`}
                        placeholder="Isi keterangan problem / keluhan..."
                        onChange={(e) => onUpdateBd(rec.id, { keterangan: e.target.value })}
                        className="w-full px-2 py-1 text-xs leading-snug bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200/80 hover:border-slate-300 focus:border-blue-600 rounded focus:outline-none text-slate-900 placeholder:text-slate-400 resize-y min-h-[44px]"
                      />
                    </td>

                    <td className="py-2 px-1.5">
                      <select
                        value={rec.status}
                        aria-label={`Status BD ${rec.unitCode}`}
                        onChange={(e) =>
                          onUpdateBd(rec.id, { status: e.target.value as BdStatus })
                        }
                        className={`w-full px-2 py-1 text-xs font-medium rounded border focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer ${stStyle.bg} ${stStyle.text} ${stStyle.border}`}
                      >
                        {BD_STATUS_CATALOG.map((item) => (
                          <option key={item.code} value={item.code} className="bg-white text-slate-900">
                            {item.code} - {item.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-2 pl-1.5 pr-3.5 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
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
