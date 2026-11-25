import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  History,
  RotateCcw,
  Search,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import {
  BD_STATUS_CATALOG,
  BD_STATUS_LABELS,
  BD_STATUS_STYLES,
  formatBdStatus,
} from '../data/initialUnits';
import {
  BdStatus,
  BreakdownRecord,
  FleetGroup,
  FleetUnit,
  RfuHistoryRecord,
} from '../types/fleet';
import {
  formatDurationId,
  formatMrNumbers,
  formatReadableDateId,
  getCurrentDateYYYYMMDD,
} from '../utils/fleetUtils';
import {
  buildAllUnitSummaries,
  buildHistoricalTimeline,
  buildUnitHealthSummary,
  exportHistoricalBdCsv,
  REPEAT_BD_THRESHOLD_HOURS,
} from '../utils/historicalBdUtils';

interface HistoricalBdViewProps {
  masterUnits: FleetUnit[];
  bdRecords: BreakdownRecord[];
  rfuHistory: RfuHistoryRecord[];
  onOpenUploadHistorical: () => void;
  onOpenPdfReport: () => void;
  onBackToBoard: () => void;
}

type DatePreset = 'ALL' | 'TODAY' | '7D' | '30D' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM';
type ConditionFilter = 'ALL' | 'ACTIVE_BD' | 'RFU';

