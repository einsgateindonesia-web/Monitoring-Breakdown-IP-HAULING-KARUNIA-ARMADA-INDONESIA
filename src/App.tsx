import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { Unsubscribe } from 'firebase/firestore';
import { Cloud, CloudUpload, History, LogOut, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AreaDashboardBdView } from './components/AreaDashboardBdView';
import { AuditLogModal } from './components/AuditLogModal';
import { DashboardSummaryStrip } from './components/DashboardSummaryStrip';
import { HistoricalBdView } from './components/HistoricalBdView';
import { InputBdModal } from './components/InputBdModal';
import { InputBdPanel } from './components/InputBdPanel';
import { MobileBottomNav } from './components/MobileBottomNav';
import { OnlineAuthGate } from './components/OnlineAuthGate';
import { PdfReportModal } from './components/PdfReportModal';
import { PopulationManagerModal } from './components/PopulationManagerModal';
import { RfuHistoryView } from './components/RfuHistoryView';
import { SparepartMrTrackingSection } from './components/SparepartMrTrackingSection';
import { TeamManagementModal } from './components/TeamManagementModal';
import { TopBar } from './components/TopBar';
import { UnitRunningPanel } from './components/UnitRunningPanel';
import { BdBulkImportPayload, UploadBdModal } from './components/UploadBdModal';
import {
  HistoricalBulkImportPayload,
  UploadHistoricalBdModal,
} from './components/UploadHistoricalBdModal';
import {
  INITIAL_FLEET_UNITS,
  PART_STATUS_LABELS,
  detectFleetGroup,
  normalizeBdStatus,
  normalizePartStatus,
} from './data/initialUnits';
import {
  auth,
  DEFAULT_WORKSPACE_ID,
  googleProvider,
  sanitizeDisplayName,
} from './firebase';
import {
  appendAuditLogCloud,
  BoardMetaState,
  clearAllRfuMonthsCloud,
  clearHourlyOverrideCloud,
  createNewInviteCode,
  deleteBdRecordCloud,
  deleteFleetUnitCloud,
  deleteRfuRecordCloud,
  ensureWorkspaceForBootstrappedAdmin,
  fetchMembership,
  fetchWorkspaceInfo,
  getMonthKeyFromDate,
  isBootstrappedAdminUser,
  joinWorkspaceWithInvite,
  listWorkspaceInvites,
  listWorkspaceMembers,
  migrateLocalSnapshotToCloud,
  removeWorkspaceMember,
  replaceActiveBdCloud,
  saveFleetUnitsReplace,
  setHourlyOverrideCloud,
  setInviteActiveState,
  subscribeBoardActiveBd,
  subscribeBoardAuditLog,
  subscribeBoardFleet,
  subscribeBoardMeta,
  subscribeHourlyMonth,
  subscribeRfuMonth,
  syncUserProfile,
  updateTargetPaCloud,
  updateWorkspaceMemberRole,
  upsertBdRecordCloud,
  upsertFleetUnitsCloud,
  upsertManyBdRecordsCloud,
  upsertRfuRecordsCloud,
  WorkspaceInfo,
  WorkspaceMemberInfo,
} from './services/workspaceService';
import {
  ActiveTab,
  AuditActionType,
  AuditLogEntry,
  BdStatus,
  BreakdownRecord,
  FleetUnit,
  HourlySlotOverride,
  RfuHistoryRecord,
} from './types/fleet';
import {
  buildWhatsappReport,
  exportBoardCsv,
  exportRfuHistoryCsv,
  formatMrNumbers,
  getCurrentDateYYYYMMDD,
  getCurrentTimeHHMM,
  normalizeMrList,
} from './utils/fleetUtils';
import {
  buildRfuDedupKey,
  convertHistoricalImportRowToRfu,
} from './utils/historicalImportUtils';
import { getCurrentOperationalShiftDate } from './utils/hourlyShiftUtils';

