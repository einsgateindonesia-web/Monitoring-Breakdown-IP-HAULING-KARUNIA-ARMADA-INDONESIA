import { useMemo, useState } from 'react';
import { Download, History, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import {
  BD_LOCATION_SUGGESTIONS,
  BD_STATUS_CATALOG,
  BD_STATUS_LABELS,
  formatBdStatus,
} from '../data/initialUnits';
import {
  getComponentNames,
  getDetailSubComponentNames,
  getSubComponentNames,
} from '../data/componentHierarchy';
import { BdStatus, FleetUnit, RfuHistoryRecord } from '../types/fleet';
import {
  formatMrNumbers,
  formatReadableDateId,
  getCurrentDateYYYYMMDD,
  getCurrentTimeHHMM,
} from '../utils/fleetUtils';
import { CompactMrInput, StackedMrEditor } from './MrListInput';
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
    mrNumbers: string[];
    keterangan: string;
    komponen: string;
    subKomponen: string;
    detailSubKomponen: string;
    activityPerbaikan: string;
    lastStatus: BdStatus;
  }) => { ok: boolean; message?: string };
  onDeleteItem: (id: string) => void;
  onExportCsv: () => void;
  onClearHistory: () => void;
  onBackToBoard: () => void;
}

interface EditDraft {
  id: string;
  unitCode: string;
  tanggalBd: string;
  jamBd: string;
  tanggalRfu: string;
  jamRfu: string;
  lokasi: string;
  mrNumbers: string[];
  keterangan: string;
  komponen: string;
  subKomponen: string;
  detailSubKomponen: string;
  activityPerbaikan: string;
  lastStatus: BdStatus;
}

interface ComponentCascadeFieldsProps {
  idPrefix: string;
  komponen: string;
  subKomponen: string;
  detailSubKomponen: string;
  onChange: (next: {
    komponen: string;
    subKomponen: string;
    detailSubKomponen: string;
  }) => void;
  labelClassName?: string;
}

const COMPONENT_NAMES = getComponentNames();
const MANUAL_OPTION_VALUE = '__MANUAL_INPUT__';

