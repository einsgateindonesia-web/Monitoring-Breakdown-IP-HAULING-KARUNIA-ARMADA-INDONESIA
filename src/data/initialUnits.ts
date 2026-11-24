import { BdStatus, FleetGroup, FleetUnit } from '../types/fleet';

export const RAW_INITIAL_UNIT_CODES: string[] = [
  'PMSC 037',
  'PMSC 039',
  'PMSC 050',
  'PMSC 051',
  'PMSC 052',
  'PMSC 053',
  'PMSC 055',
  'PMSC 056',
  'PMSC 208',
  'PMSC 209',
  'PMSC 210',
  'PMSC 211',
  'PMSC 212',
  'PMSC 215',
  'PMSC 216',
  'PMSC 217',
  'PMSC 218',
  'PMSC 219',
  'PMSC 101',
  'PMVV 103',
  'PMVV 110',
  'PMVV 111',
  'PMVV 112',
  'PMVV 118',
  'PMVV 120',
  'PMVV 121',
  'PMVV 122',
  'PMVV 123',
  'PMVV 125',
  'PMVV 136',
  'PMVV 137',
  'PMVV 138',
  'PMVV 151',
  'PMVV 152',
  'PMVV 155',
  'PMVV 156',
  'PMVV 158',
  'PMVV 159',
  'PMVV 160',
  'PMVV 161',
  'PMVV 162',
  'PMVV 163',
  'PMVV 165',
  'PMVV 166',
  'PMVV 169',
  'PMVV 170',
  'PMVV 171',
  'PMVV 172',
  'PMVV 173',
  'PMVV 175',
  'PMVV 176',
  'PMVV 177',
  'PMVV 178',
  'PMVV 179',
  'PMVV 180',
  'PMVV 181',
  'PMVV 182',
  'PMVV 185',
  'PMVV 187',
  'PMVV 190',
  'PMVV 191',
  'PMVV 192',
  'PMVV 195',
  'PMVV 196',
  'PMVV 197',
  'PMVV 198',
  'PMVV 199',
  'PMVV 200',
  'PMVV 201',
  'PMVV 203',
  'PMVV 205',
  'PMVV 206',
  'PMVV 207',
  'PMVV 233',
  'PMVV 235',
];

export const MAX_SPREADSHEET_SLOTS = 114;

export function detectFleetGroup(code: string): FleetGroup {
  const upper = code.trim().toUpperCase();
  if (upper.startsWith('PMSC')) return 'PMSC';
  if (upper.startsWith('PMVV')) return 'PMVV';
  return 'LAINNYA';
}

export const INITIAL_FLEET_UNITS: FleetUnit[] = RAW_INITIAL_UNIT_CODES.map((code, index) => ({
  id: `unit-${index + 1}`,
  code,
  fleetGroup: detectFleetGroup(code),
  orderIndex: index + 1,
}));

export const BD_LOCATION_SUGGESTIONS: string[] = [
  'Workshop IP',
  'Hauling Road',
  'KM 0',
  'KM 5',
  'KM 10',
  'KM 15',
  'KM 20',
  'Pit / Front Loading',
  'ROM / Stockpile',
  'Crusher / Hopper',
  'Jetty / Port',
  'Fuel Station',
  'Parkiran / Staging',
];

export interface BdStatusMeta {
  no: number;
  code: BdStatus;
  label: string;
}

export const BD_STATUS_CATALOG: BdStatusMeta[] = [
  { no: 1, code: 'BS', label: 'Scheduled Maintenance' },
  { no: 2, code: 'B0', label: 'BUS (On Progress)' },
  { no: 3, code: 'B1', label: 'BUS (Waiting Part)' },
  { no: 4, code: 'B2', label: 'BUS (Waiting Man power)' },
  { no: 5, code: 'B3', label: 'BUS (Warranty Dealer)' },
  { no: 6, code: 'B4', label: 'BUS (Accident, Fiss Opt, Fiss Apl)' },
  { no: 7, code: 'B5', label: 'BUS (Breakdown Tyre)' },
  { no: 8, code: 'B6', label: 'BUS (Out Site Repair)' },
  { no: 9, code: 'B7', label: 'BUS (Waiting Transportation)' },
  { no: 10, code: 'B8', label: 'BUS (Waiting Vessel)' },
  { no: 11, code: 'B9', label: 'BUS (Waiting Tool)' },
  { no: 12, code: 'B10', label: 'BUS (Bad Weather)' },
];

export const BD_STATUS_OPTIONS: BdStatus[] = BD_STATUS_CATALOG.map((item) => item.code);

export const BD_STATUS_LABELS: Record<BdStatus, string> = BD_STATUS_CATALOG.reduce(
  (acc, item) => {
    acc[item.code] = item.label;
    return acc;
  },
  {} as Record<BdStatus, string>
);

export function formatBdStatus(code: BdStatus): string {
  const label = BD_STATUS_LABELS[code];
  return label ? `${code} · ${label}` : code;
}

const LEGACY_STATUS_MAP: Record<string, BdStatus> = {
  'Scheduled PM': 'BS',
  Diagnosa: 'B0',
  'In Progress': 'B0',
  'Waiting Part': 'B1',
  'Waiting Mechanic': 'B2',
  'Vendor / Subkon': 'B6',
  Hold: 'B10',
};

export function normalizeBdStatus(raw: string | undefined): BdStatus {
  if (!raw) return 'B0';
  if ((BD_STATUS_OPTIONS as string[]).includes(raw)) {
    return raw as BdStatus;
  }
  return LEGACY_STATUS_MAP[raw] ?? 'B0';
}

export const BD_STATUS_STYLES: Record<
  BdStatus,
  { text: string; bg: string; border: string; bar: string }
> = {
  BS: {
    text: 'text-teal-800',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    bar: 'bg-teal-600',
  },
  B0: {
    text: 'text-blue-800',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    bar: 'bg-blue-600',
  },
  B1: {
    text: 'text-red-800',
    bg: 'bg-red-50',
    border: 'border-red-200',
    bar: 'bg-red-600',
  },
  B2: {
    text: 'text-orange-800',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    bar: 'bg-orange-500',
  },
  B3: {
    text: 'text-indigo-800',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    bar: 'bg-indigo-600',
  },
  B4: {
    text: 'text-rose-900',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    bar: 'bg-rose-700',
  },
  B5: {
    text: 'text-amber-800',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    bar: 'bg-amber-500',
  },
  B6: {
    text: 'text-slate-800',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
    bar: 'bg-slate-600',
  },
  B7: {
    text: 'text-amber-900',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    bar: 'bg-amber-600',
  },
  B8: {
    text: 'text-cyan-800',
    bg: 'bg-cyan-50',
    border: 'border-cyan-200',
    bar: 'bg-cyan-600',
  },
  B9: {
    text: 'text-orange-900',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    bar: 'bg-orange-600',
  },
  B10: {
    text: 'text-slate-700',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
    bar: 'bg-slate-500',
  },
};
