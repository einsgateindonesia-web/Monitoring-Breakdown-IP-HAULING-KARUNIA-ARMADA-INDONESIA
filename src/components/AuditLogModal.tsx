import { useMemo, useState } from 'react';
import { History, Search, X } from 'lucide-react';
import { AuditActionType, AuditLogEntry } from '../types/fleet';

interface AuditLogModalProps {
  isOpen: boolean;
  entries: AuditLogEntry[];
  onClose: () => void;
}

const ACTION_LABELS: Record<AuditActionType, { label: string; style: string }> = {
  INPUT_BD: {
    label: 'Input BD',
    style: 'text-red-700 bg-red-50 border-red-200',
  },
  UPDATE_BD: {
    label: 'Update BD',
    style: 'text-blue-700 bg-blue-50 border-blue-200',
  },
  MARK_RFU: {
    label: 'Selesai RFU',
    style: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
  CANCEL_BD: {
    label: 'Batal BD',
    style: 'text-slate-700 bg-slate-100 border-slate-300',
  },
  IMPORT_BD: {
    label: 'Upload Excel',
    style: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  },
  UPDATE_PART: {
    label: 'Part & MR',
    style: 'text-amber-800 bg-amber-50 border-amber-200',
  },
  HOURLY_OVERRIDE: {
    label: 'PA Per Jam',
    style: 'text-cyan-800 bg-cyan-50 border-cyan-200',
  },
  RFU_HISTORY: {
    label: 'Riwayat RFU',
    style: 'text-teal-800 bg-teal-50 border-teal-200',
  },
  FLEET_MASTER: {
    label: 'Master Armada',
    style: 'text-slate-900 bg-slate-100 border-slate-300',
  },
  TARGET_PA: {
    label: 'Target PA',
    style: 'text-blue-800 bg-blue-50 border-blue-200',
  },
  TEAM_ROLE: {
    label: 'Peran Tim',
    style: 'text-rose-800 bg-rose-50 border-rose-200',
  },
  SHEET_SYNC: {
    label: 'Spreadsheet',
    style: 'text-emerald-800 bg-emerald-50 border-emerald-200',
  },
};

function formatAuditTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type FilterGroup = 'ALL' | 'BD_RFU' | 'PART' | 'PA' | 'ADMIN';

export function AuditLogModal({ isOpen, entries, onClose }: AuditLogModalProps) {
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState<FilterGroup>('ALL');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((item) => {
      if (filterGroup === 'BD_RFU') {
        if (!['INPUT_BD', 'UPDATE_BD', 'MARK_RFU', 'CANCEL_BD', 'IMPORT_BD', 'RFU_HISTORY'].includes(item.actionType)) {
          return false;
        }
      } else if (filterGroup === 'PART') {
        if (item.actionType !== 'UPDATE_PART') return false;
      } else if (filterGroup === 'PA') {
        if (item.actionType !== 'HOURLY_OVERRIDE' && item.actionType !== 'TARGET_PA') return false;
      } else if (filterGroup === 'ADMIN') {
        if (!['FLEET_MASTER', 'TARGET_PA', 'TEAM_ROLE'].includes(item.actionType)) return false;
      }

      if (!q) return true;
      return (
        item.actorName.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        (item.unitCode ?? '').toLowerCase().includes(q)
      );
    });
  }, [entries, search, filterGroup]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-modal-title"
    >
      <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-t-2xl sm:rounded-lg shadow-xl overflow-hidden max-h-[92vh] sm:max-h-[88vh] flex flex-col">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <History className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="audit-modal-title" className="text-sm font-bold text-slate-900 truncate">
                Log Aktivitas Tim Online
              </h2>
              <p className="text-[11px] text-slate-500">
                Menyimpan 150 riwayat perubahan terakhir secara real-time.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup log aktivitas"
            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-slate-500 hover:text-slate-800 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 sm:px-5 py-2.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white">
          <div className="relative flex-1 min-w-0">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama rekan, kode unit, atau aktivitas..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="overflow-x-auto max-w-full">
            <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
              {(
                [
                  { id: 'ALL', label: 'Semua' },
                  { id: 'BD_RFU', label: 'BD & RFU' },
                  { id: 'PART', label: 'Part & MR' },
                  { id: 'PA', label: 'PA Jam' },
                  { id: 'ADMIN', label: 'Admin' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterGroup(tab.id)}
                  className={`min-h-[32px] sm:min-h-0 px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    filterGroup === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto ops-scroll divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="py-12 px-4 text-center text-xs text-slate-500">
              {entries.length === 0
                ? 'Belum ada aktivitas perubahan yang tercatat di tim online ini.'
                : 'Tidak ada log aktivitas yang sesuai filter.'}
            </div>
          ) : (
            filtered.map((item) => {
              const meta = ACTION_LABELS[item.actionType] ?? {
                label: item.actionType,
                style: 'text-slate-700 bg-slate-100 border-slate-200',
              };
              return (
                <div
                  key={item.id}
                  className="px-4 sm:px-5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 hover:bg-slate-50/70 text-xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-semibold border rounded whitespace-nowrap ${meta.style}`}
                      >
                        {meta.label}
                      </span>
                      {item.unitCode && (
                        <span className="font-mono font-bold text-slate-900">
                          {item.unitCode}
                        </span>
                      )}
                      <span className="font-semibold text-slate-800">{item.actorName}</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">{item.summary}</p>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                    {formatAuditTime(item.timestamp)}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 sm:px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between pb-safe text-xs">
          <span className="text-slate-500 tabular-nums">
            Menampilkan {filtered.length} dari {entries.length} log
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] sm:min-h-0 px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-md cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