function ComponentCascadeFields({
  idPrefix,
  komponen,
  subKomponen,
  detailSubKomponen,
  onChange,
  labelClassName = 'block text-[11px] font-semibold text-slate-600 mb-1',
}: ComponentCascadeFieldsProps) {
  const [manualComp, setManualComp] = useState(false);
  const [manualSub, setManualSub] = useState(false);
  const [manualDetail, setManualDetail] = useState(false);

  const subOptions = useMemo(() => getSubComponentNames(komponen), [komponen]);
  const detailOptions = useMemo(
    () => getDetailSubComponentNames(komponen, subKomponen),
    [komponen, subKomponen]
  );

  const hasCustomKomponen =
    Boolean(komponen.trim()) && !COMPONENT_NAMES.includes(komponen);
  const hasCustomSub =
    Boolean(subKomponen.trim()) && !subOptions.includes(subKomponen);
  const hasCustomDetail =
    Boolean(detailSubKomponen.trim()) &&
    !detailOptions.includes(detailSubKomponen);

  const handleKomponenSelect = (val: string) => {
    if (val === MANUAL_OPTION_VALUE) {
      setManualComp(true);
      setManualSub(true);
      setManualDetail(true);
      return;
    }
    const nextSubs = getSubComponentNames(val);
    const autoSub = nextSubs.length === 1 ? nextSubs[0] : '';
    const nextDetails = autoSub ? getDetailSubComponentNames(val, autoSub) : [];
    const autoDetail = nextDetails.length === 1 ? nextDetails[0] : '';
    setManualSub(false);
    setManualDetail(false);
    onChange({
      komponen: val,
      subKomponen: autoSub,
      detailSubKomponen: autoDetail,
    });
  };

  const handleSubSelect = (val: string) => {
    if (val === MANUAL_OPTION_VALUE) {
      setManualSub(true);
      setManualDetail(true);
      return;
    }
    const nextDetails = getDetailSubComponentNames(komponen, val);
    const autoDetail = nextDetails.length === 1 ? nextDetails[0] : '';
    setManualDetail(false);
    onChange({
      komponen,
      subKomponen: val,
      detailSubKomponen: autoDetail,
    });
  };

  const handleDetailSelect = (val: string) => {
    if (val === MANUAL_OPTION_VALUE) {
      setManualDetail(true);
      return;
    }
    onChange({
      komponen,
      subKomponen,
      detailSubKomponen: val,
    });
  };

  return (
    <>
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <label
            htmlFor={`${idPrefix}-komponen`}
            className={labelClassName.replace(/\bmb-\d+\b/g, '')}
          >
            KOMPONEN
          </label>
          {manualComp && (
            <button
              type="button"
              onClick={() => {
                setManualComp(false);
                setManualSub(false);
                setManualDetail(false);
              }}
              className="text-[10px] font-medium text-blue-700 hover:underline cursor-pointer whitespace-nowrap"
            >
              Pilih daftar
            </button>
          )}
        </div>
        {manualComp ? (
          <input
            id={`${idPrefix}-komponen`}
            type="text"
            value={komponen}
            onChange={(e) =>
              onChange({
                komponen: e.target.value,
                subKomponen,
                detailSubKomponen,
              })
            }
            placeholder="Ketik komponen manual..."
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        ) : (
          <select
            id={`${idPrefix}-komponen`}
            value={komponen}
            onChange={(e) => handleKomponenSelect(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="">-- Pilih Komponen --</option>
            {hasCustomKomponen && (
              <option value={komponen}>{komponen} (Custom)</option>
            )}
            {COMPONENT_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value={MANUAL_OPTION_VALUE}>+ Ketik manual...</option>
          </select>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <label
            htmlFor={`${idPrefix}-subkomponen`}
            className={labelClassName.replace(/\bmb-\d+\b/g, '')}
          >
            SUB KOMPONEN
          </label>
          {manualSub && !manualComp && (
            <button
              type="button"
              onClick={() => {
                setManualSub(false);
                setManualDetail(false);
              }}
              className="text-[10px] font-medium text-blue-700 hover:underline cursor-pointer whitespace-nowrap"
            >
              Pilih daftar
            </button>
          )}
        </div>
        {manualSub || manualComp ? (
          <input
            id={`${idPrefix}-subkomponen`}
            type="text"
            value={subKomponen}
            onChange={(e) =>
              onChange({
                komponen,
                subKomponen: e.target.value,
                detailSubKomponen,
              })
            }
            placeholder="Ketik sub komponen..."
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        ) : (
          <select
            id={`${idPrefix}-subkomponen`}
            value={subKomponen}
            disabled={!komponen.trim()}
            onChange={(e) => handleSubSelect(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-white disabled:bg-slate-50 disabled:text-slate-400 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="">
              {komponen.trim()
                ? '-- Pilih Sub Komponen --'
                : '-- Pilih Komponen dulu --'}
            </option>
            {hasCustomSub && (
              <option value={subKomponen}>{subKomponen} (Custom)</option>
            )}
            {subOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {komponen.trim() && (
              <option value={MANUAL_OPTION_VALUE}>+ Ketik manual...</option>
            )}
          </select>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <label
            htmlFor={`${idPrefix}-detailsub`}
            className={labelClassName.replace(/\bmb-\d+\b/g, '')}
          >
            DETAIL SUB KOMPONEN
          </label>
          {manualDetail && !manualSub && !manualComp && (
            <button
              type="button"
              onClick={() => setManualDetail(false)}
              className="text-[10px] font-medium text-blue-700 hover:underline cursor-pointer whitespace-nowrap"
            >
              Pilih daftar
            </button>
          )}
        </div>
        {manualDetail || manualSub || manualComp ? (
          <input
            id={`${idPrefix}-detailsub`}
            type="text"
            value={detailSubKomponen}
            onChange={(e) =>
              onChange({
                komponen,
                subKomponen,
                detailSubKomponen: e.target.value,
              })
            }
            placeholder="Ketik detail sub komponen..."
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        ) : (
          <select
            id={`${idPrefix}-detailsub`}
            value={detailSubKomponen}
            disabled={!subKomponen.trim()}
            onChange={(e) => handleDetailSelect(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-white disabled:bg-slate-50 disabled:text-slate-400 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="">
              {subKomponen.trim()
                ? '-- Pilih Detail Sub Komponen --'
                : '-- Pilih Sub Komponen dulu --'}
            </option>
            {hasCustomDetail && (
              <option value={detailSubKomponen}>
                {detailSubKomponen} (Custom)
              </option>
            )}
            {detailOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {subKomponen.trim() && (
              <option value={MANUAL_OPTION_VALUE}>+ Ketik manual...</option>
            )}
          </select>
        )}
      </div>
    </>
  );
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
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // Manual add RFU log form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUnitCode, setNewUnitCode] = useState('');
  const [newTanggalBd, setNewTanggalBd] = useState(getCurrentDateYYYYMMDD());
  const [newJamBd, setNewJamBd] = useState(getCurrentTimeHHMM());
  const [newTanggalRfu, setNewTanggalRfu] = useState(getCurrentDateYYYYMMDD());
  const [newJamRfu, setNewJamRfu] = useState(getCurrentTimeHHMM());
  const [newLokasi, setNewLokasi] = useState('');
  const [newMrNumbers, setNewMrNumbers] = useState<string[]>([]);
  const [newKeterangan, setNewKeterangan] = useState('');
  const [newKomponen, setNewKomponen] = useState('');
  const [newSubKomponen, setNewSubKomponen] = useState('');
  const [newDetailSubKomponen, setNewDetailSubKomponen] = useState('');
  const [newActivityPerbaikan, setNewActivityPerbaikan] = useState('');
  const [newStatus, setNewStatus] = useState<BdStatus>('B0');
  const [addError, setAddError] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (h) =>
        h.unitCode.toLowerCase().includes(q) ||
        (h.lokasi ?? '').toLowerCase().includes(q) ||
        (h.mrNumbers ?? []).join(' ').toLowerCase().includes(q) ||
        h.keterangan.toLowerCase().includes(q) ||
        (h.komponen ?? '').toLowerCase().includes(q) ||
        (h.subKomponen ?? '').toLowerCase().includes(q) ||
        (h.detailSubKomponen ?? '').toLowerCase().includes(q) ||
        (h.activityPerbaikan ?? '').toLowerCase().includes(q) ||
        h.lastStatus.toLowerCase().includes(q) ||
        (BD_STATUS_LABELS[h.lastStatus] ?? '').toLowerCase().includes(q)
    );
  }, [history, search]);

  const openEditModal = (item: RfuHistoryRecord) => {
    setEditDraft({
      id: item.id,
      unitCode: item.unitCode,
      tanggalBd: item.tanggalBd,
      jamBd: item.jamBd,
      tanggalRfu: item.tanggalRfu,
      jamRfu: item.jamRfu,
      lokasi: item.lokasi ?? '',
      mrNumbers: item.mrNumbers ?? [],
      keterangan: item.keterangan ?? '',
      komponen: item.komponen ?? '',
      subKomponen: item.subKomponen ?? '',
      detailSubKomponen: item.detailSubKomponen ?? '',
      activityPerbaikan: item.activityPerbaikan ?? '',
      lastStatus: item.lastStatus,
    });
  };

  const handleSaveEditModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDraft || !editDraft.unitCode.trim()) return;
    onUpdateItem(editDraft.id, {
      unitCode: editDraft.unitCode,
      tanggalBd: editDraft.tanggalBd,
      jamBd: editDraft.jamBd,
      tanggalRfu: editDraft.tanggalRfu,
      jamRfu: editDraft.jamRfu,
      lokasi: editDraft.lokasi,
      mrNumbers: editDraft.mrNumbers,
      keterangan: editDraft.keterangan,
      komponen: editDraft.komponen,
      subKomponen: editDraft.subKomponen,
      detailSubKomponen: editDraft.detailSubKomponen,
      activityPerbaikan: editDraft.activityPerbaikan,
      lastStatus: editDraft.lastStatus,
    });
    setEditDraft(null);
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
      mrNumbers: newMrNumbers,
      keterangan: newKeterangan,
      komponen: newKomponen,
      subKomponen: newSubKomponen,
      detailSubKomponen: newDetailSubKomponen,
      activityPerbaikan: newActivityPerbaikan,
      lastStatus: newStatus,
    });
    if (!res.ok) {
      setAddError(res.message ?? 'Gagal menambah catatan RFU.');
      return;
    }
    setNewUnitCode('');
    setNewLokasi('');
    setNewMrNumbers([]);
    setNewKeterangan('');
    setNewKomponen('');
    setNewSubKomponen('');
    setNewDetailSubKomponen('');
    setNewActivityPerbaikan('');
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
            Catatan detail problem, komponen, sub komponen, hingga activity perbaikan unit BD yang telah selesai (RFU).
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
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

            <div>
              <label
                htmlFor="add-rfu-mr"
                className="block text-[11px] font-semibold text-slate-600 mb-1"
              >
                NOMOR MR
              </label>
              <CompactMrInput
                id="add-rfu-mr"
                value={newMrNumbers}
                onChange={setNewMrNumbers}
                placeholder="MR-001, MR-002..."
                ariaLabel="Nomor MR Catatan RFU"
              />
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label
                htmlFor="add-rfu-ket"
                className="block text-[11px] font-semibold text-slate-600 mb-1"
              >
                KETERANGAN PROBLEM
              </label>
              <input
                id="add-rfu-ket"
                type="text"
                value={newKeterangan}
                onChange={(e) => setNewKeterangan(e.target.value)}
                placeholder="Contoh: Oli bocor / Low power..."
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <ComponentCascadeFields
              key={showAddForm ? 'add-rfu-open' : 'add-rfu-closed'}
              idPrefix="add-rfu"
              komponen={newKomponen}
              subKomponen={newSubKomponen}
              detailSubKomponen={newDetailSubKomponen}
              onChange={(next) => {
                setNewKomponen(next.komponen);
                setNewSubKomponen(next.subKomponen);
                setNewDetailSubKomponen(next.detailSubKomponen);
              }}
              labelClassName="block text-[11px] font-semibold text-slate-600"
            />

            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label
                  htmlFor="add-rfu-activity"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  ACTIVITY PERBAIKAN
                </label>
                <input
                  id="add-rfu-activity"
                  type="text"
                  value={newActivityPerbaikan}
                  onChange={(e) => setNewActivityPerbaikan(e.target.value)}
                  placeholder="Misal: Replace hose & top up oli..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <button
                type="submit"
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md cursor-pointer whitespace-nowrap shrink-0"
              >
                Simpan
              </button>
            </div>
          </div>

          {addError && <p className="text-xs font-medium text-red-600">{addError}</p>}
        </form>
      )}

      {/* Table Card */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari unit, nomor MR, problem, komponen, sub komponen, atau activity..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {filtered.length} catatan
          </span>
        </div>

        <div className="overflow-x-auto ops-scroll">
          <table className="w-full text-left border-collapse text-xs min-w-[1440px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
              <tr>
                <th className="py-2.5 pl-4 pr-2 w-10 font-mono">NO</th>
                <th className="py-2.5 px-2 w-24">UNIT</th>
                <th className="py-2.5 px-2 w-36">TGL / JAM BD</th>
                <th className="py-2.5 px-2 w-36">TGL / JAM RFU</th>
                <th className="py-2.5 px-2 w-36">POSISI / LOKASI BD</th>
                <th className="py-2.5 px-2 w-40">NOMOR MR</th>
                <th className="py-2.5 px-2 w-48">KETERANGAN PROBLEM</th>
                <th className="py-2.5 px-2 w-36">KOMPONEN</th>
                <th className="py-2.5 px-2 w-36">SUB KOMPONEN</th>
                <th className="py-2.5 px-2 w-40">DETAIL SUB KOMPONEN</th>
                <th className="py-2.5 px-2 w-52">ACTIVITY PERBAIKAN</th>
                <th className="py-2.5 px-2 w-44">STATUS TERAKHIR</th>
                <th className="py-2.5 pl-2 pr-4 text-right w-20">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-16 px-4 text-center">
                    <div className="max-w-xs mx-auto space-y-2">
                      <div className="w-9 h-9 mx-auto rounded-md bg-slate-100 flex items-center justify-center text-slate-500">
                        <History className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <p className="text-sm font-medium text-slate-800">
                        Belum ada riwayat unit RFU
                      </p>
                      <p className="text-xs text-slate-500">
                        Setiap unit BD yang diklik tombol RFU akan otomatis tercatat di sini dan dapat dilengkapi detail komponen serta activity perbaikannya.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 align-top">
                    <td className="py-2.5 pl-4 pr-2 font-mono tabular-nums text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-2 font-mono font-semibold text-slate-900 whitespace-nowrap">
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
                    <td className="py-2.5 px-2 font-mono tabular-nums text-slate-800">
                      {formatMrNumbers(item.mrNumbers, '—')}
                    </td>
                    <td className="py-2.5 px-2 text-slate-800">
                      {item.keterangan?.trim() ? item.keterangan : '—'}
                    </td>
                    <td className="py-2.5 px-2 text-slate-700 font-medium">
                      {item.komponen?.trim() ? item.komponen : '—'}
                    </td>
                    <td className="py-2.5 px-2 text-slate-700">
                      {item.subKomponen?.trim() ? item.subKomponen : '—'}
                    </td>
                    <td className="py-2.5 px-2 text-slate-700">
                      {item.detailSubKomponen?.trim() ? item.detailSubKomponen : '—'}
                    </td>
                    <td className="py-2.5 px-2 text-slate-700">
                      {item.activityPerbaikan?.trim() ? item.activityPerbaikan : '—'}
                    </td>
                    <td className="py-2.5 px-2 text-slate-600">
                      {formatBdStatus(item.lastStatus)}
                    </td>
                    <td className="py-2.5 pl-2 pr-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          title="Edit detail riwayat RFU"
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Edit Catatan RFU Modal */}
      {editDraft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-edit-rfu-title"
        >
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 id="modal-edit-rfu-title" className="text-sm font-semibold text-slate-900">
                  Edit Catatan Riwayat RFU — {editDraft.unitCode}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Lengkapi keterangan problem, komponen, sub komponen, detail sub komponen, dan activity perbaikan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditDraft(null)}
                aria-label="Tutup modal edit RFU"
                className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSaveEditModal}
              className="flex-1 overflow-auto ops-scroll p-5 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="edit-rfu-unit"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    UNIT
                  </label>
                  <input
                    id="edit-rfu-unit"
                    type="text"
                    list="rfu-unit-suggestions"
                    value={editDraft.unitCode}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, unitCode: e.target.value.toUpperCase() })
                    }
                    required
                    className="w-full px-3 py-1.5 text-xs font-mono font-semibold bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-rfu-lokasi"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    POSISI / LOKASI BD
                  </label>
                  <input
                    id="edit-rfu-lokasi"
                    type="text"
                    list="rfu-location-suggestions"
                    value={editDraft.lokasi}
                    onChange={(e) => setEditDraft({ ...editDraft, lokasi: e.target.value })}
                    placeholder="KM 12 / Pit / Workshop..."
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-rfu-status"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    STATUS TERAKHIR
                  </label>
                  <select
                    id="edit-rfu-status"
                    value={editDraft.lastStatus}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, lastStatus: e.target.value as BdStatus })
                    }
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {BD_STATUS_CATALOG.map((st) => (
                      <option key={st.code} value={st.code}>
                        {st.code} - {st.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label
                    htmlFor="edit-rfu-tgl-bd"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    TANGGAL BD
                  </label>
                  <input
                    id="edit-rfu-tgl-bd"
                    type="date"
                    value={editDraft.tanggalBd}
                    onChange={(e) => setEditDraft({ ...editDraft, tanggalBd: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-rfu-jam-bd"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    JAM BD (24:00)
                  </label>
                  <Time24Input
                    id="edit-rfu-jam-bd"
                    value={editDraft.jamBd}
                    onChange={(val) => setEditDraft({ ...editDraft, jamBd: val })}
                    className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-rfu-tgl-rfu"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    TANGGAL RFU
                  </label>
                  <input
                    id="edit-rfu-tgl-rfu"
                    type="date"
                    value={editDraft.tanggalRfu}
                    onChange={(e) => setEditDraft({ ...editDraft, tanggalRfu: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-rfu-jam-rfu"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    JAM RFU (24:00)
                  </label>
                  <Time24Input
                    id="edit-rfu-jam-rfu"
                    value={editDraft.jamRfu}
                    onChange={(val) => setEditDraft({ ...editDraft, jamRfu: val })}
                    className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor={`edit-rfu-mr-${editDraft.id}-input-0`}
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  NOMOR MR (Material Request)
                </label>
                <StackedMrEditor
                  key={`mr-${editDraft.id}`}
                  value={editDraft.mrNumbers}
                  onChange={(nextMr) => setEditDraft({ ...editDraft, mrNumbers: nextMr })}
                  idPrefix={`edit-rfu-mr-${editDraft.id}`}
                />
              </div>

              <div>
                <label
                  htmlFor="edit-rfu-problem"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  KETERANGAN PROBLEM
                </label>
                <textarea
                  id="edit-rfu-problem"
                  rows={2}
                  value={editDraft.keterangan}
                  onChange={(e) => setEditDraft({ ...editDraft, keterangan: e.target.value })}
                  placeholder="Jelaskan problem / gejala kerusakan unit..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <ComponentCascadeFields
                  key={editDraft.id}
                  idPrefix="edit-rfu"
                  komponen={editDraft.komponen}
                  subKomponen={editDraft.subKomponen}
                  detailSubKomponen={editDraft.detailSubKomponen}
                  onChange={(next) =>
                    setEditDraft({
                      ...editDraft,
                      komponen: next.komponen,
                      subKomponen: next.subKomponen,
                      detailSubKomponen: next.detailSubKomponen,
                    })
                  }
                  labelClassName="block text-xs font-semibold text-slate-700"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-rfu-activity"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  ACTIVITY PERBAIKAN
                </label>
                <textarea
                  id="edit-rfu-activity"
                  rows={2}
                  value={editDraft.activityPerbaikan}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, activityPerbaikan: e.target.value })
                  }
                  placeholder="Contoh: Bongkar hose bocor, ganti seal baru, bleeding & test fungsi normal..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditDraft(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md cursor-pointer"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
