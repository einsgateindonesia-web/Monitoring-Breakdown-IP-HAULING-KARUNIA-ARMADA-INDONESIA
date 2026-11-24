import { useEffect, useState } from 'react';

interface Time24InputProps {
  id?: string;
  value: string;
  onChange: (formatted24h: string) => void;
  ariaLabel?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
}

/**
 * Formats user input into strict 24-hour HH:mm (00:00 - 24:00).
 * Accepts "0830", "8:30", "14.45", "24:00", etc.
 */
export function normalizeTime24(raw: string): string | null {
  const cleaned = raw.trim().replace(/\./g, ':');
  if (!cleaned) return null;

  let hhStr = '';
  let mmStr = '';

  if (cleaned.includes(':')) {
    const [hPart, mPart = '00'] = cleaned.split(':');
    hhStr = hPart.replace(/\D/g, '');
    mmStr = mPart.replace(/\D/g, '');
  } else {
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length === 0) return null;
    if (digits.length <= 2) {
      hhStr = digits;
      mmStr = '00';
    } else if (digits.length === 3) {
      hhStr = digits.slice(0, 1);
      mmStr = digits.slice(1, 3);
    } else {
      hhStr = digits.slice(0, 2);
      mmStr = digits.slice(2, 4);
    }
  }

  const hh = Number(hhStr);
  const mm = Number(mmStr || '0');
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 24) return null;
  if (hh === 24 && mm !== 0) return null;
  if (mm < 0 || mm > 59) return null;

  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function Time24Input({
  id,
  value,
  onChange,
  ariaLabel,
  required,
  className = '',
  placeholder = '00:00',
}: Time24InputProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commitDraft = () => {
    const normalized = normalizeTime24(draft);
    if (normalized) {
      setDraft(normalized);
      if (normalized !== value) {
        onChange(normalized);
      }
    } else {
      // Revert to last valid value if invalid
      setDraft(value);
    }
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      maxLength={5}
      required={required}
      aria-label={ariaLabel}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9:.]/g, '');
        setDraft(raw);
        // Auto-propagate immediately when already valid HH:mm (e.g. "14:30" or "24:00")
        if (/^\d{2}:\d{2}$/.test(raw)) {
          const normalized = normalizeTime24(raw);
          if (normalized) {
            onChange(normalized);
          }
        }
      }}
      onBlur={commitDraft}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commitDraft();
        }
      }}
      className={className}
    />
  );
}
