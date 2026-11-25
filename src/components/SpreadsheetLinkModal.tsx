import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  Lock,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  BreakdownRecord,
  FleetUnit,
  HourlySlotOverride,
  RfuHistoryRecord,
  WorkspaceSheetConfig,
} from '../types/fleet';
import {
  getCachedWorkspaceAccessToken,
  requestGoogleSheetsAccessToken,
  setCachedWorkspaceAccessToken,
} from '../firebase';
import {
  createOfficialMasterSpreadsheet,
  extractSpreadsheetIdFromInput,
  MASTER_SPREADSHEET_DEFAULT_TITLE,
  SheetsApiError,
  syncAllDataToSingleSpreadsheet,
} from '../services/googleSheetsService';

interface SpreadsheetLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  isOwnerOrAdmin: boolean;
  sheetConfig: WorkspaceSheetConfig | null;
  masterUnits: FleetUnit[];
  runningUnits: FleetUnit[];
  bdRecords: BreakdownRecord[];
  rfuHistory: RfuHistoryRecord[];
  hourlyOverrides: Record<string, HourlySlotOverride>;
  targetPaPct: number;
  activeShiftDate: string;
  onSaveInitialSheetConfig: (payload: {
    spreadsheetId: string;
    spreadsheetUrl: string;
    spreadsheetTitle: string;
    lastSyncedAt: string;
    lastRowSummary: string;
  }) => Promise<void>;
  onUpdateSheetSyncStatus: (payload: {
    spreadsheetTitle: string;
    lastSyncedAt: string;
    lastRowSummary: string;
  }) => Promise<void>;
}

type PendingAction =
  | { type: 'CREATE_NEW' }
  | { type: 'LINK_EXISTING'; spreadsheetId: string }
  | { type: 'SYNC_EXISTING' };

