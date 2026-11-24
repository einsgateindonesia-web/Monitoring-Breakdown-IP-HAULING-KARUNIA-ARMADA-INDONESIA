export type FleetGroup = 'PMSC' | 'PMVV' | 'LAINNYA';

export type BdStatus =
  | 'Diagnosa'
  | 'In Progress'
  | 'Waiting Part'
  | 'Waiting Mechanic'
  | 'Vendor / Subkon'
  | 'Scheduled PM'
  | 'Hold';

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
  keterangan: string;
  lastStatus: BdStatus;
}

export type ActiveTab = 'board' | 'dashboard' | 'riwayat';
