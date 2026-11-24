import { useMemo, useState } from 'react';
import { ArrowRight, Plus, Search, Upload, X } from 'lucide-react';
import { MAX_SPREADSHEET_SLOTS } from '../data/initialUnits';
import { FleetGroup, FleetUnit } from '../types/fleet';

interface UnitRunningPanelProps {
  runningUnits: FleetUnit[];
  totalFleetCount: number;
  onSelectUnitForBd: (unitCode: string) => void;
  onAddNewUnit: (unitCode: string) => { ok: boolean; message?: string };
  onOpenPopulationManager: () => void;
}

export function UnitRunningPanel({
  runningUnits,
  totalFleetCount,
  onSelectUnitForBd,
  onAddNewUnit,
  onOpenPopulationManager,
}: UnitRunningPanelProps) {
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<'ALL' | FleetGroup>('ALL');
  const [showEmptySlots, setShowEmptySlots] = useState(false);
  const [isAddingUnit, setIsAddingUnit] = useState(false);
  const [newUnitCode, setNewUnitCode] = useState('');
  const [addError, setAddError] = useState('');

  const filteredUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return runningUnits.filter((unit) => {
      const matchGroup = groupFilter === 'ALL' || unit.fleetGroup === groupFilter;
      const matchSearch = !q || unit.code.toLowerCase().includes(q);
      return matchGroup && matchSearch;
    });
  }, [runningUnits, groupFilter, search]);

  const emptySlotNumbers = useMemo(() => {
    if (!showEmptySlots || search.trim() || groupFilter !== 'ALL') return [];
    const start = runningUnits.length + 1;
    if (start > MAX_SPREADSHEET_SLOTS) return [];
    const slots: number[] = [];
    for (let n = start; n <= MAX_SPREADSHEET_SLOTS; n++) {
      slots.push(n);
    }
    return slots;
  }, [showEmptySlots, runningUnits.length, search, groupFilter]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = onAddNewUnit(newUnitCode);
    if (!res.ok) {
      setAddError(res.message ?? 'Kode unit tidak valid.');
      return;
    }
    setNewUnitCode('');
    setAddError('');
    setIsAddingUnit(false);
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg flex flex-col min-h-[540px] lg:h-[calc(100vh-250px)]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Unit Running</h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums truncate">
            {runningUnits.length} dari {totalFleetCount} unit beroperasi
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenPopulationManager}
            title="Upload file CSV/Excel atau edit seluruh populasi unit"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>Populasi</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsAddingUnit((prev) => !prev);
              setAddError('');
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isAddingUnit ? (
              <>
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Tutup</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Tambah</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Inline Add Unit Form (slots 76-114+) */}
      {isAddingUnit && (
        <form
          onSubmit={handleAddSubmit}
          className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 space-y-1.5"
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newUnitCode}
              onChange={(e) => {
                setNewUnitCode(e.target.value.toUpperCase());
                setAddError('');
              }}
              placeholder="Contoh: PMVV 240"
              className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              autoFocus
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              Simpan
            </button>
          </div>
          {addError && <p className="text-[11px] text-red-600 font-medium">{addError}</p>}
        </form>
      )}

      {/* Search & Group Filter Bar */}
      <div className="px-4 py-2.5 border-b border-slate-200 space-y-2">
        <div className="relative">
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari unit running (misal: PMSC 037)..."
            aria-label="Cari unit running"
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
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

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
            {(['ALL', 'PMSC', 'PMVV'] as const).map((grp) => (
              <button
                key={grp}
                type="button"
                onClick={() => setGroupFilter(grp)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  groupFilter === grp
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {grp === 'ALL' ? 'Semua' : grp}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showEmptySlots}
              onChange={(e) => setShowEmptySlots(e.target.checked)}
              className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span>Slot s/d 114</span>
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto ops-scroll">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
            <tr>
              <th className="py-2 pl-4 pr-2 w-12 font-mono">NO</th>
              <th className="py-2 px-2">UNIT RUNNING</th>
              <th className="py-2 pl-2 pr-4 text-right w-28">AKSI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {filteredUnits.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-10 px-4 text-center text-slate-500">
                  {runningUnits.length === 0
                    ? 'Seluruh unit armada sedang berstatus BD.'
                    : 'Tidak ada unit running yang cocok dengan pencarian.'}
                </td>
              </tr>
            ) : (
              filteredUnits.map((unit, idx) => (
                <tr
                  key={unit.id}
                  className="hover:bg-slate-50/90 transition-colors group h-9"
                >
                  <td className="py-1.5 pl-4 pr-2 font-mono tabular-nums text-slate-400">
                    {idx + 1}
                  </td>
                  <td className="py-1.5 px-2 font-mono font-semibold text-slate-900">
                    {unit.code}
                  </td>
                  <td className="py-1.5 pl-2 pr-4 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectUnitForBd(unit.code)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-red-700 bg-red-50/70 hover:bg-red-100 border border-red-200/80 rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Input BD</span>
                      <ArrowRight className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))
            )}

            {emptySlotNumbers.map((slotNo) => (
              <tr key={`empty-${slotNo}`} className="h-8 bg-slate-50/30 text-slate-300">
                <td className="py-1 pl-4 pr-2 font-mono tabular-nums">{slotNo}</td>
                <td className="py-1 px-2 font-mono">—</td>
                <td className="py-1 pl-2 pr-4 text-right text-[11px]">Kosong</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
