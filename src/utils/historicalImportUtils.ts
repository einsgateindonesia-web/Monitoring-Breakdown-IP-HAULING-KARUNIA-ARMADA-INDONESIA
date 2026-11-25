import * as XLSX from 'xlsx';
import { BD_STATUS_CATALOG, detectFleetGroup } from '../data/initialUnits';
import { BdStatus, RfuHistoryRecord } from '../types/fleet';
import {
  parseExcelBdStatus,
  parseExcelDateToYYYYMMDD,
  parseExcelTimeTo24h,
} from './bdImportUtils';
import { getCurrentDateYYYYMMDD, parseMrInput } from './fleetUtils';

export interface ParsedHistoricalImportRow {
  rowNumber: number;
  unitCode: string;
  tanggalBd: string;
  jamBd: string;
  tanggalRfu: string;
  jamRfu: string;
  lokasi: string;
  mrNumbers: string[];
  picMekanik: string;
  keterangan: string;
  komponen: string;
  subKomponen: string;
  detailSubKomponen: string;
  activityPerbaikan: string;
  lastStatus: BdStatus;
  dedupKey: string;
}

export interface ParsedHistoricalWorkbookResult {
  sheetNames: string[];
  activeSheet: string;
  rows: ParsedHistoricalImportRow[];
  emptySkipped: number;
}

type HistColKey =
  | 'no'
  | 'unit'
  | 'tglBd'
  | 'jamBd'
  | 'tglRfu'
  | 'jamRfu'
  | 'lokasi'
  | 'mr'
  | 'pic'
  | 'keterangan'
  | 'komponen'
  | 'subKomponen'
  | 'detailSubKomponen'
  | 'activity'
  | 'status';

function normalizeCellText(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function normalizeUnitCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, ' ');
}

function looksLikeUnitCode(raw: string): boolean {
  const clean = normalizeUnitCode(raw);
  if (!clean || /^\d+$/.test(clean)) return false;
  return /[A-Z]/.test(clean) && /\d/.test(clean);
}

export function buildRfuDedupKey(item: {
  unitCode: string;
  tanggalBd: string;
  jamBd: string;
  tanggalRfu: string;
  jamRfu: string;
}): string {
  return [
    item.unitCode.trim().toUpperCase(),
    item.tanggalBd.trim(),
    item.jamBd.trim(),
    item.tanggalRfu.trim(),
    item.jamRfu.trim(),
  ].join('|');
}

function identifyHistHeaderKey(headerRaw: string): HistColKey | null {
  const h = headerRaw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!h) return null;

  if (h === 'NO' || h === 'NO.' || h === 'NOMOR') return 'no';
  if (
    h === 'UNIT' ||
    h === 'UNIT BD' ||
    h === 'KODE UNIT' ||
    h === 'NO UNIT' ||
    h === 'CN' ||
    h.includes('UNIT BD') ||
    h.includes('KODE UNIT')
  ) {
    return 'unit';
  }
  if (
    h.includes('TGL RFU') ||
    h.includes('TANGGAL RFU') ||
    h.includes('TGL SELESAI') ||
    h.includes('TANGGAL SELESAI') ||
    h === 'DATE RFU'
  ) {
    return 'tglRfu';
  }
  if (
    h.includes('JAM RFU') ||
    h.includes('WAKTU RFU') ||
    h.includes('JAM SELESAI') ||
    h === 'TIME RFU'
  ) {
    return 'jamRfu';
  }
  if (
    h.includes('TGL BD') ||
    h.includes('TANGGAL BD') ||
    h.includes('TANGGAL') ||
    h.includes('TGL') ||
    h === 'DATE'
  ) {
    return 'tglBd';
  }
  if (
    h.includes('JAM BD') ||
    h.includes('WAKTU BD') ||
    h.includes('JAM') ||
    h === 'TIME' ||
    h === 'PUKUL'
  ) {
    return 'jamBd';
  }
  if (
    h.includes('LOKASI') ||
    h.includes('POSISI') ||
    h.includes('AREA') ||
    h.includes('SITE')
  ) {
    return 'lokasi';
  }
  if (
    h === 'MR' ||
    h === 'NO MR' ||
    h === 'NO. MR' ||
    h === 'NOMOR MR' ||
    h.includes('NOMOR MR') ||
    h.includes('NO MR') ||
    h.includes('MATERIAL REQUEST')
  ) {
    return 'mr';
  }
  if (h.includes('PIC') || h.includes('MEKANIK')) return 'pic';
  if (h.includes('DETAIL SUB')) return 'detailSubKomponen';
  if (h.includes('SUB KOMPONEN') || h.includes('SUBKOMPONEN')) return 'subKomponen';
  if (h === 'KOMPONEN' || h.includes('KOMPONEN')) return 'komponen';
  if (
    h.includes('ACTIVITY') ||
    h.includes('PERBAIKAN') ||
    h.includes('TINDAKAN') ||
    h.includes('ACTION')
  ) {
    return 'activity';
  }
  if (
    h.includes('KETERANGAN') ||
    h.includes('PROBLEM') ||
    h.includes('KELUHAN') ||
    h.includes('REMARK') ||
    h.includes('DESC')
  ) {
    return 'keterangan';
  }
  if (h.includes('STATUS')) return 'status';

  return null;
}

