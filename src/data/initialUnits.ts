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

export const BD_STATUS_OPTIONS: BdStatus[] = [
  'Diagnosa',
  'In Progress',
  'Waiting Part',
  'Waiting Mechanic',
  'Vendor / Subkon',
  'Scheduled PM',
  'Hold',
];

export const BD_STATUS_STYLES: Record<
  BdStatus,
  { text: string; bg: string; border: string; bar: string }
> = {
  Diagnosa: {
    text: 'text-amber-800',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    bar: 'bg-amber-500',
  },
  'In Progress': {
    text: 'text-blue-800',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    bar: 'bg-blue-600',
  },
  'Waiting Part': {
    text: 'text-red-800',
    bg: 'bg-red-50',
    border: 'border-red-200',
    bar: 'bg-red-600',
  },
  'Waiting Mechanic': {
    text: 'text-orange-800',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    bar: 'bg-orange-500',
  },
  'Vendor / Subkon': {
    text: 'text-slate-800',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
    bar: 'bg-slate-600',
  },
  'Scheduled PM': {
    text: 'text-teal-800',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    bar: 'bg-teal-600',
  },
  Hold: {
    text: 'text-rose-900',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    bar: 'bg-rose-700',
  },
};
