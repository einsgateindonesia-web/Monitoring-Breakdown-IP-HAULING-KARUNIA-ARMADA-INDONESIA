import { useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { BD_STATUS_STYLES, formatBdStatus } from '../data/initialUnits';
import { FleetUnit, RfuHistoryRecord } from '../types/fleet';
import {
  calculateDurationMinutes,
  formatDurationId,
  formatMrNumbers,
  formatReadableDateId,
} from '../utils/fleetUtils';
import {
  buildRfuDedupKey,
  downloadHistoricalExcelTemplate,
  ParsedHistoricalImportRow,
  parseHistoricalExcelBuffer,
  parseHistoricalPastedOrCsvText,
} from '../utils/historicalImportUtils';

export interface HistoricalBulkImportPayload {
  rows: ParsedHistoricalImportRow[];
  skipDuplicates: boolean;
  autoRegisterUnknownUnits: boolean;
}

interface UploadHistoricalBdModalProps {
  isOpen: boolean;
  isOwnerOrAdmin: boolean;
  masterUnits: FleetUnit[];
  existingRfuHistory: RfuHistoryRecord[];
  onClose: () => void;
  onApplyImport: (payload: HistoricalBulkImportPayload) => {
    ok: boolean;
    message?: string;
  };
}

export function UploadHistoricalBdModal({
  isOpen,
  isOwnerOrAdmin,
  masterUnits,
  existingRfuHistory,
  onClose,
  onApplyImport,
}: UploadHistoricalBdModalProps) {
  const [rawPasteText, setRawPasteText] = useState('');
  const [excelBuffer, setExcelBuffer] = useState<ArrayBuffer | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [fileName, setFileName] = useState<string | null>(null);

  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [autoRegisterUnknownUnits, setAutoRegisterUnknownUnits] = useState(true);
  const effectiveAutoRegister = isOwnerOrAdmin && autoRegisterUnknownUnits;
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const masterCodeSet = useMemo(
    () => new Set(masterUnits.map((u) => u.code.trim().toUpperCase())),
    [masterUnits]
  );

  const existingKeySet = useMemo(() => {
    const set = new Set<string>();
    for (const h of existingRfuHistory) {
      set.add(
        buildRfuDedupKey({
          unitCode: h.unitCode,
          tanggalBd: h.tanggalBd,
          jamBd: h.jamBd,
          tanggalRfu: h.tanggalRfu,
          jamRfu: h.jamRfu,
        })
      );
    }
    return set;
  }, [existingRfuHistory]);

  const parsedResult = useMemo(() => {
    if (excelBuffer) {
      return parseHistoricalExcelBuffer(excelBuffer, selectedSheet || undefined);
    }
    const textParsed = parseHistoricalPastedOrCsvText(rawPasteText);
    return {
      sheetNames: [] as string[],
      activeSheet: '',
      ...textParsed,
    };
  }, [excelBuffer, selectedSheet, rawPasteText]);

  const previewSummary = useMemo(() => {
    let importableCount = 0;
    let duplicateCount = 0;
    let newUnitCount = 0;
    const seenNewUnits = new Set<string>();
    const seenInBatch = new Set<string>();

    for (const row of parsedResult.rows) {
      const isExistingDup = existingKeySet.has(row.dedupKey);
      const isBatchDup = seenInBatch.has(row.dedupKey);
      seenInBatch.add(row.dedupKey);

      if (skipDuplicates && (isExistingDup || isBatchDup)) {
        duplicateCount += 1;
        continue;
      }

      importableCount += 1;
      if (effectiveAutoRegister && !masterCodeSet.has(row.unitCode)) {
        seenNewUnits.add(row.unitCode);
      }
    }
    newUnitCount = seenNewUnits.size;

    return {
      totalParsed: parsedResult.rows.length,
      importableCount,
      duplicateCount,
      newUnitCount,
    };
  }, [parsedResult.rows, existingKeySet, skipDuplicates, effectiveAutoRegister, masterCodeSet]);

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
          const parsed = parseHistoricalExcelBuffer(result);
          setExcelBuffer(result);
          setSheetNames(parsed.sheetNames);
          setSelectedSheet(parsed.activeSheet);
          setRawPasteText('');
          if (parsed.rows.length === 0) {
            setFeedbackError(
              'File Excel terbaca, namun belum ada baris histori BD/RFU pada sheet yang dipilih.'
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
        'Belum ada data histori yang terbaca. Upload file Excel/CSV atau tempel data dari Excel.'
      );
      return;
    }
    if (previewSummary.importableCount === 0) {
      setFeedbackError(
        'Semua baris sudah tercatat sebagai duplikat. Matikan opsi lewati duplikat jika tetap ingin mengimpor.'
      );
      return;
    }

    const res = onApplyImport({
      rows: parsedResult.rows,
      skipDuplicates,
      autoRegisterUnknownUnits: effectiveAutoRegister,
    });

    if (!res.ok) {
      setFeedbackError(res.message ?? 'Gagal mengimpor histori breakdown.');
      return;
    }

    handleResetInput();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/45 p-0 sm:p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-hist-title"
    >
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-t-2xl sm:rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh]">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="upload-hist-title" className="text-sm font-semibold text-slate-900">
              Import Excel Histori Breakdown &amp; RFU Lama
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Unggah catatan breakdown &amp; RFU periode sebelumnya (.xlsx, .xls, .csv) atau tempel langsung dari Excel ke arsip Historical BD.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <button
              type="button"
              onClick={downloadHistoricalExcelTemplate}
              className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span>Template Histori (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup modal import histori"
              className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center text-slate-400 hover:text-slate-700 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto ops-scroll p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Left: File Picker + Options */}
            <div className="md:col-span-5 space-y-3">
              <div className="border border-dashed border-slate-300 rounded-lg p-4 bg-slate-50/60 text-center space-y-2">
                <div className="w-9 h-9 mx-auto rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-600">
                  <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800">
                    Upload File Histori Excel / CSV
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Kolom: UNIT, TGL BD, JAM BD, TGL RFU, JAM RFU, LOKASI, NOMOR MR, PIC, PROBLEM, KOMPONEN, ACTIVITY, STATUS.
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
                      htmlFor="hist-excel-sheet"
                      className="block text-[11px] font-semibold text-slate-600 mb-1"
                    >
                      Pilih Sheet Excel
                    </label>
                    <select
                      id="hist-excel-sheet"
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

              <div className="border border-slate-200 rounded-lg p-3 space-y-2.5">
                <p className="text-xs font-semibold text-slate-800">Opsi Import Histori</p>

                <label className="flex items-start gap-2 text-[11px] text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <span>
                    <strong className="text-slate-900">Lewati data duplikat</strong> (unit, tanggal/jam BD, dan tanggal/jam RFU sama persis).
                  </span>
                </label>

                <div className="pt-2 border-t border-slate-100">
                  <label
                    className={`flex items-start gap-2 text-[11px] ${
                      isOwnerOrAdmin
                        ? 'text-slate-700 cursor-pointer'
                        : 'text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={!isOwnerOrAdmin}
                      checked={effectiveAutoRegister}
                      onChange={(e) => setAutoRegisterUnknownUnits(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600 disabled:opacity-50"
                    />
                    <span>
                      Daftarkan otomatis kode unit baru ke populasi master armada jika belum ada
                      {!isOwnerOrAdmin && ' (Khusus Admin)'}.
                    </span>
                  </label>
                </div>

                <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-100 leading-relaxed">
                  Data yang diimpor otomatis tersimpan per bulan ke cloud dan langsung dianalisis untuk deteksi <strong>Repeat BD ≤ 72 jam</strong>.
                </p>
              </div>
            </div>

            {/* Right: Direct Excel Copy-Paste */}
            <div className="md:col-span-7 flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="paste-hist-excel-input"
                  className="text-xs font-semibold text-slate-700"
                >
                  Atau Copy-Paste Langsung dari Excel
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
                id="paste-hist-excel-input"
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
                    : 'Blok baris riwayat di Excel lalu Ctrl+C dan tempel di sini:\nUNIT\tTGL BD\tJAM BD\tTGL RFU\tJAM RFU\tLOKASI\tNOMOR MR\tKETERANGAN\tKOMPONEN\tACTIVITY\tSTATUS\nPMSC 037\t2026-11-10\t08:00\t2026-11-10\t12:30\tKM 12\tMR-1021\tHose pecah\tHydraulic System\tGanti hose\tB0'
                }
                className="flex-1 w-full p-3 text-xs font-mono bg-white disabled:bg-slate-50 disabled:text-slate-500 border border-slate-300 rounded-lg text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Preview Table */}
          {parsedResult.rows.length > 0 && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-800">
                  Preview Histori Terbaca ({previewSummary.totalParsed} baris)
                </span>
                <div className="flex flex-wrap items-center gap-2.5 text-[11px] tabular-nums">
                  <span className="text-emerald-700 font-semibold">
                    Siap Disimpan: {previewSummary.importableCount}
                  </span>
                  {previewSummary.duplicateCount > 0 && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="text-amber-700 font-medium">
                        Duplikat Dilewati: {previewSummary.duplicateCount}
                      </span>
                    </>
                  )}
                  {previewSummary.newUnitCount > 0 && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="text-blue-700 font-medium">
                        Unit Baru: {previewSummary.newUnitCount}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="max-h-56 overflow-auto ops-scroll">
                <table className="w-full text-left border-collapse text-xs min-w-[880px]">
                  <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                    <tr>
                      <th className="py-1.5 pl-3.5 pr-2 w-10 font-mono">NO</th>
                      <th className="py-1.5 px-2 w-24">UNIT</th>
                      <th className="py-1.5 px-2 w-32">MULAI BD</th>
                      <th className="py-1.5 px-2 w-32">SELESAI RFU</th>
                      <th className="py-1.5 px-2 w-20">DURASI</th>
                      <th className="py-1.5 px-2 w-32">KOMPONEN</th>
                      <th className="py-1.5 px-2">PROBLEM &amp; MR</th>
                      <th className="py-1.5 px-2 w-36">STATUS</th>
                      <th className="py-1.5 pl-2 pr-3.5 text-right w-28">AKSI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedResult.rows.map((row, idx) => {
                      const isDup = skipDuplicates && existingKeySet.has(row.dedupKey);
                      const stStyle = BD_STATUS_STYLES[row.lastStatus];
                      const durText = formatDurationId(
                        calculateDurationMinutes(
                          row.tanggalBd,
                          row.jamBd,
                          row.tanggalRfu,
                          row.jamRfu
                        )
                      );

                      return (
                        <tr
                          key={`${row.dedupKey}-${idx}`}
                          className={isDup ? 'bg-slate-50/70 opacity-60' : 'hover:bg-slate-50/80'}
                        >
                          <td className="py-1.5 pl-3.5 pr-2 font-mono tabular-nums text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-1.5 px-2 font-mono font-semibold text-slate-900 whitespace-nowrap">
                            {row.unitCode}
                          </td>
                          <td className="py-1.5 px-2 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {formatReadableDateId(row.tanggalBd)} · {row.jamBd}
                          </td>
                          <td className="py-1.5 px-2 font-mono tabular-nums text-emerald-700 whitespace-nowrap">
                            {formatReadableDateId(row.tanggalRfu)} · {row.jamRfu}
                          </td>
                          <td className="py-1.5 px-2 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                            {durText}
                          </td>
                          <td className="py-1.5 px-2 text-slate-700">
                            {row.komponen || '—'}
                          </td>
                          <td className="py-1.5 px-2 text-slate-700">
                            <div>{row.keterangan || '—'}</div>
                            {row.mrNumbers.length > 0 && (
                              <div className="text-[10px] font-mono text-slate-500">
                                MR: {formatMrNumbers(row.mrNumbers, '')}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 px-2">
                            <span className={`font-medium ${stStyle.text}`}>
                              {formatBdStatus(row.lastStatus)}
                            </span>
                          </td>
                          <td className="py-1.5 pl-2 pr-3.5 text-right text-[11px] whitespace-nowrap">
                            {isDup ? (
                              <span className="text-amber-700 font-medium">Duplikat</span>
                            ) : (
                              <span className="text-emerald-700 font-semibold">Simpan</span>
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

          {feedbackError && (
            <p className="text-xs font-medium text-red-600">{feedbackError}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 pb-safe">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-initial min-h-[42px] sm:min-h-0 px-4 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={parsedResult.rows.length === 0 || previewSummary.importableCount === 0}
            className="flex-1 sm:flex-initial min-h-[42px] sm:min-h-0 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md cursor-pointer whitespace-nowrap"
          >
            Import {previewSummary.importableCount} Catatan Histori
          </button>
        </div>
      </div>
    </div>
  );
}
