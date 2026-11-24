import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { formatMrNumbers, normalizeMrList, parseMrInput } from '../utils/fleetUtils';

interface StackedMrEditorProps {
  value: string[];
  onChange: (next: string[]) => void;
  idPrefix?: string;
  compact?: boolean;
}

export function StackedMrEditor({
  value,
  onChange,
  idPrefix = 'mr',
  compact = false,
}: StackedMrEditorProps) {
  const [rows, setRows] = useState<string[]>(() => (value.length > 0 ? value : ['']));
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const pendingFocusIdx = useRef<number | null>(null);

  // Sync external changes when serialized value differs from normalized local rows
  useEffect(() => {
    const localNormalized = normalizeMrList(rows).join('|');
    const externalNormalized = normalizeMrList(value).join('|');
    if (localNormalized !== externalNormalized) {
      setRows(value.length > 0 ? value : ['']);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (pendingFocusIdx.current !== null) {
      const target = inputRefs.current[pendingFocusIdx.current];
      pendingFocusIdx.current = null;
      if (target) {
        target.focus();
      }
    }
  }, [rows]);

  const commitRows = (nextRows: string[]) => {
    setRows(nextRows);
    onChange(normalizeMrList(nextRows));
  };

  const handleRowChange = (idx: number, raw: string) => {
    // Auto-split when user types comma/semicolon or pastes newline-separated MRs
    if (/[,;\r\n]/.test(raw)) {
      const endsWithDelimiter = /[,;\r\n]\s*$/.test(raw);
      const splitParts = raw
        .split(/[,;\r\n]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      const nextRows = [...rows];
      if (splitParts.length === 0) {
        nextRows[idx] = '';
      } else {
        const replacement = endsWithDelimiter ? [...splitParts, ''] : splitParts;
        nextRows.splice(idx, 1, ...replacement);
        pendingFocusIdx.current = idx + replacement.length - 1;
      }
      commitRows(nextRows);
      return;
    }

    const nextRows = [...rows];
    nextRows[idx] = raw.toUpperCase();
    commitRows(nextRows);
  };

  const handleAddRow = () => {
    const nextRows = [...rows, ''];
    pendingFocusIdx.current = nextRows.length - 1;
    setRows(nextRows);
  };

  const handleRemoveRow = (idx: number) => {
    if (rows.length <= 1) {
      commitRows(['']);
      return;
    }
    const nextRows = rows.filter((_, i) => i !== idx);
    commitRows(nextRows);
  };

  return (
    <div className="space-y-1.5">
      <div className="space-y-1.5 max-h-40 overflow-y-auto ops-scroll pr-0.5">
        {rows.map((rowVal, idx) => (
          <div key={`${idPrefix}-row-${idx}`} className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono tabular-nums text-slate-400 w-4 shrink-0 text-right">
              {idx + 1}.
            </span>
            <input
              ref={(el) => {
                inputRefs.current[idx] = el;
              }}
              id={idx === 0 ? `${idPrefix}-input-0` : undefined}
              type="text"
              value={rowVal}
              onChange={(e) => handleRowChange(idx, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddRow();
                }
              }}
              placeholder={idx === 0 ? 'Misal: MR-24011 (atau pisah koma)' : `Nomor MR ke-${idx + 1}`}
              aria-label={`Nomor MR ${idx + 1}`}
              className={`flex-1 min-w-0 font-mono uppercase bg-white border border-slate-300 rounded-md text-slate-900 placeholder:normal-case placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                compact ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-xs'
              }`}
            />
            {(rows.length > 1 || rowVal.trim() !== '') && (
              <button
                type="button"
                onClick={() => handleRemoveRow(idx)}
                aria-label={`Hapus MR ${idx + 1}`}
                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <button
          type="button"
          onClick={handleAddRow}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-3 h-3" aria-hidden="true" />
          <span>Tambah MR</span>
        </button>
        <span className="text-[10px] text-slate-400">
          Pisah koma atau tekan Enter
        </span>
      </div>
    </div>
  );
}

interface CompactMrInputProps {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export function CompactMrInput({
  id,
  value,
  onChange,
  placeholder = 'MR-001, MR-002...',
  ariaLabel = 'Nomor MR',
}: CompactMrInputProps) {
  const [draft, setDraft] = useState(() => formatMrNumbers(value, ''));
  const [popoverOpen, setPopoverOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const currentParsed = parseMrInput(draft).join('|');
    const externalJoined = normalizeMrList(value).join('|');
    if (currentParsed !== externalJoined) {
      setDraft(formatMrNumbers(value, ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!popoverOpen) return;
    const handleDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [popoverOpen]);

  return (
    <div ref={containerRef} className="relative flex items-center gap-1">
      <input
        id={id}
        type="text"
        value={draft}
        aria-label={ariaLabel}
        onChange={(e) => {
          const upper = e.target.value.toUpperCase();
          setDraft(upper);
          onChange(parseMrInput(upper));
        }}
        onBlur={() => {
          const formatted = formatMrNumbers(parseMrInput(draft), '');
          setDraft(formatted);
        }}
        placeholder={placeholder}
        className="w-full min-w-0 px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
      />
      <button
        type="button"
        onClick={() => setPopoverOpen((prev) => !prev)}
        title="Tambah / kelola beberapa Nomor MR"
        aria-label="Kelola daftar Nomor MR"
        className="inline-flex items-center gap-0.5 px-2 py-1.5 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
      >
        <Plus className="w-3 h-3" aria-hidden="true" />
        <span>MR</span>
      </button>

      {popoverOpen && (
        <div className="absolute right-0 top-full mt-1 z-30 w-72 bg-white border border-slate-200 rounded-lg shadow-lg p-3 space-y-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <span className="text-[11px] font-semibold text-slate-800">
              Daftar Nomor MR ({value.length})
            </span>
            <button
              type="button"
              onClick={() => setPopoverOpen(false)}
              className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
            >
              Selesai
            </button>
          </div>
          <StackedMrEditor
            value={value}
            onChange={(next) => {
              onChange(next);
              setDraft(formatMrNumbers(next, ''));
            }}
            idPrefix={id ?? 'compact-mr'}
            compact
          />
        </div>
      )}
    </div>
  );
}

interface InlineTableMrCellProps {
  unitCode: string;
  value: string[];
  onChange: (next: string[]) => void;
}

export function InlineTableMrCell({ unitCode, value, onChange }: InlineTableMrCellProps) {
  const [editing, setEditing] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editing) return;
    const handleDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditing(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditing(false);
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDocClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [editing]);

  const normalized = normalizeMrList(value);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setEditing((prev) => !prev)}
        aria-label={`Edit Nomor MR ${unitCode}`}
        title={
          normalized.length > 0
            ? `${normalized.join(', ')} (klik untuk ubah / tambah MR)`
            : 'Klik untuk isi atau tambah Nomor MR'
        }
        className="w-full text-left px-2 py-1 text-xs rounded border border-transparent hover:border-slate-200 hover:bg-white focus:outline-none focus:border-blue-600 flex items-center justify-between gap-1.5 cursor-pointer group"
      >
        <span
          className={`truncate font-mono tabular-nums ${
            normalized.length > 0 ? 'text-slate-900 font-medium' : 'font-sans text-slate-400'
          }`}
        >
          {normalized.length > 0 ? normalized.join(', ') : 'Isi / + MR...'}
        </span>
        <span className="text-[10px] font-semibold text-blue-700 opacity-70 group-hover:opacity-100 whitespace-nowrap shrink-0">
          + MR
        </span>
      </button>

      {editing && (
        <div className="absolute left-0 top-full mt-1 z-30 w-72 bg-white border border-slate-200 rounded-lg shadow-lg p-3 space-y-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <span className="text-[11px] font-semibold text-slate-800 font-mono">
              MR — {unitCode} ({normalized.length})
            </span>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
            >
              Tutup
            </button>
          </div>
          <StackedMrEditor
            value={normalized}
            onChange={onChange}
            idPrefix={`cell-mr-${unitCode.replace(/\s+/g, '-')}`}
            compact
          />
        </div>
      )}
    </div>
  );
}
