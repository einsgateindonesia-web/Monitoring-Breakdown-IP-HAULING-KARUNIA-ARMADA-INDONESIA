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
  keterangan: string;
  status: BdStatus;
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
  keterangan: string;
  lastStatus: BdStatus;
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