function shiftDaysYYYYMMDD(baseStr: string, deltaDays: number): string {
  const dt = new Date(`${baseStr}T00:00:00`);
  dt.setDate(dt.getDate() + deltaDays);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getMonthBounds(baseStr: string, offsetMonths: number): { start: string; end: string } {
  const dt = new Date(`${baseStr}T00:00:00`);
  dt.setDate(1);
  dt.setMonth(dt.getMonth() + offsetMonths);
  const y = dt.getFullYear();
  const m = dt.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  const mPad = String(m + 1).padStart(2, '0');
  return {
    start: `${y}-${mPad}-01`,
    end: `${y}-${mPad}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function HistoricalBdView({
  masterUnits,
  bdRecords,
  rfuHistory,
  onOpenUploadHistorical,
  onOpenPdfReport,
  onBackToBoard,
}: HistoricalBdViewProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = getCurrentDateYYYYMMDD();

  // Filter states
  const [datePreset, setDatePreset] = useState<DatePreset>('30D');
  const [startDate, setStartDate] = useState<string>(() => shiftDaysYYYYMMDD(todayStr, -29));
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [selectedUnit, setSelectedUnit] = useState<string>('ALL');
  const [groupFilter, setGroupFilter] = useState<'ALL' | FleetGroup>('ALL');
  const [conditionFilter, setConditionFilter] = useState<ConditionFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | BdStatus>('ALL');
  const [componentFilter, setComponentFilter] = useState<string>('ALL');
  const [onlyRepeatBd, setOnlyRepeatBd] = useState(false);
  const [search, setSearch] = useState('');

  const handleSelectDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'TODAY') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7D') {
      setStartDate(shiftDaysYYYYMMDD(todayStr, -6));
      setEndDate(todayStr);
    } else if (preset === '30D') {
      setStartDate(shiftDaysYYYYMMDD(todayStr, -29));
      setEndDate(todayStr);
    } else if (preset === 'THIS_MONTH') {
      const b = getMonthBounds(todayStr, 0);
      setStartDate(b.start);
      setEndDate(b.end);
    } else if (preset === 'LAST_MONTH') {
      const b = getMonthBounds(todayStr, -1);
      setStartDate(b.start);
      setEndDate(b.end);
    }
  };

  // Full combined timeline across all history & active BDs (needed so Repeat BD <= 72h is always accurate across date boundaries!)
  const allEvents = useMemo(
    () => buildHistoricalTimeline(bdRecords, rfuHistory, nowMs),
    [bdRecords, rfuHistory, nowMs]
  );

  const availableUnits = useMemo(() => {
    const countMap = new Map<string, { count: number; repeat: number }>();
    for (const ev of allEvents) {
      const prev = countMap.get(ev.unitCode) ?? { count: 0, repeat: 0 };
      prev.count += 1;
      if (ev.isRepeatBd) prev.repeat += 1;
      countMap.set(ev.unitCode, prev);
    }
    const allCodes = new Set<string>([
      ...masterUnits.map((u) => u.code.trim().toUpperCase()),
      ...countMap.keys(),
    ]);
    return Array.from(allCodes)
      .sort((a, b) => {
        const ac = countMap.get(a)?.count ?? 0;
        const bc = countMap.get(b)?.count ?? 0;
        if (bc !== ac) return bc - ac;
        return a.localeCompare(b);
      })
      .map((code) => ({
        code,
        count: countMap.get(code)?.count ?? 0,
        repeat: countMap.get(code)?.repeat ?? 0,
      }));
  }, [allEvents, masterUnits]);

  const availableComponents = useMemo(() => {
    const set = new Set<string>();
    for (const ev of allEvents) {
      const comp = ev.komponen.trim();
      if (comp) set.add(comp);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allEvents]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEvents.filter((ev) => {
      if (startDate && ev.tanggalBd < startDate) return false;
      if (endDate && ev.tanggalBd > endDate) return false;
      if (selectedUnit !== 'ALL' && ev.unitCode !== selectedUnit) return false;
      if (groupFilter !== 'ALL' && ev.fleetGroup !== groupFilter) return false;
      if (conditionFilter === 'ACTIVE_BD' && !ev.isActiveBd) return false;
      if (conditionFilter === 'RFU' && ev.isActiveBd) return false;
      if (statusFilter !== 'ALL' && ev.status !== statusFilter) return false;
      if (componentFilter !== 'ALL' && ev.komponen.trim() !== componentFilter) return false;
      if (onlyRepeatBd && !ev.isRepeatBd) return false;

      if (!q) return true;
      return (
        ev.unitCode.toLowerCase().includes(q) ||
        ev.lokasi.toLowerCase().includes(q) ||
        ev.mrNumbers.join(' ').toLowerCase().includes(q) ||
        ev.picMekanik.toLowerCase().includes(q) ||
        ev.keterangan.toLowerCase().includes(q) ||
        ev.komponen.toLowerCase().includes(q) ||
        ev.subKomponen.toLowerCase().includes(q) ||
        ev.detailSubKomponen.toLowerCase().includes(q) ||
        ev.activityPerbaikan.toLowerCase().includes(q) ||
        ev.status.toLowerCase().includes(q) ||
        (BD_STATUS_LABELS[ev.status] ?? '').toLowerCase().includes(q)
      );
    });
  }, [
    allEvents,
    startDate,
    endDate,
    selectedUnit,
    groupFilter,
    conditionFilter,
    statusFilter,
    componentFilter,
    onlyRepeatBd,
    search,
  ]);

  // KPI metrics computed from filtered events
  const filteredKpis = useMemo(() => {
    let activeCount = 0;
    let rfuCount = 0;
    let repeatCount = 0;
    let sameCompRepeatCount = 0;
    let totalDowntimeMinutes = 0;
    let rfuDurSum = 0;
    let rfuDurCount = 0;

    for (const ev of filteredEvents) {
      if (ev.isActiveBd) activeCount += 1;
      else rfuCount += 1;

      if (ev.isRepeatBd) repeatCount += 1;
      if (ev.isSameComponentRepeat) sameCompRepeatCount += 1;

      if (ev.durationMinutes !== null) {
        totalDowntimeMinutes += ev.durationMinutes;
        if (!ev.isActiveBd) {
          rfuDurSum += ev.durationMinutes;
          rfuDurCount += 1;
        }
      }
    }

    // Average MTBF across units in filteredEvents that have >= 2 events
    const byUnit = new Map<string, number[]>();
    for (const ev of filteredEvents) {
      if (ev.bdStartMs === null) continue;
      const list = byUnit.get(ev.unitCode) ?? [];
      list.push(ev.bdStartMs);
      byUnit.set(ev.unitCode, list);
    }
    let mtbfGapSum = 0;
    let mtbfGapCount = 0;
    for (const stamps of byUnit.values()) {
      if (stamps.length < 2) continue;
      stamps.sort((a, b) => a - b);
      for (let i = 1; i < stamps.length; i++) {
        mtbfGapSum += Math.floor((stamps[i] - stamps[i - 1]) / 60000);
        mtbfGapCount += 1;
      }
    }

    return {
      totalEvents: filteredEvents.length,
      activeCount,
      rfuCount,
      repeatCount,
      sameCompRepeatCount,
      totalDowntimeMinutes,
      mttrMinutes: rfuDurCount > 0 ? Math.round(rfuDurSum / rfuDurCount) : null,
      mtbfMinutes: mtbfGapCount > 0 ? Math.round(mtbfGapSum / mtbfGapCount) : null,
    };
  }, [filteredEvents]);

  // Top units with Repeat BD / highest BD frequency within active date/group scope (ignoring selectedUnit so user can jump between units easily)
  const topRepeatAndBdUnits = useMemo(() => {
    const scopeEvents = allEvents.filter((ev) => {
      if (startDate && ev.tanggalBd < startDate) return false;
      if (endDate && ev.tanggalBd > endDate) return false;
      if (groupFilter !== 'ALL' && ev.fleetGroup !== groupFilter) return false;
      return true;
    });
    return buildAllUnitSummaries(scopeEvents).slice(0, 8);
  }, [allEvents, startDate, endDate, groupFilter]);

  // Unit Health Profile when a specific unit is selected (calculated on date-scoped events for that unit, or all-time if no date filter)
  const selectedUnitProfile = useMemo(() => {
    if (selectedUnit === 'ALL') return null;
    const unitScopedEvents = filteredEvents.filter((e) => e.unitCode === selectedUnit);
    const summary = buildUnitHealthSummary(selectedUnit, unitScopedEvents);
    return {
      summary,
      timeline: unitScopedEvents,
    };
  }, [selectedUnit, filteredEvents]);

  const hasCustomFilter =
    selectedUnit !== 'ALL' ||
    groupFilter !== 'ALL' ||
    conditionFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    componentFilter !== 'ALL' ||
    onlyRepeatBd ||
    search.trim() !== '' ||
    datePreset !== '30D';

  const handleResetFilters = () => {
    handleSelectDatePreset('30D');
    setSelectedUnit('ALL');
    setGroupFilter('ALL');
    setConditionFilter('ALL');
    setStatusFilter('ALL');
    setComponentFilter('ALL');
    setOnlyRepeatBd(false);
    setSearch('');
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">
            Historical Breakdown &amp; Rekam Medis Unit
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gabungan histori BD aktif &amp; RFU, deteksi otomatis{' '}
            <strong className="text-slate-700">
              Repeat Breakdown ≤ {REPEAT_BD_THRESHOLD_HOURS} jam
            </strong>{' '}
            pasca RFU, serta import Excel histori lama.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onBackToBoard}
            className="min-h-[40px] sm:min-h-0 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0 text-center"
          >
            Kembali ke Board
          </button>

          <button
            type="button"
            onClick={onOpenUploadHistorical}
            className="min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Import Excel Histori</span>
          </button>

          <button
            type="button"
            onClick={() =>
              exportHistoricalBdCsv(
                filteredEvents,
                selectedUnit !== 'ALL' ? selectedUnit : datePreset.toLowerCase()
              )
            }
            disabled={filteredEvents.length === 0}
            className="min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={onOpenPdfReport}
            className="min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileText className="w-3.5 h-3.5 text-red-600" aria-hidden="true" />
            <span>Unduh PDF</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Strip */}
      <section
        aria-label="Ringkasan Historical Breakdown"
        className="bg-white border border-slate-200 rounded-lg grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 overflow-hidden"
      >
        <div className="bg-white px-4 py-3">
          <p className="text-xs font-medium text-slate-500">Total Kejadian BD</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {filteredKpis.totalEvents}
            </span>
            <span className="text-xs text-slate-500">kejadian</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            <span className="text-red-700 font-medium">{filteredKpis.activeCount} Aktif</span>
            {' · '}
            <span className="text-emerald-700 font-medium">{filteredKpis.rfuCount} RFU</span>
          </p>
        </div>

        <div className="bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-500">
              Repeat BD (≤ {REPEAT_BD_THRESHOLD_HOURS} Jam)
            </p>
            {filteredKpis.repeatCount > 0 && (
              <button
                type="button"
                onClick={() => setOnlyRepeatBd((prev) => !prev)}
                className="text-[11px] font-semibold text-rose-700 hover:underline cursor-pointer whitespace-nowrap"
              >
                {onlyRepeatBd ? 'Tampilkan semua' : 'Filter repeat'}
              </button>
            )}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tabular-nums ${
                filteredKpis.repeatCount > 0 ? 'text-rose-700' : 'text-emerald-700'
              }`}
            >
              {filteredKpis.repeatCount}
            </span>
            <span className="text-xs text-slate-500">kejadian berulang</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {filteredKpis.sameCompRepeatCount > 0
              ? `${filteredKpis.sameCompRepeatCount}x komponen sama persis`
              : `Batas jeda ≤ ${REPEAT_BD_THRESHOLD_HOURS} jam pasca RFU`}
          </p>
        </div>

        <div className="bg-white px-4 py-3">
          <p className="text-xs font-medium text-slate-500">Total Downtime &amp; MTTR</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {formatDurationId(filteredKpis.totalDowntimeMinutes)}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            MTTR rata-rata:{' '}
            <strong className="font-mono text-slate-800">
              {formatDurationId(filteredKpis.mttrMinutes)}
            </strong>
          </p>
        </div>

        <div className="bg-white px-4 py-3">
          <p className="text-xs font-medium text-slate-500">MTBF Rata-rata Unit</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-blue-700">
              {formatDurationId(filteredKpis.mtbfMinutes)}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Rata-rata jeda antar BD unit yang sama
          </p>
        </div>
      </section>

      {/* Top Repeat / Frequent BD Units Quick Selector Strip */}
      {topRepeatAndBdUnits.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-900">
                Unit Prioritas (Repeat ≤ 72 Jam &amp; Frekuensi BD Tertinggi)
              </h2>
            </div>
            <span className="text-[11px] text-slate-500">
              Ketuk kartu unit untuk membuka Rekam Medis Unit
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {topRepeatAndBdUnits.map((u) => {
              const isSelected = selectedUnit === u.unitCode;
              return (
                <button
                  key={u.unitCode}
                  type="button"
                  onClick={() =>
                    setSelectedUnit((prev) => (prev === u.unitCode ? 'ALL' : u.unitCode))
                  }
                  className={`text-left p-2.5 rounded-md border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500'
                      : u.repeatBdCount > 0
                      ? 'bg-rose-50/50 hover:bg-rose-50 border-rose-200'
                      : 'bg-slate-50/70 hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-mono font-bold text-slate-900 truncate">
                      {u.unitCode}
                    </span>
                    {u.isCurrentlyBd && (
                      <span
                        title="Sedang BD saat ini"
                        className="w-2 h-2 rounded-full bg-red-600 shrink-0"
                      />
                    )}
                  </div>
                  <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-700">
                    <span className="font-semibold">{u.totalEvents}x BD</span>
                    <span className="text-slate-400"> · </span>
                    <span>{formatDurationId(u.totalDowntimeMinutes)}</span>
                  </div>
                  <div className="mt-1 text-[10px] font-mono tabular-nums">
                    {u.repeatBdCount > 0 ? (
                      <span className="font-bold text-rose-700">
                        {u.repeatBdCount}x Repeat ≤72j
                      </span>
                    ) : (
                      <span className="text-slate-400">0 Repeat ≤72j</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Multi-Dimensional Filter Panel */}
      <section
        aria-label="Filter Historical Breakdown"
        className="bg-white border border-slate-200 rounded-lg p-3.5 sm:p-4 space-y-3"
      >
        {/* Row 1: Date Presets & Explicit Date Range */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
            {(
              [
                { id: 'TODAY', label: 'Hari Ini' },
                { id: '7D', label: '7 Hari' },
                { id: '30D', label: '30 Hari' },
                { id: 'THIS_MONTH', label: 'Bulan Ini' },
                { id: 'LAST_MONTH', label: 'Bulan Lalu' },
                { id: 'ALL', label: 'Semua' },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectDatePreset(preset.id)}
                className={`min-h-[34px] sm:min-h-0 px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  datePreset === preset.id
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <label htmlFor="hist-start-date" className="text-[11px] font-semibold text-slate-500">
                Dari
              </label>
              <input
                id="hist-start-date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setDatePreset('CUSTOM');
                  setStartDate(e.target.value);
                }}
                className="px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label htmlFor="hist-end-date" className="text-[11px] font-semibold text-slate-500">
                Sampai
              </label>
              <input
                id="hist-end-date"
                type="date"
                value={endDate}
                onChange={(e) => {
                  setDatePreset('CUSTOM');
                  setEndDate(e.target.value);
                }}
                className="px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>
        </div>

        {/* Row 2: Search + Unit + Group + Condition + Status + Component + Repeat Toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 items-center">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari MR, PIC, problem, activity..."
              aria-label="Cari di historical breakdown"
              className="w-full pl-8 pr-7 py-2 sm:py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Hapus pencarian"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            aria-label="Filter unit spesifik"
            value={selectedUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
            className="w-full px-2.5 py-2 sm:py-1.5 text-xs font-mono font-medium bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="ALL">Semua Unit ({availableUnits.length})</option>
            {availableUnits.map((u) => (
              <option key={u.code} value={u.code}>
                {u.code} ({u.count} BD{u.repeat > 0 ? ` · ${u.repeat} Repeat` : ''})
              </option>
            ))}
          </select>

          <select
            aria-label="Filter grup unit"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value as 'ALL' | FleetGroup)}
            className="w-full px-2.5 py-2 sm:py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="ALL">Grup: Semua</option>
            <option value="PMSC">Grup: PMSC</option>
            <option value="PMVV">Grup: PMVV</option>
            <option value="LAINNYA">Grup: LAINNYA</option>
          </select>

          <select
            aria-label="Filter kondisi BD"
            value={conditionFilter}
            onChange={(e) => setConditionFilter(e.target.value as ConditionFilter)}
            className="w-full px-2.5 py-2 sm:py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="ALL">Kondisi: Semua</option>
            <option value="ACTIVE_BD">Masih BD Aktif</option>
            <option value="RFU">Sudah Selesai (RFU)</option>
          </select>

          <select
            aria-label="Filter status kode BD"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | BdStatus)}
            className="w-full px-2.5 py-2 sm:py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="ALL">Status: Semua (BS–B10)</option>
            {BD_STATUS_CATALOG.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} - {item.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter komponen"
            value={componentFilter}
            onChange={(e) => setComponentFilter(e.target.value)}
            className="w-full px-2.5 py-2 sm:py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="ALL">Komponen: Semua</option>
            {availableComponents.map((comp) => (
              <option key={comp} value={comp}>
                {comp}
              </option>
            ))}
          </select>
        </div>

        {/* Row 3: Repeat Toggle + Result Count + Reset */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOnlyRepeatBd((prev) => !prev)}
              className={`min-h-[34px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                onlyRepeatBd
                  ? 'bg-rose-50 text-rose-800 border-rose-300 font-semibold'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <AlertTriangle
                className={`w-3.5 h-3.5 ${onlyRepeatBd ? 'text-rose-600' : 'text-slate-400'}`}
                aria-hidden="true"
              />
              <span>
                Hanya Repeat BD ≤ {REPEAT_BD_THRESHOLD_HOURS} Jam ({filteredKpis.repeatCount})
              </span>
            </button>

            {hasCustomFilter && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="min-h-[34px] sm:min-h-0 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                <span>Reset Filter</span>
              </button>
            )}
          </div>

          <span className="font-mono tabular-nums text-[11px] text-slate-500">
            Menampilkan {filteredEvents.length} dari {allEvents.length} total kejadian
          </span>
        </div>
      </section>

      {/* Unit Health Profile / Rekam Medis Unit (Visible when a specific unit is selected) */}
      {selectedUnit !== 'ALL' && (
        <section
          aria-label={`Rekam Medis Unit ${selectedUnit}`}
          className="bg-white border-2 border-blue-200 rounded-lg overflow-hidden"
        >
          <div className="px-4 py-3 bg-blue-50/70 border-b border-blue-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-blue-700 text-white flex items-center justify-center font-mono text-xs font-bold shrink-0">
                <Wrench className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold font-mono text-slate-900">
                    Rekam Medis Unit: {selectedUnit}
                  </h2>
                  {selectedUnitProfile?.summary?.isCurrentlyBd && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-red-100 text-red-800 border border-red-200 rounded">
                      SEDANG BD AKTIF
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600">
                  Kronologi breakdown, riwayat komponen &amp; MR, serta jejak Repeat BD ≤{' '}
                  {REPEAT_BD_THRESHOLD_HOURS} jam pasca RFU.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedUnit('ALL')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md cursor-pointer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Tutup Profil Unit</span>
            </button>
          </div>

          {!selectedUnitProfile?.summary ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Unit <strong className="font-mono text-slate-800">{selectedUnit}</strong> tidak memiliki kejadian BD pada rentang filter saat ini.
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Unit KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md">
                  <span className="block text-[10px] font-semibold uppercase text-slate-500">
                    Frekuensi BD
                  </span>
                  <span className="block text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {selectedUnitProfile.summary.totalEvents} Kali
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md">
                  <span className="block text-[10px] font-semibold uppercase text-slate-500">
                    Repeat ≤ 72 Jam
                  </span>
                  <span
                    className={`block text-base font-bold font-mono tabular-nums mt-0.5 ${
                      selectedUnitProfile.summary.repeatBdCount > 0
                        ? 'text-rose-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {selectedUnitProfile.summary.repeatBdCount} Kali
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md">
                  <span className="block text-[10px] font-semibold uppercase text-slate-500">
                    Total Downtime
                  </span>
                  <span className="block text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {formatDurationId(selectedUnitProfile.summary.totalDowntimeMinutes)}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md">
                  <span className="block text-[10px] font-semibold uppercase text-slate-500">
                    MTTR Unit
                  </span>
                  <span className="block text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {formatDurationId(selectedUnitProfile.summary.mttrMinutes)}
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-1 p-2.5 bg-slate-50 border border-slate-200 rounded-md">
                  <span className="block text-[10px] font-semibold uppercase text-slate-500">
                    MTBF Unit
                  </span>
                  <span className="block text-base font-bold font-mono tabular-nums text-blue-700 mt-0.5">
                    {formatDurationId(selectedUnitProfile.summary.mtbfMinutes)}
                  </span>
                </div>
              </div>

              {/* Top Components & MR numbers used on this unit */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-md space-y-1.5">
                  <span className="block text-[11px] font-semibold text-slate-700">
                    Komponen Paling Sering Bermasalah
                  </span>
                  {selectedUnitProfile.summary.topComponents.length === 0 ? (
                    <p className="text-slate-500">Belum ada komponen yang terklasifikasi.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedUnitProfile.summary.topComponents.map((c) => (
                        <span
                          key={c.name}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-medium text-slate-800"
                        >
                          <span>{c.name}</span>
                          <span className="font-mono font-bold text-blue-700">{c.count}x</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-md space-y-1.5">
                  <span className="block text-[11px] font-semibold text-slate-700">
                    Riwayat Nomor MR Terkait ({selectedUnitProfile.summary.mrList.length})
                  </span>
                  {selectedUnitProfile.summary.mrList.length === 0 ? (
                    <p className="text-slate-500">Belum ada nomor MR tercatat.</p>
                  ) : (
                    <p className="font-mono text-[11px] text-slate-800 leading-relaxed">
                      {selectedUnitProfile.summary.mrList.join(', ')}
                    </p>
                  )}
                </div>
              </div>

              {/* Chronological Timeline */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                  Kronologi Breakdown ({selectedUnitProfile.timeline.length} Kejadian)
                </h3>
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto ops-scroll pr-1">
                  {selectedUnitProfile.timeline.map((ev) => {
                    const compPath = [ev.komponen, ev.subKomponen, ev.detailSubKomponen]
                      .filter((x) => x.trim())
                      .join(' → ');
                    const stStyle = BD_STATUS_STYLES[ev.status];

                    return (
                      <div
                        key={`tl-${ev.id}`}
                        className={`p-3 rounded-md border text-xs space-y-1.5 ${
                          ev.isRepeatBd
                            ? 'bg-rose-50/40 border-rose-200'
                            : ev.isActiveBd
                            ? 'bg-amber-50/40 border-amber-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
                            {ev.isActiveBd ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-800 border border-red-200 rounded">
                                <Clock className="w-3 h-3" aria-hidden="true" />
                                MASIH BD
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
                                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                                RFU
                              </span>
                            )}
                            <span className="font-semibold text-slate-900">
                              BD {formatReadableDateId(ev.tanggalBd)} {ev.jamBd}
                            </span>
                            <span className="text-slate-400">→</span>
                            <span className="font-semibold text-emerald-700">
                              {ev.tanggalRfu
                                ? `RFU ${formatReadableDateId(ev.tanggalRfu)} ${ev.jamRfu}`
                                : 'Belum RFU'}
                            </span>
                            <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[11px] font-semibold text-slate-800">
                              Durasi: {formatDurationId(ev.durationMinutes)}
                            </span>
                          </div>

                          <span
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${stStyle.bg} ${stStyle.text} ${stStyle.border}`}
                          >
                            {formatBdStatus(ev.status)}
                          </span>
                        </div>

                        {ev.isRepeatBd && (
                          <div className="px-2.5 py-1.5 bg-rose-100/80 border border-rose-200 rounded text-[11px] text-rose-900 flex flex-wrap items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-700 shrink-0" aria-hidden="true" />
                            <span className="font-bold">REPEAT BREAKDOWN:</span>
                            <span>
                              Kembali BD{' '}
                              <strong className="font-mono">
                                {formatDurationId(ev.repeatGapMinutes)}
                              </strong>{' '}
                              setelah RFU sebelumnya ({formatReadableDateId(ev.prevRfuTanggal)}{' '}
                              {ev.prevRfuJam})
                              {ev.isSameComponentRepeat &&
                                ` · Komponen sama (${ev.komponen})`}
                              .
                            </span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-700">
                          <div>
                            <span className="text-slate-400">Lokasi:</span>{' '}
                            <span className="font-medium">{ev.lokasi || '—'}</span>
                          </div>
                          <div className="font-mono">
                            <span className="font-sans text-slate-400">MR:</span>{' '}
                            <span className="font-medium">
                              {formatMrNumbers(ev.mrNumbers, '—')}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">PIC Mekanik:</span>{' '}
                            <span className="font-medium">{ev.picMekanik || '—'}</span>
                          </div>
                        </div>

                        {ev.keterangan && (
                          <p className="text-slate-800">
                            <span className="text-slate-400">Problem:</span> {ev.keterangan}
                          </p>
                        )}
                        {compPath && (
                          <p className="text-slate-700">
                            <span className="text-slate-400">Komponen:</span>{' '}
                            <span className="font-medium">{compPath}</span>
                          </p>
                        )}
                        {ev.activityPerbaikan && (
                          <p className="text-slate-700">
                            <span className="text-slate-400">Activity:</span>{' '}
                            {ev.activityPerbaikan}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Historical Breakdown Table (Desktop) & Cards (Mobile) */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-3.5 sm:px-4 py-2.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">
            Log Historical Breakdown ({filteredEvents.length})
          </h2>
          <span className="text-[11px] text-slate-500">
            Klik kode unit untuk melihat Rekam Medis Unit
          </span>
        </div>

        {/* Mobile Card View (< md) */}
        <div className="md:hidden divide-y divide-slate-200">
          {filteredEvents.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-2">
              <div className="w-9 h-9 mx-auto rounded-md bg-slate-100 flex items-center justify-center text-slate-500">
                <History className="w-4 h-4" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-slate-800">
                Tidak ada data historical breakdown
              </p>
              <p className="text-xs text-slate-500">
                Ubah filter tanggal di atas atau gunakan tombol Import Excel Histori untuk mengisi data lampau.
              </p>
            </div>
          ) : (
            filteredEvents.map((ev, idx) => {
              const stStyle = BD_STATUS_STYLES[ev.status];
              const compPath = [ev.komponen, ev.subKomponen, ev.detailSubKomponen]
                .filter((x) => x.trim())
                .join(' → ');

              return (
                <article
                  key={`m-${ev.id}`}
                  className={`p-3.5 space-y-2 ${ev.isRepeatBd ? 'bg-rose-50/30' : 'bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                        #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedUnit(ev.unitCode)}
                        className="text-sm font-mono font-bold text-blue-700 hover:underline cursor-pointer"
                      >
                        {ev.unitCode}
                      </button>
                      {ev.isActiveBd ? (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 rounded">
                          MASIH BD
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                          RFU
                        </span>
                      )}
                      {ev.isRepeatBd && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 rounded font-mono">
                          REPEAT {formatDurationId(ev.repeatGapMinutes)}
                        </span>
                      )}
                    </div>

                    <span className="text-xs font-mono font-bold text-slate-900 tabular-nums shrink-0">
                      {formatDurationId(ev.durationMinutes)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-2 bg-slate-50 border border-slate-200/80 rounded text-[11px] font-mono tabular-nums">
                    <div>
                      <span className="block font-sans text-[10px] font-semibold text-slate-500">
                        MULAI BD
                      </span>
                      <span className="text-slate-900">
                        {formatReadableDateId(ev.tanggalBd)} · {ev.jamBd}
                      </span>
                    </div>
                    <div>
                      <span className="block font-sans text-[10px] font-semibold text-slate-500">
                        SELESAI RFU
                      </span>
                      <span className={ev.tanggalRfu ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
                        {ev.tanggalRfu
                          ? `${formatReadableDateId(ev.tanggalRfu)} · ${ev.jamRfu}`
                          : 'Sedang BD'}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs space-y-1">
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                      <span>
                        Lokasi: <strong className="text-slate-800">{ev.lokasi || '—'}</strong>
                      </span>
                      <span className="font-mono">
                        MR: <strong className="text-slate-800">{formatMrNumbers(ev.mrNumbers, '—')}</strong>
                      </span>
                      {ev.picMekanik && (
                        <span>
                          PIC: <strong className="text-slate-800">{ev.picMekanik}</strong>
                        </span>
                      )}
                    </div>

                    {ev.keterangan && (
                      <p className="text-slate-800">
                        <span className="text-slate-400">Problem:</span> {ev.keterangan}
                      </p>
                    )}
                    {compPath && (
                      <p className="text-slate-700">
                        <span className="text-slate-400">Komponen:</span> {compPath}
                      </p>
                    )}
                    {ev.activityPerbaikan && (
                      <p className="text-slate-700">
                        <span className="text-slate-400">Activity:</span> {ev.activityPerbaikan}
                      </p>
                    )}

                    <div className="pt-0.5">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded border ${stStyle.bg} ${stStyle.text} ${stStyle.border}`}
                      >
                        {formatBdStatus(ev.status)}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* Desktop Table View (md+) */}
        <div className="hidden md:block overflow-x-auto ops-scroll">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
              <tr>
                <th className="py-2.5 pl-4 pr-2 w-10 font-mono">NO</th>
                <th className="py-2.5 px-2 w-28">UNIT &amp; KONDISI</th>
                <th className="py-2.5 px-2 w-36">REPEAT ≤ 72 JAM</th>
                <th className="py-2.5 px-2 w-40">TGL / JAM BD → RFU</th>
                <th className="py-2.5 px-2 w-24">DURASI</th>
                <th className="py-2.5 px-2 w-36">LOKASI &amp; MR</th>
                <th className="py-2.5 px-2 min-w-[200px]">PROBLEM &amp; ACTIVITY</th>
                <th className="py-2.5 px-2 w-44">KOMPONEN</th>
                <th className="py-2.5 pl-2 pr-4 w-44">STATUS &amp; PIC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 px-4 text-center">
                    <div className="max-w-sm mx-auto space-y-2">
                      <div className="w-9 h-9 mx-auto rounded-md bg-slate-100 flex items-center justify-center text-slate-500">
                        <History className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <p className="text-sm font-medium text-slate-800">
                        Tidak ada catatan historical breakdown yang cocok
                      </p>
                      <p className="text-xs text-slate-500">
                        Sesuaikan filter tanggal atau klik Import Excel Histori untuk memasukkan riwayat lama.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEvents.map((ev, idx) => {
                  const stStyle = BD_STATUS_STYLES[ev.status];
                  const compPath = [ev.komponen, ev.subKomponen, ev.detailSubKomponen]
                    .filter((x) => x.trim())
                    .join(' → ');

                  return (
                    <tr
                      key={`d-${ev.id}`}
                      className={`align-top transition-colors ${
                        ev.isRepeatBd
                          ? 'bg-rose-50/35 hover:bg-rose-50/70'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-2.5 pl-4 pr-2 font-mono tabular-nums text-slate-400">
                        {idx + 1}
                      </td>

                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedUnit(ev.unitCode)}
                          title={`Buka Rekam Medis Unit ${ev.unitCode}`}
                          className="font-mono font-bold text-blue-700 hover:underline cursor-pointer block"
                        >
                          {ev.unitCode}
                        </button>
                        <div className="mt-1 flex items-center gap-1">
                          {ev.isActiveBd ? (
                            <span className="px-1.5 py-px text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 rounded">
                              MASIH BD
                            </span>
                          ) : (
                            <span className="px-1.5 py-px text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                              RFU
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">{ev.fleetGroup}</span>
                        </div>
                      </td>

                      <td className="py-2.5 px-2">
                        {ev.isRepeatBd ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 rounded font-mono whitespace-nowrap">
                              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                              REPEAT · {formatDurationId(ev.repeatGapMinutes)}
                            </span>
                            <div className="text-[10px] text-rose-700 leading-tight">
                              Pasca RFU {formatReadableDateId(ev.prevRfuTanggal).slice(0, 5)}{' '}
                              {ev.prevRfuJam}
                              {ev.isSameComponentRepeat && ' · Komponen Sama'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2 font-mono tabular-nums whitespace-nowrap">
                        <div className="text-slate-800">
                          BD: {formatReadableDateId(ev.tanggalBd)} · {ev.jamBd}
                        </div>
                        <div
                          className={
                            ev.tanggalRfu
                              ? 'text-emerald-700 font-medium mt-0.5'
                              : 'text-red-700 font-medium mt-0.5'
                          }
                        >
                          {ev.tanggalRfu
                            ? `RFU: ${formatReadableDateId(ev.tanggalRfu)} · ${ev.jamRfu}`
                            : 'Belum RFU (Aktif)'}
                        </div>
                      </td>

                      <td className="py-2.5 px-2 font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {formatDurationId(ev.durationMinutes)}
                      </td>

                      <td className="py-2.5 px-2">
                        <div className="text-slate-800 font-medium">
                          {ev.lokasi || '—'}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 mt-0.5 break-words">
                          MR: {formatMrNumbers(ev.mrNumbers, '—')}
                        </div>
                      </td>

                      <td className="py-2.5 px-2">
                        <div className="text-slate-900 leading-snug">
                          {ev.keterangan || '—'}
                        </div>
                        {ev.activityPerbaikan && (
                          <div className="text-[11px] text-slate-600 mt-1 leading-snug">
                            <span className="font-semibold text-slate-700">Activity:</span>{' '}
                            {ev.activityPerbaikan}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-2 text-slate-700">
                        {compPath || <span className="text-slate-400">—</span>}
                      </td>

                      <td className="py-2.5 pl-2 pr-4">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded border ${stStyle.bg} ${stStyle.text} ${stStyle.border}`}
                        >
                          {formatBdStatus(ev.status)}
                        </span>
                        {ev.picMekanik && (
                          <div className="text-[11px] text-slate-500 mt-1">
                            PIC: {ev.picMekanik}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
