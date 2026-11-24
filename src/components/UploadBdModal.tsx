import { useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { BD_STATUS_STYLES, formatBdStatus } from '../data/initialUnits';
import { BreakdownRecord, FleetUnit } from '../types/fleet';
import {
  ParsedBdImportRow,
  downloadBdExcelTemplate,
  parseBdExcelBuffer,
  parseBdPastedOrCsvText,
} from '../utils/bdImportUtils';
import { formatMrNumbers, formatReadableDateId } from '../utils/fleetUtils';

export type BdImportMode = 'upsert' | 'replace';

export interface BdBulkImportPayload {
  rows: ParsedBdImportRow[];
  mode: BdImportMode;
  autoRegisterUnknownUnits: boolean;
  markMissingAsRfu: boolean;
}

interface UploadBdModalProps {
  isOpen: boolean;
  masterUnits: FleetUnit[];
  bdRecords: BreakdownRecord[];
  onClose: () => void;
  onApplyImport: (payload: BdBulkImportPayload) => {
    ok: boolean;
    message?: string;
  };
}

export function UploadBdModal({
  isOpen,
  masterUnits,
  bdRecords,
  onClose,
  onApplyImport,
}: UploadBdModalProps) {
  const [rawPasteText, setRawPasteText] = useState('');
  const [excelBuffer, setExcelBuffer] = useState<ArrayBuffer | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [fileName, setFileName] = useState<string | null>(null);

  const [importMode, setImportMode] = useState<BdImportMode>('upsert');
  const [autoRegisterUnknownUnits, setAutoRegisterUnknownUnits] = useState(true);
  const [markMissingAsRfu, setMarkMissingAsRfu] = useState(true);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const masterCodeSet = useMemo(
    () => new Set(masterUnits.map((u) => u.code.trim().toUpperCase())),
    [masterUnits]
  );

  const activeBdCodeSet = useMemo(
    () => new Set(bdRecords.map((b) => b.unitCode.trim().toUpperCase())),
    [bdRecords]
  );

  const parsedResult = useMemo(() => {
    if (excelBuffer) {
      return parseBdExcelBuffer(excelBuffer, selectedSheet || undefined);
    }
    const textParsed = parseBdPastedOrCsvText(rawPasteText);
    return {
      sheetNames: [] as string[],
      activeSheet: '',
      ...textParsed,
    };
  }, [excelBuffer, selectedSheet, rawPasteText]);

  const previewSummary = useMemo(() => {
    let updateCount = 0;
    let newBdCount = 0;
    let newUnitCount = 0;
    let skippedCount = 0;

    const importedCodeSet = new Set<string>();

    for (const row of parsedResult.rows) {
      const code = row.unitCode.trim().toUpperCase();
      importedCodeSet.add(code);
      const inMaster = masterCodeSet.has(code);
      const inBd = activeBdCodeSet.has(code);

      if (!inMaster) {
        if (autoRegisterUnknownUnits) {
          newUnitCount += 1;
          newBdCount += 1;
        } else {
          skippedCount += 1;
        }
      } else if (inBd) {
        updateCount += 1;
      } else {
        newBdCount += 1;
      }
    }

    const rfuOnReplaceCount =
      importMode === 'replace' && markMissingAsRfu
        ? bdRecords.filter((b) => !importedCodeSet.has(b.unitCode.trim().toUpperCase())).length
        : 0;

    const applicableCount = parsedResult.rows.length - skippedCount;

    return {
      totalParsed: parsedResult.rows.length,
      updateCount,
      newBdCount,
      newUnitCount,
      skippedCount,
      rfuOnReplaceCount,
      applicableCount,
    };
  }, [
    parsedResult.rows,
    masterCodeSet,
    activeBdCodeSet,
    autoRegisterUnknownUnits,
    importMode,
    markMissingAsRfu,
    bdRecords,
  ]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFeedbackError(null);

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const isBinaryExcel = ext === 'xlsx' || ext === 'xls';

    const reader = new FileReader();
    if (isBinaryExcel) {
      reader.onload = (ev) => {
        const result = ev.target?.result;
        if (!(result instanceof ArrayBuffer)) {
          setFeedbackError('Gagal membaca file Excel.');
          return;
        }
        try {
          const parsed = parseBdExcelBuffer(result);
          setExcelBuffer(result);
          setSheetNames(parsed.sheetNames);
          setSelectedSheet(parsed.activeSheet);
          setRawPasteText('');
          if (parsed.rows.length === 0) {
            setFeedbackError(
              'File Excel terbaca, namun belum ada baris unit BD pada sheet yang dipilih.'
            );
          }
        } catch {
          setFeedbackError('Format file Excel tidak valid atau rusak.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (ev) => {
        const text = typeof ev.target?.result === 'string' ? ev.target.result : '';
        setExcelBuffer(null);
        setSheetNames([]);
        setSelectedSheet('');
        setRawPasteText(text);
      };
      reader.readAsText(file);
    }

    e.target.value = '';
  };

  const handleResetInput = () => {
    setRawPasteText('');
    setExcelBuffer(null);
    setSheetNames([]);
    setSelectedSheet('');
    setFileName(null);
    setFeedbackError(null);
  };

  const handleSubmit = () => {
    if (parsedResult.rows.length === 0) {
      setFeedbackError(
        'Belum ada data unit BD yang terbaca. Upload file Excel/CSV atau tempel data dari Excel.'
      );
      return;
    }
    if (previewSummary.applicableCount === 0 && importMode !== 'replace') {
      setFeedbackError(
        'Semua unit pada file tidak terdaftar di populasi dan opsi pendaftaran otomatis dimatikan.'
      );
      return;
    }

    const res = onApplyImport({
      rows: parsedResult.rows,
      mode: importMode,
      autoRegisterUnknownUnits,
      markMissingAsRfu,
    });

    if (!res.ok) {
      setFeedbackError(res.message ?? 'Gagal menerapkan upload data BD.');
      return;
    }

    handleResetInput();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-bd-title"
    >
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="upload-bd-title" className="text-sm font-semibold text-slate-900">
              Upload &amp; Update Breakdown (Excel / CSV)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Update banyak unit BD sekaligus dari file Excel (.xlsx, .xls, .csv) atau tempel langsung dari tabel Excel.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadBdExcelTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span>Download Template (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup upload breakdown"
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto ops-scroll p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Left: File Picker + Options */}
            <div className="md:col-span-5 space-y-3">
              <div className="border border-dashed border-slate-300 rounded-lg p-4 bg-slate-50/60 text-center space-y-2">
                <div className="w-9 h-9 mx-auto rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-600">
                  <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800">
                    Upload File Excel / CSV
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Kolom: UNIT BD, JAM BD, TANGGAL BD, POSISI/LOKASI, NOMOR MR, KETERANGAN, STATUS (BS / B0–B10).
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv,.txt"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-md cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Pilih File Excel</span>
                  </button>
                  {fileName && (
                    <button
                      type="button"
                      onClick={handleResetInput}
                      className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
                {fileName && (
                  <p className="text-[11px] font-mono text-blue-700 truncate">
                    File: {fileName}
                  </p>
                )}

                {sheetNames.length > 1 && (
                  <div className="pt-2 text-left">
                    <label
                      htmlFor="bd-excel-sheet"
                      className="block text-[11px] font-semibold text-slate-600 mb-1"
                    >
                      Pilih Sheet Excel
                    </label>
                    <select
                      id="bd-excel-sheet"
                      value={selectedSheet}
                      onChange={(e) => {
                        setSelectedSheet(e.target.value);
                        setFeedbackError(null);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      {sheetNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Update Mode */}
              <div className="border border-slate-200 rounded-lg p-3 space-y-2.5">
                <p className="text-xs font-semibold text-slate-800">Mode Update Board BD</p>
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="bd-import-mode"
                    checked={importMode === 'upsert'}
                    onChange={() => setImportMode('upsert')}
                    className="mt-0.5 text-blue-700 focus:ring-blue-600"
                  />
                  <span>
                    <span className="font-semibold text-slate-900 block">
                      Update &amp; Tambah Unit BD
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Unit BD yang sudah aktif diperbarui datanya; unit Running dipindah ke BD tanpa menghapus unit BD lain.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="bd-import-mode"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                    className="mt-0.5 text-blue-700 focus:ring-blue-600"
                  />
                  <span>
                    <span className="font-semibold text-slate-900 block">
                      Sinkronisasi Penuh (Ganti Daftar BD)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Menyamakan daftar Unit BD aktif persis sesuai data Excel yang diupload.
                    </span>
                  </span>
                </label>

                {importMode === 'replace' && (
                  <label className="flex items-start gap-2 pl-5 pt-1 text-[11px] text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={markMissingAsRfu}
                      onChange={(e) => setMarkMissingAsRfu(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                    />
                    <span>
                      Catat unit BD sebelumnya yang tidak ada di Excel sebagai RFU ke Riwayat.
                    </span>
                  </label>
                )}

                <div className="pt-2 border-t border-slate-100">
                  <label className="flex items-start gap-2 text-[11px] text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRegisterUnknownUnits}
                      onChange={(e) => setAutoRegisterUnknownUnits(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                    />
                    <span>
                      Otomatis daftarkan kode unit baru ke populasi armada jika belum terdaftar.
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Right: Direct Excel Copy-Paste */}
            <div className="md:col-span-7 flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="paste-bd-excel-input"
                  className="text-xs font-semibold text-slate-700"
                >
                  Atau Copy-Paste Langsung dari Tabel Excel
                </label>
                {(rawPasteText || excelBuffer) && (
                  <button
                    type="button"
                    onClick={handleResetInput}
                    className="text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Bersihkan
                  </button>
                )}
              </div>
              <textarea
                id="paste-bd-excel-input"
                value={rawPasteText}
                disabled={Boolean(excelBuffer)}
                onChange={(e) => {
                  setExcelBuffer(null);
                  setSheetNames([]);
                  setSelectedSheet('');
                  setFileName(null);
                  setRawPasteText(e.target.value);
                  setFeedbackError(null);
                }}
                rows={11}
                placeholder={
                  excelBuffer
                    ? `Menggunakan file Excel: ${fileName ?? 'Workbook'}`
                    : 'Blok baris di Excel lalu Ctrl+C dan tempel di sini (dengan atau tanpa baris judul):\nUNIT BD\tJAM BD\tPOSISI / LOKASI\tNOMOR MR\tKETERANGAN\tSTATUS\nPMSC 037\t08:30\tKM 12\tMR-24011, MR-24012\tHose hidrolik bocor\tB0\nPMVV 110\t10:15\tWorkshop IP\tMR-24015\tWaiting part filter\tB1'
                }
                className="flex-1 w-full p-3 text-xs font-mono bg-white disabled:bg-slate-50 disabled:text-slate-500 border border-slate-300 rounded-lg text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <p className="text-[11px] text-slate-500 mt-1.5">
                Mendukung status kode (<span className="font-mono">BS, B0–B10</span>) maupun deskripsi status (misal: <span className="font-mono">Waiting Part</span>, <span className="font-mono">On Progress</span>).
              </p>
            </div>
          </div>

          {/* Preview Table */}
          {parsedResult.rows.length > 0 && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-800">
                  Preview Data Breakdown Terbaca ({previewSummary.totalParsed} unit)
                </span>
                <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-600 tabular-nums">
                  <span className="text-red-700 font-medium">
                    BD Baru: {previewSummary.newBdCount}
                  </span>
                  <span>·</span>
                  <span className="text-blue-700 font-medium">
                    Update BD: {previewSummary.updateCount}
                  </span>
                  {previewSummary.newUnitCount > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-emerald-700 font-medium">
                        Unit Baru: {previewSummary.newUnitCount}
                      </span>
                    </>
                  )}
                  {previewSummary.rfuOnReplaceCount > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-emerald-700 font-medium">
                        Menjadi RFU: {previewSummary.rfuOnReplaceCount}
                      </span>
                    </>
                  )}
                  {previewSummary.skippedCount > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-amber-700">
                        Dilewati: {previewSummary.skippedCount}
                      </span>
                    </>
                  )}
                  {parsedResult.duplicateSkipped > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-amber-700">
                        Duplikat: {parsedResult.duplicateSkipped}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="max-h-56 overflow-auto ops-scroll">
                <table className="w-full text-left border-collapse text-xs min-w-[860px]">
                  <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                    <tr>
                      <th className="py-1.5 pl-3.5 pr-2 w-10 font-mono">NO</th>
                      <th className="py-1.5 px-2 w-28">UNIT BD</th>
                      <th className="py-1.5 px-2 w-20">JAM BD</th>
                      <th className="py-1.5 px-2 w-24">TGL BD</th>
                      <th className="py-1.5 px-2 w-32">POSISI / LOKASI</th>
                      <th className="py-1.5 px-2 w-36">NOMOR MR</th>
                      <th className="py-1.5 px-2">KETERANGAN</th>
                      <th className="py-1.5 px-2 w-44">STATUS</th>
                      <th className="py-1.5 pl-2 pr-3.5 text-right w-36">AKSI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedResult.rows.map((row, idx) => {
                      const codeUpper = row.unitCode.trim().toUpperCase();
                      const inMaster = masterCodeSet.has(codeUpper);
                      const inBd = activeBdCodeSet.has(codeUpper);
                      const stStyle = BD_STATUS_STYLES[row.status];

                      let actionLabel = 'Pindah ke BD';
                      let actionClass = 'text-red-700 font-medium';
                      if (!inMaster) {
                        if (autoRegisterUnknownUnits) {
                          actionLabel = 'Unit Baru + BD';
                          actionClass = 'text-blue-700 font-medium';
                        } else {
                          actionLabel = 'Dilewati (Tak ada)';
                          actionClass = 'text-slate-400';
                        }
                      } else if (inBd) {
                        actionLabel = 'Update BD Aktif';
                        actionClass = 'text-blue-700 font-medium';
                      }

                      return (
                        <tr key={`${row.unitCode}-${idx}`} className="hover:bg-slate-50/80">
                          <td className="py-1.5 pl-3.5 pr-2 font-mono tabular-nums text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-1.5 px-2 font-mono font-semibold text-slate-900 whitespace-nowrap">
                            {row.unitCode}
                          </td>
                          <td className="py-1.5 px-2 font-mono tabular-nums text-slate-700">
                            {row.jamBd}
                          </td>
                          <td className="py-1.5 px-2 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            {formatReadableDateId(row.tanggalBd)}
                          </td>
                          <td className="py-1.5 px-2 text-slate-700">
                            {row.lokasi || '—'}
                          </td>
                          <td className="py-1.5 px-2 font-mono tabular-nums text-slate-800">
                            {formatMrNumbers(row.mrNumbers, '—')}
                          </td>
                          <td className="py-1.5 px-2 text-slate-700">
                            {row.keterangan || '—'}
                          </td>
                          <td className="py-1.5 px-2">
                            <span className={`font-medium ${stStyle.text}`}>
                              {formatBdStatus(row.status)}
                            </span>
                          </td>
                          <td className={`py-1.5 pl-2 pr-3.5 text-right text-[11px] whitespace-nowrap ${actionClass}`}>
                            {actionLabel}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {feedbackError && (
            <p className="text-xs font-medium text-red-600">{feedbackError}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              parsedResult.rows.length === 0 ||
              (previewSummary.applicableCount === 0 && importMode !== 'replace')
            }
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md cursor-pointer"
          >
            Terapkan Update BD ({previewSummary.applicableCount} unit)
          </button>
        </div>
      </div>
    </div>
  );
}
