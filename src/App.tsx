import { useEffect, useMemo, useState } from 'react';
import { AreaDashboardBdView } from './components/AreaDashboardBdView';
import { DashboardSummaryStrip } from './components/DashboardSummaryStrip';
import { InputBdModal } from './components/InputBdModal';
import { InputBdPanel } from './components/InputBdPanel';
import { PopulationManagerModal } from './components/PopulationManagerModal';
import { RfuHistoryView } from './components/RfuHistoryView';
import { TopBar } from './components/TopBar';
import { UnitRunningPanel } from './components/UnitRunningPanel';
import { BdBulkImportPayload, UploadBdModal } from './components/UploadBdModal';
import { INITIAL_FLEET_UNITS, detectFleetGroup, normalizeBdStatus } from './data/initialUnits';
import {
  ActiveTab,
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
  getCurrentDateYYYYMMDD,
  getCurrentTimeHHMM,
  normalizeMrList,
} from './utils/fleetUtils';
import { getCurrentOperationalShiftDate } from './utils/hourlyShiftUtils';

const STORAGE_KEYS = {
  masterFleet: 'fleetbd_master_units_v1',
  bdRecords: 'fleetbd_active_bd_v1',
  rfuHistory: 'fleetbd_rfu_history_v1',
  hourlyOverrides: 'fleetbd_hourly_overrides_v1',
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

export default function App() {
  const [masterUnits, setMasterUnits] = useState<FleetUnit[]>(() =>
    loadFromStorage<FleetUnit[]>(STORAGE_KEYS.masterFleet, INITIAL_FLEET_UNITS)
  );
  const [bdRecords, setBdRecords] = useState<BreakdownRecord[]>(() =>
    loadFromStorage<BreakdownRecord[]>(STORAGE_KEYS.bdRecords, []).map((rec) => ({
      ...rec,
      lokasi: rec.lokasi ?? '',
      mrNumbers: normalizeMrList(rec.mrNumbers),
      status: normalizeBdStatus(rec.status),
    }))
  );
  const [rfuHistory, setRfuHistory] = useState<RfuHistoryRecord[]>(() =>
    loadFromStorage<RfuHistoryRecord[]>(STORAGE_KEYS.rfuHistory, []).map((item) => ({
      ...item,
      lokasi: item.lokasi ?? '',
      mrNumbers: normalizeMrList(item.mrNumbers),
      komponen: item.komponen ?? '',
      subKomponen: item.subKomponen ?? '',
      detailSubKomponen: item.detailSubKomponen ?? '',
      activityPerbaikan: item.activityPerbaikan ?? '',
      lastStatus: normalizeBdStatus(item.lastStatus),
    }))
  );
  const [hourlyOverrides, setHourlyOverrides] = useState<Record<string, HourlySlotOverride>>(
    () => loadFromStorage<Record<string, HourlySlotOverride>>(STORAGE_KEYS.hourlyOverrides, {})
  );
  const [shiftDate, setShiftDate] = useState<string>(() => getCurrentOperationalShiftDate());

  const [activeTab, setActiveTab] = useState<ActiveTab>('board');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalUnitCode, setModalUnitCode] = useState<string | null>(null);
  const [populationModalOpen, setPopulationModalOpen] = useState(false);
  const [uploadBdModalOpen, setUploadBdModalOpen] = useState(false);
  const [copiedWa, setCopiedWa] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.masterFleet, JSON.stringify(masterUnits));
    } catch {
      // Ignore storage quota errors
    }
  }, [masterUnits]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.bdRecords, JSON.stringify(bdRecords));
    } catch {
      // Ignore storage quota errors
    }
  }, [bdRecords]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.rfuHistory, JSON.stringify(rfuHistory));
    } catch {
      // Ignore storage quota errors
    }
  }, [rfuHistory]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.hourlyOverrides, JSON.stringify(hourlyOverrides));
    } catch {
      // Ignore storage quota errors
    }
  }, [hourlyOverrides]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
  };

  useEffect(() => {
    if (!toastMsg) return;
    const timer = setTimeout(() => setToastMsg(null), 3200);
    return () => clearTimeout(timer);
  }, [toastMsg]);

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

  const handleAddBd = (payload: {
    unitCode: string;
    jamBd: string;
    lokasi: string;
    mrNumbers: string[];
    keterangan: string;
    status: BdStatus;
  }): { ok: boolean; message?: string } => {
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
      updatedAt: new Date().toISOString(),
    };

    setBdRecords((prev) => [...prev, newRecord]);
    showToast(`${matchedMaster.code} dipindahkan dari Unit Running ke Unit BD.`);
    return { ok: true };
  };

  const handleUpdateBd = (
    id: string,
    patch: Partial<
      Pick<BreakdownRecord, 'jamBd' | 'lokasi' | 'mrNumbers' | 'keterangan' | 'status'>
    >
  ) => {
    setBdRecords((prev) =>
      prev.map((rec) =>
        rec.id === id
          ? {
              ...rec,
              ...patch,
              mrNumbers:
                patch.mrNumbers !== undefined
                  ? normalizeMrList(patch.mrNumbers)
                  : rec.mrNumbers,
              updatedAt: new Date().toISOString(),
            }
          : rec
      )
    );
  };

  const handleMarkRfu = (id: string) => {
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
    };

    setBdRecords((prev) => prev.filter((r) => r.id !== id));
    setRfuHistory((prev) => [historyEntry, ...prev]);
    showToast(`${target.unitCode} selesai (RFU) dan dikembalikan ke Unit Running.`);
  };

  const handleCancelBd = (id: string) => {
    const target = bdRecords.find((r) => r.id === id);
    if (!target) return;
    setBdRecords((prev) => prev.filter((r) => r.id !== id));
    showToast(`${target.unitCode} dibatalkan dari BD dan kembali ke Unit Running.`);
  };

  const handleAddNewUnit = (rawCode: string): { ok: boolean; message?: string } => {
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
    showToast(`Unit ${code} ditambahkan ke Unit Running (No. ${runningUnits.length + 1}).`);
    return { ok: true };
  };

  const handleImportPopulation = (
    codes: string[],
    mode: 'append' | 'replace'
  ): { ok: boolean; added: number; total: number; message?: string } => {
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
      setMasterUnits(nextUnits);
      setBdRecords((prev) =>
        prev.filter((b) => nextCodeSet.has(b.unitCode.trim().toUpperCase()))
      );
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
    showToast(`${addedUnits.length} unit baru ditambahkan ke populasi (Total ${totalAfter}).`);
    return { ok: true, added: addedUnits.length, total: totalAfter };
  };

  const handleUpdateMasterUnitCode = (
    unitId: string,
    rawNewCode: string
  ): { ok: boolean; message?: string } => {
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

    setMasterUnits((prev) =>
      prev.map((u) =>
        u.id === unitId ? { ...u, code: newCode, fleetGroup: newGroup } : u
      )
    );

    // Sync BD record if this unit is currently BD
    setBdRecords((prev) =>
      prev.map((rec) =>
        rec.unitCode.trim().toUpperCase() === oldCodeUpper
          ? { ...rec, unitCode: newCode, fleetGroup: newGroup }
          : rec
      )
    );

    showToast(`Kode unit ${target.code} diubah menjadi ${newCode}.`);
    return { ok: true };
  };

  const handleDeleteMasterUnit = (unitId: string) => {
    const target = masterUnits.find((u) => u.id === unitId);
    if (!target) return;
    const codeUpper = target.code.trim().toUpperCase();
    setMasterUnits((prev) => prev.filter((u) => u.id !== unitId));
    setBdRecords((prev) =>
      prev.filter((rec) => rec.unitCode.trim().toUpperCase() !== codeUpper)
    );
    showToast(`Unit ${target.code} dihapus dari populasi armada.`);
  };

  const handleResetDefaultPopulation = () => {
    setMasterUnits(INITIAL_FLEET_UNITS);
    const defaultSet = new Set(INITIAL_FLEET_UNITS.map((u) => u.code.toUpperCase()));
    setBdRecords((prev) =>
      prev.filter((rec) => defaultSet.has(rec.unitCode.trim().toUpperCase()))
    );
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
    const key = `${slot.shiftDate}__${slot.slotIndex}`;
    setHourlyOverrides((prev) => ({
      ...prev,
      [key]: {
        key,
        shiftDate: slot.shiftDate,
        slotIndex: slot.slotIndex,
        totalPopulasi: slot.totalPopulasi,
        bdCount: slot.bdCount,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const handleClearHourlyOverride = (key: string) => {
    setHourlyOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleUpdateRfuHistory = (
    id: string,
    patch: Partial<Omit<RfuHistoryRecord, 'id' | 'fleetGroup'>>
  ) => {
    setRfuHistory((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const nextCode =
          patch.unitCode !== undefined
            ? patch.unitCode.trim().toUpperCase().replace(/\s+/g, ' ') || item.unitCode
            : item.unitCode;
        return {
          ...item,
          ...patch,
          mrNumbers:
            patch.mrNumbers !== undefined
              ? normalizeMrList(patch.mrNumbers)
              : item.mrNumbers,
          unitCode: nextCode,
          fleetGroup: detectFleetGroup(nextCode),
        };
      })
    );
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
  }): { ok: boolean; message?: string } => {
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
    };
    setRfuHistory((prev) => [newEntry, ...prev]);
    showToast(`Catatan RFU untuk ${code} ditambahkan.`);
    return { ok: true };
  };

  const handleDeleteRfuHistoryItem = (id: string) => {
    const target = rfuHistory.find((r) => r.id === id);
    setRfuHistory((prev) => prev.filter((r) => r.id !== id));
    if (target) {
      showToast(`Catatan RFU ${target.unitCode} dihapus.`);
    }
  };

  const handleOpenModalForUnit = (unitCode: string | null) => {
    setModalUnitCode(unitCode);
    setModalOpen(true);
  };

  const handleBulkImportBd = (
    payload: BdBulkImportPayload
  ): { ok: boolean; message?: string } => {
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

    if (payload.autoRegisterUnknownUnits) {
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
          updatedAt: nowIso,
        });
      }
    }

    if (newlyRegisteredUnits.length > 0) {
      setMasterUnits((prev) => [...prev, ...newlyRegisteredUnits]);
    }

    let rfuMovedCount = 0;
    if (payload.mode === 'replace') {
      if (payload.markMissingAsRfu) {
        const missingRecords = bdRecords.filter(
          (rec) => !importedCodeSet.has(rec.unitCode.trim().toUpperCase())
        );
        if (missingRecords.length > 0) {
          rfuMovedCount = missingRecords.length;
          const rfuEntries: RfuHistoryRecord[] = missingRecords.map((rec, idx) => ({
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
          }));
          setRfuHistory((prev) => [...rfuEntries, ...prev]);
        }
      }
      setBdRecords(importedRecords);
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
      setBdRecords([...mergedExisting, ...newlyAddedBd]);
    }

    const parts: string[] = [];
    if (addedBdCount > 0) parts.push(`${addedBdCount} BD baru`);
    if (updatedCount > 0) parts.push(`${updatedCount} diperbarui`);
    if (newlyRegisteredUnits.length > 0) {
      parts.push(`${newlyRegisteredUnits.length} unit baru terdaftar`);
    }
    if (rfuMovedCount > 0) parts.push(`${rfuMovedCount} dicatat RFU`);

    showToast(
      parts.length > 0
        ? `Upload Excel BD berhasil: ${parts.join(', ')}.`
        : 'Daftar Unit BD disinkronkan.'
    );
    return { ok: true };
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <TopBar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onOpenInputModal={() => handleOpenModalForUnit(null)}
        bdCount={bdRecords.length}
        rfuCount={rfuHistory.length}
      />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
        {activeTab === 'board' && (
          <>
            <DashboardSummaryStrip
              runningUnits={runningUnits}
              bdRecords={bdRecords}
              totalFleetCount={masterUnits.length}
              onOpenDashboardTab={() => setActiveTab('dashboard')}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
              <div className="lg:col-span-4">
                <UnitRunningPanel
                  runningUnits={runningUnits}
                  totalFleetCount={masterUnits.length}
                  onSelectUnitForBd={(code) => handleOpenModalForUnit(code)}
                  onAddNewUnit={handleAddNewUnit}
                  onOpenPopulationManager={() => setPopulationModalOpen(true)}
                />
              </div>

              <div className="lg:col-span-8">
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
                  copiedWa={copiedWa}
                />
              </div>
            </div>
          </>
        )}

        {activeTab === 'dashboard' && (
          <AreaDashboardBdView
            runningUnits={runningUnits}
            bdRecords={bdRecords}
            rfuHistory={rfuHistory}
            totalFleetCount={masterUnits.length}
            shiftDate={shiftDate}
            onChangeShiftDate={setShiftDate}
            hourlyOverrides={hourlyOverrides}
            onSetHourlyOverride={handleSetHourlyOverride}
            onClearHourlyOverride={handleClearHourlyOverride}
            onCopyWaReport={handleCopyWaReport}
            onExportCsv={() => exportBoardCsv(runningUnits, bdRecords)}
            copiedWa={copiedWa}
            onBackToBoard={() => setActiveTab('board')}
          />
        )}

        {activeTab === 'riwayat' && (
          <RfuHistoryView
            history={rfuHistory}
            masterUnits={masterUnits}
            onUpdateItem={handleUpdateRfuHistory}
            onAddItem={handleAddRfuHistory}
            onDeleteItem={handleDeleteRfuHistoryItem}
            onExportCsv={() => exportRfuHistoryCsv(rfuHistory)}
            onClearHistory={() => {
              setRfuHistory([]);
              showToast('Seluruh log riwayat RFU dibersihkan.');
            }}
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
        isOpen={populationModalOpen}
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
        masterUnits={masterUnits}
        bdRecords={bdRecords}
        onClose={() => setUploadBdModalOpen(false)}
        onApplyImport={handleBulkImportBd}
      />

      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-2.5 rounded-md shadow-lg border border-slate-700"
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}