function parseMatrixToHistoricalRows(matrix: unknown[][]): {
  rows: ParsedHistoricalImportRow[];
  emptySkipped: number;
} {
  const defaultDate = getCurrentDateYYYYMMDD();

  const nonEmptyRows = matrix
    .map((cells, idx) => ({
      originalRowNumber: idx + 1,
      cells: Array.isArray(cells) ? cells : [],
    }))
    .filter((r) => r.cells.some((c) => normalizeCellText(c) !== ''));

  if (nonEmptyRows.length === 0) {
    return { rows: [], emptySkipped: 0 };
  }

  let headerRowIdx = -1;
  let colMap: Partial<Record<HistColKey, number>> = {};

  for (let i = 0; i < Math.min(5, nonEmptyRows.length); i++) {
    const candidateMap: Partial<Record<HistColKey, number>> = {};
    let matchedCount = 0;
    nonEmptyRows[i].cells.forEach((cell, colIdx) => {
      const key = identifyHistHeaderKey(normalizeCellText(cell));
      if (key && candidateMap[key] === undefined) {
        candidateMap[key] = colIdx;
        matchedCount += 1;
      }
    });
    if (candidateMap.unit !== undefined && matchedCount >= 2) {
      headerRowIdx = i;
      colMap = candidateMap;
      break;
    }
  }

  const dataRows = headerRowIdx >= 0 ? nonEmptyRows.slice(headerRowIdx + 1) : nonEmptyRows;
  const parsedRows: ParsedHistoricalImportRow[] = [];
  let emptySkipped = 0;

  for (const row of dataRows) {
    const cells = row.cells;

    let unitRaw = '';
    let tglBdRaw: unknown = '';
    let jamBdRaw: unknown = '';
    let tglRfuRaw: unknown = '';
    let jamRfuRaw: unknown = '';
    let lokasiRaw = '';
    let mrRaw = '';
    let picRaw = '';
    let ketRaw = '';
    let komponenRaw = '';
    let subKomponenRaw = '';
    let detailSubRaw = '';
    let activityRaw = '';
    let statusRaw = '';

    if (headerRowIdx >= 0) {
      unitRaw = colMap.unit !== undefined ? normalizeCellText(cells[colMap.unit]) : '';
      tglBdRaw = colMap.tglBd !== undefined ? cells[colMap.tglBd] : '';
      jamBdRaw = colMap.jamBd !== undefined ? cells[colMap.jamBd] : '';
      tglRfuRaw = colMap.tglRfu !== undefined ? cells[colMap.tglRfu] : '';
      jamRfuRaw = colMap.jamRfu !== undefined ? cells[colMap.jamRfu] : '';
      lokasiRaw = colMap.lokasi !== undefined ? normalizeCellText(cells[colMap.lokasi]) : '';
      mrRaw = colMap.mr !== undefined ? normalizeCellText(cells[colMap.mr]) : '';
      picRaw = colMap.pic !== undefined ? normalizeCellText(cells[colMap.pic]) : '';
      ketRaw = colMap.keterangan !== undefined ? normalizeCellText(cells[colMap.keterangan]) : '';
      komponenRaw = colMap.komponen !== undefined ? normalizeCellText(cells[colMap.komponen]) : '';
      subKomponenRaw =
        colMap.subKomponen !== undefined ? normalizeCellText(cells[colMap.subKomponen]) : '';
      detailSubRaw =
        colMap.detailSubKomponen !== undefined
          ? normalizeCellText(cells[colMap.detailSubKomponen])
          : '';
      activityRaw = colMap.activity !== undefined ? normalizeCellText(cells[colMap.activity]) : '';
      statusRaw = colMap.status !== undefined ? normalizeCellText(cells[colMap.status]) : '';
    } else {
      // Positional fallback without header:
      // [NO?], UNIT, TGL BD, JAM BD, TGL RFU, JAM RFU, LOKASI, MR, KETERANGAN, KOMPONEN, ACTIVITY, STATUS
      const c0 = normalizeCellText(cells[0]);
      const c1 = normalizeCellText(cells[1]);
      const startCol = /^\d+$/.test(c0) && looksLikeUnitCode(c1) ? 1 : 0;

      unitRaw = normalizeCellText(cells[startCol]);
      tglBdRaw = cells[startCol + 1];
      jamBdRaw = cells[startCol + 2];
      tglRfuRaw = cells[startCol + 3];
      jamRfuRaw = cells[startCol + 4];
      lokasiRaw = normalizeCellText(cells[startCol + 5]);
      mrRaw = normalizeCellText(cells[startCol + 6]);
      ketRaw = normalizeCellText(cells[startCol + 7]);
      komponenRaw = normalizeCellText(cells[startCol + 8]);
      activityRaw = normalizeCellText(cells[startCol + 9]);
      statusRaw = normalizeCellText(cells[startCol + 10]);
    }

    const unitCode = normalizeUnitCode(unitRaw);
    if (!unitCode || identifyHistHeaderKey(unitCode) === 'unit') {
      emptySkipped += 1;
      continue;
    }

    const tanggalBd = parseExcelDateToYYYYMMDD(tglBdRaw, defaultDate);
    const jamBd = parseExcelTimeTo24h(jamBdRaw, '00:00');
    const tanggalRfu = parseExcelDateToYYYYMMDD(tglRfuRaw, tanggalBd);
    const jamRfu = parseExcelTimeTo24h(jamRfuRaw, jamBd);

    const dedupKey = buildRfuDedupKey({
      unitCode,
      tanggalBd,
      jamBd,
      tanggalRfu,
      jamRfu,
    });

    parsedRows.push({
      rowNumber: row.originalRowNumber,
      unitCode,
      tanggalBd,
      jamBd,
      tanggalRfu,
      jamRfu,
      lokasi: lokasiRaw,
      mrNumbers: parseMrInput(mrRaw),
      picMekanik: picRaw,
      keterangan: ketRaw,
      komponen: komponenRaw,
      subKomponen: subKomponenRaw,
      detailSubKomponen: detailSubRaw,
      activityPerbaikan: activityRaw,
      lastStatus: parseExcelBdStatus(statusRaw),
      dedupKey,
    });
  }

  return { rows: parsedRows, emptySkipped };
}

