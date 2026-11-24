import * as XLSX from 'xlsx';
import { BD_STATUS_CATALOG, BD_STATUS_OPTIONS, detectFleetGroup } from '../data/initialUnits';
import { BdStatus } from '../types/fleet';
import { normalizeTime24 } from '../components/Time24Input';
import { getCurrentDateYYYYMMDD, getCurrentTimeHHMM, parseMrInput } from './fleetUtils';

export interface ParsedBdImportRow {
  rowNumber: number;
  unitCode: string;
  jamBd: string;
  tanggalBd: string;
  lokasi: string;
  mrNumbers: string[];
  keterangan: string;
  status: BdStatus;
  rawStatus: string;
}

export interface ParsedBdWorkbookResult {
  sheetNames: string[];
  activeSheet: string;
  rows: ParsedBdImportRow[];
  duplicateSkipped: number;
  emptySkipped: number;
}

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
  // Typical fleet unit codes contain letters and digits, e.g. PMSC 037, PMVV 235, DT-01
  return /[A-Z]/.test(clean) && /\d/.test(clean);
}

/**
 * Converts Excel serial time (0..1) or text ("08:30", "8.30", "0830", "24:00") into HH:mm.
 */
export function parseExcelTimeTo24h(raw: unknown, fallbackTime: string): string {
  if (raw === null || raw === undefined || raw === '') return fallbackTime;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Excel fractional day (or date+time serial number)
    const frac = raw >= 1 ? raw % 1 : raw;
    if (frac === 0 && raw >= 1) {
      // Exact midnight or 24:00 if raw === 1
      return raw === 1 ? '24:00' : fallbackTime;
    }
    const totalMinutes = Math.round(frac * 24 * 60);
    if (totalMinutes >= 24 * 60) return '24:00';
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  const str = String(raw).trim();
  if (!str) return fallbackTime;

  // Handle "08:30:00" or "08.30.00"
  const hhmmssMatch = str.match(/^(\d{1,2})[:.](\d{1,2})(?:[:.]\d{1,2})?$/);
  if (hhmmssMatch) {
    const candidate = `${hhmmssMatch[1]}:${hhmmssMatch[2]}`;
    return normalizeTime24(candidate) ?? fallbackTime;
  }

  return normalizeTime24(str) ?? fallbackTime;
}

/**
 * Converts Excel serial date or DD/MM/YYYY / YYYY-MM-DD strings into YYYY-MM-DD.
 */
export function parseExcelDateToYYYYMMDD(raw: unknown, fallbackDate: string): string {
  if (raw === null || raw === undefined || raw === '') return fallbackDate;

  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 20000) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  const str = String(raw).trim();
  if (!str) return fallbackDate;

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }

  return fallbackDate;
}

export function parseExcelBdStatus(raw: unknown): BdStatus {
  const str = normalizeCellText(raw).toUpperCase();
  if (!str) return 'B0';

  // Exact match
  if ((BD_STATUS_OPTIONS as string[]).includes(str)) {
    return str as BdStatus;
  }

  // Leading code match e.g. "B1 - BUS (Waiting Part)" or "B10 · Bad Weather"
  const codeMatch = str.match(/^(BS|B10|B[0-9])\b/);
  if (codeMatch && (BD_STATUS_OPTIONS as string[]).includes(codeMatch[1])) {
    return codeMatch[1] as BdStatus;
  }

  // Keyword match from company catalog labels
  if (str.includes('SCHEDULE') || str.includes('PM') || str.includes('PS')) return 'BS';
  if (str.includes('PROGRESS')) return 'B0';
  if (str.includes('PART')) return 'B1';
  if (str.includes('MAN POWER') || str.includes('MANPOWER') || str.includes('MEKANIK')) return 'B2';
  if (str.includes('WARRANTY') || str.includes('DEALER')) return 'B3';
  if (str.includes('ACCIDENT') || str.includes('FISS')) return 'B4';
  if (str.includes('TYRE') || str.includes('TIRE') || str.includes('BAN')) return 'B5';
  if (str.includes('OUT SITE') || str.includes('OUTSITE') || str.includes('VENDOR')) return 'B6';
  if (str.includes('TRANSPORT')) return 'B7';
  if (str.includes('VESSEL')) return 'B8';
  if (str.includes('TOOL')) return 'B9';
  if (str.includes('WEATHER') || str.includes('CUACA') || str.includes('HUJAN')) return 'B10';

  return 'B0';
}

type ColumnKey = 'no' | 'unit' | 'jam' | 'tanggal' | 'lokasi' | 'mr' | 'keterangan' | 'status';

