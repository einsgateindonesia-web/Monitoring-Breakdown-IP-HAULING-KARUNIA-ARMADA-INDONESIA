import { useMemo, useState } from 'react';
import { Check, Download, History, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import {
  BD_LOCATION_SUGGESTIONS,
  BD_STATUS_CATALOG,
  BD_STATUS_LABELS,
  formatBdStatus,
} from '../data/initialUnits';
import { BdStatus, FleetUnit, RfuHistoryRecord } from '../types/fleet';
import {
  formatReadableDateId,
  getCurrentDateYYYYMMDD,
  getCurrentTimeHHMM,
} from '../utils/fleetUtils';
import { Time24Input } from './Time24Input';

interface RfuHistoryViewProps {
  history: RfuHistoryRecord[];
  masterUnits: FleetUnit[];
  onUpdateItem: (
    id: string,
    patch: Partial<Omit<RfuHistoryRecord, 'id' | 'fleetGroup'>>
  ) => void;
  onAddItem: (payload: {
    unitCode: string;
    tanggalBd: string;
    jamBd: string;
    tanggalRfu: string;
    jamRfu: string;
    lokasi: string;
    keterangan: string;
    lastStatus: BdStatus;
  }) => { ok: boolean; message?: string };
  onDeleteItem: (id: string) => void;
  onExportCsv: () => void;
  onClearHistory: () => void;
  onBackToBoard: () => void;
}

interface EditDraft {
  unitCode: string;
  tanggalBd: string;
  jamBd: string;
  tanggalRfu: string;
  jamRfu: string;
  lokasi: string;
  keterangan: string;
  lastStatus: BdStatus;
}

export function RfuHistoryView({
  history,
  masterUnits,
  onUpdateItem,
  onAddItem,
  onDeleteItem,
  onExportCsv,
  onClearHistory,
  onBackToBoard,
}: RfuHistoryViewProps) {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // Manual add RFU log form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUnitCode, setNewUnitCode] = useState('');
  const [newTanggalBd, setNewTanggalBd] = useState(getCurrentDateYYYYMMDD());
  const [newJamBd, setNewJamBd] = useState(getCurrentTimeHHMM());
  const [newTanggalRfu, setNewTanggalRfu] = useState(getCurrentDateYYYYMMDD());
  const [newJamRfu, setNewJamRfu] = useState(getCurrentTimeHHMM());
  const [newLokasi, setNewLokasi] = useState('');
  const [newKeterangan, setNewKeterangan] = useState('');
  const [newStatus, setNewStatus] = useState<BdStatus>('B0');
  const [addError, setAddError] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (h) =>
        h.unitCode.toLowerCase().includes(q) ||
        (h.lokasi ?? '').toLowerCase().includes(q) ||
        h.keterangan.toLowerCase().includes(q) ||
        h.lastStatus.toLowerCase().includes(q) ||
        (BD_STATUS_LABELS[h.lastStatus] ?? '').toLowerCase().includes(q)
    );
  }, [history, search]);

  const startEdit = (item: RfuHistoryRecord) => {
    setEditingId(item.id);
    setDraft({
      unitCode: item.unitCode,
      tanggalBd: item.tanggalBd,
      jamBd: item.jamBd,
      tanggalRfu: item.tanggalRfu,
      jamRfu: item.jamRfu,
      lokasi: item.lokasi ?? '',
      keterangan: item.keterangan,
      lastStatus: item.lastStatus,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = () => {
    if (!editingId || !draft) return;
    if (!draft.unitCode.trim()) return;
    onUpdateItem(editingId, {
      unitCode: draft.unitCode,
      tanggalBd: draft.tanggalBd,
      jamBd: draft.jamBd,
      tanggalRfu: draft.tanggalRfu,
      jamRfu: draft.jamRfu,
      lokasi: draft.lokasi,
      keterangan: draft.keterangan,
      lastStatus: draft.lastStatus,
    });
    setEditingId(null);
    setDraft(null);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = onAddItem({
      unitCode: newUnitCode,
      tanggalBd: newTanggalBd,
      jamBd: newJamBd,
      tanggalRfu: newTanggalRfu,
      jamRfu: newJamRfu,
      lokasi: newLokasi,
      keterangan: newKeterangan,
      lastStatus: newStatus,
    });
    if (!res.ok) {
      setAddError(res.message ?? 'Gagal menambah catatan RFU.');
      return;
    }
    setNewUnitCode('');
    setNewLokasi('');
    setNewKeterangan('');
    setNewStatus('B0');
    setAddError('');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-4">
      <datalist id="rfu-unit-suggestions">
        {masterUnits.map((u) => (
          <option key={u.id} value={u.code} />
        ))}
      </datalist>

      <datalist id="rfu-location-suggestions">
        {BD_LOCATION_SUGGESTIONS.map((loc) => (
          <option key={loc} value={loc} />
        ))}
      </datalist>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Riwayat Unit RFU</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Catatan unit BD yang telah selesai perbaikan. Klik tombol edit pada baris untuk mengubah tanggal, jam, posisi, keterangan, atau status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBackToBoard}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
          >
            Kembali ke Board
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAddForm((prev) => !prev);
              setAddError('');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer whitespace-nowrap shrink-0"
          >
            {showAddForm ? (
              <>
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Tutup Form</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Tambah Catatan RFU</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            disabled={history.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
          {history.length > 0 && !confirmClearAll && (
            <button
              type="button"
              onClick={() => setConfirmClearAll(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-white hover:bg-red-50 border border-red-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Bersihkan Log</span>
            </button>
          )}
          {confirmClearAll && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-red-50 border border-red-200 rounded-md text-xs">
              <span className="text-red-800 font-medium">Hapus semua log?</span>
              <button
                type="button"
                onClick={() => {
                  onClearHistory();
                  setConfirmClearAll(false);
                }}
                className="px-2 py-0.5 text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded cursor-pointer"
              >
                Ya, Hapus
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearAll(false)}
                className="px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Batal
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Inline Manual Add RFU Record Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddSubmit}
          className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-900">
              Tambah Catatan Riwayat RFU Manual
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label
                htmlFor="add-rfu-unit"
                className="block text-[11px] font-semibold text-slate-600 mb-1"
              >
                UNIT
              </label>
              <input
                id="add-rfu-unit"
                type="text"
                list="rfu-unit-suggestions"
                value={newUnitCode}
                onChange={(e) => {
                  setNewUnitCode(e.target.value.toUpperCase());
                  setAddError('');
                }}
                placeholder="Misal: PMSC 037"
                className="w-full px-2.5 py-1.5 text-xs font-mono font-semibold bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="add-rfu-tgl-bd"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  TGL BD
                </label>
                <input
                  id="add-rfu-tgl-bd"
                  type="date"
                  value={newTanggalBd}
                  onChange={(e) => setNewTanggalBd(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label
                  htmlFor="add-rfu-jam-bd"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  JAM BD (24:00)
                </label>
                <Time24Input
                  id="add-rfu-jam-bd"
                  value={newJamBd}
                  onChange={setNewJamBd}
                  className="w-full px-2 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="add-rfu-tgl-rfu"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  TGL RFU
                </label>
                <input
                  id="add-rfu-tgl-rfu"
                  type="date"
                  value={newTanggalRfu}
                  onChange={(e) => setNewTanggalRfu(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label
                  htmlFor="add-rfu-jam-rfu"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  JAM RFU (24:00)
                </label>
                <Time24Input
                  id="add-rfu-jam-rfu"
                  value={newJamRfu}
                  onChange={setNewJamRfu}
                  className="w-full px-2 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="add-rfu-status"
                className="block text-[11px] font-semibold text-slate-600 mb-1"
              >
                STATUS TERAKHIR
              </label>
              <select
                id="add-rfu-status"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as BdStatus)}
                className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {BD_STATUS_CATALOG.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code} - {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-4">
              <label
                htmlFor="add-rfu-lokasi"
                className="block text-[11px] font-semibold text-slate-600 mb-1"
              >
                POSISI / LOKASI BD
              </label>
              <input
                id="add-rfu-lokasi"
                type="text"
                list="rfu-location-suggestions"
                value={newLokasi}
                onChange={(e) => setNewLokasi(e.target.value)}
                placeholder="KM 12 / Pit / Workshop..."
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="sm:col-span-6">
              <label
                htmlFor="add-rfu-ket"
                className="block text-[11px] font-semibold text-slate-600 mb-1"
              >
                KETERANGAN
              </label>
              <input
                id="add-rfu-ket"
                type="text"
                value={newKeterangan}
                onChange={(e) => setNewKeterangan(e.target.value)}
                placeholder="Perbaikan / penggantian part..."
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                className="w-full px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md cursor-pointer"
              >
                Simpan Catatan
              </button>
            </div>
          </div>

          {addError && <p className="text-xs font-medium text-red-600">{addError}</p>}
        </form>
      )}

      {/* Table Card */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari unit, lokasi, status, atau keterangan..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {filtered.length} catatan
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs min-w-[960px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
              <tr>
                <th className="py-2.5 pl-4 pr-2 w-10 font-mono">NO</th>
                <th className="py-2.5 px-2 w-28">UNIT</th>
                <th className="py-2.5 px-2 w-44">TGL / JAM BD</th>
                <th className="py-2.5 px-2 w-44">TGL / JAM RFU</th>
                <th className="py-2.5 px-2 w-40">POSISI / LOKASI BD</th>
                <th className="py-2.5 px-2">KETERANGAN</th>
                <th className="py-2.5 px-2 w-48">STATUS TERAKHIR</th>
                <th className="py-2.5 pl-2 pr-4 text-right w-24">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 px-4 text-center">
                    <div className="max-w-xs mx-auto space-y-2">
                      <div className="w-9 h-9 mx-auto rounded-md bg-slate-100 flex items-center justify-center text-slate-500">
                        <History className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <p className="text-sm font-medium text-slate-800">
                        Belum ada riwayat unit RFU
                      </p>
                      <p className="text-xs text-slate-500">
                        Setiap unit BD yang diklik tombol RFU akan otomatis tercatat di sini dan kembali ke Unit Running.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((item, idx) => {
                  const isEditing = editingId === item.id && draft !== null;

                  if (isEditing && draft) {
                    return (
                      <tr key={item.id} className="bg-blue-50/40">
                        <td className="py-2 pl-4 pr-2 font-mono tabular-nums text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            list="rfu-unit-suggestions"
                            value={draft.unitCode}
                            onChange={(e) =>
                              setDraft({ ...draft, unitCode: e.target.value.toUpperCase() })
                            }
                            aria-label="Edit kode unit RFU"
                            className="w-full px-2 py-1 text-xs font-mono font-semibold bg-white border border-blue-600 rounded focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="date"
                              value={draft.tanggalBd}
                              onChange={(e) => setDraft({ ...draft, tanggalBd: e.target.value })}
                              aria-label="Edit tanggal BD"
                              className="w-[110px] px-1.5 py-1 text-[11px] font-mono bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                            />
                            <Time24Input
                              value={draft.jamBd}
                              onChange={(val) => setDraft({ ...draft, jamBd: val })}
                              ariaLabel="Edit jam BD"
                              className="w-14 px-1.5 py-1 text-[11px] font-mono tabular-nums bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                            />
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="date"
                              value={draft.tanggalRfu}
                              onChange={(e) => setDraft({ ...draft, tanggalRfu: e.target.value })}
                              aria-label="Edit tanggal RFU"
                              className="w-[110px] px-1.5 py-1 text-[11px] font-mono bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                            />
                            <Time24Input
                              value={draft.jamRfu}
                              onChange={(val) => setDraft({ ...draft, jamRfu: val })}
                              ariaLabel="Edit jam RFU"
                              className="w-14 px-1.5 py-1 text-[11px] font-mono tabular-nums bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                            />
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            list="rfu-location-suggestions"
                            value={draft.lokasi}
                            onChange={(e) => setDraft({ ...draft, lokasi: e.target.value })}
                            placeholder="Posisi / lokasi..."
                            aria-label="Edit posisi atau lokasi BD"
                            className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={draft.keterangan}
                            onChange={(e) => setDraft({ ...draft, keterangan: e.target.value })}
                            placeholder="Keterangan..."
                            aria-label="Edit keterangan RFU"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                saveEdit();
                              } else if (e.key === 'Escape') {
                                cancelEdit();
                              }
                            }}
                            className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <select
                            value={draft.lastStatus}
                            onChange={(e) =>
                              setDraft({ ...draft, lastStatus: e.target.value as BdStatus })
                            }
                            aria-label="Edit status terakhir RFU"
                            className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                          >
                            {BD_STATUS_CATALOG.map((st) => (
                              <option key={st.code} value={st.code}>
                                {st.code} - {st.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pl-2 pr-4 text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={saveEdit}
                              title="Simpan perubahan"
                              aria-label={`Simpan edit ${item.unitCode}`}
                              className="p-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              title="Batal edit"
                              aria-label="Batal edit"
                              className="p-1.5 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 pl-4 pr-2 font-mono tabular-nums text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-2 font-mono font-semibold text-slate-900">
                        {item.unitCode}
                      </td>
                      <td className="py-2.5 px-2 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {formatReadableDateId(item.tanggalBd)} · {item.jamBd}
                      </td>
                      <td className="py-2.5 px-2 font-mono tabular-nums text-emerald-700 font-medium whitespace-nowrap">
                        {formatReadableDateId(item.tanggalRfu)} · {item.jamRfu}
                      </td>
                      <td className="py-2.5 px-2 text-slate-700">
                        {item.lokasi?.trim() ? item.lokasi : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-slate-700">
                        {item.keterangan.trim() ? item.keterangan : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600">
                        {formatBdStatus(item.lastStatus)}
                      </td>
                      <td className="py-2.5 pl-2 pr-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            title="Edit catatan RFU"
                            aria-label={`Edit catatan RFU ${item.unitCode}`}
                            className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteItem(item.id)}
                            title="Hapus catatan ini"
                            aria-label={`Hapus catatan RFU ${item.unitCode}`}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
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
    </div>
  );
}
