import { Plus } from 'lucide-react';
import { ActiveTab } from '../types/fleet';

interface TopBarProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  onOpenInputModal: () => void;
  bdCount: number;
  rfuCount: number;
}

export function TopBar({
  activeTab,
  onChangeTab,
  onOpenInputModal,
  bdCount,
  rfuCount,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => onChangeTab('board')}
          title="Monitoring Breakdown IP HAULING KARUNIA ARMADA INDONESIA"
          className="text-sm lg:text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 truncate max-w-[210px] sm:max-w-[340px] lg:max-w-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
        >
          Monitoring Breakdown IP HAULING KARUNIA ARMADA INDONESIA
        </button>

        {/* Zone 2: Clean single-line navigation links */}
        <nav className="flex items-center gap-6 text-sm font-medium overflow-x-auto">
          <button
            type="button"
            onClick={() => onChangeTab('board')}
            className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none ${
              activeTab === 'board'
                ? 'border-blue-700 text-slate-900 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Board Operasi
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('dashboard')}
            className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none ${
              activeTab === 'dashboard'
                ? 'border-blue-700 text-slate-900 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Area Dashboard BD ({bdCount})
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('riwayat')}
            className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none ${
              activeTab === 'riwayat'
                ? 'border-blue-700 text-slate-900 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Riwayat RFU ({rfuCount})
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onOpenInputModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Input BD Unit</span>
          </button>
        </div>
      </div>
    </header>
  );
}
