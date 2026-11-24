import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, RotateCcw } from 'lucide-react';
import {
  BreakdownRecord,
  HourlyMonitoringRow,
  HourlySlotOverride,
  RfuHistoryRecord,
} from '../types/fleet';
import { formatReadableDateId } from '../utils/fleetUtils';
import {
  buildHourlyShiftRows,
  buildHourlyWhatsappReport,
  exportHourlyMonitoringCsv,
} from '../utils/hourlyShiftUtils';

interface HourlyPaMonitoringSectionProps {
  shiftDate: string;
  onChangeShiftDate: (date: string) => void;
  totalPopulasi: number;
  targetPaPct?: number;
  isOwnerOrAdmin?: boolean;
  onUpdateTargetPa?: (nextTarget: number) => void;
  bdRecords: BreakdownRecord[];
  rfuHistory: RfuHistoryRecord[];
  overrides: Record<string, HourlySlotOverride>;
  onSetOverride: (slot: {
    shiftDate: string;
    slotIndex: number;
    totalPopulasi: number;
    bdCount: number;
  }) => void;
  onClearOverride: (key: string) => void;
}

type ShiftFilter = 'ALL' | 'SHIFT_1' | 'SHIFT_2';

export function HourlyPaMonitoringSection({
  shiftDate,
  onChangeShiftDate,
  totalPopulasi,
  targetPaPct = 90,
  isOwnerOrAdmin = false,
  onUpdateTargetPa,
  bdRecords,
  rfuHistory,
  overrides,
  onSetOverride,
  onClearOverride,
}: HourlyPaMonitoringSectionProps) {
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>('ALL');
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<number | null>(null);
  const [copiedHourlyWa, setCopiedHourlyWa] = useState(false);
  const [targetInput, setTargetInput] = useState(String(targetPaPct));

  useEffect(() => {
    setTargetInput(String(targetPaPct));
  }, [targetPaPct]);

  const warnThreshold = Math.max(0, targetPaPct - 10);

  const allRows = useMemo(
    () =>
      buildHourlyShiftRows({
        shiftDate,
        totalPopulasi,
        bdRecords,
        rfuHistory,
        overrides,
      }),
    [shiftDate, totalPopulasi, bdRecords, rfuHistory, overrides]
  );

  const visibleRows = useMemo(() => {
    if (shiftFilter === 'SHIFT_1') {
      return allRows.filter((r) => r.slotIndex <= 12);
    }
    if (shiftFilter === 'SHIFT_2') {
      return allRows.filter((r) => r.slotIndex >= 12);
    }
    return allRows;
  }, [allRows, shiftFilter]);

  const stats = useMemo(() => {
    const activeAll = allRows.filter((r) => r.isElapsed || r.isManual);
    const activeS1 = activeAll.filter((r) => r.slotIndex < 12);
    const activeS2 = activeAll.filter((r) => r.slotIndex >= 12);

    const calcAvgPa = (list: HourlyMonitoringRow[]) =>
      list.length > 0
        ? (list.reduce((sum, r) => sum + r.paPct, 0) / list.length).toFixed(1)
        : '—';

    const calcAvgBd = (list: HourlyMonitoringRow[]) =>
      list.length > 0
        ? (list.reduce((sum, r) => sum + r.bdCount, 0) / list.length).toFixed(1)
        : '—';

    const maxBd =
      activeAll.length > 0 ? Math.max(...activeAll.map((r) => r.bdCount)) : 0;

    return {
      paAll: calcAvgPa(activeAll),
      bdAvgAll: calcAvgBd(activeAll),
      paS1: calcAvgPa(activeS1),
      bdAvgS1: calcAvgBd(activeS1),
      paS2: calcAvgPa(activeS2),
      bdAvgS2: calcAvgBd(activeS2),
      maxBd,
      recordedHours: activeAll.length,
    };
  }, [allRows]);

  const hoveredRow = useMemo(
    () =>
      hoveredSlotIndex !== null
        ? allRows.find((r) => r.slotIndex === hoveredSlotIndex) ?? null
        : null,
    [hoveredSlotIndex, allRows]
  );

  const handleCopyHourlyWa = async () => {
    const text = buildHourlyWhatsappReport(shiftDate, allRows);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedHourlyWa(true);
      setTimeout(() => setCopiedHourlyWa(false), 2200);
    } catch {
      // Clipboard blocked
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      {/* Section Header */}
      <div className="px-3.5 sm:px-4 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Kondisi PA Unit, Total Populasi &amp; BD Per Jam (06:00 Shift 1 – 06:00 Shift 2)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Rekam otomatis setiap jam dari awal Shift 1 (06:00) hingga akhir Shift 2 (06:00), dapat disesuaikan manual jika perlu koreksi shift.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <div className="col-span-2 sm:col-span-1 flex items-center justify-between sm:justify-start gap-2 text-xs">
            <label htmlFor="shift-date-picker" className="text-slate-500 font-medium whitespace-nowrap">
              Tanggal Shift:
            </label>
            <input
              id="shift-date-picker"
              type="date"
              value={shiftDate}
              onChange={(e) => {
                if (e.target.value) onChangeShiftDate(e.target.value);
              }}
              className="flex-1 sm:flex-initial px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {isOwnerOrAdmin && onUpdateTargetPa ? (
            <div className="col-span-2 sm:col-span-1 flex items-center gap-1.5 text-xs bg-white border border-slate-200 rounded-md px-2 py-1">
              <label htmlFor="target-pa-input" className="text-slate-500 font-medium whitespace-nowrap">
                Target PA:
              </label>
              <input
                id="target-pa-input"
                type="number"
                min={50}
                max={100}
                step={0.5}
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                className="w-14 px-1.5 py-0.5 text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <span className="text-slate-500 font-mono">%</span>
              <button
                type="button"
                onClick={() => {
                  const val = Number(targetInput);
                  if (!Number.isFinite(val)) return;
                  const clamped = Math.min(100, Math.max(50, Math.round(val * 10) / 10));
                  setTargetInput(String(clamped));
                  onUpdateTargetPa(clamped);
                }}
                className="px-2 py-1 text-[11px] font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded cursor-pointer whitespace-nowrap"
              >
                Simpan
              </button>
            </div>
          ) : (
            <div className="col-span-2 sm:col-span-1 inline-flex items-center px-2.5 py-1.5 text-xs font-mono font-medium text-slate-600 bg-white border border-slate-200 rounded-md whitespace-nowrap">
              Target PA: {targetPaPct}%
            </div>
          )}

          <button
            type="button"
            onClick={handleCopyHourlyWa}
            className="min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
          >
            {copiedHourlyWa ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                <span className="text-emerald-700">WA Tersalin</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                <span>Salin WA Jam</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => exportHourlyMonitoringCsv(shiftDate, allRows)}
            className="min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>CSV Per Jam</span>
          </button>
        </div>
      </div>

      {/* 3-Column Shift Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 border-b border-slate-200">
        <div className="px-4 py-3">
          <p className="text-xs font-medium text-slate-500">
            Rata-rata PA Shift 1 (06:00 – 18:00)
          </p>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="text-xl font-bold font-mono tabular-nums text-slate-900">
              {stats.paS1 === '—' ? '—' : `${stats.paS1}%`}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              Rata-rata BD: {stats.bdAvgS1} unit
            </span>
          </div>
        </div>

        <div className="px-4 py-3">
          <p className="text-xs font-medium text-slate-500">
            Rata-rata PA Shift 2 (18:00 – 06:00)
          </p>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="text-xl font-bold font-mono tabular-nums text-slate-900">
              {stats.paS2 === '—' ? '—' : `${stats.paS2}%`}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              Rata-rata BD: {stats.bdAvgS2} unit
            </span>
          </div>
        </div>

        <div className="px-4 py-3">
          <p className="text-xs font-medium text-slate-500">
            PA Gabungan 24 Jam &amp; Puncak BD
          </p>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="text-xl font-bold font-mono tabular-nums text-emerald-700">
              {stats.paAll === '—' ? '—' : `${stats.paAll}%`}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              BD Maks: {stats.maxBd} unit · {stats.recordedHours}/25 titik jam
            </span>
          </div>
        </div>
      </div>

      {/* Hourly Visual Chart (06:00 -> 06:00) */}
      <div className="px-4 py-4 border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="text-xs text-slate-600 tabular-nums">
            {hoveredRow ? (
              <span className="font-medium text-slate-900">
                Jam {hoveredRow.hourLabel} ({formatReadableDateId(hoveredRow.calendarDate)}) ·{' '}
                {hoveredRow.shiftLabel} ·{' '}
                {hoveredRow.isElapsed || hoveredRow.isManual ? (
                  <>
                    Populasi{' '}
                    <span className="font-mono font-semibold">{hoveredRow.totalPopulasi}</span> ·{' '}
                    Running{' '}
                    <span className="font-mono font-semibold text-emerald-700">
                      {hoveredRow.runningCount}
                    </span>{' '}
                    · BD{' '}
                    <span className="font-mono font-semibold text-red-700">
                      {hoveredRow.bdCount}
                    </span>{' '}
                    · PA{' '}
                    <span className="font-mono font-semibold">
                      {hoveredRow.paPct.toFixed(1)}%
                    </span>
                  </>
                ) : (
                  <span className="text-slate-500">Belum memasuki jam ini</span>
                )}
              </span>
            ) : (
              <span>
                Grafik PA (%) &amp; BD per jam dari 06:00 Shift 1 hingga 06:00 Shift 2 (arahkan kursor ke batang jam untuk rincian)
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600 shrink-0">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-emerald-600 rounded-xs inline-block" />
              <span>PA ≥ {targetPaPct}%</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-amber-500 rounded-xs inline-block" />
              <span>
                PA {warnThreshold}–{(targetPaPct - 0.1).toFixed(1)}%
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-red-600 rounded-xs inline-block" />
              <span>PA &lt; {warnThreshold}%</span>
            </span>
          </div>
        </div>

        {/* 25-Slot Bar Chart */}
        <p className="md:hidden text-[11px] text-slate-400 mb-1">
          Geser grafik ke samping &amp; ketuk batang jam untuk rincian →
        </p>
        <div className="relative pt-4 pb-1 overflow-x-auto ops-scroll">
          <div className="min-w-[760px]">
            {/* Target Guideline */}
            <div className="relative h-36 flex items-end gap-1 border-b border-slate-200 px-1">
              <div
                className="absolute left-0 right-0 border-t border-dashed border-slate-300 pointer-events-none flex justify-end"
                style={{ bottom: `${targetPaPct}%` }}
              >
                <span className="text-[10px] font-mono text-slate-400 bg-white px-1 -mt-2">
                  Target {targetPaPct}%
                </span>
              </div>

              {allRows.map((row) => {
                const active = row.isElapsed || row.isManual;
                const heightPct = active ? Math.max(4, Math.min(100, row.paPct)) : 0;
                const barColor = !active
                  ? 'bg-slate-100'
                  : row.paPct >= targetPaPct
                  ? 'bg-emerald-600'
                  : row.paPct >= warnThreshold
                  ? 'bg-amber-500'
                  : 'bg-red-600';

                const isShiftBoundary = row.slotIndex === 12;

                return (
                  <div
                    key={row.key}
                    onClick={() => setHoveredSlotIndex(row.slotIndex)}
                    onMouseEnter={() => setHoveredSlotIndex(row.slotIndex)}
                    onMouseLeave={() => setHoveredSlotIndex(null)}
                    className={`flex-1 h-full flex flex-col justify-end items-center relative group cursor-pointer ${
                      isShiftBoundary ? 'border-l border-dashed border-blue-400 pl-1' : ''
                    }`}
                  >
                    {active && row.bdCount > 0 && (
                      <span className="text-[10px] font-mono font-bold text-red-700 mb-0.5 tabular-nums leading-none">
                        {row.bdCount}
                      </span>
                    )}
                    <div
                      className={`w-full rounded-t-xs transition-all duration-150 ${barColor} ${
                        row.isCurrentHour ? 'ring-2 ring-blue-600 ring-offset-1' : ''
                      }`}
                      style={{ height: active ? `${heightPct}%` : '8%' }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Hour Labels */}
            <div className="flex items-center gap-1 px-1 mt-1.5">
              {allRows.map((row) => (
                <div
                  key={`lbl-${row.key}`}
                  className={`flex-1 text-center font-mono text-[10px] tabular-nums ${
                    row.slotIndex === 12
                      ? 'text-blue-700 font-bold'
                      : row.isCurrentHour
                      ? 'text-slate-900 font-bold'
                      : 'text-slate-500'
                  }`}
                >
                  {row.hourLabel.slice(0, 2)}
                </div>
              ))}
            </div>

            {/* Shift Span Indicator */}
            <div className="grid grid-cols-[12fr_13fr] gap-1 px-1 mt-1 text-[10px] font-medium text-slate-400">
              <div className="border-t border-slate-200 pt-1 text-center">
                Shift 1 (06:00 – 17:59)
              </div>
              <div className="border-t border-blue-200 pt-1 text-center text-blue-700">
                Shift 2 (18:00 – 06:00 Akhir Shift)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Shift Filter Toolbar */}
      <div className="px-3.5 sm:px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 bg-slate-50/40">
        <div className="overflow-x-auto max-w-full">
          <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
            {(
              [
                { id: 'ALL', label: 'Semua 24 Jam (06:00–06:00)' },
                { id: 'SHIFT_1', label: 'Shift 1 (06:00–18:00)' },
                { id: 'SHIFT_2', label: 'Shift 2 (18:00–06:00)' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setShiftFilter(tab.id)}
                className={`min-h-[36px] md:min-h-0 px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  shiftFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-slate-500">
          Nilai <span className="font-semibold text-slate-700">Populasi</span> &amp;{' '}
          <span className="font-semibold text-slate-700">BD</span> per jam dapat diubah langsung jika ingin koreksi laporan shift.
        </p>
      </div>

      {/* Mobile Hourly Card View (< md) */}
      <div className="md:hidden divide-y divide-slate-200">
        {visibleRows.map((row) => {
          const active = row.isElapsed || row.isManual;
          const paColor = !active
            ? 'text-slate-400'
            : row.paPct >= targetPaPct
            ? 'text-emerald-700'
            : row.paPct >= warnThreshold
            ? 'text-amber-700'
            : 'text-red-700';

          const barColor = !active
            ? 'bg-slate-200'
            : row.paPct >= targetPaPct
            ? 'bg-emerald-600'
            : row.paPct >= warnThreshold
            ? 'bg-amber-500'
            : 'bg-red-600';

          return (
            <div
              key={row.key}
              className={`p-3.5 space-y-2.5 ${
                row.isCurrentHour ? 'bg-blue-50/40' : 'bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-mono font-bold tabular-nums text-slate-900">
                    {row.hourLabel}
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-500">
                    {formatReadableDateId(row.calendarDate).slice(0, 5)}
                  </span>
                  <span
                    className={`text-[11px] font-medium truncate ${
                      row.slotIndex === 12 || row.slotIndex === 24
                        ? 'text-blue-700'
                        : 'text-slate-600'
                    }`}
                  >
                    {row.shiftLabel}
                  </span>
                  {row.isCurrentHour && (
                    <span className="text-[10px] font-semibold text-blue-700">Aktif</span>
                  )}
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <span className={`text-sm font-mono font-bold tabular-nums ${paColor}`}>
                    {active ? `${row.paPct.toFixed(1)}%` : '—'}
                  </span>
                  {row.isManual ? (
                    <button
                      type="button"
                      onClick={() => onClearOverride(row.key)}
                      className="min-h-[32px] px-2 inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" aria-hidden="true" />
                      <span>Reset</span>
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-400">
                      {active ? 'Auto' : 'Nanti'}
                    </span>
                  )}
                </div>
              </div>

              <div className="w-full h-1.5 bg-slate-100 rounded-xs overflow-hidden">
                <div
                  className={`h-full ${barColor}`}
                  style={{ width: active ? `${Math.min(100, row.paPct)}%` : '0%' }}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                    Populasi
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    aria-label={`Total populasi jam ${row.hourLabel}`}
                    value={active ? row.totalPopulasi : ''}
                    placeholder={String(totalPopulasi)}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!Number.isFinite(val)) return;
                      onSetOverride({
                        shiftDate,
                        slotIndex: row.slotIndex,
                        totalPopulasi: Math.max(0, Math.floor(val)),
                        bdCount: active ? row.bdCount : 0,
                      });
                    }}
                    className="w-full min-h-[40px] px-2.5 py-1.5 text-sm font-mono tabular-nums bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 rounded focus:outline-none text-slate-900 placeholder:text-slate-300"
                  />
                </div>

                <div>
                  <span className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                    Running
                  </span>
                  <div className="min-h-[40px] px-2.5 py-1.5 flex items-center text-sm font-mono tabular-nums font-semibold text-emerald-700 bg-slate-50/60 border border-slate-200/70 rounded">
                    {active ? row.runningCount : '—'}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                    Unit BD
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    aria-label={`Jumlah unit BD jam ${row.hourLabel}`}
                    value={active ? row.bdCount : ''}
                    placeholder="0"
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!Number.isFinite(val)) return;
                      onSetOverride({
                        shiftDate,
                        slotIndex: row.slotIndex,
                        totalPopulasi: active ? row.totalPopulasi : totalPopulasi,
                        bdCount: Math.max(0, Math.floor(val)),
                      });
                    }}
                    className={`w-full min-h-[40px] px-2.5 py-1.5 text-sm font-mono tabular-nums font-semibold bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 rounded focus:outline-none placeholder:text-slate-300 ${
                      active && row.bdCount > 0 ? 'text-red-700' : 'text-slate-700'
                    }`}
                  />
                </div>
              </div>

              {active && row.bdUnitCodes.length > 0 && (
                <p className="text-[11px] font-mono text-slate-600 leading-relaxed">
                  <span className="font-sans text-slate-400">Unit BD:</span>{' '}
                  {row.bdUnitCodes.join(', ')}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop Hourly Table (>= md) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs min-w-[820px]">
          <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
            <tr>
              <th className="py-2.5 pl-4 pr-2 w-20">JAM</th>
              <th className="py-2.5 px-2 w-24">TANGGAL</th>
              <th className="py-2.5 px-2 w-28">SHIFT</th>
              <th className="py-2.5 px-2 w-28 text-right">POPULASI</th>
              <th className="py-2.5 px-2 w-28 text-right">RUNNING</th>
              <th className="py-2.5 px-2 w-24 text-right">UNIT BD</th>
              <th className="py-2.5 px-2 w-44">KONDISI PA (%)</th>
              <th className="py-2.5 px-2">UNIT BD TERCATAT</th>
              <th className="py-2.5 pl-2 pr-4 text-right w-24">SUMBER</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.map((row) => {
              const active = row.isElapsed || row.isManual;
              const paColor = !active
                ? 'text-slate-400'
                : row.paPct >= targetPaPct
                ? 'text-emerald-700'
                : row.paPct >= warnThreshold
                ? 'text-amber-700'
                : 'text-red-700';

              const barColor = !active
                ? 'bg-slate-200'
                : row.paPct >= targetPaPct
                ? 'bg-emerald-600'
                : row.paPct >= warnThreshold
                ? 'bg-amber-500'
                : 'bg-red-600';

              const paLabel = !active
                ? 'Menunggu'
                : row.paPct >= targetPaPct
                ? 'Optimal'
                : row.paPct >= warnThreshold
                ? 'Perhatian'
                : 'Kritis';

              return (
                <tr
                  key={row.key}
                  className={`transition-colors ${
                    row.isCurrentHour
                      ? 'bg-blue-50/50 hover:bg-blue-50/80'
                      : 'hover:bg-slate-50/80'
                  }`}
                >
                  <td className="py-2 pl-4 pr-2 font-mono font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                    {row.hourLabel}
                    {row.isCurrentHour && (
                      <span className="ml-1.5 text-[10px] font-sans font-semibold text-blue-700">
                        Aktif
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 font-mono tabular-nums text-slate-500">
                    {formatReadableDateId(row.calendarDate).slice(0, 5)}
                  </td>
                  <td
                    className={`py-2 px-2 font-medium whitespace-nowrap ${
                      row.slotIndex === 12 || row.slotIndex === 24
                        ? 'text-blue-700'
                        : 'text-slate-700'
                    }`}
                  >
                    {row.shiftLabel}
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <input
                      type="number"
                      min={0}
                      max={999}
                      aria-label={`Total populasi jam ${row.hourLabel}`}
                      value={active ? row.totalPopulasi : ''}
                      placeholder={String(totalPopulasi)}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!Number.isFinite(val)) return;
                        onSetOverride({
                          shiftDate,
                          slotIndex: row.slotIndex,
                          totalPopulasi: Math.max(0, Math.floor(val)),
                          bdCount: active ? row.bdCount : 0,
                        });
                      }}
                      className="w-16 px-1.5 py-1 text-right text-xs font-mono tabular-nums bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-blue-600 rounded focus:outline-none text-slate-900 placeholder:text-slate-300"
                    />
                  </td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums font-semibold text-emerald-700">
                    {active ? row.runningCount : '—'}
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <input
                      type="number"
                      min={0}
                      max={999}
                      aria-label={`Jumlah unit BD jam ${row.hourLabel}`}
                      value={active ? row.bdCount : ''}
                      placeholder="0"
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!Number.isFinite(val)) return;
                        onSetOverride({
                          shiftDate,
                          slotIndex: row.slotIndex,
                          totalPopulasi: active ? row.totalPopulasi : totalPopulasi,
                          bdCount: Math.max(0, Math.floor(val)),
                        });
                      }}
                      className={`w-14 px-1.5 py-1 text-right text-xs font-mono tabular-nums font-semibold bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-blue-600 rounded focus:outline-none placeholder:text-slate-300 ${
                        active && row.bdCount > 0 ? 'text-red-700' : 'text-slate-700'
                      }`}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono tabular-nums font-semibold w-12 ${paColor}`}
                      >
                        {active ? `${row.paPct.toFixed(1)}%` : '—'}
                      </span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-xs overflow-hidden">
                        <div
                          className={`h-full ${barColor}`}
                          style={{ width: active ? `${Math.min(100, row.paPct)}%` : '0%' }}
                        />
                      </div>
                      <span className={`text-[11px] w-16 text-right ${paColor}`}>
                        {paLabel}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-2 font-mono text-[11px] text-slate-600">
                    {active && row.bdUnitCodes.length > 0
                      ? row.bdUnitCodes.join(', ')
                      : active && row.bdCount === 0
                      ? 'Nihil (100% Running)'
                      : row.isManual
                      ? 'Input manual'
                      : '—'}
                  </td>
                  <td className="py-2 pl-2 pr-4 text-right whitespace-nowrap">
                    {row.isManual ? (
                      <button
                        type="button"
                        onClick={() => onClearOverride(row.key)}
                        title="Kembalikan ke hitungan otomatis"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:text-blue-800 hover:underline cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" aria-hidden="true" />
                        <span>Reset</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">
                        {active ? 'Otomatis' : 'Menunggu'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
