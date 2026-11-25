import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';

interface OnlineAuthGateProps {
  mode: 'signin' | 'join';
  userDisplayName?: string;
  userEmail?: string | null;
  userEmailVerified?: boolean;
  pendingInviteCode?: string;
  loading?: boolean;
  errorMessage?: string | null;
  errorCode?: string | null;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onJoinWithCode: (code: string) => Promise<{ ok: boolean; message?: string }>;
  onRecheckEmailAccess?: () => Promise<{ ok: boolean; message?: string }>;
}

export function OnlineAuthGate({
  mode,
  userDisplayName,
  userEmail,
  userEmailVerified = true,
  pendingInviteCode = '',
  loading = false,
  errorMessage = null,
  errorCode = null,
  onSignInGoogle,
  onSignOut,
  onJoinWithCode,
  onRecheckEmailAccess,
}: OnlineAuthGateProps) {
  const [inviteInput, setInviteInput] = useState(pendingInviteCode);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [recheckMsg, setRecheckMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rechecking, setRechecking] = useState(false);

  const isInIframe = useMemo(() => {
    try {
      return typeof window !== 'undefined' && window.self !== window.top;
    } catch {
      return true;
    }
  }, []);

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  const handleJoinSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    setRecheckMsg(null);
    setSubmitting(true);
    try {
      const res = await onJoinWithCode(inviteInput);
      if (!res.ok && res.message) {
        setJoinError(res.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecheck = async () => {
    if (!onRecheckEmailAccess) return;
    setJoinError(null);
    setRecheckMsg(null);
    setRechecking(true);
    try {
      const res = await onRecheckEmailAccess();
      if (!res.ok && res.message) {
        setRecheckMsg(res.message);
      }
    } finally {
      setRechecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center items-center px-4 py-10 text-[#0F172A]">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/70">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">
            Operasional Armada Online
          </p>
          <h1 className="mt-1 text-base font-bold tracking-tight text-slate-900">
            Monitoring Breakdown IP HAULING KARUNIA ARMADA INDONESIA
          </h1>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            Data Unit Running, Input BD, Nomor MR, PA Per Jam, dan Riwayat RFU tersinkronisasi langsung antar rekan kerja.
          </p>
        </div>

        <div className="p-6 space-y-5">
          {mode === 'signin' ? (
            <>
              {pendingInviteCode && (
                <div className="p-3 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-900">
                  Link undangan tim terdeteksi (<span className="font-mono font-semibold">{pendingInviteCode}</span>). Masuk dengan akun Google pribadi Anda untuk langsung bergabung.
                </div>
              )}

              {errorMessage && (
                <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-900 space-y-2">
                  <p className="font-medium leading-relaxed">{errorMessage}</p>
                  {errorCode && (
                    <p className="font-mono text-[11px] text-red-700 break-all">
                      Kode: {errorCode}
                    </p>
                  )}
                  {(isInIframe ||
                    errorCode === 'auth/popup-blocked' ||
                    errorCode === 'auth/popup-closed-by-user' ||
                    errorCode === 'auth/cancelled-popup-request') &&
                    currentUrl && (
                      <a
                        href={currentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-800 bg-white border border-blue-300 hover:bg-blue-50 rounded cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Buka Aplikasi di Tab Baru</span>
                      </a>
                    )}
                </div>
              )}

              <button
                type="button"
                disabled={loading}
                onClick={() => void onSignInGoogle()}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                <LogIn className="w-4 h-4" aria-hidden="true" />
                <span>{loading ? 'Membuka Login Google...' : 'Masuk dengan Akun Google'}</span>
              </button>

              {isInIframe && currentUrl && (
                <div className="p-3 rounded-md bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center justify-between gap-2">
                  <span>Jika popup Google terblokir di preview, buka di tab penuh:</span>
                  <a
                    href={currentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline whitespace-nowrap shrink-0"
                  >
                    <span>Tab Baru</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                <p>
                  Gunakan akun Google / Gmail pribadi Anda untuk masuk. Jika email Anda sudah didaftarkan Admin atau Anda membuka link undangan tim, akses board langsung terbuka.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="p-3 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">
                    {userDisplayName || 'Akun Google'}
                  </p>
                  {userEmail && (
                    <p className="text-[11px] text-slate-500 truncate font-mono">{userEmail}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void onSignOut()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded cursor-pointer whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Ganti Akun</span>
                </button>
              </div>

              {!userEmailVerified && (
                <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                  Email akun Google Anda (<span className="font-mono font-semibold">{userEmail}</span>) belum berstatus terverifikasi di Google. Gunakan akun <span className="font-mono">@gmail.com</span> pribadi atau verifikasi email Anda terlebih dahulu di pengaturan Akun Google, lalu klik <strong>Ganti Akun</strong>.
                </div>
              )}

              <form onSubmit={handleJoinSubmit} className="space-y-3">
                <div>
                  <label
                    htmlFor="team-invite-code"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Kode atau Link Undangan Tim Kerja
                  </label>
                  <div className="relative">
                    <KeyRound
                      className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <input
                      id="team-invite-code"
                      type="text"
                      value={inviteInput}
                      onChange={(e) => setInviteInput(e.target.value)}
                      placeholder="Contoh: KAI-IPHAULING atau tempel link undangan"
                      maxLength={300}
                      required
                      disabled={!userEmailVerified}
                      className="w-full pl-9 pr-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
                    Masukkan kode/link undangan dari Admin, <strong>atau</strong> minta Admin mendaftarkan email <span className="font-mono">{userEmail || 'pribadi Anda'}</span> di menu <em>Tim &amp; Undangan</em> lalu klik tombol cek akses di bawah.
                  </p>
                </div>

                {(joinError || errorMessage) && (
                  <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-800 leading-relaxed">
                    {joinError || errorMessage}
                  </div>
                )}

                {recheckMsg && (
                  <div className="p-3 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-900 leading-relaxed flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{recheckMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || loading || !inviteInput.trim() || !userEmailVerified}
                  className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Users className="w-4 h-4" aria-hidden="true" />
                  <span>{submitting ? 'Memverifikasi Kode...' : 'Gabung Tim Operasional'}</span>
                </button>

                {onRecheckEmailAccess && userEmailVerified && (
                  <button
                    type="button"
                    disabled={rechecking || loading}
                    onClick={() => void handleRecheck()}
                    className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 disabled:opacity-60 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${rechecking ? 'animate-spin' : ''}`} aria-hidden="true" />
                    <span>
                      {rechecking
                        ? 'Memeriksa Pendaftaran Email...'
                        : 'Sudah Didaftarkan Admin? Cek Akses Email Saya'}
                    </span>
                  </button>
                )}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

