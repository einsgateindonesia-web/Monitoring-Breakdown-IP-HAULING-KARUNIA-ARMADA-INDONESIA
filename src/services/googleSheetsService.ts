import { BD_STATUS_LABELS, PART_STATUS_LABELS, formatBdStatus } from '../data/initialUnits';
import {
  BreakdownRecord,
  FleetUnit,
  HourlySlotOverride,
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
  normalizeMrList,
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
          locale: 'id_ID',
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
