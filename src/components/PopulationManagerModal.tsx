import { useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { detectFleetGroup } from '../data/initialUnits';
import { FleetUnit } from '../types/fleet';
import { exportPopulationCsv, parseFleetPopulationText } from '../utils/fleetUtils';

interface PopulationManagerModalProps {
  isOpen: boolean;
  masterUnits: FleetUnit[];
  bdUnitCodesSet: Set<string>;
  onClose: () => void;
  onImportPopulation: (
    codes: string[],
    mode: 'append' | 'replace'
  ) => { ok: boolean; added: number; total: number; message?: string };
  onAddSingleUnit: (code: string) => { ok: boolean; message?: string };
  onUpdateUnitCode: (unitId: string, newCode: string) => { ok: boolean; message?: string };
  onDeleteUnit: (unitId: string) => void;
  onResetDefault: () => void;
}

type ModalTab = 'upload' | 'edit';

export function PopulationManagerModal({
  isOpen,
  masterUnits,
  bdUnitCodesSet,
  onClose,
  onImportPopulation,
  onAddSingleUnit,
  onUpdateUnitCode,
  onDeleteUnit,
  onResetDefault,
}: PopulationManagerModalProps) {
  const [tab, setTab] = useState<ModalTab>('upload');

  // Upload / Paste state
  const [rawInput, setRawInput] = useState('');
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Edit Master state
  const [editSearch, setEditSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState('');
  const [editError, setEditError] = useState('');
  const [newCodeInput, setNewCodeInput] = useState('');
  const [newCodeError, setNewCodeError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  const existingCodeSet = useMemo(
    () => new Set(masterUnits.map((u) => u.code.trim().toUpperCase())),
    [masterUnits]
  );

  const parsedResult = useMemo(() => parseFleetPopulationText(rawInput), [rawInput]);

  const previewStats = useMemo(() => {
    const newCodes = parsedResult.codes.filter((c) => !existingCodeSet.has(c));
    const alreadyExists = parsedResult.codes.length - newCodes.length;
    return {
      totalParsed: parsedResult.codes.length,
      newCount: newCodes.length,
      alreadyExists,
      duplicateInInput: parsedResult.duplicateInInput,
    };
  }, [parsedResult, existingCodeSet]);

  const filteredMasterUnits = useMemo(() => {
    const q = editSearch.trim().toLowerCase();
    if (!q) return masterUnits;
    return masterUnits.filter(
      (u) =>
        u.code.toLowerCase().includes(q) ||
        u.fleetGroup.toLowerCase().includes(q)
    );
  }, [masterUnits, editSearch]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setUploadFeedback(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = typeof ev.target?.result === 'string' ? ev.target.result : '';
      setRawInput(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleApplyImport = () => {
    if (parsedResult.codes.length === 0) {
      setUploadFeedback('Tidak ada kode unit yang terbaca. Upload file CSV/TXT atau tempel daftar unit.');
      return;
    }
    const res = onImportPopulation(parsedResult.codes, importMode);
    if (!res.ok) {
      setUploadFeedback(res.message ?? 'Gagal memperbarui populasi unit.');
      return;
    }
    setRawInput('');
    setFileName(null);
    setUploadFeedback(null);
    setTab('edit');
  };

  const handleSaveInlineEdit = (unitId: string) => {
    const res = onUpdateUnitCode(unitId, editingCode);
    if (!res.ok) {
      setEditError(res.message ?? 'Gagal menyimpan perubahan kode unit.');
      return;
    }
    setEditingId(null);
    setEditingCode('');
    setEditError('');
  };

  const handleAddInlineUnit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = onAddSingleUnit(newCodeInput);
    if (!res.ok) {
      setNewCodeError(res.message ?? 'Gagal menambah unit.');
      return;
    }
    setNewCodeInput('');
    setNewCodeError('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/45 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pop-manager-title"
    >
      <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-t-2xl sm:rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh]">
        {/* Modal Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="pop-manager-title" className="text-sm font-semibold text-slate-900">
              Kelola &amp; Upload Populasi Unit
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              Total populasi terdaftar saat ini: {masterUnits.length} unit
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup kelola populasi"
            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-slate-400 hover:text-slate-700 rounded cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-4 sm:px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
          <div className="overflow-x-auto max-w-full">
            <div className="inline-flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-md">
              <button
                type="button"
                onClick={() => setTab('upload')}
                className={`min-h-[36px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  tab === 'upload'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Upload / Paste Excel</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('edit')}
                className={`min-h-[36px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  tab === 'edit'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Edit Populasi ({masterUnits.length})</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => exportPopulationCsv(masterUnits)}
            className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>Download CSV</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-auto ops-scroll p-4 sm:p-5">
          {tab === 'upload' ? (
            <div className="space-y-4">
              {/* File Picker + Paste Area */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-5 space-y-3">
                  <div className="border border-dashed border-slate-300 rounded-lg p-4 bg-slate-50/60 text-center space-y-2">
                    <div className="w-9 h-9 mx-auto rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-600">
                      <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">
                        Upload File CSV / TXT
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Mendukung format 1 kolom kode unit atau 2 kolom (NO, UNIT) dari Excel.
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt,.tsv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-md cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Pilih File</span>
                    </button>
                    {fileName && (
                      <p className="text-[11px] font-mono text-blue-700 truncate">
                        File: {fileName}
                      </p>
                    )}
                  </div>

                  {/* Import Mode */}
                  <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-800">Mode Upload</p>
                    <label className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="import-mode"
                        checked={importMode === 'append'}
                        onChange={() => setImportMode('append')}
                        className="mt-0.5 text-blue-700 focus:ring-blue-600"
                      />
                      <span>
                        <span className="font-semibold text-slate-900 block">
                          Tambah ke Populasi
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Menambahkan unit baru tanpa menghapus daftar yang sudah ada.
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="import-mode"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                        className="mt-0.5 text-blue-700 focus:ring-blue-600"
                      />
                      <span>
                        <span className="font-semibold text-slate-900 block">
                          Ganti Seluruh Populasi
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Mengganti master daftar unit dengan daftar baru yang diupload.
                        </span>
                      </span>
                    </label>
                  </div>
                </div>

                {/* Paste Textarea */}
                <div className="md:col-span-7 flex flex-col">
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="paste-population-input"
                      className="text-xs font-semibold text-slate-700"
                    >
                      Atau Tempel (Paste) Langsung dari Excel
                    </label>
                    {rawInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setRawInput('');
                          setFileName(null);
                          setUploadFeedback(null);
                        }}
                        className="text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        Bersihkan
                      </button>
                    )}
                  </div>
                  <textarea
                    id="paste-population-input"
                    value={rawInput}
                    onChange={(e) => {
                      setRawInput(e.target.value);
                      setUploadFeedback(null);
                    }}
                    rows={9}
                    placeholder={'Contoh tempel dari Excel atau ketik per baris:\nPMSC 220\nPMSC 221\nPMVV 240\nPMVV 241'}
                    className="flex-1 w-full p-3 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Live Parsed Preview */}
              {parsedResult.codes.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-800">
                      Preview Data Terbaca ({previewStats.totalParsed} unit)
                    </span>
                    <div className="flex items-center gap-3 text-[11px] text-slate-600 tabular-nums">
                      <span className="text-emerald-700 font-medium">
                        Baru: {previewStats.newCount}
                      </span>
                      <span>·</span>
                      <span>Sudah ada: {previewStats.alreadyExists}</span>
                      {previewStats.duplicateInInput > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-amber-700">
                            Duplikat di file dilewati: {previewStats.duplicateInInput}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="max-h-44 overflow-auto ops-scroll">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50/70 border-b border-slate-200 text-[11px] text-slate-500">
                        <tr>
                          <th className="py-1.5 pl-3.5 pr-2 w-12 font-mono">NO</th>
                          <th className="py-1.5 px-2">KODE UNIT</th>
                          <th className="py-1.5 px-2 w-24">GRUP</th>
                          <th className="py-1.5 pl-2 pr-3.5 text-right">KETERANGAN</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedResult.codes.map((code, idx) => {
                          const exists = existingCodeSet.has(code);
                          return (
                            <tr key={code} className="hover:bg-slate-50">
                              <td className="py-1.5 pl-3.5 pr-2 font-mono tabular-nums text-slate-400">
                                {idx + 1}
                              </td>
                              <td className="py-1.5 px-2 font-mono font-semibold text-slate-900">
                                {code}
                              </td>
                              <td className="py-1.5 px-2 font-mono text-slate-600">
                                {detectFleetGroup(code)}
                              </td>
                              <td className="py-1.5 pl-2 pr-3.5 text-right text-[11px]">
                                {exists ? (
                                  <span className="text-slate-500">Sudah terdaftar</span>
                                ) : (
                                  <span className="text-emerald-700 font-medium">Unit baru</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {uploadFeedback && (
                <p className="text-xs font-medium text-red-600">{uploadFeedback}</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Add Single Unit + Search + Reset */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
                <div className="relative flex-1 min-w-0">
                  <Search
                    className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={editSearch}
                    onChange={(e) => setEditSearch(e.target.value)}
                    placeholder="Cari kode unit di populasi..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <form onSubmit={handleAddInlineUnit} className="flex items-center gap-1.5 w-full sm:w-auto">
                  <input
                    type="text"
                    value={newCodeInput}
                    onChange={(e) => {
                      setNewCodeInput(e.target.value.toUpperCase());
                      setNewCodeError('');
                    }}
                    placeholder="Tambah unit (misal PMVV 240)"
                    className="flex-1 sm:w-44 min-w-0 px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="submit"
                    className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Tambah</span>
                  </button>
                </form>
              </div>

              {newCodeError && (
                <p className="text-xs font-medium text-red-600">{newCodeError}</p>
              )}
              {editError && (
                <p className="text-xs font-medium text-red-600">{editError}</p>
              )}

              {/* Editable Master Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="max-h-72 overflow-auto ops-scroll">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                      <tr>
                        <th className="py-2 pl-4 pr-2 w-12 font-mono">NO</th>
                        <th className="py-2 px-2">KODE UNIT</th>
                        <th className="py-2 px-2 w-24">GRUP</th>
                        <th className="py-2 px-2 w-28">KONDISI</th>
                        <th className="py-2 pl-2 pr-4 text-right w-32">AKSI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredMasterUnits.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-500">
                            Tidak ada unit yang sesuai pencarian.
                          </td>
                        </tr>
                      ) : (
                        filteredMasterUnits.map((unit, idx) => {
                          const isBd = bdUnitCodesSet.has(unit.code.trim().toUpperCase());
                          const isEditing = editingId === unit.id;

                          return (
                            <tr key={unit.id} className="hover:bg-slate-50/80">
                              <td className="py-1.5 pl-4 pr-2 font-mono tabular-nums text-slate-400">
                                {idx + 1}
                              </td>
                              <td className="py-1.5 px-2">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editingCode}
                                    onChange={(e) => {
                                      setEditingCode(e.target.value.toUpperCase());
                                      setEditError('');
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSaveInlineEdit(unit.id);
                                      } else if (e.key === 'Escape') {
                                        setEditingId(null);
                                        setEditError('');
                                      }
                                    }}
                                    autoFocus
                                    className="w-40 px-2 py-1 text-xs font-mono font-semibold bg-white border border-blue-600 rounded focus:outline-none"
                                  />
                                ) : (
                                  <span className="font-mono font-semibold text-slate-900">
                                    {unit.code}
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 px-2 font-mono text-slate-600">
                                {unit.fleetGroup}
                              </td>
                              <td className="py-1.5 px-2">
                                {isBd ? (
                                  <span className="font-medium text-red-700">Unit BD</span>
                                ) : (
                                  <span className="font-medium text-emerald-700">Running</span>
                                )}
                              </td>
                              <td className="py-1.5 pl-2 pr-4 text-right">
                                {isEditing ? (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveInlineEdit(unit.id)}
                                      aria-label={`Simpan ${unit.code}`}
                                      className="p-1 text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingId(null);
                                        setEditError('');
                                      }}
                                      aria-label="Batal edit"
                                      className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingId(unit.id);
                                        setEditingCode(unit.code);
                                        setEditError('');
                                      }}
                                      aria-label={`Edit kode ${unit.code}`}
                                      className="p-1 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded cursor-pointer"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onDeleteUnit(unit.id)}
                                      aria-label={`Hapus ${unit.code}`}
                                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
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
              </div>

              {/* Reset Default Option */}
              <div className="flex items-center justify-between pt-1 text-xs">
                {confirmReset ? (
                  <div className="flex items-center gap-2">
                    <span className="text-red-700 font-medium">
                      Kembalikan populasi ke 75 unit awal?
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onResetDefault();
                        setConfirmReset(false);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded cursor-pointer"
                    >
                      Ya, Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmReset(true)}
                    className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Reset ke 75 unit awal</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 pb-safe">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-initial min-h-[42px] sm:min-h-0 px-4 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md cursor-pointer"
          >
            Tutup
          </button>
          {tab === 'upload' && (
            <button
              type="button"
              onClick={handleApplyImport}
              disabled={parsedResult.codes.length === 0}
              className="flex-1 sm:flex-initial min-h-[42px] sm:min-h-0 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md cursor-pointer whitespace-nowrap"
            >
              {importMode === 'append'
                ? `Tambah (${previewStats.newCount})`
                : `Terapkan (${previewStats.totalParsed})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
