export type FleetGroup = 'PMSC' | 'PMVV' | 'LAINNYA';

export type BdStatus =
  | 'BS'
  | 'B0'
  | 'B1'
  | 'B2'
  | 'B3'
  | 'B4'
  | 'B5'
  | 'B6'
  | 'B7'
  | 'B8'
  | 'B9'
  | 'B10';

export type PartStatus =
  | ''
  | 'WAITING_PR_PO'
  | 'ORDERED'
  | 'IN_TRANSIT'
  | 'READY_WAREHOUSE'
  | 'INSTALLED';

export interface FleetUnit {
  id: string;
  code: string;
  fleetGroup: FleetGroup;
  orderIndex: number;
}

export interface BreakdownRecord {
  id: string;
  unitCode: string;
  fleetGroup: FleetGroup;
  jamBd: string; // HH:mm format
  tanggalBd: string; // YYYY-MM-DD
  lokasi: string;
  mrNumbers: string[];
  keterangan: string;
  status: BdStatus;
  picMekanik?: string;
  etr?: string; // HH:mm estimasi ready
  partStatus?: PartStatus;
  partNote?: string;
  updatedAt: string;
}

export interface RfuHistoryRecord {
  id: string;
  unitCode: string;
  fleetGroup: FleetGroup;
  jamBd: string;
  tanggalBd: string;
  jamRfu: string;
  tanggalRfu: string;
  lokasi: string;
  mrNumbers: string[];
  keterangan: string; // Keterangan Problem
  komponen: string;
  subKomponen: string;
  detailSubKomponen: string;
  activityPerbaikan: string;
  lastStatus: BdStatus;
  picMekanik?: string;
}

export type ActiveTab = 'board' | 'dashboard' | 'riwayat';

export interface HourlySlotOverride {
  key: string; // `${shiftDate}__${slotIndex}`
  shiftDate: string; // YYYY-MM-DD
  slotIndex: number; // 0..24 (0 = 06:00 Shift 1, 12 = 18:00 Shift 2, 24 = 06:00 Akhir Shift 2)
  totalPopulasi: number;
  bdCount: number;
  updatedAt: string;
}

export interface HourlyMonitoringRow {
  key: string;
  slotIndex: number;
  hourLabel: string; // "06:00", "07:00", ...
  calendarDate: string; // YYYY-MM-DD
  shiftLabel: 'Shift 1' | 'Shift 2' | 'Akhir Shift 2';
  isElapsed: boolean;
  isCurrentHour: boolean;
  isManual: boolean;
  totalPopulasi: number;
  runningCount: number;
  bdCount: number;
  paPct: number;
  bdUnitCodes: string[];
}

export type AuditActionType =
  | 'INPUT_BD'
  | 'UPDATE_BD'
  | 'MARK_RFU'
  | 'CANCEL_BD'
  | 'IMPORT_BD'
  | 'UPDATE_PART'
  | 'HOURLY_OVERRIDE'
  | 'RFU_HISTORY'
  | 'FLEET_MASTER'
  | 'TARGET_PA'
  | 'TEAM_ROLE';

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO string
  actorUid: string;
  actorName: string;
  actionType: AuditActionType;
  summary: string;
  unitCode?: string;
}
