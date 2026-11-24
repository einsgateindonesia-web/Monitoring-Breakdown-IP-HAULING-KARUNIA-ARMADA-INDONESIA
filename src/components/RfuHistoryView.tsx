import { useMemo, useState } from 'react';
import { Download, History, Search, Trash2 } from 'lucide-react';
import { RfuHistoryRecord } from '../types/fleet';
import { formatReadableDateId } from '../utils/fleetUtils';

interface RfuHistoryViewProps {
  history: RfuHistoryRecord[];
  onExportCsv: () => void;
  onClearHistory: () => void;
  onBackToBoard: () => void;
}

export function RfuHistoryView({
  history,
  onExportCsv,
  onClearHistory,
  onBackToBoard,
}: RfuHistoryViewProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (h) =>
        h.unitCode.toLowerCase().includes(q) ||
        h.keterangan.toLowerCase().includes(q) ||
        h.lastStatus.toLowerCase().includes(q)
    );
  }, [history, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Riwayat Unit RFU</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Catatan unit BD yang telah selesai perbaikan dan kembali ke Unit Running.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToBoard}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
          >
            Kembali ke Board
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            disabled={history.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
          {history.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-white hover:bg-red-50 border border-red-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Bersihkan Log</span>
            </button>
          )}
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari unit atau keterangan..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {filtered.length} catatan
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs min-w-[720px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
              <tr>
                <th className="py-2.5 pl-4 pr-2 w-12 font-mono">NO</th>
                <th className="py-2.5 px-2 w-28">UNIT</th>
                <th className="py-2.5 px-2 w-32">TGL / JAM BD</th>
                <th className="py-2.5 px-2 w-32">TGL / JAM RFU</th>
                <th className="py-2.5 px-2">KETERANGAN</th>
                <th className="py-2.5 pl-2 pr-4 w-36">STATUS TERAKHIR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 px-4 text-center">
                    <div className="max-w-xs mx-auto space-y-2">
                      <div className="w-9 h-9 mx-auto rounded-md bg-slate-100 flex items-center justify-center text-slate-500">
                        <History className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <p className="text-sm font-medium text-slate-800">
                        Belum ada riwayat unit RFU
                      </p>
                      <p className="text-xs text-slate-500">
                        Setiap unit BD yang diklik tombol RFU akan otomatis tercatat di sini dan kembali ke Unit Running.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50/80">
                    <td className="py-2.5 pl-4 pr-2 font-mono tabular-nums text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-2 font-mono font-semibold text-slate-900">
                      {item.unitCode}
                    </td>
                    <td className="py-2.5 px-2 font-mono tabular-nums text-slate-700">
                      {formatReadableDateId(item.tanggalBd)} · {item.jamBd}
                    </td>
                    <td className="py-2.5 px-2 font-mono tabular-nums text-emerald-700 font-medium">
                      {formatReadableDateId(item.tanggalRfu)} · {item.jamRfu}
                    </td>
                    <td className="py-2.5 px-2 text-slate-700">
                      {item.keterangan.trim() ? item.keterangan : '—'}
                    </td>
                    <td className="py-2.5 pl-2 pr-4 text-slate-600">{item.lastStatus}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