export function SpreadsheetLinkModal({
  isOpen,
  onClose,
  isOwnerOrAdmin,
  sheetConfig,
  masterUnits,
  runningUnits,
  bdRecords,
  rfuHistory,
  hourlyOverrides,
  targetPaPct,
  activeShiftDate,
  onSaveInitialSheetConfig,
  onUpdateSheetSyncStatus,
}: SpreadsheetLinkModalProps) {
  const [hasToken, setHasToken] = useState<boolean>(() => Boolean(getCachedWorkspaceAccessToken()));
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [existingUrlInput, setExistingUrlInput] = useState('');
  const [showAttachExisting, setShowAttachExisting] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentTokenAvailable = hasToken && Boolean(getCachedWorkspaceAccessToken());

  const handleConnectGoogleSheets = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setConnectingGoogle(true);
    try {
      await requestGoogleSheetsAccessToken();
      setHasToken(true);
      setSuccessMsg('Akun Google terhubung dengan izin Google Sheets. Silakan lanjutkan sinkronisasi.');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal menghubungkan izin Google Sheets. Pastikan popup diizinkan.'
      );
    } finally {
      setConnectingGoogle(false);
    }
  };

  const handleCopySingleLink = async () => {
    if (!sheetConfig?.spreadsheetUrl) return;
    try {
      await navigator.clipboard.writeText(sheetConfig.spreadsheetUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      setErrorMsg('Gagal menyalin otomatis. Salin link langsung dari kotak URL di atas.');
    }
  };

  const executeConfirmedAction = async () => {
    if (!pendingAction) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    const token = getCachedWorkspaceAccessToken();
    if (!token) {
      setHasToken(false);
      setPendingAction(null);
      setErrorMsg('Sesi akses Google Sheets belum aktif. Klik "Hubungkan Google Sheets" di bawah terlebih dahulu.');
      return;
    }

    setSyncing(true);
    try {
      let targetSpreadsheetId = sheetConfig?.spreadsheetId || '';

      if (pendingAction.type === 'CREATE_NEW') {
        if (sheetConfig) {
          throw new Error('Link Spreadsheet tunggal sudah terdaftar untuk workspace ini.');
        }
        const created = await createOfficialMasterSpreadsheet(
          token,
          MASTER_SPREADSHEET_DEFAULT_TITLE
        );
        targetSpreadsheetId = created.spreadsheetId;
      } else if (pendingAction.type === 'LINK_EXISTING') {
        if (sheetConfig) {
          throw new Error('Link Spreadsheet tunggal sudah terdaftar untuk workspace ini.');
        }
        targetSpreadsheetId = pendingAction.spreadsheetId;
      }

      const result = await syncAllDataToSingleSpreadsheet({
        accessToken: token,
        spreadsheetId: targetSpreadsheetId,
        masterUnits,
        runningUnits,
        bdRecords,
        rfuHistory,
        hourlyOverrides,
        targetPaPct,
        activeShiftDate,
      });

      const syncedIso = new Date().toISOString();

      if (pendingAction.type === 'CREATE_NEW' || pendingAction.type === 'LINK_EXISTING') {
        await onSaveInitialSheetConfig({
          spreadsheetId: result.spreadsheetId,
          spreadsheetUrl: result.spreadsheetUrl,
          spreadsheetTitle: result.spreadsheetTitle,
          lastSyncedAt: syncedIso,
          lastRowSummary: result.lastRowSummary,
        });
        setSuccessMsg(
          '1 Link Spreadsheet resmi berhasil disiapkan dan seluruh data aplikasi telah ditulis.'
        );
      } else {
        await onUpdateSheetSyncStatus({
          spreadsheetTitle: result.spreadsheetTitle,
          lastSyncedAt: syncedIso,
          lastRowSummary: result.lastRowSummary,
        });
        setSuccessMsg(
          `Data terbaru (${result.lastRowSummary}) berhasil disinkronkan ke 1 Spreadsheet resmi.`
        );
      }

      setPendingAction(null);
      setExistingUrlInput('');
      setShowAttachExisting(false);
    } catch (err) {
      if (err instanceof SheetsApiError && (err.status === 401 || err.status === 403)) {
        setCachedWorkspaceAccessToken(null);
        setHasToken(false);
        setErrorMsg(
          'Izin akses Google Sheets kedaluwarsa atau belum dicentang. Klik "Hubungkan Google Sheets" lalu coba lagi.'
        );
      } else {
        setErrorMsg(
          err instanceof Error ? err.message : 'Gagal menyinkronkan data ke Google Sheets.'
        );
      }
      setPendingAction(null);
    } finally {
      setSyncing(false);
    }
  };

  const handleRequestSyncExisting = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setPendingAction({ type: 'SYNC_EXISTING' });
  };

  const handleRequestCreateNew = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setPendingAction({ type: 'CREATE_NEW' });
  };

  const handleRequestAttachExisting = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const extracted = extractSpreadsheetIdFromInput(existingUrlInput);
    if (!extracted) {
      setErrorMsg('URL atau ID Google Spreadsheet tidak valid. Tempel link Google Sheets yang lengkap.');
      return;
    }
    setPendingAction({ type: 'LINK_EXISTING', spreadsheetId: extracted });
  };

  const totalHourlyDates = new Set([
    activeShiftDate,
    ...Object.values(hourlyOverrides).map((o) => o.shiftDate).filter(Boolean),
  ]).size;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="spreadsheet-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
              <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="spreadsheet-modal-title"
                className="text-sm sm:text-base font-bold text-slate-900"
              >
                1 Link Spreadsheet Resmi (Semua Data Inputan)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Seluruh data Board BD, Riwayat RFU, Historical BD, PA Per Jam, dan Populasi Armada disimpan dalam 1 file Google Spreadsheet yang sama.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal spreadsheet"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-md cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto ops-scroll space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Mandatory Confirmation Dialog Before Mutating Spreadsheet */}
          {pendingAction && (
            <div className="p-4 rounded-md bg-amber-50 border-2 border-amber-300 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="font-bold text-slate-900 text-xs sm:text-sm">
                    Konfirmasi Perubahan Data Google Sheets
                  </p>
                  <p className="text-slate-700 leading-relaxed">
                    {pendingAction.type === 'CREATE_NEW'
                      ? 'Aplikasi akan membuat 1 Google Spreadsheet resmi baru dan mengisi seluruh data operasional saat ini ke dalam 5 sheet:'
                      : pendingAction.type === 'LINK_EXISTING'
                      ? 'Aplikasi akan menautkan spreadsheet tersebut sebagai 1 link resmi tim dan memperbarui isi 5 sheet di dalamnya:'
                      : 'Seluruh isi 5 sheet pada spreadsheet resmi di bawah ini akan diperbarui/ditimpa dengan data operasional terbaru dari aplikasi:'}
                  </p>
                </div>
              </div>

              <ul className="pl-6 list-disc text-[11px] text-slate-800 space-y-0.5 font-mono">
                <li>Ringkasan (KPI Live, Target PA {targetPaPct.toFixed(1)}%, PMSC/PMVV)</li>
                <li>Unit_BD_Aktif ({bdRecords.length} baris)</li>
                <li>Riwayat_RFU ({rfuHistory.length} baris riwayat &amp; histori)</li>
                <li>PA_Per_Jam ({totalHourlyDates} tanggal shift × 25 slot jam)</li>
                <li>Populasi_Unit ({masterUnits.length} unit terdaftar)</li>
              </ul>

              {sheetConfig && (
                <p className="text-[11px] font-mono text-slate-600 break-all bg-white/80 px-2.5 py-1.5 rounded border border-amber-200">
                  Target: {sheetConfig.spreadsheetUrl}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={syncing}
                  onClick={() => setPendingAction(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={syncing}
                  onClick={() => void executeConfirmedAction()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>{syncing ? 'Menyinkronkan...' : 'Konfirmasi & Sinkronkan'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Google Sheets OAuth Connection Box when in-memory token missing */}
          {!currentTokenAvailable && (
            <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-slate-900">
                    Hubungkan Izin Google Sheets untuk Mengirim / Memperbarui Data
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Klik tombol Google di bawah untuk memberikan izin sementara sesi ini agar aplikasi dapat menulis data ke Google Sheets Anda.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={connectingGoogle}
                onClick={() => void handleConnectGoogleSheets()}
                className="inline-flex items-center gap-2.5 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-md shadow-xs text-xs font-semibold text-slate-800 cursor-pointer disabled:opacity-60"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                <span>
                  {connectingGoogle ? 'Menghubungkan Google...' : 'Sign in with Google · Izinkan Sheets'}
                </span>
              </button>
            </div>
          )}

          {/* Case A: Single Spreadsheet Link Already Configured (STRICTLY 1 LINK ONLY) */}
          {sheetConfig ? (
            <div className="space-y-3.5">
              <div className="p-3.5 rounded-md bg-emerald-50/70 border border-emerald-200 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                    <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Link Spreadsheet Tunggal Terkunci</span>
                  </span>
                  <span className="text-[11px] font-mono text-emerald-700">
                    5 Tab Terpadu
                  </span>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-900">
                    {sheetConfig.spreadsheetTitle}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={sheetConfig.spreadsheetUrl}
                      aria-label="Link satu-satunya Google Spreadsheet"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-[11px] font-mono bg-white border border-emerald-300 rounded text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCopySingleLink()}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedLink ? 'Tersalin' : 'Salin Link'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-600">
                  <div>
                    {sheetConfig.lastSyncedAt ? (
                      <span>
                        Sinkronisasi terakhir:{' '}
                        <strong className="text-slate-800">
                          {new Date(sheetConfig.lastSyncedAt).toLocaleString('id-ID')}
                        </strong>{' '}
                        oleh <strong className="text-slate-800">{sheetConfig.lastSyncedByName}</strong>
                      </span>
                    ) : (
                      <span>Belum ada riwayat sinkronisasi</span>
                    )}
                    {sheetConfig.lastRowSummary && (
                      <p className="font-mono text-[10px] text-slate-500 mt-0.5">
                        {sheetConfig.lastRowSummary}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={sheetConfig.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Buka Spreadsheet</span>
                </a>

                <button
                  type="button"
                  disabled={!currentTokenAvailable || syncing}
                  onClick={handleRequestSyncExisting}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 disabled:opacity-50 rounded-md cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>Sinkronkan Semua Data Terbaru</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                Sesuai kebijakan tim, hanya tersedia <strong>1 Link Spreadsheet</strong> ini untuk seluruh inputan. Tidak ada link tambahan lain agar semua laporan mengacu ke satu dokumen yang sama.
              </p>
            </div>
          ) : (
            /* Case B: Initial Setup — Create OR Link THAT ONE Spreadsheet (Admin only) */
            <div className="space-y-3">
              {isOwnerOrAdmin ? (
                <>
                  <div className="p-3.5 rounded-md bg-blue-50/70 border border-blue-200 space-y-2.5">
                    <p className="font-semibold text-slate-900">
                      Siapkan 1 Link Spreadsheet Resmi untuk Workspace Ini
                    </p>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Setelah dibuat, link ini dikunci menjadi satu-satunya spreadsheet resmi untuk seluruh anggota tim (berisi tab: <span className="font-mono">Ringkasan</span>, <span className="font-mono">Unit_BD_Aktif</span>, <span className="font-mono">Riwayat_RFU</span>, <span className="font-mono">PA_Per_Jam</span>, dan <span className="font-mono">Populasi_Unit</span>).
                    </p>
                    <button
                      type="button"
                      disabled={!currentTokenAvailable || syncing}
                      onClick={handleRequestCreateNew}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-md cursor-pointer whitespace-nowrap"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Buat 1 Link Spreadsheet &amp; Isi Semua Data</span>
                    </button>
                  </div>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAttachExisting((v) => !v)}
                      className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer"
                    >
                      {showAttachExisting
                        ? 'Tutup opsi tautkan spreadsheet yang sudah ada'
                        : 'Sudah punya 1 link Google Spreadsheet? Tautkan sebagai link resmi'}
                    </button>

                    {showAttachExisting && (
                      <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                        <label
                          htmlFor="existing-sheet-url"
                          className="block text-[11px] font-semibold text-slate-700"
                        >
                          Tempel URL Google Spreadsheet (hanya 1 link ini yang akan dipakai)
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            id="existing-sheet-url"
                            type="url"
                            value={existingUrlInput}
                            onChange={(e) => setExistingUrlInput(e.target.value)}
                            placeholder="https://docs.google.com/spreadsheets/d/..."
                            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                          <button
                            type="button"
                            disabled={!currentTokenAvailable || syncing || !existingUrlInput.trim()}
                            onClick={handleRequestAttachExisting}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded cursor-pointer whitespace-nowrap shrink-0"
                          >
                            Kunci &amp; Sinkronkan
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-4 rounded-md bg-slate-50 border border-slate-200 text-slate-600 leading-relaxed">
                  Admin tim belum menyiapkan <strong>1 Link Spreadsheet resmi</strong> untuk workspace ini. Hubungi Admin agar menyiapkan link tersebut terlebih dahulu.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
