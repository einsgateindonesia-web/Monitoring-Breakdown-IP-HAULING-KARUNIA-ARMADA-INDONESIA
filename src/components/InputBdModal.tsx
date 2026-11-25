import { useEffect, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { BD_LOCATION_SUGGESTIONS, BD_STATUS_CATALOG } from '../data/initialUnits';
import { BdStatus, FleetUnit } from '../types/fleet';
import { getCurrentTimeHHMM } from '../utils/fleetUtils';
import { StackedMrEditor } from './MrListInput';
import { Time24Input } from './Time24Input';

const MODAL_DRAFT_KEY = 'fleetbd_draft_input_bd_modal_v1';

interface InputBdDraft {
  unitCode: string;
  jamBd: string;
  lokasi: string;
  mrNumbers: string[];
  partName: string;
  keterangan: string;
  status: BdStatus;
  picMekanik: string;
  etr: string;
}

function loadModalDraft(): InputBdDraft | null {
  try {
    const raw = localStorage.getItem(MODAL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<InputBdDraft>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      unitCode: String(parsed.unitCode ?? ''),
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
  } catch {
    return null;
  }
}

function saveModalDraft(draft: InputBdDraft): void {
  try {
    localStorage.setItem(MODAL_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage quota errors
  }
}

function clearModalDraft(): void {
  try {
    localStorage.removeItem(MODAL_DRAFT_KEY);
  } catch {
    // Ignore storage errors
  }
}

interface InputBdModalProps {
  isOpen: boolean;
  initialUnitCode: string | null;
  runningUnits: FleetUnit[];
  onClose: () => void;
  onSubmit: (payload: {
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
}

export function InputBdModal({
  isOpen,
  initialUnitCode,
  runningUnits,
  onClose,
  onSubmit,
}: InputBdModalProps) {
  const [unitCode, setUnitCode] = useState('');
  const [jamBd, setJamBd] = useState(getCurrentTimeHHMM());
  const [lokasi, setLokasi] = useState('');
  const [mrNumbers, setMrNumbers] = useState<string[]>([]);
  const [partName, setPartName] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [status, setStatus] = useState<BdStatus>('B0');
  const [picMekanik, setPicMekanik] = useState('');
  const [etr, setEtr] = useState('');
  const [error, setError] = useState('');
  const [restoredDraftNotice, setRestoredDraftNotice] = useState(false);
  const [otherUnitDraft, setOtherUnitDraft] = useState<InputBdDraft | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const saved = loadModalDraft();
    const hasMeaningfulContent = Boolean(
      saved &&
        (saved.lokasi.trim() ||
          saved.partName.trim() ||
          saved.keterangan.trim() ||
          saved.mrNumbers.length > 0 ||
          saved.picMekanik.trim() ||
          saved.etr.trim() ||
          saved.status !== 'B0')
    );

    if (saved && hasMeaningfulContent && (!initialUnitCode || saved.unitCode === initialUnitCode)) {
      const validSavedUnit = runningUnits.some((u) => u.code === saved.unitCode);
      setUnitCode(validSavedUnit ? saved.unitCode : initialUnitCode ?? runningUnits[0]?.code ?? '');
      setJamBd(saved.jamBd || getCurrentTimeHHMM());
      setLokasi(saved.lokasi);
      setMrNumbers(saved.mrNumbers);
      setPartName(saved.partName);
      setKeterangan(saved.keterangan);
      setStatus(saved.status);
      setPicMekanik(saved.picMekanik);
      setEtr(saved.etr);
      setError('');
      setRestoredDraftNotice(true);
      setOtherUnitDraft(null);
      return;
    }

    setUnitCode(initialUnitCode ?? runningUnits[0]?.code ?? '');
    setJamBd(getCurrentTimeHHMM());
    setLokasi('');
    setMrNumbers([]);
    setPartName('');
    setKeterangan('');
    setStatus('B0');
    setPicMekanik('');
    setEtr('');
    setError('');
    setRestoredDraftNotice(false);
    setOtherUnitDraft(
      saved && hasMeaningfulContent && initialUnitCode && saved.unitCode !== initialUnitCode
        ? saved
        : null
    );
  }, [isOpen, initialUnitCode, runningUnits]);

  useEffect(() => {
    if (!isOpen) return;
    const hasMeaningfulContent = Boolean(
      lokasi.trim() ||
        partName.trim() ||
        keterangan.trim() ||
        mrNumbers.length > 0 ||
        picMekanik.trim() ||
        etr.trim() ||
        status !== 'B0'
    );
    if (!hasMeaningfulContent) return;
    saveModalDraft({
      unitCode,
      jamBd,
      lokasi,
      mrNumbers,
      partName,
      keterangan,
      status,
      picMekanik,
      etr,
    });
  }, [isOpen, unitCode, jamBd, lokasi, mrNumbers, partName, keterangan, status, picMekanik, etr]);

  if (!isOpen) return null;

  const handleResetDraft = () => {
    clearModalDraft();
    setUnitCode(initialUnitCode ?? runningUnits[0]?.code ?? '');
    setJamBd(getCurrentTimeHHMM());
    setLokasi('');
    setMrNumbers([]);
    setPartName('');
    setKeterangan('');
    setStatus('B0');
    setPicMekanik('');
    setEtr('');
    setRestoredDraftNotice(false);
    setOtherUnitDraft(null);
  };

  const handleApplyOtherDraft = () => {
    if (!otherUnitDraft) return;
    const validSavedUnit = runningUnits.some((u) => u.code === otherUnitDraft.unitCode);
    setUnitCode(validSavedUnit ? otherUnitDraft.unitCode : runningUnits[0]?.code ?? '');
    setJamBd(otherUnitDraft.jamBd || getCurrentTimeHHMM());
    setLokasi(otherUnitDraft.lokasi);
    setMrNumbers(otherUnitDraft.mrNumbers);
    setPartName(otherUnitDraft.partName);
    setKeterangan(otherUnitDraft.keterangan);
    setStatus(otherUnitDraft.status);
    setPicMekanik(otherUnitDraft.picMekanik);
    setEtr(otherUnitDraft.etr);
    setRestoredDraftNotice(true);
    setOtherUnitDraft(null);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = onSubmit({
      unitCode,
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
      setError(res.message ?? 'Gagal memindahkan unit ke BD.');
      return;
    }
    clearModalDraft();
    setRestoredDraftNotice(false);
    setOtherUnitDraft(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-input-bd-title"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-t-2xl sm:rounded-lg shadow-lg overflow-hidden max-h-[92vh] sm:max-h-[90vh] flex flex-col">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
          <div>
            <h2 id="modal-input-bd-title" className="text-sm font-semibold text-slate-900">
              Input BD Unit
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Unit otomatis pindah dari Unit Running ke Unit BD.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-slate-400 hover:text-slate-700 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto ops-scroll">
          {restoredDraftNotice && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-900">
              <span>Draf ketikan terakhir dipulihkan otomatis.</span>
              <button
                type="button"
                onClick={handleResetDraft}
                className="inline-flex items-center gap-1 font-semibold text-amber-950 hover:underline cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                <span>Reset</span>
              </button>
            </div>
          )}

          {otherUnitDraft && !restoredDraftNotice && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-[11px] text-blue-900">
              <span>
                Ada draf belum tersimpan untuk <strong>{otherUnitDraft.unitCode || 'unit sebelumnya'}</strong>.
              </span>
              <button
                type="button"
                onClick={handleApplyOtherDraft}
                className="font-semibold text-blue-800 hover:underline cursor-pointer shrink-0"
              >
                Pulihkan
              </button>
            </div>
          )}

          <datalist id="modal-bd-location-suggestions">
            {BD_LOCATION_SUGGESTIONS.map((loc) => (
              <option key={loc} value={loc} />
            ))}
          </datalist>

          <div>
            <label
              htmlFor="modal-unit-select"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              UNIT BD (Dari Unit Running)
            </label>
            {runningUnits.length === 0 ? (
              <p className="text-xs text-red-600 py-2">
                Tidak ada unit tersisa di daftar Unit Running.
              </p>
            ) : (
              <select
                id="modal-unit-select"
                value={unitCode}
                onChange={(e) => {
                  setUnitCode(e.target.value);
                  setError('');
                }}
                className="w-full px-3 py-2 text-xs font-mono font-semibold bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {runningUnits.map((u) => (
                  <option key={u.id} value={u.code}>
                    {u.code}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="modal-jam-bd"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                JAM BD (Format 24:00)
              </label>
              <Time24Input
                id="modal-jam-bd"
                value={jamBd}
                onChange={setJamBd}
                required
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="modal-status-bd"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                STATUS
              </label>
              <select
                id="modal-status-bd"
                value={status}
                onChange={(e) => setStatus(e.target.value as BdStatus)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {BD_STATUS_CATALOG.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code} - {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="modal-lokasi-bd"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              POSISI / LOKASI UNIT SAAT BD
            </label>
            <input
              id="modal-lokasi-bd"
              type="text"
              list="modal-bd-location-suggestions"
              value={lokasi}
              onChange={(e) => setLokasi(e.target.value)}
              placeholder="Contoh: KM 12 Hauling Road, Pit / Front Loading, Workshop IP..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="modal-pic-bd"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                PIC MEKANIK (Opsional)
              </label>
              <input
                id="modal-pic-bd"
                type="text"
                value={picMekanik}
                onChange={(e) => setPicMekanik(e.target.value)}
                placeholder="Nama mekanik / leader..."
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="modal-etr-bd"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                ESTIMASI READY / ETR (24:00)
              </label>
              <Time24Input
                id="modal-etr-bd"
                value={etr}
                onChange={setEtr}
                placeholder="HH:mm"
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="modal-mr-input-0"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              NOMOR MR (Material Request)
            </label>
            <StackedMrEditor
              value={mrNumbers}
              onChange={setMrNumbers}
              idPrefix="modal-mr"
            />
          </div>

          <div>
            <label
              htmlFor="modal-part-name"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              NAMA PART UTAMA (Opsional)
            </label>
            <input
              id="modal-part-name"
              type="text"
              value={partName}
              onChange={(e) => setPartName(e.target.value)}
              placeholder="Contoh: Hose Hydraulic High Press, Alternator, Fuel Filter..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="modal-ket-bd"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              KETERANGAN
            </label>
            <textarea
              id="modal-ket-bd"
              rows={3}
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Contoh: Hose hydraulic bocor, tunggu mekanik..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 pb-safe">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial min-h-[42px] sm:min-h-0 px-4 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={runningUnits.length === 0}
              className="flex-1 sm:flex-initial min-h-[42px] sm:min-h-0 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md cursor-pointer"
            >
              Pindahkan ke Unit BD
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
