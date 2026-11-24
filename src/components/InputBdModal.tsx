import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { BD_LOCATION_SUGGESTIONS, BD_STATUS_CATALOG } from '../data/initialUnits';
import { BdStatus, FleetUnit } from '../types/fleet';
import { getCurrentTimeHHMM } from '../utils/fleetUtils';
import { Time24Input } from './Time24Input';

interface InputBdModalProps {
  isOpen: boolean;
  initialUnitCode: string | null;
  runningUnits: FleetUnit[];
  onClose: () => void;
  onSubmit: (payload: {
    unitCode: string;
    jamBd: string;
    lokasi: string;
    keterangan: string;
    status: BdStatus;
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
  const [keterangan, setKeterangan] = useState('');
  const [status, setStatus] = useState<BdStatus>('B0');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setUnitCode(initialUnitCode ?? runningUnits[0]?.code ?? '');
      setJamBd(getCurrentTimeHHMM());
      setLokasi('');
      setKeterangan('');
      setStatus('B0');
      setError('');
    }
  }, [isOpen, initialUnitCode, runningUnits]);

  if (!isOpen) return null;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = onSubmit({
      unitCode,
      jamBd: jamBd || getCurrentTimeHHMM(),
      lokasi,
      keterangan,
      status,
    });
    if (!res.ok) {
      setError(res.message ?? 'Gagal memindahkan unit ke BD.');
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-input-bd-title"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
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
            className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-5 space-y-4">
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
              autoFocus
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

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={runningUnits.length === 0}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md cursor-pointer"
            >
              Pindahkan ke Unit BD
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