const STORAGE_KEYS = {
  masterFleet: 'fleetbd_master_units_v1',
  bdRecords: 'fleetbd_active_bd_v1',
  rfuHistory: 'fleetbd_rfu_history_v1',
  hourlyOverrides: 'fleetbd_hourly_overrides_v1',
  migratedFlag: 'fleetbd_cloud_migrated_v1',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getInviteParamsFromUrl(): { workspaceId: string; inviteCode: string } {
  if (typeof window === 'undefined') {
    return { workspaceId: DEFAULT_WORKSPACE_ID, inviteCode: '' };
  }
  const params = new URLSearchParams(window.location.search);
  const ws = (params.get('ws') || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const invite = (params.get('invite') || '').trim().toUpperCase();
  return { workspaceId: ws, inviteCode: invite };
}

export default function App() {
  const initialUrlParams = useMemo(() => getInviteParamsFromUrl(), []);
  const [workspaceId] = useState<string>(initialUrlParams.workspaceId);
  const [pendingInviteCode, setPendingInviteCode] = useState<string>(
    initialUrlParams.inviteCode
  );

  // Auth & Workspace Collaboration State
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authErrorCode, setAuthErrorCode] = useState<string | null>(null);
  const [workspaceInfo, setWorkspaceInfo] = useState<WorkspaceInfo | null>(null);
  const [membership, setMembership] = useState<WorkspaceMemberInfo | null>(null);
  const [lastEditorName, setLastEditorName] = useState<string | null>(null);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [syncError, setSyncError] = useState<Error | null>(null);
  const pendingInviteRef = useRef<string>(initialUrlParams.inviteCode);
  const auditDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Operational Board State (real-time synced from Firestore once member)
  const [masterUnits, setMasterUnits] = useState<FleetUnit[]>(INITIAL_FLEET_UNITS);
  const [bdRecords, setBdRecords] = useState<BreakdownRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [rfuByMonth, setRfuByMonth] = useState<Record<string, Record<string, RfuHistoryRecord>>>(
    {}
  );
  const [hourlyByMonth, setHourlyByMonth] = useState<
    Record<string, Record<string, HourlySlotOverride>>
  >({});
  const [boardMeta, setBoardMeta] = useState<BoardMetaState>({
    rfuMonths: [],
    hourlyMonths: [],
    targetPaPct: 90,
  });

  const [shiftDate, setShiftDate] = useState<string>(() => getCurrentOperationalShiftDate());
  const [activeTab, setActiveTab] = useState<ActiveTab>('board');
  const [mobileBoardPanel, setMobileBoardPanel] = useState<'bd' | 'part' | 'running'>('bd');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalUnitCode, setModalUnitCode] = useState<string | null>(null);
  const [populationModalOpen, setPopulationModalOpen] = useState(false);
  const [uploadBdModalOpen, setUploadBdModalOpen] = useState(false);
  const [uploadHistModalOpen, setUploadHistModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [copiedWa, setCopiedWa] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [localMigrationDismissed, setLocalMigrationDismissed] = useState<boolean>(() =>
    loadFromStorage<boolean>(STORAGE_KEYS.migratedFlag, false)
  );

  if (syncError) {
    throw syncError;
  }

  const rfuHistory = useMemo<RfuHistoryRecord[]>(() => {
    const merged: RfuHistoryRecord[] = [];
    for (const monthRecords of Object.values(rfuByMonth)) {
      for (const item of Object.values(monthRecords)) {
        merged.push(item);
      }
    }
    return merged.sort((a, b) => {
      const aStamp = `${a.tanggalRfu} ${a.jamRfu}`;
      const bStamp = `${b.tanggalRfu} ${b.jamRfu}`;
      if (aStamp !== bStamp) return aStamp < bStamp ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    });
  }, [rfuByMonth]);

  const hourlyOverrides = useMemo<Record<string, HourlySlotOverride>>(() => {
    const merged: Record<string, HourlySlotOverride> = {};
    for (const monthOverrides of Object.values(hourlyByMonth)) {
      Object.assign(merged, monthOverrides);
    }
    return merged;
  }, [hourlyByMonth]);

  // Detect pre-existing local browser data that can be uploaded to cloud
  const localSnapshot = useMemo(() => {
    const localFleet = loadFromStorage<FleetUnit[]>(STORAGE_KEYS.masterFleet, []);
    const localBd = loadFromStorage<BreakdownRecord[]>(STORAGE_KEYS.bdRecords, []).map((rec) => ({
      ...rec,
      lokasi: rec.lokasi ?? '',
      mrNumbers: normalizeMrList(rec.mrNumbers),
      status: normalizeBdStatus(rec.status),
    }));
    const localRfu = loadFromStorage<RfuHistoryRecord[]>(STORAGE_KEYS.rfuHistory, []).map(
      (item) => ({
        ...item,
        lokasi: item.lokasi ?? '',
        mrNumbers: normalizeMrList(item.mrNumbers),
        komponen: item.komponen ?? '',
        subKomponen: item.subKomponen ?? '',
        detailSubKomponen: item.detailSubKomponen ?? '',
        activityPerbaikan: item.activityPerbaikan ?? '',
        lastStatus: normalizeBdStatus(item.lastStatus),
      })
    );
    const localHourly = loadFromStorage<Record<string, HourlySlotOverride>>(
      STORAGE_KEYS.hourlyOverrides,
      {}
    );
    const hasCustomFleet =
      localFleet.length > 0 &&
      (localFleet.length !== INITIAL_FLEET_UNITS.length ||
        localFleet.some((u, i) => u.code !== INITIAL_FLEET_UNITS[i]?.code));
    const hasData =
      !localMigrationDismissed &&
      (localBd.length > 0 ||
        localRfu.length > 0 ||
        Object.keys(localHourly).length > 0 ||
        hasCustomFleet);
    return {
      hasData,
      masterUnits: localFleet.length > 0 ? localFleet : INITIAL_FLEET_UNITS,
      bdRecords: localBd,
      rfuHistory: localRfu,
      hourlyOverrides: localHourly,
      summaryText: `${localBd.length} Unit BD aktif · ${localRfu.length} Riwayat RFU · ${Object.keys(localHourly).length} slot PA manual`,
    };
  }, [localMigrationDismissed]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const timer = setTimeout(() => setToastMsg(null), 3400);
    return () => clearTimeout(timer);
  }, [toastMsg]);

  const runCloudTask = useCallback((task: Promise<unknown>) => {
    task.catch((err) => {
      setSyncError(err instanceof Error ? err : new Error(String(err)));
    });
  }, []);

  const logAudit = useCallback(
    (entry: { actionType: AuditActionType; summary: string; unitCode?: string }) => {
      if (!currentUser) return;
      void appendAuditLogCloud(workspaceId, entry, currentUser).catch(() => {
        // Non-blocking audit log write
      });
    },
    [currentUser, workspaceId]
  );

  const logAuditDebounced = useCallback(
    (
      debounceKey: string,
      entry: { actionType: AuditActionType; summary: string; unitCode?: string }
    ) => {
      const prev = auditDebounceRef.current.get(debounceKey);
      if (prev) clearTimeout(prev);
      const timer = setTimeout(() => {
        auditDebounceRef.current.delete(debounceKey);
        logAudit(entry);
      }, 1200);
      auditDebounceRef.current.set(debounceKey, timer);
    },
    [logAudit]
  );

  useEffect(() => {
    const timers = auditDebounceRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  // Auth listener (registered once per workspaceId)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthError(null);
      setAuthErrorCode(null);

      if (!user) {
        setMembership(null);
        setWorkspaceInfo(null);
        setWorkspaceLoading(false);
        setAuthReady(true);
        return;
      }

      setWorkspaceLoading(true);
      try {
        await syncUserProfile(user);

        if (isBootstrappedAdminUser(user)) {
          const res = await ensureWorkspaceForBootstrappedAdmin(user, workspaceId);
          setWorkspaceInfo(res.workspace);
          setMembership(res.membership);
        } else {
          let existingMember = await fetchMembership(workspaceId, user.uid);
          const inviteToUse = pendingInviteRef.current;
          if (!existingMember && inviteToUse) {
            const joinRes = await joinWorkspaceWithInvite(workspaceId, inviteToUse, user);
            if (joinRes.ok && joinRes.membership) {
              existingMember = joinRes.membership;
              pendingInviteRef.current = '';
              setPendingInviteCode('');
              if (typeof window !== 'undefined' && window.location.search) {
                window.history.replaceState({}, '', window.location.pathname);
              }
              showToast('Berhasil bergabung ke tim operasional online.');
            } else if (joinRes.message) {
              setAuthError(joinRes.message);
            }
          }

          if (existingMember) {
            setMembership(existingMember);
            const ws = await fetchWorkspaceInfo(workspaceId);
            setWorkspaceInfo(ws);
          } else {
            setMembership(null);
            setWorkspaceInfo(null);
          }
        }
      } catch (err) {
        setSyncError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setWorkspaceLoading(false);
        setSigningIn(false);
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, [workspaceId, showToast]);

  // Real-time Board Subscriptions (only when authenticated & member)
  useEffect(() => {
    if (!authReady || !currentUser || !membership) return;

    const unsubFleet = subscribeBoardFleet(workspaceId, (units, meta) => {
      if (units.length > 0) {
        setMasterUnits(units);
      }
      if (meta.updatedByName) setLastEditorName(meta.updatedByName);
    });

    const unsubBd = subscribeBoardActiveBd(workspaceId, (records, meta) => {
      setBdRecords(records);
      if (meta.updatedByName) setLastEditorName(meta.updatedByName);
    });

    const unsubMeta = subscribeBoardMeta(workspaceId, (meta) => {
      setBoardMeta(meta);
    });

    const unsubAudit = subscribeBoardAuditLog(workspaceId, (entries) => {
      setAuditLogs(entries);
    });

    return () => {
      unsubFleet();
      unsubBd();
      unsubMeta();
      unsubAudit();
    };
  }, [authReady, currentUser, membership, workspaceId]);

  // Real-time Monthly RFU & Hourly Shards Subscriptions
  const rfuSubsRef = useRef<Map<string, Unsubscribe>>(new Map());
  const hourlySubsRef = useRef<Map<string, Unsubscribe>>(new Map());

  useEffect(() => {
    if (!authReady || !currentUser || !membership) {
      for (const unsub of rfuSubsRef.current.values()) unsub();
      rfuSubsRef.current.clear();
      return;
    }

    const activeMonths = new Set(boardMeta.rfuMonths);
    const currentMonth = getMonthKeyFromDate();
    if (boardMeta.rfuMonths.length > 0) {
      activeMonths.add(currentMonth);
    }

    // Unsubscribe removed months
    for (const [key, unsub] of rfuSubsRef.current.entries()) {
      if (!activeMonths.has(key)) {
        unsub();
        rfuSubsRef.current.delete(key);
      }
    }

    // Subscribe new months
    for (const monthKey of activeMonths) {
      if (!rfuSubsRef.current.has(monthKey)) {
        const unsub = subscribeRfuMonth(workspaceId, monthKey, (records) => {
          setRfuByMonth((prev) => ({ ...prev, [monthKey]: records }));
        });
        rfuSubsRef.current.set(monthKey, unsub);
      }
    }
  }, [authReady, currentUser, membership, workspaceId, boardMeta.rfuMonths]);

  useEffect(() => {
    if (!authReady || !currentUser || !membership) {
      for (const unsub of hourlySubsRef.current.values()) unsub();
      hourlySubsRef.current.clear();
      return;
    }

    const activeMonths = new Set(boardMeta.hourlyMonths);
    const shiftMonth = getMonthKeyFromDate(shiftDate);
    if (boardMeta.hourlyMonths.length > 0) {
      activeMonths.add(shiftMonth);
    }

    for (const [key, unsub] of hourlySubsRef.current.entries()) {
      if (!activeMonths.has(key)) {
        unsub();
        hourlySubsRef.current.delete(key);
      }
    }

    for (const monthKey of activeMonths) {
      if (!hourlySubsRef.current.has(monthKey)) {
        const unsub = subscribeHourlyMonth(workspaceId, monthKey, (overrides) => {
          setHourlyByMonth((prev) => ({ ...prev, [monthKey]: overrides }));
        });
        hourlySubsRef.current.set(monthKey, unsub);
      }
    }
  }, [authReady, currentUser, membership, workspaceId, boardMeta.hourlyMonths, shiftDate]);

  useEffect(() => {
    return () => {
      for (const unsub of rfuSubsRef.current.values()) unsub();
      for (const unsub of hourlySubsRef.current.values()) unsub();
    };
  }, []);

  const handleSignInGoogle = async () => {
    setAuthError(null);
    setAuthErrorCode(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code ?? '')
          : '';
      const rawMessage = err instanceof Error ? err.message : String(err);
      setAuthErrorCode(code || null);

      if (code === 'auth/popup-blocked') {
        setAuthError(
          'Popup login Google diblokir oleh browser. Izinkan popup atau buka aplikasi di tab baru.'
        );
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError(
          'Jendela login Google ditutup sebelum proses masuk selesai. Jika terjadi di mode preview, coba buka di tab baru.'
        );
      } else if (code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        setAuthError(
          `Domain (${host}) belum diizinkan di Firebase Auth Authorized Domains.`
        );
      } else if (code === 'auth/operation-not-allowed') {
        setAuthError('Login Google belum diaktifkan di konfigurasi Firebase Authentication.');
      } else if (code === 'auth/network-request-failed') {
        setAuthError('Koneksi jaringan bermasalah saat menghubungi server Google Login.');
      } else {
        setAuthError(`Gagal masuk dengan akun Google: ${rawMessage}`);
      }
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleJoinWithCode = async (
    code: string
  ): Promise<{ ok: boolean; message?: string }> => {
    if (!currentUser) return { ok: false, message: 'Silakan login terlebih dahulu.' };
    const res = await joinWorkspaceWithInvite(workspaceId, code, currentUser);
    if (res.ok && res.membership) {
      setMembership(res.membership);
      const ws = await fetchWorkspaceInfo(workspaceId);
      setWorkspaceInfo(ws);
      showToast('Berhasil bergabung ke tim operasional.');
      return { ok: true };
    }
    return { ok: false, message: res.message };
  };

  // Core transfer rule: Units present in bdRecords are automatically excluded from runningUnits
  const bdUnitCodesSet = useMemo(
    () => new Set(bdRecords.map((b) => b.unitCode.trim().toUpperCase())),
    [bdRecords]
  );

  const runningUnits = useMemo(
    () =>
      masterUnits
        .filter((u) => !bdUnitCodesSet.has(u.code.trim().toUpperCase()))
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [masterUnits, bdUnitCodesSet]
  );

  const isOwnerOrAdmin = Boolean(
    currentUser &&
      (isBootstrappedAdminUser(currentUser) ||
        workspaceInfo?.ownerUid === currentUser.uid ||
        membership?.role === 'admin')
  );

  const partTrackCount = useMemo(
    () =>
      bdRecords.filter(
        (rec) =>
          rec.status === 'B1' ||
          normalizeMrList(rec.mrNumbers).length > 0 ||
          Boolean(rec.partStatus) ||
          Boolean(rec.partNote?.trim())
      ).length,
    [bdRecords]
  );

  const handleAddBd = (payload: {
    unitCode: string;
    jamBd: string;
    lokasi: string;
    mrNumbers: string[];
    keterangan: string;
    status: BdStatus;
    picMekanik?: string;
    etr?: string;
  }): { ok: boolean; message?: string } => {
    if (!currentUser) return { ok: false, message: 'Sesi login tidak aktif.' };

    const normalizedCode = payload.unitCode.trim().toUpperCase().replace(/\s+/g, ' ');
    if (!normalizedCode) {
      return { ok: false, message: 'Masukkan atau pilih kode unit terlebih dahulu.' };
    }

    if (bdUnitCodesSet.has(normalizedCode)) {
      return {
        ok: false,
        message: `Unit ${normalizedCode} sudah berada di daftar Unit BD.`,
      };
    }

    const matchedMaster = masterUnits.find(
      (u) => u.code.trim().toUpperCase() === normalizedCode
    );

    if (!matchedMaster) {
      return {
        ok: false,
        message: `Unit "${normalizedCode}" tidak ditemukan di daftar Unit Running. Tambahkan unit terlebih dahulu jika unit baru.`,
      };
    }

    const newRecord: BreakdownRecord = {
      id: `bd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      unitCode: matchedMaster.code,
      fleetGroup: matchedMaster.fleetGroup,
      jamBd: payload.jamBd || getCurrentTimeHHMM(),
      tanggalBd: getCurrentDateYYYYMMDD(),
      lokasi: payload.lokasi.trim(),
      mrNumbers: normalizeMrList(payload.mrNumbers),
      keterangan: payload.keterangan.trim(),
      status: payload.status,
      picMekanik: (payload.picMekanik ?? '').trim(),
      etr: (payload.etr ?? '').trim(),
      partStatus: '',
      partNote: '',
      updatedAt: new Date().toISOString(),
    };

    setBdRecords((prev) => [newRecord, ...prev]);
    runCloudTask(upsertBdRecordCloud(workspaceId, newRecord, currentUser));
    logAudit({
      actionType: 'INPUT_BD',
      unitCode: matchedMaster.code,
      summary: `Input BD (${payload.status})${newRecord.lokasi ? ` di ${newRecord.lokasi}` : ''}${newRecord.keterangan ? `: ${newRecord.keterangan}` : ''}`,
    });
    showToast(`${matchedMaster.code} dipindahkan dari Unit Running ke Unit BD.`);
    return { ok: true };
  };

  const handleUpdateBd = (
    id: string,
    patch: Partial<
      Pick<
        BreakdownRecord,
        | 'jamBd'
        | 'lokasi'
        | 'mrNumbers'
        | 'keterangan'
        | 'status'
        | 'picMekanik'
        | 'etr'
        | 'partStatus'
        | 'partNote'
      >
    >
  ) => {
    if (!currentUser) return;
    const existing = bdRecords.find((r) => r.id === id);
    if (!existing) return;

    const updated: BreakdownRecord = {
      ...existing,
      ...patch,
      mrNumbers:
        patch.mrNumbers !== undefined
          ? normalizeMrList(patch.mrNumbers)
          : existing.mrNumbers,
      partStatus:
        patch.partStatus !== undefined
          ? normalizePartStatus(patch.partStatus)
          : existing.partStatus,
      updatedAt: new Date().toISOString(),
    };

    setBdRecords((prev) => prev.map((rec) => (rec.id === id ? updated : rec)));
    runCloudTask(upsertBdRecordCloud(workspaceId, updated, currentUser));

    if (patch.status !== undefined && patch.status !== existing.status) {
      logAudit({
        actionType: 'UPDATE_BD',
        unitCode: existing.unitCode,
        summary: `Ubah status BD dari ${existing.status} ke ${patch.status}`,
      });
    } else if (patch.partStatus !== undefined && patch.partStatus !== (existing.partStatus ?? '')) {
      const lbl = PART_STATUS_LABELS[updated.partStatus ?? ''] || 'Belum Diatur';
      logAudit({
        actionType: 'UPDATE_PART',
        unitCode: existing.unitCode,
        summary: `Update status sparepart: ${lbl}`,
      });
    } else if (patch.mrNumbers !== undefined) {
      logAudit({
        actionType: 'UPDATE_PART',
        unitCode: existing.unitCode,
        summary: `Update nomor MR: ${formatMrNumbers(updated.mrNumbers, 'Kosong')}`,
      });
    } else if (patch.jamBd !== undefined && patch.jamBd !== existing.jamBd) {
      logAuditDebounced(`bd-jam-${id}`, {
        actionType: 'UPDATE_BD',
        unitCode: existing.unitCode,
        summary: `Koreksi jam BD menjadi ${patch.jamBd}`,
      });
    } else if (patch.etr !== undefined && patch.etr !== (existing.etr ?? '')) {
      logAuditDebounced(`bd-etr-${id}`, {
        actionType: 'UPDATE_BD',
        unitCode: existing.unitCode,
        summary: `Update ETR menjadi ${patch.etr || 'kosong'}`,
      });
    } else if (patch.partNote !== undefined) {
      logAuditDebounced(`bd-partnote-${id}`, {
        actionType: 'UPDATE_PART',
        unitCode: existing.unitCode,
        summary: `Update catatan part: ${patch.partNote.trim() || 'kosong'}`,
      });
    } else if (
      patch.keterangan !== undefined ||
      patch.lokasi !== undefined ||
      patch.picMekanik !== undefined
    ) {
      const parts: string[] = [];
      if (patch.lokasi !== undefined) parts.push(`posisi "${patch.lokasi.trim() || '-'}"`);
      if (patch.picMekanik !== undefined) parts.push(`PIC "${patch.picMekanik.trim() || '-'}"`);
      if (patch.keterangan !== undefined) parts.push(`keterangan`);
      logAuditDebounced(`bd-text-${id}`, {
        actionType: 'UPDATE_BD',
        unitCode: existing.unitCode,
        summary: `Memperbarui ${parts.join(', ')}`,
      });
    }
  };

  const handleMarkRfu = (id: string) => {
    if (!currentUser) return;
    const target = bdRecords.find((r) => r.id === id);
    if (!target) return;

    const historyEntry: RfuHistoryRecord = {
      id: `rfu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      unitCode: target.unitCode,
      fleetGroup: target.fleetGroup,
      jamBd: target.jamBd,
      tanggalBd: target.tanggalBd,
      jamRfu: getCurrentTimeHHMM(),
      tanggalRfu: getCurrentDateYYYYMMDD(),
      lokasi: target.lokasi ?? '',
      mrNumbers: normalizeMrList(target.mrNumbers),
      keterangan: target.keterangan,
      komponen: '',
      subKomponen: '',
      detailSubKomponen: '',
      activityPerbaikan: '',
      lastStatus: target.status,
      picMekanik: target.picMekanik ?? '',
    };

    setBdRecords((prev) => prev.filter((r) => r.id !== id));
    const mKey = getMonthKeyFromDate(historyEntry.tanggalRfu);
    setRfuByMonth((prev) => ({
      ...prev,
      [mKey]: { ...(prev[mKey] ?? {}), [historyEntry.id]: historyEntry },
    }));

    runCloudTask(
      Promise.all([
        deleteBdRecordCloud(workspaceId, id, currentUser),
        upsertRfuRecordsCloud(workspaceId, [historyEntry], boardMeta.rfuMonths, currentUser),
      ])
    );
    logAudit({
      actionType: 'MARK_RFU',
      unitCode: target.unitCode,
      summary: `Unit dinyatakan RFU pada ${historyEntry.jamRfu} (status terakhir ${target.status})`,
    });
    showToast(`${target.unitCode} selesai (RFU) dan dikembalikan ke Unit Running.`);
  };

  const handleCancelBd = (id: string) => {
    if (!currentUser) return;
    const target = bdRecords.find((r) => r.id === id);
    if (!target) return;

    setBdRecords((prev) => prev.filter((r) => r.id !== id));
    runCloudTask(deleteBdRecordCloud(workspaceId, id, currentUser));
    logAudit({
      actionType: 'CANCEL_BD',
      unitCode: target.unitCode,
      summary: `Membatalkan status BD (kembali Running)`,
    });
    showToast(`${target.unitCode} dibatalkan dari BD dan kembali ke Unit Running.`);
  };

  const handleAddNewUnit = (rawCode: string): { ok: boolean; message?: string } => {
    if (!currentUser) return { ok: false, message: 'Sesi login tidak aktif.' };
    if (!isOwnerOrAdmin) {
      return { ok: false, message: 'Penambahan master unit khusus Admin.' };
    }

    const code = rawCode.trim().toUpperCase().replace(/\s+/g, ' ');
    if (!code) {
      return { ok: false, message: 'Kode unit tidak boleh kosong.' };
    }
    const exists = masterUnits.some((u) => u.code.toUpperCase() === code);
    if (exists) {
      return { ok: false, message: `Unit ${code} sudah terdaftar di armada.` };
    }

    const nextIndex =
      masterUnits.length > 0
        ? Math.max(...masterUnits.map((u) => u.orderIndex)) + 1
        : 1;

    const newUnit: FleetUnit = {
      id: `unit-${Date.now()}`,
      code,
      fleetGroup: detectFleetGroup(code),
      orderIndex: nextIndex,
    };

    setMasterUnits((prev) => [...prev, newUnit]);
    runCloudTask(upsertFleetUnitsCloud(workspaceId, [newUnit], currentUser));
    logAudit({
      actionType: 'FLEET_MASTER',
      unitCode: code,
      summary: `Menambah unit baru ke populasi master armada`,
    });
    showToast(`Unit ${code} ditambahkan ke Unit Running (No. ${runningUnits.length + 1}).`);
    return { ok: true };
  };

  const handleImportPopulation = (
    codes: string[],
    mode: 'append' | 'replace'
  ): { ok: boolean; added: number; total: number; message?: string } => {
    if (!currentUser) {
      return { ok: false, added: 0, total: masterUnits.length, message: 'Sesi login tidak aktif.' };
    }
    if (!isOwnerOrAdmin) {
      return { ok: false, added: 0, total: masterUnits.length, message: 'Kelola populasi unit khusus Admin.' };
    }
    if (codes.length === 0) {
      return { ok: false, added: 0, total: masterUnits.length, message: 'Daftar unit kosong.' };
    }

    if (mode === 'replace') {
      const nextUnits: FleetUnit[] = codes.map((code, idx) => ({
        id: `unit-${Date.now()}-${idx + 1}`,
        code,
        fleetGroup: detectFleetGroup(code),
        orderIndex: idx + 1,
      }));
      const nextCodeSet = new Set(nextUnits.map((u) => u.code.toUpperCase()));
      const filteredBd = bdRecords.filter((b) =>
        nextCodeSet.has(b.unitCode.trim().toUpperCase())
      );
      setMasterUnits(nextUnits);
      setBdRecords(filteredBd);

      runCloudTask(
        Promise.all([
          saveFleetUnitsReplace(workspaceId, nextUnits, currentUser),
          filteredBd.length !== bdRecords.length
            ? replaceActiveBdCloud(workspaceId, filteredBd, currentUser)
            : Promise.resolve(),
        ])
      );
      logAudit({
        actionType: 'FLEET_MASTER',
        summary: `Mengganti populasi armada menjadi ${nextUnits.length} unit`,
      });
      showToast(`Populasi unit diperbarui: ${nextUnits.length} unit terdaftar.`);
      return { ok: true, added: nextUnits.length, total: nextUnits.length };
    }

    const existingSet = new Set(masterUnits.map((u) => u.code.trim().toUpperCase()));
    const newCodes = codes.filter((c) => !existingSet.has(c.toUpperCase()));
    if (newCodes.length === 0) {
      return {
        ok: false,
        added: 0,
        total: masterUnits.length,
        message: 'Semua kode unit dari file/input sudah ada di populasi saat ini.',
      };
    }

    const startIdx =
      masterUnits.length > 0
        ? Math.max(...masterUnits.map((u) => u.orderIndex)) + 1
        : 1;

    const addedUnits: FleetUnit[] = newCodes.map((code, idx) => ({
      id: `unit-${Date.now()}-${idx + 1}`,
      code,
      fleetGroup: detectFleetGroup(code),
      orderIndex: startIdx + idx,
    }));

    const totalAfter = masterUnits.length + addedUnits.length;
    setMasterUnits((prev) => [...prev, ...addedUnits]);
    runCloudTask(upsertFleetUnitsCloud(workspaceId, addedUnits, currentUser));
    logAudit({
      actionType: 'FLEET_MASTER',
      summary: `Menambah ${addedUnits.length} unit baru ke populasi armada (Total ${totalAfter})`,
    });
    showToast(`${addedUnits.length} unit baru ditambahkan ke populasi (Total ${totalAfter}).`);
    return { ok: true, added: addedUnits.length, total: totalAfter };
  };

  const handleUpdateMasterUnitCode = (
    unitId: string,
    rawNewCode: string
  ): { ok: boolean; message?: string } => {
    if (!currentUser) return { ok: false, message: 'Sesi login tidak aktif.' };
    if (!isOwnerOrAdmin) return { ok: false, message: 'Ubah kode unit khusus Admin.' };

    const newCode = rawNewCode.trim().toUpperCase().replace(/\s+/g, ' ');
    if (!newCode) {
      return { ok: false, message: 'Kode unit tidak boleh kosong.' };
    }

    const target = masterUnits.find((u) => u.id === unitId);
    if (!target) {
      return { ok: false, message: 'Unit tidak ditemukan.' };
    }

    const duplicate = masterUnits.some(
      (u) => u.id !== unitId && u.code.trim().toUpperCase() === newCode
    );
    if (duplicate) {
      return { ok: false, message: `Kode unit ${newCode} sudah digunakan unit lain.` };
    }

    const oldCodeUpper = target.code.trim().toUpperCase();
    const newGroup = detectFleetGroup(newCode);
    const updatedUnit: FleetUnit = { ...target, code: newCode, fleetGroup: newGroup };

    const affectedBd: BreakdownRecord[] = [];
    const nextBd = bdRecords.map((rec) => {
      if (rec.unitCode.trim().toUpperCase() === oldCodeUpper) {
        const patched = { ...rec, unitCode: newCode, fleetGroup: newGroup };
        affectedBd.push(patched);
        return patched;
      }
      return rec;
    });

    setMasterUnits((prev) => prev.map((u) => (u.id === unitId ? updatedUnit : u)));
    setBdRecords(nextBd);

    runCloudTask(
      Promise.all([
        upsertFleetUnitsCloud(workspaceId, [updatedUnit], currentUser),
        affectedBd.length > 0
          ? upsertManyBdRecordsCloud(workspaceId, affectedBd, currentUser)
          : Promise.resolve(),
      ])
    );

    logAudit({
      actionType: 'FLEET_MASTER',
      unitCode: newCode,
      summary: `Mengubah kode unit master dari ${target.code} menjadi ${newCode}`,
    });
    showToast(`Kode unit ${target.code} diubah menjadi ${newCode}.`);
    return { ok: true };
  };

  const handleDeleteMasterUnit = (unitId: string) => {
    if (!currentUser || !isOwnerOrAdmin) return;
    const target = masterUnits.find((u) => u.id === unitId);
    if (!target) return;
    const codeUpper = target.code.trim().toUpperCase();
    const removedBds = bdRecords.filter(
      (rec) => rec.unitCode.trim().toUpperCase() === codeUpper
    );

    setMasterUnits((prev) => prev.filter((u) => u.id !== unitId));
    setBdRecords((prev) =>
      prev.filter((rec) => rec.unitCode.trim().toUpperCase() !== codeUpper)
    );

    runCloudTask(
      Promise.all([
        deleteFleetUnitCloud(workspaceId, unitId, currentUser),
        ...removedBds.map((rec) => deleteBdRecordCloud(workspaceId, rec.id, currentUser)),
      ])
    );
    logAudit({
      actionType: 'FLEET_MASTER',
      unitCode: target.code,
      summary: `Menghapus unit dari populasi master armada`,
    });
    showToast(`Unit ${target.code} dihapus dari populasi armada.`);
  };

  const handleResetDefaultPopulation = () => {
    if (!currentUser || !isOwnerOrAdmin) return;
    const defaultSet = new Set(INITIAL_FLEET_UNITS.map((u) => u.code.toUpperCase()));
    const filteredBd = bdRecords.filter((rec) =>
      defaultSet.has(rec.unitCode.trim().toUpperCase())
    );
    setMasterUnits(INITIAL_FLEET_UNITS);
    setBdRecords(filteredBd);

    runCloudTask(
      Promise.all([
        saveFleetUnitsReplace(workspaceId, INITIAL_FLEET_UNITS, currentUser),
        filteredBd.length !== bdRecords.length
          ? replaceActiveBdCloud(workspaceId, filteredBd, currentUser)
          : Promise.resolve(),
      ])
    );
    logAudit({
      actionType: 'FLEET_MASTER',
      summary: `Mengembalikan populasi armada ke ${INITIAL_FLEET_UNITS.length} unit standar awal`,
    });
    showToast('Populasi armada dikembalikan ke 75 unit awal.');
  };

  const handleCopyWaReport = async () => {
    const report = buildWhatsappReport(runningUnits, bdRecords, masterUnits.length);
    try {
      await navigator.clipboard.writeText(report);
      setCopiedWa(true);
      setTimeout(() => setCopiedWa(false), 2200);
    } catch {
      showToast('Gagal menyalin otomatis. Buka tab Area Dashboard BD untuk menyalin manual.');
    }
  };

  const handleSetHourlyOverride = (slot: {
    shiftDate: string;
    slotIndex: number;
    totalPopulasi: number;
    bdCount: number;
  }) => {
    if (!currentUser) return;
    const key = `${slot.shiftDate}__${slot.slotIndex}`;
    const override: HourlySlotOverride = {
      key,
      shiftDate: slot.shiftDate,
      slotIndex: slot.slotIndex,
      totalPopulasi: slot.totalPopulasi,
      bdCount: slot.bdCount,
      updatedAt: new Date().toISOString(),
    };
    const mKey = getMonthKeyFromDate(slot.shiftDate);
    setHourlyByMonth((prev) => ({
      ...prev,
      [mKey]: { ...(prev[mKey] ?? {}), [key]: override },
    }));
    runCloudTask(
      setHourlyOverrideCloud(workspaceId, override, boardMeta.hourlyMonths, currentUser)
    );
    logAuditDebounced(`hourly-${key}`, {
      actionType: 'HOURLY_OVERRIDE',
      summary: `Koreksi PA slot #${slot.slotIndex + 1} (${slot.shiftDate}): Pop ${slot.totalPopulasi}, BD ${slot.bdCount}`,
    });
  };

  const handleClearHourlyOverride = (key: string) => {
    if (!currentUser) return;
    const shiftDatePart = key.split('__')[0] ?? '';
    const mKey = getMonthKeyFromDate(shiftDatePart);
    setHourlyByMonth((prev) => {
      const monthMap = { ...(prev[mKey] ?? {}) };
      delete monthMap[key];
      return { ...prev, [mKey]: monthMap };
    });
    runCloudTask(clearHourlyOverrideCloud(workspaceId, key, currentUser));
    logAudit({
      actionType: 'HOURLY_OVERRIDE',
      summary: `Reset koreksi manual PA jam (${key.replace('__', ' slot #')}) ke hitungan otomatis`,
    });
  };

  const handleUpdateTargetPa = (nextTarget: number) => {
    if (!currentUser || !isOwnerOrAdmin) return;
    const clamped = Math.min(100, Math.max(50, Math.round(nextTarget * 10) / 10));
    setBoardMeta((prev) => ({ ...prev, targetPaPct: clamped }));
    runCloudTask(updateTargetPaCloud(workspaceId, clamped, currentUser));
    logAudit({
      actionType: 'TARGET_PA',
      summary: `Mengubah Target PA harian menjadi ${clamped}%`,
    });
    showToast(`Target PA diperbarui menjadi ${clamped}%.`);
  };

  const handleUpdateRfuHistory = (
    id: string,
    patch: Partial<Omit<RfuHistoryRecord, 'id' | 'fleetGroup'>>
  ) => {
    if (!currentUser) return;
    const existing = rfuHistory.find((r) => r.id === id);
    if (!existing) return;

    const nextCode =
      patch.unitCode !== undefined
        ? patch.unitCode.trim().toUpperCase().replace(/\s+/g, ' ') || existing.unitCode
        : existing.unitCode;
    const candidateTanggalRfu = patch.tanggalRfu ?? existing.tanggalRfu;
    const oldMonth = getMonthKeyFromDate(existing.tanggalRfu);
    const candidateNewMonth = getMonthKeyFromDate(candidateTanggalRfu);
    const safeTanggalRfu =
      !isOwnerOrAdmin && oldMonth !== candidateNewMonth
        ? existing.tanggalRfu
        : candidateTanggalRfu;

    const updated: RfuHistoryRecord = {
      ...existing,
      ...patch,
      tanggalRfu: safeTanggalRfu,
      mrNumbers:
        patch.mrNumbers !== undefined
          ? normalizeMrList(patch.mrNumbers)
          : existing.mrNumbers,
      picMekanik:
        patch.picMekanik !== undefined
          ? patch.picMekanik.trim()
          : existing.picMekanik ?? '',
      unitCode: nextCode,
      fleetGroup: detectFleetGroup(nextCode),
    };

    const newMonth = getMonthKeyFromDate(updated.tanggalRfu);

    setRfuByMonth((prev) => {
      const next = { ...prev };
      if (oldMonth !== newMonth && next[oldMonth]) {
        const oldCopy = { ...next[oldMonth] };
        delete oldCopy[id];
        next[oldMonth] = oldCopy;
      }
      next[newMonth] = { ...(next[newMonth] ?? {}), [id]: updated };
      return next;
    });

    runCloudTask(
      (async () => {
        if (oldMonth !== newMonth) {
          await deleteRfuRecordCloud(workspaceId, existing, currentUser);
        }
        await upsertRfuRecordsCloud(workspaceId, [updated], boardMeta.rfuMonths, currentUser);
      })()
    );
    logAudit({
      actionType: 'RFU_HISTORY',
      unitCode: updated.unitCode,
      summary: `Memperbarui catatan RFU${updated.komponen ? ` (${updated.komponen})` : ''}`,
    });
    showToast('Catatan riwayat RFU diperbarui.');
  };

  const handleAddRfuHistory = (payload: {
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
    picMekanik?: string;
  }): { ok: boolean; message?: string } => {
    if (!currentUser) return { ok: false, message: 'Sesi login tidak aktif.' };

    const code = payload.unitCode.trim().toUpperCase().replace(/\s+/g, ' ');
    if (!code) {
      return { ok: false, message: 'Kode unit tidak boleh kosong.' };
    }
    const newEntry: RfuHistoryRecord = {
      id: `rfu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      unitCode: code,
      fleetGroup: detectFleetGroup(code),
      tanggalBd: payload.tanggalBd || getCurrentDateYYYYMMDD(),
      jamBd: payload.jamBd || getCurrentTimeHHMM(),
      tanggalRfu: payload.tanggalRfu || getCurrentDateYYYYMMDD(),
      jamRfu: payload.jamRfu || getCurrentTimeHHMM(),
      lokasi: payload.lokasi.trim(),
      mrNumbers: normalizeMrList(payload.mrNumbers),
      keterangan: payload.keterangan.trim(),
      komponen: payload.komponen.trim(),
      subKomponen: payload.subKomponen.trim(),
      detailSubKomponen: payload.detailSubKomponen.trim(),
      activityPerbaikan: payload.activityPerbaikan.trim(),
      lastStatus: payload.lastStatus,
      picMekanik: (payload.picMekanik ?? '').trim(),
    };

    const mKey = getMonthKeyFromDate(newEntry.tanggalRfu);
    setRfuByMonth((prev) => ({
      ...prev,
      [mKey]: { ...(prev[mKey] ?? {}), [newEntry.id]: newEntry },
    }));
    runCloudTask(upsertRfuRecordsCloud(workspaceId, [newEntry], boardMeta.rfuMonths, currentUser));
    logAudit({
      actionType: 'RFU_HISTORY',
      unitCode: code,
      summary: `Menambah catatan RFU manual (${newEntry.tanggalRfu})`,
    });
    showToast(`Catatan RFU untuk ${code} ditambahkan.`);
    return { ok: true };
  };

  const handleDeleteRfuHistoryItem = (id: string) => {
    if (!currentUser || !isOwnerOrAdmin) return;
    const target = rfuHistory.find((r) => r.id === id);
    if (!target) return;
    const mKey = getMonthKeyFromDate(target.tanggalRfu);
    setRfuByMonth((prev) => {
      const monthCopy = { ...(prev[mKey] ?? {}) };
      delete monthCopy[id];
      return { ...prev, [mKey]: monthCopy };
    });
    runCloudTask(deleteRfuRecordCloud(workspaceId, target, currentUser));
    logAudit({
      actionType: 'RFU_HISTORY',
      unitCode: target.unitCode,
      summary: `Menghapus catatan riwayat RFU`,
    });
    showToast(`Catatan RFU ${target.unitCode} dihapus.`);
  };

  const handleOpenModalForUnit = (unitCode: string | null) => {
    setModalUnitCode(unitCode);
    setModalOpen(true);
  };

  const handleBulkImportBd = (
    payload: BdBulkImportPayload
  ): { ok: boolean; message?: string } => {
    if (!currentUser) return { ok: false, message: 'Sesi login tidak aktif.' };

    const nowIso = new Date().toISOString();
    const nowTime = getCurrentTimeHHMM();
    const nowDate = getCurrentDateYYYYMMDD();

    const masterMap = new Map<string, FleetUnit>();
    masterUnits.forEach((u) => {
      masterMap.set(u.code.trim().toUpperCase(), u);
    });

    const newlyRegisteredUnits: FleetUnit[] = [];
    let nextOrderIdx =
      masterUnits.length > 0
        ? Math.max(...masterUnits.map((u) => u.orderIndex)) + 1
        : 1;

    if (payload.autoRegisterUnknownUnits && isOwnerOrAdmin) {
      for (const row of payload.rows) {
        const key = row.unitCode.trim().toUpperCase();
        if (!masterMap.has(key)) {
          const newUnit: FleetUnit = {
            id: `unit-${Date.now()}-${nextOrderIdx}`,
            code: key,
            fleetGroup: detectFleetGroup(key),
            orderIndex: nextOrderIdx,
          };
          nextOrderIdx += 1;
          masterMap.set(key, newUnit);
          newlyRegisteredUnits.push(newUnit);
        }
      }
    }

    const existingBdMap = new Map<string, BreakdownRecord>();
    bdRecords.forEach((rec) => {
      existingBdMap.set(rec.unitCode.trim().toUpperCase(), rec);
    });

    const importedRecords: BreakdownRecord[] = [];
    const importedCodeSet = new Set<string>();
    let updatedCount = 0;
    let addedBdCount = 0;

    for (const row of payload.rows) {
      const key = row.unitCode.trim().toUpperCase();
      const matchedUnit = masterMap.get(key);
      if (!matchedUnit) continue;

      importedCodeSet.add(key);
      const prevRec = existingBdMap.get(key);

      if (prevRec) {
        updatedCount += 1;
        importedRecords.push({
          ...prevRec,
          jamBd: row.jamBd || prevRec.jamBd,
          tanggalBd: row.tanggalBd || prevRec.tanggalBd,
          lokasi: row.lokasi || prevRec.lokasi,
          mrNumbers:
            row.mrNumbers.length > 0 ? normalizeMrList(row.mrNumbers) : prevRec.mrNumbers ?? [],
          keterangan: row.keterangan || prevRec.keterangan,
          status: row.status,
          picMekanik: row.picMekanik || prevRec.picMekanik || '',
          etr: row.etr || prevRec.etr || '',
          updatedAt: nowIso,
        });
      } else {
        addedBdCount += 1;
        importedRecords.push({
          id: `bd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          unitCode: matchedUnit.code,
          fleetGroup: matchedUnit.fleetGroup,
          jamBd: row.jamBd || nowTime,
          tanggalBd: row.tanggalBd || nowDate,
          lokasi: row.lokasi,
          mrNumbers: normalizeMrList(row.mrNumbers),
          keterangan: row.keterangan,
          status: row.status,
          picMekanik: row.picMekanik || '',
          etr: row.etr || '',
          partStatus: '',
          partNote: '',
          updatedAt: nowIso,
        });
      }
    }

    let nextBdList: BreakdownRecord[];
    let rfuEntries: RfuHistoryRecord[] = [];

    if (payload.mode === 'replace') {
      if (payload.markMissingAsRfu) {
        const missingRecords = bdRecords.filter(
          (rec) => !importedCodeSet.has(rec.unitCode.trim().toUpperCase())
        );
        if (missingRecords.length > 0) {
          rfuEntries = missingRecords.map((rec, idx) => ({
            id: `rfu-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
            unitCode: rec.unitCode,
            fleetGroup: rec.fleetGroup,
            jamBd: rec.jamBd,
            tanggalBd: rec.tanggalBd,
            jamRfu: nowTime,
            tanggalRfu: nowDate,
            lokasi: rec.lokasi ?? '',
            mrNumbers: normalizeMrList(rec.mrNumbers),
            keterangan: rec.keterangan,
            komponen: '',
            subKomponen: '',
            detailSubKomponen: '',
            activityPerbaikan: '',
            lastStatus: rec.status,
            picMekanik: rec.picMekanik ?? '',
          }));
        }
      }
      nextBdList = importedRecords;
    } else {
      const updatedMap = new Map<string, BreakdownRecord>();
      importedRecords.forEach((rec) => {
        updatedMap.set(rec.unitCode.trim().toUpperCase(), rec);
      });
      const mergedExisting = bdRecords.map((rec) => {
        const key = rec.unitCode.trim().toUpperCase();
        return updatedMap.get(key) ?? rec;
      });
      const newlyAddedBd = importedRecords.filter(
        (rec) => !existingBdMap.has(rec.unitCode.trim().toUpperCase())
      );
      nextBdList = [...mergedExisting, ...newlyAddedBd];
    }

    if (newlyRegisteredUnits.length > 0) {
      setMasterUnits((prev) => [...prev, ...newlyRegisteredUnits]);
    }
    setBdRecords(nextBdList);

    runCloudTask(
      Promise.all([
        newlyRegisteredUnits.length > 0
          ? upsertFleetUnitsCloud(workspaceId, newlyRegisteredUnits, currentUser)
          : Promise.resolve(),
        payload.mode === 'replace'
          ? replaceActiveBdCloud(workspaceId, nextBdList, currentUser)
          : upsertManyBdRecordsCloud(workspaceId, importedRecords, currentUser),
        rfuEntries.length > 0
          ? upsertRfuRecordsCloud(workspaceId, rfuEntries, boardMeta.rfuMonths, currentUser)
          : Promise.resolve(),
      ])
    );

    const parts: string[] = [];
    if (addedBdCount > 0) parts.push(`${addedBdCount} BD baru`);
    if (updatedCount > 0) parts.push(`${updatedCount} diperbarui`);
    if (newlyRegisteredUnits.length > 0) {
      parts.push(`${newlyRegisteredUnits.length} unit baru terdaftar`);
    }
    if (rfuEntries.length > 0) parts.push(`${rfuEntries.length} dicatat RFU`);

    logAudit({
      actionType: 'IMPORT_BD',
      summary: `Upload Excel BD (${payload.mode}): ${parts.join(', ') || 'Sinkronisasi daftar BD'}`,
    });

    showToast(
      parts.length > 0
        ? `Upload Excel BD berhasil: ${parts.join(', ')}.`
        : 'Daftar Unit BD disinkronkan.'
    );
    return { ok: true };
  };

  const handleBulkImportHistorical = (
    payload: HistoricalBulkImportPayload
  ): { ok: boolean; message?: string } => {
    if (!currentUser) return { ok: false, message: 'Sesi login tidak aktif.' };
    if (payload.rows.length === 0) {
      return { ok: false, message: 'Tidak ada baris data histori untuk diimpor.' };
    }

    const existingKeys = new Set<string>(rfuHistory.map((item) => buildRfuDedupKey(item)));
    const batchSeenKeys = new Set<string>();
    const rowsToImport = payload.rows.filter((row) => {
      const key = buildRfuDedupKey(row);
      if (payload.skipDuplicates && (existingKeys.has(key) || batchSeenKeys.has(key))) {
        return false;
      }
      batchSeenKeys.add(key);
      return true;
    });

    if (rowsToImport.length === 0) {
      return {
        ok: false,
        message: 'Semua baris pada file/input sudah ada di riwayat histori (terdeteksi duplikat).',
      };
    }

    const masterMap = new Map<string, FleetUnit>();
    masterUnits.forEach((u) => {
      masterMap.set(u.code.trim().toUpperCase(), u);
    });

    const newlyRegisteredUnits: FleetUnit[] = [];
    let nextOrderIdx =
      masterUnits.length > 0
        ? Math.max(...masterUnits.map((u) => u.orderIndex)) + 1
        : 1;

    if (payload.autoRegisterUnknownUnits && isOwnerOrAdmin) {
      for (const row of rowsToImport) {
        const key = row.unitCode.trim().toUpperCase();
        if (!masterMap.has(key)) {
          const newUnit: FleetUnit = {
            id: `unit-${Date.now()}-${nextOrderIdx}`,
            code: key,
            fleetGroup: detectFleetGroup(key),
            orderIndex: nextOrderIdx,
          };
          nextOrderIdx += 1;
          masterMap.set(key, newUnit);
          newlyRegisteredUnits.push(newUnit);
        }
      }
    }

    const newEntries: RfuHistoryRecord[] = rowsToImport.map((row, idx) =>
      convertHistoricalImportRowToRfu(row, idx)
    );

    const skippedCount = payload.rows.length - newEntries.length;

    if (newlyRegisteredUnits.length > 0) {
      setMasterUnits((prev) => [...prev, ...newlyRegisteredUnits]);
    }

    setRfuByMonth((prev) => {
      const next = { ...prev };
      for (const entry of newEntries) {
        const mKey = getMonthKeyFromDate(entry.tanggalRfu);
        next[mKey] = { ...(next[mKey] ?? {}), [entry.id]: entry };
      }
      return next;
    });

    runCloudTask(
      Promise.all([
        newlyRegisteredUnits.length > 0
          ? upsertFleetUnitsCloud(workspaceId, newlyRegisteredUnits, currentUser)
          : Promise.resolve(),
        upsertRfuRecordsCloud(workspaceId, newEntries, boardMeta.rfuMonths, currentUser),
      ])
    );

    const summaryParts = [`${newEntries.length} catatan histori diimpor`];
    if (skippedCount > 0) summaryParts.push(`${skippedCount} duplikat dilewati`);
    if (newlyRegisteredUnits.length > 0) {
      summaryParts.push(`${newlyRegisteredUnits.length} unit baru terdaftar`);
    }

    logAudit({
      actionType: 'RFU_HISTORY',
      summary: `Import Excel Histori BD/RFU: ${summaryParts.join(', ')}`,
    });

    showToast(`Import histori berhasil: ${summaryParts.join(', ')}.`);
    return { ok: true };
  };

  const handleMigrateLocalToCloud = async () => {
    if (!currentUser) return;
    await migrateLocalSnapshotToCloud(
      workspaceId,
      {
        masterUnits: localSnapshot.masterUnits,
        bdRecords: localSnapshot.bdRecords,
        rfuHistory: localSnapshot.rfuHistory,
        hourlyOverrides: localSnapshot.hourlyOverrides,
      },
      boardMeta.rfuMonths,
      boardMeta.hourlyMonths,
      currentUser
    );
    try {
      localStorage.setItem(STORAGE_KEYS.migratedFlag, 'true');
    } catch {
      // Ignore storage error
    }
    setLocalMigrationDismissed(true);
    showToast('Data lokal berhasil disinkronkan ke Cloud tim.');
  };

  // Show loading spinner while checking initial auth or setting up workspace after sign-in
  if (!authReady || (currentUser && workspaceLoading)) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="text-center space-y-2">
          <div className="w-6 h-6 border-2 border-blue-700 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-medium text-slate-600">
            Menghubungkan sinkronisasi tim online...
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <OnlineAuthGate
        mode="signin"
        pendingInviteCode={pendingInviteCode}
        loading={signingIn}
        errorMessage={authError}
        errorCode={authErrorCode}
        onSignInGoogle={handleSignInGoogle}
        onSignOut={handleSignOut}
        onJoinWithCode={handleJoinWithCode}
      />
    );
  }

  if (!membership) {
    return (
      <OnlineAuthGate
        mode="join"
        userDisplayName={sanitizeDisplayName(currentUser.displayName, currentUser.email)}
        userEmail={currentUser.email}
        pendingInviteCode={pendingInviteCode}
        loading={workspaceLoading}
        errorMessage={authError}
        errorCode={authErrorCode}
        onSignInGoogle={handleSignInGoogle}
        onSignOut={handleSignOut}
        onJoinWithCode={handleJoinWithCode}
      />
    );
  }

  const effectiveOwnerUid = workspaceInfo?.ownerUid || membership.ownerUid || currentUser.uid;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <TopBar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onOpenInputModal={() => handleOpenModalForUnit(null)}
        bdCount={bdRecords.length}
        rfuCount={rfuHistory.length}
      />

      <main className="no-print flex-1 max-w-[1680px] w-full mx-auto px-3 sm:px-5 pt-3 pb-20 sm:py-4 md:pb-5 space-y-3 sm:space-y-4">
        {/* Compact Online Team Sync Strip (Keeps TopBar cleanly 3-zone) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3 sm:px-3.5 py-2.5 sm:py-2 bg-white border border-slate-200 rounded-md text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-600">
            <Cloud className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
            <span className="font-semibold text-slate-900">Mode Online Aktif</span>
            <span aria-hidden="true">·</span>
            <span>
              Masuk sebagai{' '}
              <strong className="font-semibold text-slate-800">
                {membership.displayName}
              </strong>{' '}
              ({isOwnerOrAdmin ? 'Admin' : 'Operator'})
            </span>
            {lastEditorName && (
              <>
                <span className="hidden sm:inline" aria-hidden="true">·</span>
                <span className="text-slate-500 w-full sm:w-auto">
                  Update terakhir oleh {lastEditorName}
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {localSnapshot.hasData && (
              <button
                type="button"
                onClick={() => void handleMigrateLocalToCloud()}
                className="inline-flex items-center justify-center gap-1.5 min-h-[36px] sm:min-h-0 px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded cursor-pointer whitespace-nowrap shrink-0"
              >
                <CloudUpload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Unggah Data Lokal</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setAuditModalOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[36px] sm:min-h-0 px-3 sm:px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded cursor-pointer whitespace-nowrap shrink-0"
            >
              <History className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span>Log Tim</span>
            </button>
            <button
              type="button"
              onClick={() => setTeamModalOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[36px] sm:min-h-0 px-3 sm:px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded cursor-pointer whitespace-nowrap shrink-0"
            >
              <Users className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Tim &amp; Undangan</span>
            </button>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="inline-flex items-center justify-center gap-1 min-h-[36px] sm:min-h-0 px-3 sm:px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded cursor-pointer whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Keluar</span>
            </button>
          </div>
        </div>

        {activeTab === 'board' && (
          <>
            <DashboardSummaryStrip
              runningUnits={runningUnits}
              bdRecords={bdRecords}
              totalFleetCount={masterUnits.length}
              targetPaPct={boardMeta.targetPaPct}
              onOpenDashboardTab={() => setActiveTab('dashboard')}
            />

            {/* Mobile Board Panel Switcher (< lg) */}
            <div
              className="lg:hidden grid grid-cols-3 gap-1 p-1 bg-slate-200/80 rounded-lg"
              role="tablist"
              aria-label="Pilih Panel Board"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mobileBoardPanel === 'bd'}
                onClick={() => setMobileBoardPanel('bd')}
                className={`min-h-[42px] px-2 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer tabular-nums whitespace-nowrap ${
                  mobileBoardPanel === 'bd'
                    ? 'bg-white text-red-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Unit BD ({bdRecords.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileBoardPanel === 'part'}
                onClick={() => setMobileBoardPanel('part')}
                className={`min-h-[42px] px-2 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer tabular-nums whitespace-nowrap ${
                  mobileBoardPanel === 'part'
                    ? 'bg-white text-amber-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Part &amp; MR ({partTrackCount})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileBoardPanel === 'running'}
                onClick={() => setMobileBoardPanel('running')}
                className={`min-h-[42px] px-2 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer tabular-nums whitespace-nowrap ${
                  mobileBoardPanel === 'running'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Running ({runningUnits.length})
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-4 items-stretch">
              <div
                className={`order-2 xl:order-1 ${
                  mobileBoardPanel === 'running' ? 'block' : 'hidden lg:block'
                }`}
              >
                <UnitRunningPanel
                  runningUnits={runningUnits}
                  totalFleetCount={masterUnits.length}
                  isOwnerOrAdmin={isOwnerOrAdmin}
                  onSelectUnitForBd={(code) => handleOpenModalForUnit(code)}
                  onAddNewUnit={handleAddNewUnit}
                  onOpenPopulationManager={() => {
                    if (isOwnerOrAdmin) setPopulationModalOpen(true);
                  }}
                />
              </div>

              <div
                className={`order-1 xl:order-2 min-w-0 ${
                  mobileBoardPanel === 'bd' ? 'block' : 'hidden lg:block'
                }`}
              >
                <InputBdPanel
                  runningUnits={runningUnits}
                  bdRecords={bdRecords}
                  onAddBd={handleAddBd}
                  onUpdateBd={handleUpdateBd}
                  onMarkRfu={handleMarkRfu}
                  onCancelBd={handleCancelBd}
                  onCopyWaReport={handleCopyWaReport}
                  onExportCsv={() => exportBoardCsv(runningUnits, bdRecords)}
                  onOpenUploadBd={() => setUploadBdModalOpen(true)}
                  onOpenPdfReport={() => setPdfModalOpen(true)}
                  copiedWa={copiedWa}
                />
              </div>
            </div>

            <div className={mobileBoardPanel === 'part' ? 'block' : 'hidden lg:block'}>
              <SparepartMrTrackingSection
                bdRecords={bdRecords}
                onUpdateBd={handleUpdateBd}
              />
            </div>
          </>
        )}

        {activeTab === 'dashboard' && (
          <AreaDashboardBdView
            runningUnits={runningUnits}
            bdRecords={bdRecords}
            rfuHistory={rfuHistory}
            totalFleetCount={masterUnits.length}
            targetPaPct={boardMeta.targetPaPct}
            isOwnerOrAdmin={isOwnerOrAdmin}
            onUpdateTargetPa={handleUpdateTargetPa}
            shiftDate={shiftDate}
            onChangeShiftDate={setShiftDate}
            hourlyOverrides={hourlyOverrides}
            onSetHourlyOverride={handleSetHourlyOverride}
            onClearHourlyOverride={handleClearHourlyOverride}
            onCopyWaReport={handleCopyWaReport}
            onExportCsv={() => exportBoardCsv(runningUnits, bdRecords)}
            onOpenPdfReport={() => setPdfModalOpen(true)}
            copiedWa={copiedWa}
            onBackToBoard={() => setActiveTab('board')}
          />
        )}

        {activeTab === 'riwayat' && (
          <RfuHistoryView
            history={rfuHistory}
            masterUnits={masterUnits}
            isOwnerOrAdmin={isOwnerOrAdmin}
            onUpdateItem={handleUpdateRfuHistory}
            onAddItem={handleAddRfuHistory}
            onDeleteItem={handleDeleteRfuHistoryItem}
            onExportCsv={() => exportRfuHistoryCsv(rfuHistory)}
            onOpenPdfReport={() => setPdfModalOpen(true)}
            onClearHistory={() => {
              if (!isOwnerOrAdmin) return;
              const allMonths = Array.from(
                new Set([
                  ...boardMeta.rfuMonths,
                  ...Object.keys(rfuByMonth),
                ])
              );
              setRfuByMonth({});
              runCloudTask(clearAllRfuMonthsCloud(workspaceId, allMonths, currentUser));
              logAudit({
                actionType: 'RFU_HISTORY',
                summary: `Membersihkan seluruh catatan riwayat RFU`,
              });
              showToast('Seluruh log riwayat RFU dibersihkan.');
            }}
            onBackToBoard={() => setActiveTab('board')}
          />
        )}

        {activeTab === 'historical' && (
          <HistoricalBdView
            masterUnits={masterUnits}
            bdRecords={bdRecords}
            rfuHistory={rfuHistory}
            onOpenUploadHistorical={() => setUploadHistModalOpen(true)}
            onOpenPdfReport={() => setPdfModalOpen(true)}
            onBackToBoard={() => setActiveTab('board')}
          />
        )}
      </main>

      <InputBdModal
        isOpen={modalOpen}
        initialUnitCode={modalUnitCode}
        runningUnits={runningUnits}
        onClose={() => setModalOpen(false)}
        onSubmit={handleAddBd}
      />

      <PopulationManagerModal
        isOpen={populationModalOpen && isOwnerOrAdmin}
        masterUnits={masterUnits}
        bdUnitCodesSet={bdUnitCodesSet}
        onClose={() => setPopulationModalOpen(false)}
        onImportPopulation={handleImportPopulation}
        onAddSingleUnit={handleAddNewUnit}
        onUpdateUnitCode={handleUpdateMasterUnitCode}
        onDeleteUnit={handleDeleteMasterUnit}
        onResetDefault={handleResetDefaultPopulation}
      />

      <UploadBdModal
        isOpen={uploadBdModalOpen}
        isOwnerOrAdmin={isOwnerOrAdmin}
        masterUnits={masterUnits}
        bdRecords={bdRecords}
        onClose={() => setUploadBdModalOpen(false)}
        onApplyImport={handleBulkImportBd}
      />

      <UploadHistoricalBdModal
        isOpen={uploadHistModalOpen}
        isOwnerOrAdmin={isOwnerOrAdmin}
        masterUnits={masterUnits}
        existingRfuHistory={rfuHistory}
        onClose={() => setUploadHistModalOpen(false)}
        onApplyImport={handleBulkImportHistorical}
      />

      <AuditLogModal
        isOpen={auditModalOpen}
        entries={auditLogs}
        onClose={() => setAuditModalOpen(false)}
      />

      <TeamManagementModal
        isOpen={teamModalOpen}
        workspace={workspaceInfo}
        membership={membership}
        isOwnerOrAdmin={isOwnerOrAdmin}
        currentUserUid={currentUser.uid}
        ownerUid={effectiveOwnerUid}
        hasLocalMigrationData={localSnapshot.hasData}
        localSummaryText={localSnapshot.summaryText}
        onClose={() => setTeamModalOpen(false)}
        onLoadTeamDetails={async () => {
          const [members, invites] = await Promise.all([
            listWorkspaceMembers(workspaceId, effectiveOwnerUid),
            listWorkspaceInvites(workspaceId, effectiveOwnerUid),
          ]);
          return { members, invites };
        }}
        onCreateInviteCode={async () => {
          return createNewInviteCode(workspaceId, effectiveOwnerUid, currentUser);
        }}
        onToggleInviteActive={async (code, active) => {
          await setInviteActiveState(workspaceId, code, active);
        }}
        onUpdateMemberRole={async (memberUid, nextRole) => {
          await updateWorkspaceMemberRole(workspaceId, memberUid, nextRole);
          logAudit({
            actionType: 'TEAM_ROLE',
            summary: `Mengubah peran anggota tim menjadi ${nextRole === 'admin' ? 'Admin' : 'Operator'}`,
          });
          showToast(
            `Peran anggota diperbarui menjadi ${nextRole === 'admin' ? 'Admin' : 'Operator'}.`
          );
        }}
        onRemoveMember={async (memberUid) => {
          await removeWorkspaceMember(workspaceId, memberUid);
          logAudit({
            actionType: 'TEAM_ROLE',
            summary: `Mencabut akses seorang anggota tim dari workspace`,
          });
          showToast('Akses anggota tim dicabut.');
        }}
        onMigrateLocalToCloud={handleMigrateLocalToCloud}
      />

      <PdfReportModal
        isOpen={pdfModalOpen}
        onClose={() => setPdfModalOpen(false)}
        runningUnits={runningUnits}
        bdRecords={bdRecords}
        rfuHistory={rfuHistory}
        totalFleetCount={masterUnits.length}
        targetPaPct={boardMeta.targetPaPct}
        preparedByName={membership.displayName}
      />

      <MobileBottomNav
        activeTab={activeTab}
        bdCount={bdRecords.length}
        rfuCount={rfuHistory.length}
        onChangeTab={setActiveTab}
        onOpenInputModal={() => handleOpenModalForUnit(null)}
      />

      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="no-print fixed bottom-20 md:bottom-5 left-3 right-3 sm:left-auto sm:right-5 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-2.5 rounded-md shadow-lg border border-slate-700 text-center sm:text-left"
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}