function identifyHeaderKey(headerRaw: string): ColumnKey | null {
  const h = headerRaw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!h) return null;

  if (h === 'NO' || h === 'NO.' || h === 'NO BD' || h === 'NOMOR') return 'no';
  if (
    h === 'UNIT' ||
    h === 'UNIT BD' ||
    h === 'KODE UNIT' ||
    h === 'NO UNIT' ||
    h === 'CODE' ||
    h === 'CN' ||
    h.includes('UNIT BD') ||
    h.includes('KODE UNIT')
  ) {
    return 'unit';
  }
  if (h.includes('JAM') || h === 'TIME' || h === 'WAKTU' || h === 'PUKUL') return 'jam';
  if (h.includes('TANGGAL') || h.includes('TGL') || h === 'DATE') return 'tanggal';
  if (
    h.includes('LOKASI') ||
    h.includes('POSISI') ||
    h.includes('AREA') ||
    h.includes('SITE') ||
    h.includes('LOCATION')
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
    h.includes('MATERIAL REQUEST') ||
    h.includes('KODE MR')
  ) {
    return 'mr';
  }
  if (
    h.includes('KETERANGAN') ||
    h.includes('PROBLEM') ||
    h.includes('KELUHAN') ||
    h.includes('REMARK') ||
    h.includes('CATATAN') ||
    h.includes('DESC')
  ) {
    return 'keterangan';
  }
  if (h.includes('STATUS')) return 'status';

  return null;
}

function parseMatrixToBdRows(matrix: unknown[][]): {
  rows: ParsedBdImportRow[];
  duplicateSkipped: number;
  emptySkipped: number;
} {
  const defaultDate = getCurrentDateYYYYMMDD();
  const defaultTime = getCurrentTimeHHMM();

  // Filter completely blank rows while preserving row positions
  const nonEmptyRows = matrix
    .map((cells, idx) => ({
      originalRowNumber: idx + 1,
      cells: Array.isArray(cells) ? cells : [],
    }))
    .filter((r) => r.cells.some((c) => normalizeCellText(c) !== ''));

  if (nonEmptyRows.length === 0) {
    return { rows: [], duplicateSkipped: 0, emptySkipped: 0 };
  }

  // Detect header row within first 5 non-empty rows
  let headerRowIdx = -1;
  let colMap: Partial<Record<ColumnKey, number>> = {};

  for (let i = 0; i < Math.min(5, nonEmptyRows.length); i++) {
    const candidateMap: Partial<Record<ColumnKey, number>> = {};
    let matchedCount = 0;
    nonEmptyRows[i].cells.forEach((cell, colIdx) => {
      const key = identifyHeaderKey(normalizeCellText(cell));
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
  const seenUnits = new Set<string>();
  const parsedRows: ParsedBdImportRow[] = [];
  let duplicateSkipped = 0;
  let emptySkipped = 0;

  for (const row of dataRows) {
    const cells = row.cells;

    let unitRaw = '';
    let jamRaw: unknown = '';
    let tanggalRaw: unknown = '';
    let lokasiRaw = '';
    let mrRaw = '';
    let ketRaw = '';
    let statusRaw = '';

    if (headerRowIdx >= 0) {
      unitRaw = colMap.unit !== undefined ? normalizeCellText(cells[colMap.unit]) : '';
      jamRaw = colMap.jam !== undefined ? cells[colMap.jam] : '';
      tanggalRaw = colMap.tanggal !== undefined ? cells[colMap.tanggal] : '';
      lokasiRaw = colMap.lokasi !== undefined ? normalizeCellText(cells[colMap.lokasi]) : '';
      mrRaw = colMap.mr !== undefined ? normalizeCellText(cells[colMap.mr]) : '';
      ketRaw = colMap.keterangan !== undefined ? normalizeCellText(cells[colMap.keterangan]) : '';
      statusRaw = colMap.status !== undefined ? normalizeCellText(cells[colMap.status]) : '';
    } else {
      // Positional fallback when pasted without header row:
      // Detect if column 0 is a plain row number (1, 2, 3...) and column 1 is a unit code
      const c0 = normalizeCellText(cells[0]);
      const c1 = normalizeCellText(cells[1]);
      const startCol = /^\d+$/.test(c0) && looksLikeUnitCode(c1) ? 1 : 0;

      unitRaw = normalizeCellText(cells[startCol]);
      const next1 = cells[startCol + 1];
      const next2 = cells[startCol + 2];
      const next3 = cells[startCol + 3];
      const next4 = cells[startCol + 4];
      const next5 = cells[startCol + 5];
      const next6 = cells[startCol + 6];

      // Check if next2 looks like a date (YYYY-MM-DD / DD/MM/YYYY / Excel date serial)
      const next2Str = normalizeCellText(next2);
      const hasDateCol =
        (typeof next2 === 'number' && next2 > 20000) ||
        /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(next2Str) ||
        /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(next2Str);

      if (hasDateCol) {
        jamRaw = next1;
        tanggalRaw = next2;
        lokasiRaw = normalizeCellText(next3);
        if (next6 !== undefined && normalizeCellText(next6) !== '') {
          mrRaw = normalizeCellText(next4);
          ketRaw = normalizeCellText(next5);
          statusRaw = normalizeCellText(next6);
        } else {
          ketRaw = normalizeCellText(next4);
          statusRaw = normalizeCellText(next5);
        }
      } else {
        jamRaw = next1;
        lokasiRaw = normalizeCellText(next2);
        if (next5 !== undefined && normalizeCellText(next5) !== '') {
          mrRaw = normalizeCellText(next3);
          ketRaw = normalizeCellText(next4);
          statusRaw = normalizeCellText(next5);
        } else {
          ketRaw = normalizeCellText(next3);
          statusRaw = normalizeCellText(next4);
        }
      }
    }

    const unitCode = normalizeUnitCode(unitRaw);
    if (!unitCode || identifyHeaderKey(unitCode) === 'unit') {
      emptySkipped += 1;
      continue;
    }

    if (seenUnits.has(unitCode)) {
      duplicateSkipped += 1;
      continue;
    }
    seenUnits.add(unitCode);

    parsedRows.push({
      rowNumber: row.originalRowNumber,
      unitCode,
      jamBd: parseExcelTimeTo24h(jamRaw, defaultTime),
      tanggalBd: parseExcelDateToYYYYMMDD(tanggalRaw, defaultDate),
      lokasi: lokasiRaw,
      mrNumbers: parseMrInput(mrRaw),
      keterangan: ketRaw,
      status: parseExcelBdStatus(statusRaw),
      rawStatus: statusRaw,
    });
  }

  return { rows: parsedRows, duplicateSkipped, emptySkipped };
}

export function parseBdExcelBuffer(
  buffer: ArrayBuffer,
  preferredSheet?: string
): ParsedBdWorkbookResult {
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
      duplicateSkipped: 0,
      emptySkipped: 0,
    };
  }

  const sheet = workbook.Sheets[activeSheet];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
  });

  const parsed = parseMatrixToBdRows(matrix);
  return {
    sheetNames,
    activeSheet,
    ...parsed,
  };
}