export function parseHistoricalExcelBuffer(
  buffer: ArrayBuffer,
  preferredSheet?: string
): ParsedHistoricalWorkbookResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetNames = workbook.SheetNames;
  const activeSheet =
    preferredSheet && sheetNames.includes(preferredSheet)
      ? preferredSheet
      : sheetNames[0] ?? '';

  if (!activeSheet) {
    return {
      sheetNames: [],
      activeSheet: '',
      rows: [],
      emptySkipped: 0,
    };
  }

  const sheet = workbook.Sheets[activeSheet];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
  });

  const parsed = parseMatrixToHistoricalRows(matrix);
  return {
    sheetNames,
    activeSheet,
    ...parsed,
  };
}

export function parseHistoricalPastedOrCsvText(rawText: string): {
  rows: ParsedHistoricalImportRow[];
  emptySkipped: number;
} {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { rows: [], emptySkipped: 0 };
  }

  const lines = trimmed.split(/\r?\n/);
  const matrix: string[][] = lines.map((line) => {
    if (line.includes('\t')) {
      return line.split('\t').map((c) => c.replace(/^["']|["']$/g, '').trim());
    }
    if (line.includes(';')) {
      return line.split(';').map((c) => c.replace(/^["']|["']$/g, '').trim());
    }
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  });

  return parseMatrixToHistoricalRows(matrix);
}

export function convertHistoricalImportRowToRfu(
  row: ParsedHistoricalImportRow,
  idx: number
): RfuHistoryRecord {
  return {
    id: `rfu-imp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
    unitCode: row.unitCode,
    fleetGroup: detectFleetGroup(row.unitCode),
    tanggalBd: row.tanggalBd,
    jamBd: row.jamBd,
    tanggalRfu: row.tanggalRfu,
    jamRfu: row.jamRfu,
    lokasi: row.lokasi,
    mrNumbers: row.mrNumbers,
    keterangan: row.keterangan,
    komponen: row.komponen,
    subKomponen: row.subKomponen,
    detailSubKomponen: row.detailSubKomponen,
    activityPerbaikan: row.activityPerbaikan,
    lastStatus: row.lastStatus,
    picMekanik: row.picMekanik,
  };
}

export function downloadHistoricalExcelTemplate(): void {
  const today = getCurrentDateYYYYMMDD();
  const sampleRows = [
    [
      'NO',
      'UNIT',
      'TGL BD',
      'JAM BD',
      'TGL RFU',
      'JAM RFU',
      'POSISI / LOKASI',
      'NOMOR MR',
      'PIC MEKANIK',
      'KETERANGAN PROBLEM',
      'KOMPONEN',
      'SUB KOMPONEN',
      'DETAIL SUB KOMPONEN',
      'ACTIVITY PERBAIKAN',
      'STATUS',
    ],
    [
      1,
      'PMSC 037',
      today,
      '07:30',
      today,
      '11:45',
      'KM 12',
      'MR-24011',
      'Budi',
      'Hose hidrolik dump bocor',
      'Hydraulic System',
      'Hose & Fitting',
      'Hose High Pressure',
      'Replace hose hidrolik & top up oli',
      'B0',
    ],
    [
      2,
      'PMVV 110',
      today,
      '13:00',
      today,
      '16:15',
      'Workshop IP',
      'MR-24015, MR-24016',
      'Andi',
      'Filter solar buntu / low power',
      'Engine',
      'Fuel System',
      'Fuel Filter',
      'Replace fuel filter & bleeding',
      'B1',
    ],
  ];

  const statusRefRows = [
    ['NO', 'CODE', 'KETERANGAN STATUS'],
    ...BD_STATUS_CATALOG.map((s) => [s.no, s.code, s.label]),
  ];

  const wb = XLSX.utils.book_new();
  const wsHist = XLSX.utils.aoa_to_sheet(sampleRows);
  wsHist['!cols'] = [
    { wch: 5 },
    { wch: 13 },
    { wch: 12 },
    { wch: 9 },
    { wch: 12 },
    { wch: 9 },
    { wch: 18 },
    { wch: 20 },
    { wch: 14 },
    { wch: 28 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 28 },
    { wch: 10 },
  ];

  const wsRef = XLSX.utils.aoa_to_sheet(statusRefRows);
  wsRef['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 38 }];

  XLSX.utils.book_append_sheet(wb, wsHist, 'Histori_BD_RFU');
  XLSX.utils.book_append_sheet(wb, wsRef, 'Referensi_Status');

  XLSX.writeFile(wb, `template-import-histori-bd-${today}.xlsx`);
}
