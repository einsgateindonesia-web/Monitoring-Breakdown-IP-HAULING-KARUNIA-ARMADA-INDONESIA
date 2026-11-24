import { BarChart3, ClipboardList, History, Plus } from 'lucide-react';
import { ActiveTab } from '../types/fleet';

interface MobileBottomNavProps {
  activeTab: ActiveTab;
  bdCount: number;
  rfuCount: number;
  onChangeTab: (tab: ActiveTab) => void;
  onOpenInputModal: () => void;
}

export function MobileBottomNav({
  activeTab,
  bdCount,
  rfuCount,
  onChangeTab,
  onOpenInputModal,
}: MobileBottomNavProps) {
  return (
    <nav
      aria-label="Navigasi Mobile"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
    >
      <div className="grid grid-cols-4 items-center h-14 px-1">
        <button
          type="button"
          onClick={() => onChangeTab('board')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-md cursor-pointer transition-colors ${
            activeTab === 'board' ? 'text-blue-700 font-semibold' : 'text-slate-500'
          }`}
        >
          <ClipboardList className="w-5 h-5" aria-hidden="true" />
          <span className="text-[10px] leading-none whitespace-nowrap">Board</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeTab('dashboard')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-md cursor-pointer transition-colors ${
            activeTab === 'dashboard' ? 'text-blue-700 font-semibold' : 'text-slate-500'
          }`}
        >
          <BarChart3 className="w-5 h-5" aria-hidden="true" />
          <span className="text-[10px] leading-none whitespace-nowrap tabular-nums">
            Dashboard ({bdCount})
          </span>
        </button>

        <button
          type="button"
          onClick={() => onChangeTab('riwayat')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-md cursor-pointer transition-colors ${
            activeTab === 'riwayat' ? 'text-blue-700 font-semibold' : 'text-slate-500'
          }`}
        >
          <History className="w-5 h-5" aria-hidden="true" />
          <span className="text-[10px] leading-none whitespace-nowrap tabular-nums">
            RFU ({rfuCount})
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenInputModal}
          className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-md text-red-700 font-semibold cursor-pointer active:bg-red-50 transition-colors"
        >
          <Plus className="w-5 h-5" aria-hidden="true" />
          <span className="text-[10px] leading-none whitespace-nowrap">Input BD</span>
        </button>
      </div>
    </nav>
  );
}