export function parseBdPastedOrCsvText(rawText: string): {
  rows: ParsedBdImportRow[];
  duplicateSkipped: number;
  emptySkipped: number;
} {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { rows: [], duplicateSkipped: 0, emptySkipped: 0 };
  }

  const lines = trimmed.split(/\r?\n/);
  const matrix: string[][] = lines.map((line) => {
    // Prefer tab (Excel copy-paste), then semicolon, then comma
    if (line.includes('\t')) {
      return line.split('\t').map((c) => c.replace(/^["']|["']$/g, '').trim());
    }
    if (line.includes(';')) {
      return line.split(';').map((c) => c.replace(/^["']|["']$/g, '').trim());
    }
    // Simple CSV split supporting quoted cells
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

  return parseMatrixToBdRows(matrix);
}

export function downloadBdExcelTemplate(): void {
  const today = getCurrentDateYYYYMMDD();
  const sampleRows = [
    [
      'NO',
      'UNIT BD',
      'JAM BD',
      'TANGGAL BD',
      'POSISI / LOKASI BD',
      'NOMOR MR',
      'KETERANGAN',
      'STATUS',
    ],
    [
      1,
      'PMSC 037',
      '08:30',
      today,
      'KM 12',
      'MR-24011, MR-24012',
      'Hose hidrolik dump bocor',
      'B0',
    ],
    [
      2,
      'PMVV 110',
      '10:15',
      today,
      'Workshop IP',
      'MR-24015',
      'Waiting sparepart filter oli',
      'B1',
    ],
  ];

  const statusRefRows = [
    ['NO', 'CODE', 'KETERANGAN STATUS'],
    ...BD_STATUS_CATALOG.map((s) => [s.no, s.code, s.label]),
  ];

  const wb = XLSX.utils.book_new();
  const wsBd = XLSX.utils.aoa_to_sheet(sampleRows);
  wsBd['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 10 },
    { wch: 14 },
    { wch: 22 },
    { wch: 24 },
    { wch: 32 },
    { wch: 12 },
  ];

  const wsRef = XLSX.utils.aoa_to_sheet(statusRefRows);
  wsRef['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 38 }];

  XLSX.utils.book_append_sheet(wb, wsBd, 'Upload_BD');
  XLSX.utils.book_append_sheet(wb, wsRef, 'Referensi_Status');

  XLSX.writeFile(wb, `template-upload-bd-${today}.xlsx`);
}

export { detectFleetGroup };
