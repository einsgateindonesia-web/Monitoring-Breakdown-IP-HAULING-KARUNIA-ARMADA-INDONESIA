import {
  BD_STATUS_CATALOG,
  BD_STATUS_LABELS,
  PART_STATUS_LABELS,
  detectFleetGroup,
  formatBdStatus,
  normalizeBdStatus,
  normalizePartStatus,
} from '../data/initialUnits';
import {
  BdStatus,
  BreakdownRecord,
  FleetGroup,
  FleetUnit,
  HourlySlotOverride,
  PartStatus,
  RfuHistoryRecord,
} from '../types/fleet';
import {
  computeBdTimeSplit,
  computeEtrStatus,
  computeRfuTimeSplit,
  formatDurationId,
  formatMrNumbers,
  getCurrentDateYYYYMMDD,
  getCurrentTimeHHMM,
  isActivelyWaitingPart,
  normalizeMrList,
  parseMrInput,
} from '../utils/fleetUtils';
import { buildHistoricalTimeline } from '../utils/historicalBdUtils';
import { buildHourlyShiftRows, getCurrentOperationalShiftDate } from '../utils/hourlyShiftUtils';

export const MASTER_SPREADSHEET_DEFAULT_TITLE =
  'Master Data Monitoring Breakdown & RFU — IP HAULING KAI';

export const SHEET_TABS = [
  'Ringkasan',
  'Unit_BD_Aktif',
  'Riwayat_RFU',
  'PA_Per_Jam',
  'Populasi_Unit',
] as const;

export type MasterSheetTabName = (typeof SHEET_TABS)[number];

export class SheetsApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'SheetsApiError';
    this.status = status;
  }
}

export function extractSpreadsheetIdFromInput(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{10,128})/);
  if (urlMatch?.[1]) return urlMatch[1];
  if (/^[a-zA-Z0-9_-]{15,128}$/.test(trimmed)) return trimmed;
  return null;
}

export function buildSpreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`;
}

function quoteSheetRange(sheetTitle: string, range = 'A1:Z'): string {
  const safe = sheetTitle.replace(/'/g, "''");
  return `'${safe}'!${range}`;
}

async function sheetsFetch<T>(
  url: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = `Google Sheets API error (${res.status})`;
    try {
      const errJson = (await res.json()) as { error?: { message?: string } };
      if (errJson?.error?.message) {
        message = errJson.error.message;
      }
    } catch {
      // ignore json parse failure
    }
    throw new SheetsApiError(message, res.status);
  }

  return (await res.json()) as T;
}

interface SpreadsheetMetadataResponse {
  spreadsheetId: string;
  spreadsheetUrl?: string;
  properties?: { title?: string };
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
    };
  }>;
}

interface BatchGetValuesResponse {
  spreadsheetId: string;
  valueRanges?: Array<{
    range?: string;
    values?: unknown[][];
  }>;
}

export async function createOfficialMasterSpreadsheet(
  accessToken: string,
  title = MASTER_SPREADSHEET_DEFAULT_TITLE
): Promise<{
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
}> {
  const created = await sheetsFetch<SpreadsheetMetadataResponse>(
    'https://sheets.googleapis.com/v4/spreadsheets',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          title,
        },
        sheets: SHEET_TABS.map((tabTitle, index) => ({
          properties: {
            title: tabTitle,
            index,
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        })),
      }),
    }
  );

  const id = created.spreadsheetId;
  return {
    spreadsheetId: id,
    spreadsheetUrl: created.spreadsheetUrl || buildSpreadsheetUrl(id),
    spreadsheetTitle: created.properties?.title || title,
  };
}

export interface SyncWorkspaceSheetsParams {
  accessToken: string;
  spreadsheetId: string;
  masterUnits: FleetUnit[];
  runningUnits: FleetUnit[];
  bdRecords: BreakdownRecord[];
  rfuHistory: RfuHistoryRecord[];
  hourlyOverrides: Record<string, HourlySlotOverride>;
  targetPaPct: number;
  activeShiftDate: string;
}

export interface SyncWorkspaceSheetsResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
  lastRowSummary: string;
  counts: {
    activeBd: number;
    rfuHistory: number;
    hourlyRows: number;
    population: number;
  };
}

export async function syncAllDataToSingleSpreadsheet(
  params: SyncWorkspaceSheetsParams
): Promise<SyncWorkspaceSheetsResult> {
  const {
    accessToken,
    spreadsheetId,
    masterUnits,
    runningUnits,
    bdRecords,
    rfuHistory,
    hourlyOverrides,
    targetPaPct,
    activeShiftDate,
  } = params;

  const nowMs = Date.now();
  const todayStr = getCurrentDateYYYYMMDD();
  const nowTimeStr = getCurrentTimeHHMM();

  // 1. Always inspect existing spreadsheet metadata first (per Sheets API guidelines)
  const meta = await sheetsFetch<SpreadsheetMetadataResponse>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets(properties(sheetId,title))`,
    accessToken
  );

  const existingTitles = new Map<string, number>();
  for (const s of meta.sheets ?? []) {
    if (s.properties?.title && typeof s.properties.sheetId === 'number') {
      existingTitles.set(s.properties.title, s.properties.sheetId);
    }
  }

  const missingTabs = SHEET_TABS.filter((tab) => !existingTitles.has(tab));
  if (missingTabs.length > 0) {
    const addResp = await sheetsFetch<{
      replies?: Array<{ addSheet?: { properties?: { sheetId?: number; title?: string } } }>;
    }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: missingTabs.map((tabTitle) => ({
            addSheet: {
              properties: {
                title: tabTitle,
                gridProperties: { frozenRowCount: 1 },
              },
            },
          })),
        }),
      }
    );

    for (const rep of addResp.replies ?? []) {
      const props = rep.addSheet?.properties;
      if (props?.title && typeof props.sheetId === 'number') {
        existingTitles.set(props.title, props.sheetId);
      }
    }
  }

  // 2. Build Sheet 1: Ringkasan
  const totalPop = masterUnits.length;
  const livePaPct = totalPop > 0 ? Number(((runningUnits.length / totalPop) * 100).toFixed(1)) : 0;
  const pmscRun = runningUnits.filter((u) => u.fleetGroup === 'PMSC').length;
  const pmscBd = bdRecords.filter((b) => b.fleetGroup === 'PMSC').length;
  const pmvvRun = runningUnits.filter((u) => u.fleetGroup === 'PMVV').length;
  const pmvvBd = bdRecords.filter((b) => b.fleetGroup === 'PMVV').length;

  let activeRepairMinsTotal = 0;
  let waitingPartMinsTotal = 0;
  let overdueEtrCount = 0;
  for (const rec of bdRecords) {
    const split = computeBdTimeSplit(rec, nowMs);
    activeRepairMinsTotal += split.activeRepairMinutes;
    waitingPartMinsTotal += split.waitingPartMinutes;
    if (rec.etr?.trim()) {
      const etrEval = computeEtrStatus(rec.tanggalBd, rec.jamBd, rec.etr, nowMs);
      if (etrEval?.isOverdue) overdueEtrCount += 1;
    }
  }
  for (const rfu of rfuHistory) {
    const split = computeRfuTimeSplit(rfu);
    activeRepairMinsTotal += split.activeRepairMinutes;
    waitingPartMinsTotal += split.waitingPartMinutes;
  }

  const timeline = buildHistoricalTimeline(bdRecords, rfuHistory, nowMs);
  const repeatEventById = new Map<string, boolean>();
  for (const ev of timeline) {
    repeatEventById.set(ev.id, ev.isRepeatBd);
  }
  const totalRepeatCount = timeline.filter((ev) => ev.isRepeatBd).length;

  const ringkasanRows: (string | number)[][] = [
    ['METRIK / KATEGORI', 'NILAI', 'KETERANGAN'],
    ['Judul Sistem', 'Monitoring Breakdown IP HAULING — Karunia Armada Indonesia', 'Sinkronisasi Resmi (1 Link Tunggal)'],
    ['Terakhir Disinkronkan', `${todayStr} ${nowTimeStr}`, 'Waktu sinkronisasi terakhir dari aplikasi'],
    ['Total Populasi Armada', totalPop, 'Unit terdaftar aktif'],
    ['Unit Running Saat Ini', runningUnits.length, 'Unit beroperasi normal'],
    ['Unit Breakdown (BD) Aktif', bdRecords.length, `Overdue ETR: ${overdueEtrCount} unit`],
    ['Physical Availability (PA %) Saat Ini', livePaPct, `Target PA: ${targetPaPct.toFixed(1)}%`],
    ['Armada PMSC', `${pmscRun} Running / ${pmscBd} BD`, `Total ${pmscRun + pmscBd} unit`],
    ['Armada PMVV', `${pmvvRun} Running / ${pmvvBd} BD`, `Total ${pmvvRun + pmvvBd} unit`],
    ['Total Riwayat RFU & Histori BD', rfuHistory.length, `Repeat BD <=72 jam tercatat: ${totalRepeatCount} kejadian`],
    ['Akumulasi Kerja Mekanik (Menit)', activeRepairMinsTotal, formatDurationId(activeRepairMinsTotal)],
    ['Akumulasi Tunggu Part / Logistik (Menit)', waitingPartMinsTotal, formatDurationId(waitingPartMinsTotal)],
  ];

  // 3. Build Sheet 2: Unit_BD_Aktif
  const bdRows: (string | number)[][] = [
    [
      'No',
      'ID',
      'Kode Unit',
      'Grup Armada',
      'Tanggal BD',
      'Jam BD',
      'Durasi Total',
      'Durasi Total (Menit)',
      'Kerja Mekanik (Menit)',
      'Tunggu Part (Menit)',
      'Kode Status',
      'Status BD',
      'Lokasi / Posisi',
      'Nomor MR',
      'Nama Part Utama',
      'Status Part',
      'Catatan Part',
      'PIC Mekanik',
      'ETR',
      'Keterangan Problem',
      'Aksi (BD / RFU / BATAL)',
      'Terakhir Diubah',
    ],
  ];
  bdRecords.forEach((rec, idx) => {
    const split = computeBdTimeSplit(rec, nowMs);
    bdRows.push([
      idx + 1,
      rec.id,
      rec.unitCode,
      rec.fleetGroup,
      rec.tanggalBd,
      rec.jamBd,
      formatDurationId(split.totalMinutes),
      split.totalMinutes,
      split.activeRepairMinutes,
      split.waitingPartMinutes,
      rec.status,
      BD_STATUS_LABELS[rec.status] ?? rec.status,
      rec.lokasi ?? '',
      formatMrNumbers(rec.mrNumbers, ''),
      rec.partName ?? '',
      rec.partStatus ? PART_STATUS_LABELS[rec.partStatus] ?? rec.partStatus : '',
      rec.partNote ?? '',
      rec.picMekanik ?? '',
      rec.etr ?? '',
      rec.keterangan ?? '',
      'BD',
      rec.updatedAt ?? '',
    ]);
  });

  // 4. Build Sheet 3: Riwayat_RFU
  const rfuRows: (string | number)[][] = [
    [
      'No',
      'ID',
      'Kode Unit',
      'Grup Armada',
      'Tanggal BD',
      'Jam BD',
      'Tanggal RFU',
      'Jam RFU',
      'Durasi Total',
      'Durasi Total (Menit)',
      'Kerja Mekanik (Menit)',
      'Tunggu Part (Menit)',
      'Status Terakhir',
      'Lokasi / Posisi',
      'Nomor MR',
      'Nama Part Utama',
      'Komponen',
      'Sub Komponen',
      'Detail Sub Komponen',
      'Activity Perbaikan',
      'PIC Mekanik',
      'ETR',
      'Keterangan Problem',
      'Repeat BD <=72 Jam',
    ],
  ];
  rfuHistory.forEach((item, idx) => {
    const split = computeRfuTimeSplit(item);
    const isRepeat = repeatEventById.get(item.id) ?? false;
    rfuRows.push([
      idx + 1,
      item.id,
      item.unitCode,
      item.fleetGroup,
      item.tanggalBd,
      item.jamBd,
      item.tanggalRfu,
      item.jamRfu,
      formatDurationId(split.totalMinutes),
      split.totalMinutes,
      split.activeRepairMinutes,
      split.waitingPartMinutes,
      formatBdStatus(item.lastStatus),
      item.lokasi ?? '',
      formatMrNumbers(normalizeMrList(item.mrNumbers), ''),
      item.partName ?? '',
      item.komponen ?? '',
      item.subKomponen ?? '',
      item.detailSubKomponen ?? '',
      item.activityPerbaikan ?? '',
      item.picMekanik ?? '',
      item.etr ?? '',
      item.keterangan ?? '',
      isRepeat ? 'YA (Repeat <=72j)' : 'Normal',
    ]);
  });

  // 5. Build Sheet 4: PA_Per_Jam (all shift dates from overrides + activeShiftDate + today operational)
  const shiftDatesSet = new Set<string>([
    activeShiftDate,
    getCurrentOperationalShiftDate(),
  ]);
  for (const ov of Object.values(hourlyOverrides)) {
    if (ov.shiftDate && /^\d{4}-\d{2}-\d{2}$/.test(ov.shiftDate)) {
      shiftDatesSet.add(ov.shiftDate);
    }
  }
  const sortedShiftDates = Array.from(shiftDatesSet).sort((a, b) => (a < b ? 1 : -1));

  const hourlyRows: (string | number)[][] = [
    [
      'Tanggal Shift',
      'Jam',
      'Tanggal Kalender',
      'Shift',
      'Total Populasi',
      'Unit Running',
      'Total BD',
      'PA (%)',
      'Sumber Data',
      'Unit BD Tercatat',
    ],
  ];

  for (const sDate of sortedShiftDates) {
    const rows = buildHourlyShiftRows({
      shiftDate: sDate,
      totalPopulasi: totalPop,
      bdRecords,
      rfuHistory,
      overrides: hourlyOverrides,
      nowMs,
    });
    for (const r of rows) {
      const active = r.isElapsed || r.isManual;
      hourlyRows.push([
        sDate,
        r.hourLabel,
        r.calendarDate,
        r.shiftLabel,
        active ? r.totalPopulasi : '',
        active ? r.runningCount : '',
        active ? r.bdCount : '',
        active ? Number(r.paPct.toFixed(1)) : '',
        r.isManual ? 'Manual' : active ? 'Otomatis' : 'Menunggu',
        r.bdUnitCodes.join(', '),
      ]);
    }
  }

  // 6. Build Sheet 5: Populasi_Unit
  const bdUnitSet = new Set(bdRecords.map((b) => b.unitCode.trim().toUpperCase()));
  const populationRows: (string | number)[][] = [
    ['No', 'ID', 'Kode Unit', 'Grup Armada', 'Status Saat Ini', 'Urutan'],
  ];
  masterUnits.forEach((unit, idx) => {
    const isBd = bdUnitSet.has(unit.code.trim().toUpperCase());
    populationRows.push([
      idx + 1,
      unit.id,
      unit.code,
      unit.fleetGroup,
      isBd ? 'BREAKDOWN' : 'RUNNING',
      unit.orderIndex,
    ]);
  });

  // 7. Clear previous contents & write all 5 sheets atomically
  await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchClear`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        ranges: SHEET_TABS.map((t) => quoteSheetRange(t, 'A1:Z')),
      }),
    }
  );

  await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: [
          { range: quoteSheetRange('Ringkasan', 'A1'), values: ringkasanRows },
          { range: quoteSheetRange('Unit_BD_Aktif', 'A1'), values: bdRows },
          { range: quoteSheetRange('Riwayat_RFU', 'A1'), values: rfuRows },
          { range: quoteSheetRange('PA_Per_Jam', 'A1'), values: hourlyRows },
          { range: quoteSheetRange('Populasi_Unit', 'A1'), values: populationRows },
        ],
      }),
    }
  );

  // 8. Style frozen header rows cleanly (best-effort)
  const formatRequests = SHEET_TABS.map((tab) => {
    const sheetId = existingTitles.get(tab);
    if (sheetId === undefined) return null;
    return [
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: { frozenRowCount: 1 },
          },
          fields: 'gridProperties.frozenRowCount',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.06, green: 0.09, blue: 0.16 },
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                bold: true,
              },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      },
    ];
  })
    .flat()
    .filter(Boolean);

  if (formatRequests.length > 0) {
    void sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ requests: formatRequests }),
      }
    ).catch(() => {
      // Non-critical styling failure
    });
  }

  const lastRowSummary = `${bdRecords.length} BD aktif · ${rfuHistory.length} Riwayat RFU · ${hourlyRows.length - 1} slot PA per jam · ${masterUnits.length} unit`;

  return {
    spreadsheetId,
    spreadsheetUrl: meta.spreadsheetUrl || buildSpreadsheetUrl(spreadsheetId),
    spreadsheetTitle: meta.properties?.title || MASTER_SPREADSHEET_DEFAULT_TITLE,
    lastRowSummary,
    counts: {
      activeBd: bdRecords.length,
      rfuHistory: rfuHistory.length,
      hourlyRows: hourlyRows.length - 1,
      population: masterUnits.length,
    },
  };
}

// =========================================================================
// TWO-WAY PULL: Read & Diff Spreadsheet -> Web Preview
// =========================================================================

export interface SheetPullDiffPreview {
  checkedAt: string;
  spreadsheetTitle: string;
  newUnits: FleetUnit[];
  newBdRecords: BreakdownRecord[];
  updatedBdRecords: Array<{
    record: BreakdownRecord;
    changedFields: string[];
  }>;
  rfuFromActiveBd: Array<{
    bdId: string;
    unitCode: string;
    rfuEntry: RfuHistoryRecord;
  }>;
  cancelFromActiveBd: Array<{
    bdId: string;
    unitCode: string;
  }>;
  newRfuRecords: RfuHistoryRecord[];
  updatedRfuRecords: Array<{
    record: RfuHistoryRecord;
    changedFields: string[];
  }>;
  hourlyOverridesToSave: HourlySlotOverride[];
  warnings: string[];
  totalChanges: number;
  summaryText: string;
}

function cellStr(row: unknown[], idx: number | undefined): string {
  if (idx === undefined || idx < 0 || idx >= row.length) return '';
  const v = row[idx];
  return v === null || v === undefined ? '' : String(v).trim();
}

function buildHeaderIndexMap(headerRow: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((cell, idx) => {
    const key = String(cell ?? '').trim().toLowerCase();
    if (key) map.set(key, idx);
  });
  return map;
}

function normalizeSheetDate(raw: string, fallback = ''): string {
  const s = raw.trim();
  if (!s) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const slashMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const dd = slashMatch[1].padStart(2, '0');
    const mm = slashMatch[2].padStart(2, '0');
    const yyyy = slashMatch[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return fallback;
}

function normalizeSheetTime(raw: string, fallback = ''): string {
  const s = raw.trim().replace('.', ':');
  if (!s) return fallback;
  const m = s.match(/^(\d{1,2}):(\d{1,2})/);
  if (m) {
    const hh = Math.min(23, Math.max(0, Number(m[1])));
    const mm = Math.min(59, Math.max(0, Number(m[2])));
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  return fallback;
}

function parseSheetBdStatus(rawCode: string, rawLabel?: string): BdStatus {
  const candidates = [rawCode, rawLabel ?? ''];
  for (const cand of candidates) {
    const clean = cand.trim().toUpperCase();
    if (!clean) continue;
    const prefix = clean.split(/[\s\-–]+/)[0];
    const valid = BD_STATUS_CATALOG.find((item) => item.code === prefix);
    if (valid) return valid.code;
    const byLabel = BD_STATUS_CATALOG.find(
      (item) => item.label.toUpperCase() === clean
    );
    if (byLabel) return byLabel.code;
  }
  return normalizeBdStatus(rawCode || rawLabel || 'B0');
}

function parseSheetPartStatus(raw: string): PartStatus {
  const clean = raw.trim();
  if (!clean) return '';
  const direct = normalizePartStatus(clean);
  if (direct) return direct;
  const lower = clean.toLowerCase();
  for (const [key, label] of Object.entries(PART_STATUS_LABELS)) {
    if (label.toLowerCase() === lower) {
      return key as PartStatus;
    }
  }
  return '';
}

function parseSheetFleetGroup(raw: string, unitCode: string): FleetGroup {
  const upper = raw.trim().toUpperCase();
  if (upper === 'PMSC' || upper === 'PMVV' || upper === 'LAINNYA') {
    return upper;
  }
  return detectFleetGroup(unitCode);
}

function resolveHourlySlotIndex(hourLabel: string, shiftLabel: string): number | null {
  const normHour = normalizeSheetTime(hourLabel);
  if (!normHour) return null;
  const hh = Number(normHour.split(':')[0]);
  if (!Number.isFinite(hh)) return null;
  const shiftLower = shiftLabel.trim().toLowerCase();
  if (shiftLower.includes('akhir')) return 24;
  if (hh >= 6 && hh <= 17) return hh - 6;
  if (hh >= 18 && hh <= 23) return hh - 6;
  if (hh >= 0 && hh <= 5) return hh + 18;
  return null;
}

export async function inspectSpreadsheetChanges(params: {
  accessToken: string;
  spreadsheetId: string;
  isOwnerOrAdmin: boolean;
  masterUnits: FleetUnit[];
  bdRecords: BreakdownRecord[];
  rfuHistory: RfuHistoryRecord[];
  hourlyOverrides: Record<string, HourlySlotOverride>;
}): Promise<SheetPullDiffPreview> {
  const {
    accessToken,
    spreadsheetId,
    isOwnerOrAdmin,
    masterUnits,
    bdRecords,
    rfuHistory,
    hourlyOverrides,
  } = params;

  const nowMs = Date.now();
  const todayStr = getCurrentDateYYYYMMDD();
  const nowTimeStr = getCurrentTimeHHMM();

  // 1. Metadata check
  const meta = await sheetsFetch<SpreadsheetMetadataResponse>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=spreadsheetId,properties.title,sheets(properties(title))`,
    accessToken
  );

  const availableTabs = new Set(
    (meta.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter((t): t is string => Boolean(t))
  );

  const tabsToRead = (['Populasi_Unit', 'Unit_BD_Aktif', 'Riwayat_RFU', 'PA_Per_Jam'] as const).filter(
    (t) => availableTabs.has(t)
  );

  const rowsByTab = new Map<string, unknown[][]>();
  if (tabsToRead.length > 0) {
    const rangesQuery = tabsToRead
      .map((t) => `ranges=${encodeURIComponent(quoteSheetRange(t, 'A1:Z'))}`)
      .join('&');
    const batchRes = await sheetsFetch<BatchGetValuesResponse>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values:batchGet?${rangesQuery}`,
      accessToken
    );

    tabsToRead.forEach((tab, idx) => {
      rowsByTab.set(tab, batchRes.valueRanges?.[idx]?.values ?? []);
    });
  }

  const warnings: string[] = [];

  // 2. Parse Populasi_Unit
  const newUnits: FleetUnit[] = [];
  const masterByCode = new Map<string, FleetUnit>();
  for (const u of masterUnits) {
    masterByCode.set(u.code.trim().toUpperCase(), u);
  }
  let maxOrderIdx = masterUnits.reduce((m, u) => Math.max(m, u.orderIndex), 0);

  const popValues = rowsByTab.get('Populasi_Unit') ?? [];
  if (popValues.length > 1) {
    const h = buildHeaderIndexMap(popValues[0]);
    for (let r = 1; r < popValues.length; r++) {
      const row = popValues[r];
      const unitCode = cellStr(row, h.get('kode unit') ?? 2).toUpperCase().replace(/\s+/g, ' ');
      if (!unitCode) continue;
      if (!masterByCode.has(unitCode)) {
        if (!isOwnerOrAdmin) {
          warnings.push(`Populasi_Unit baris ${r + 1}: Penambahan unit baru ${unitCode} khusus Admin.`);
          continue;
        }
        maxOrderIdx += 1;
        const grp = parseSheetFleetGroup(cellStr(row, h.get('grup armada') ?? 3), unitCode);
        const rawId = cellStr(row, h.get('id') ?? 1);
        const unit: FleetUnit = {
          id: rawId || `unit-sheet-${nowMs}-${r}`,
          code: unitCode,
          fleetGroup: grp,
          orderIndex: maxOrderIdx,
        };
        newUnits.push(unit);
        masterByCode.set(unitCode, unit);
      }
    }
  }

  // 3. Parse Unit_BD_Aktif
  const newBdRecords: BreakdownRecord[] = [];
  const updatedBdRecords: Array<{ record: BreakdownRecord; changedFields: string[] }> = [];
  const rfuFromActiveBd: Array<{ bdId: string; unitCode: string; rfuEntry: RfuHistoryRecord }> = [];
  const cancelFromActiveBd: Array<{ bdId: string; unitCode: string }> = [];

  const bdById = new Map<string, BreakdownRecord>();
  const bdByUnitCode = new Map<string, BreakdownRecord>();
  for (const rec of bdRecords) {
    bdById.set(rec.id, rec);
    bdByUnitCode.set(rec.unitCode.trim().toUpperCase(), rec);
  }
  const seenNewBdCodes = new Set<string>();

  const bdValues = rowsByTab.get('Unit_BD_Aktif') ?? [];
  if (bdValues.length > 1) {
    const h = buildHeaderIndexMap(bdValues[0]);
    for (let r = 1; r < bdValues.length; r++) {
      const row = bdValues[r];
      const rawId = cellStr(row, h.get('id') ?? 1);
      const unitCode = cellStr(row, h.get('kode unit') ?? 2).toUpperCase().replace(/\s+/g, ' ');
      if (!unitCode) continue;

      const existing =
        (rawId ? bdById.get(rawId) : undefined) ?? bdByUnitCode.get(unitCode);

      const actionRaw = cellStr(row, h.get('aksi (bd / rfu / batal)') ?? h.get('aksi')).toUpperCase();
      const tanggalBd = normalizeSheetDate(
        cellStr(row, h.get('tanggal bd') ?? 4),
        existing?.tanggalBd || todayStr
      );
      const jamBd = normalizeSheetTime(
        cellStr(row, h.get('jam bd') ?? 5),
        existing?.jamBd || nowTimeStr
      );
      const status = parseSheetBdStatus(
        cellStr(row, h.get('kode status') ?? 10),
        cellStr(row, h.get('status bd') ?? 11)
      );
      const lokasi = cellStr(row, h.get('lokasi / posisi') ?? 12);
      const mrNumbers = parseMrInput(cellStr(row, h.get('nomor mr') ?? 13));
      const partName = cellStr(row, h.get('nama part utama') ?? 14);
      const partStatus = parseSheetPartStatus(cellStr(row, h.get('status part') ?? 15));
      const partNote = cellStr(row, h.get('catatan part') ?? 16);
      const picMekanik = cellStr(row, h.get('pic mekanik') ?? 17);
      const etr = normalizeSheetTime(cellStr(row, h.get('etr') ?? 18), cellStr(row, h.get('etr') ?? 18));
      const keterangan = cellStr(row, h.get('keterangan problem') ?? 19);

      if (existing) {
        if (actionRaw === 'RFU') {
          const split = computeBdTimeSplit({ ...existing, status, partStatus }, nowMs);
          rfuFromActiveBd.push({
            bdId: existing.id,
            unitCode: existing.unitCode,
            rfuEntry: {
              id: `rfu-sheet-${nowMs}-${r}`,
              unitCode: existing.unitCode,
              fleetGroup: existing.fleetGroup,
              jamBd,
              tanggalBd,
              jamRfu: nowTimeStr,
              tanggalRfu: todayStr,
              lokasi,
              mrNumbers,
              partName,
              keterangan,
              komponen: '',
              subKomponen: '',
              detailSubKomponen: '',
              activityPerbaikan: '',
              lastStatus: status,
              picMekanik,
              etr,
              waitingPartMinutes: split.waitingPartMinutes,
            },
          });
          continue;
        }

        if (actionRaw === 'BATAL' || actionRaw === 'CANCEL') {
          cancelFromActiveBd.push({
            bdId: existing.id,
            unitCode: existing.unitCode,
          });
          continue;
        }

        const changedFields: string[] = [];
        if (tanggalBd !== existing.tanggalBd) changedFields.push('Tanggal BD');
        if (jamBd !== existing.jamBd) changedFields.push('Jam BD');
        if (status !== existing.status) changedFields.push('Status BD');
        if (lokasi !== (existing.lokasi ?? '')) changedFields.push('Lokasi');
        if (mrNumbers.join(',') !== normalizeMrList(existing.mrNumbers).join(',')) {
          changedFields.push('Nomor MR');
        }
        if (partName !== (existing.partName ?? '')) changedFields.push('Nama Part');
        if (partStatus !== normalizePartStatus(existing.partStatus)) {
          changedFields.push('Status Part');
        }
        if (partNote !== (existing.partNote ?? '')) changedFields.push('Catatan Part');
        if (picMekanik !== (existing.picMekanik ?? '')) changedFields.push('PIC Mekanik');
        if (etr !== (existing.etr ?? '')) changedFields.push('ETR');
        if (keterangan !== (existing.keterangan ?? '')) changedFields.push('Keterangan');

        if (changedFields.length > 0) {
          const wasWaiting = Boolean((existing.waitingPartStartedAt ?? '').trim());
          const willWait = isActivelyWaitingPart(status, partStatus);
          let nextStartedAt = existing.waitingPartStartedAt ?? '';
          let nextAccumulated = existing.waitingPartAccumulatedMinutes ?? 0;
          const nowIso = new Date(nowMs).toISOString();

          if (!wasWaiting && willWait) {
            nextStartedAt = nowIso;
          } else if (wasWaiting && !willWait) {
            const startedMs = Date.parse(existing.waitingPartStartedAt ?? '');
            if (Number.isFinite(startedMs) && nowMs > startedMs) {
              nextAccumulated += Math.floor((nowMs - startedMs) / 60000);
            }
            nextStartedAt = '';
          }

          updatedBdRecords.push({
            changedFields,
            record: {
              ...existing,
              tanggalBd,
              jamBd,
              status,
              lokasi,
              mrNumbers,
              partName,
              partStatus,
              partNote,
              picMekanik,
              etr,
              keterangan,
              waitingPartStartedAt: nextStartedAt,
              waitingPartAccumulatedMinutes: nextAccumulated,
              updatedAt: nowIso,
            },
          });
        }
      } else {
        if (actionRaw === 'BATAL' || actionRaw === 'CANCEL' || actionRaw === 'RFU') {
          continue;
        }
        const registeredUnit = masterByCode.get(unitCode);
        if (!registeredUnit) {
          warnings.push(
            `Unit_BD_Aktif baris ${r + 1}: Unit "${unitCode}" tidak terdaftar di populasi armada.`
          );
          continue;
        }
        if (seenNewBdCodes.has(unitCode)) continue;
        seenNewBdCodes.add(unitCode);

        const nowIso = new Date(nowMs).toISOString();
        const startsWaiting = isActivelyWaitingPart(status, partStatus);
        newBdRecords.push({
          id: rawId || `bd-sheet-${nowMs}-${r}`,
          unitCode: registeredUnit.code,
          fleetGroup: registeredUnit.fleetGroup,
          tanggalBd,
          jamBd,
          lokasi,
          mrNumbers,
          partName,
          keterangan,
          status,
          picMekanik,
          etr,
          partStatus,
          partNote,
          waitingPartStartedAt: startsWaiting ? nowIso : '',
          waitingPartAccumulatedMinutes: 0,
          updatedAt: nowIso,
        });
      }
    }
  }

  // 4. Parse Riwayat_RFU
  const newRfuRecords: RfuHistoryRecord[] = [];
  const updatedRfuRecords: Array<{ record: RfuHistoryRecord; changedFields: string[] }> = [];

  const rfuById = new Map<string, RfuHistoryRecord>();
  const rfuByDedup = new Map<string, RfuHistoryRecord>();
  const makeRfuKey = (u: string, tb: string, jb: string, tr: string, jr: string) =>
    `${u.trim().toUpperCase()}|${tb}|${jb}|${tr}|${jr}`;
  for (const item of rfuHistory) {
    rfuById.set(item.id, item);
    rfuByDedup.set(
      makeRfuKey(item.unitCode, item.tanggalBd, item.jamBd, item.tanggalRfu, item.jamRfu),
      item
    );
  }

  const rfuValues = rowsByTab.get('Riwayat_RFU') ?? [];
  if (rfuValues.length > 1) {
    const h = buildHeaderIndexMap(rfuValues[0]);
    for (let r = 1; r < rfuValues.length; r++) {
      const row = rfuValues[r];
      const rawId = cellStr(row, h.get('id') ?? 1);
      const unitCode = cellStr(row, h.get('kode unit') ?? 2).toUpperCase().replace(/\s+/g, ' ');
      if (!unitCode) continue;

      const tanggalBd = normalizeSheetDate(cellStr(row, h.get('tanggal bd') ?? 4), todayStr);
      const jamBd = normalizeSheetTime(cellStr(row, h.get('jam bd') ?? 5), '00:00');
      const tanggalRfu = normalizeSheetDate(cellStr(row, h.get('tanggal rfu') ?? 6), tanggalBd);
      const jamRfu = normalizeSheetTime(cellStr(row, h.get('jam rfu') ?? 7), jamBd);

      const dedupKey = makeRfuKey(unitCode, tanggalBd, jamBd, tanggalRfu, jamRfu);
      const existing =
        (rawId ? rfuById.get(rawId) : undefined) ?? rfuByDedup.get(dedupKey);

      const rawWaitNum = Number(cellStr(row, h.get('tunggu part (menit)') ?? 11));
      const waitingPartMinutes =
        Number.isFinite(rawWaitNum) && rawWaitNum >= 0 ? Math.round(rawWaitNum) : existing?.waitingPartMinutes ?? 0;

      const lastStatus = parseSheetBdStatus(cellStr(row, h.get('status terakhir') ?? 12));
      const lokasi = cellStr(row, h.get('lokasi / posisi') ?? 13);
      const mrNumbers = parseMrInput(cellStr(row, h.get('nomor mr') ?? 14));
      const partName = cellStr(row, h.get('nama part utama') ?? 15);
      const komponen = cellStr(row, h.get('komponen') ?? 16);
      const subKomponen = cellStr(row, h.get('sub komponen') ?? 17);
      const detailSubKomponen = cellStr(row, h.get('detail sub komponen') ?? 18);
      const activityPerbaikan = cellStr(row, h.get('activity perbaikan') ?? 19);
      const picMekanik = cellStr(row, h.get('pic mekanik') ?? 20);
      const etr = normalizeSheetTime(cellStr(row, h.get('etr') ?? 21), cellStr(row, h.get('etr') ?? 21));
      const keterangan = cellStr(row, h.get('keterangan problem') ?? 22);
      const fleetGroup = parseSheetFleetGroup(
        cellStr(row, h.get('grup armada') ?? 3),
        unitCode
      );

      if (existing) {
        const changedFields: string[] = [];
        if (lastStatus !== existing.lastStatus) changedFields.push('Status Akhir');
        if (lokasi !== (existing.lokasi ?? '')) changedFields.push('Lokasi');
        if (mrNumbers.join(',') !== normalizeMrList(existing.mrNumbers).join(',')) {
          changedFields.push('Nomor MR');
        }
        if (partName !== (existing.partName ?? '')) changedFields.push('Nama Part');
        if (komponen !== (existing.komponen ?? '')) changedFields.push('Komponen');
        if (subKomponen !== (existing.subKomponen ?? '')) changedFields.push('Sub Komponen');
        if (detailSubKomponen !== (existing.detailSubKomponen ?? '')) changedFields.push('Detail Sub');
        if (activityPerbaikan !== (existing.activityPerbaikan ?? '')) changedFields.push('Activity');
        if (picMekanik !== (existing.picMekanik ?? '')) changedFields.push('PIC');
        if (etr !== (existing.etr ?? '')) changedFields.push('ETR');
        if (keterangan !== (existing.keterangan ?? '')) changedFields.push('Keterangan');
        if (waitingPartMinutes !== (existing.waitingPartMinutes ?? 0)) {
          changedFields.push('Tunggu Part');
        }

        if (changedFields.length > 0) {
          updatedRfuRecords.push({
            changedFields,
            record: {
              ...existing,
              fleetGroup,
              lokasi,
              mrNumbers,
              partName,
              komponen,
              subKomponen,
              detailSubKomponen,
              activityPerbaikan,
              lastStatus,
              picMekanik,
              etr,
              keterangan,
              waitingPartMinutes,
            },
          });
        }
      } else {
        // Also avoid duplicate if this unit is being marked RFU from Unit_BD_Aktif in the same pull
        const alreadyRfuFromBd = rfuFromActiveBd.some(
          (x) => x.unitCode.toUpperCase() === unitCode && x.rfuEntry.tanggalRfu === tanggalRfu
        );
        if (alreadyRfuFromBd) continue;

        const newEntry: RfuHistoryRecord = {
          id: rawId || `rfu-sheet-${nowMs}-${r}`,
          unitCode,
          fleetGroup,
          jamBd,
          tanggalBd,
          jamRfu,
          tanggalRfu,
          lokasi,
          mrNumbers,
          partName,
          keterangan,
          komponen,
          subKomponen,
          detailSubKomponen,
          activityPerbaikan,
          lastStatus,
          picMekanik,
          etr,
          waitingPartMinutes,
        };
        newRfuRecords.push(newEntry);
        rfuByDedup.set(dedupKey, newEntry);
      }
    }
  }

  // 5. Parse PA_Per_Jam
  const hourlyOverridesToSave: HourlySlotOverride[] = [];
  const hourlyValues = rowsByTab.get('PA_Per_Jam') ?? [];
  if (hourlyValues.length > 1) {
    const h = buildHeaderIndexMap(hourlyValues[0]);
    const autoCache = new Map<string, ReturnType<typeof buildHourlyShiftRows>>();
    const totalPopMaster = masterByCode.size;

    for (let r = 1; r < hourlyValues.length; r++) {
      const row = hourlyValues[r];
      const shiftDate = normalizeSheetDate(cellStr(row, h.get('tanggal shift') ?? 0));
      if (!shiftDate) continue;
      const hourLabel = cellStr(row, h.get('jam') ?? 1);
      const shiftLabel = cellStr(row, h.get('shift') ?? 3);
      const slotIndex = resolveHourlySlotIndex(hourLabel, shiftLabel);
      if (slotIndex === null) continue;

      const rawPop = cellStr(row, h.get('total populasi') ?? 4);
      const rawBd = cellStr(row, h.get('total bd') ?? 6);
      if (!rawPop && !rawBd) continue;
      const pop = Number(rawPop);
      const bd = Number(rawBd);
      if (!Number.isFinite(pop) || !Number.isFinite(bd) || pop <= 0 || bd < 0) continue;

      const sourceRaw = cellStr(row, h.get('sumber data') ?? 8).toLowerCase();
      const key = `${shiftDate}__${slotIndex}`;
      const existingOv = hourlyOverrides[key];

      if (existingOv) {
        if (existingOv.totalPopulasi !== Math.round(pop) || existingOv.bdCount !== Math.round(bd)) {
          hourlyOverridesToSave.push({
            key,
            shiftDate,
            slotIndex,
            totalPopulasi: Math.round(pop),
            bdCount: Math.min(Math.round(pop), Math.round(bd)),
            updatedAt: new Date(nowMs).toISOString(),
          });
        }
      } else {
        let computedRows = autoCache.get(shiftDate);
        if (!computedRows) {
          computedRows = buildHourlyShiftRows({
            shiftDate,
            totalPopulasi: totalPopMaster,
            bdRecords,
            rfuHistory,
            overrides: hourlyOverrides,
            nowMs,
          });
          autoCache.set(shiftDate, computedRows);
        }
        const computedRow = computedRows.find((cr) => cr.slotIndex === slotIndex);
        const matchesAuto =
          computedRow &&
          (computedRow.isElapsed || computedRow.isManual) &&
          computedRow.totalPopulasi === Math.round(pop) &&
          computedRow.bdCount === Math.round(bd);

        if (sourceRaw === 'manual' || !matchesAuto) {
          hourlyOverridesToSave.push({
            key,
            shiftDate,
            slotIndex,
            totalPopulasi: Math.round(pop),
            bdCount: Math.min(Math.round(pop), Math.round(bd)),
            updatedAt: new Date(nowMs).toISOString(),
          });
        }
      }
    }
  }

  const totalChanges =
    newUnits.length +
    newBdRecords.length +
    updatedBdRecords.length +
    rfuFromActiveBd.length +
    cancelFromActiveBd.length +
    newRfuRecords.length +
    updatedRfuRecords.length +
    hourlyOverridesToSave.length;

  const summaryParts: string[] = [];
  if (newBdRecords.length > 0) summaryParts.push(`+${newBdRecords.length} BD baru`);
  if (updatedBdRecords.length > 0) summaryParts.push(`${updatedBdRecords.length} BD diupdate`);
  if (rfuFromActiveBd.length > 0) summaryParts.push(`${rfuFromActiveBd.length} unit RFU`);
  if (cancelFromActiveBd.length > 0) summaryParts.push(`${cancelFromActiveBd.length} batal BD`);
  if (newRfuRecords.length > 0) summaryParts.push(`+${newRfuRecords.length} riwayat RFU`);
  if (updatedRfuRecords.length > 0) summaryParts.push(`${updatedRfuRecords.length} RFU diupdate`);
  if (hourlyOverridesToSave.length > 0) summaryParts.push(`${hourlyOverridesToSave.length} slot PA jam`);
  if (newUnits.length > 0) summaryParts.push(`+${newUnits.length} unit baru`);

  return {
    checkedAt: new Date(nowMs).toISOString(),
    spreadsheetTitle: meta.properties?.title || MASTER_SPREADSHEET_DEFAULT_TITLE,
    newUnits,
    newBdRecords,
    updatedBdRecords,
    rfuFromActiveBd,
    cancelFromActiveBd,
    newRfuRecords,
    updatedRfuRecords,
    hourlyOverridesToSave,
    warnings,
    totalChanges,
    summaryText:
      summaryParts.length > 0
        ? summaryParts.join(', ')
        : 'Sudah sinkron (tidak ada perubahan baru di Spreadsheet)',
  };
}
