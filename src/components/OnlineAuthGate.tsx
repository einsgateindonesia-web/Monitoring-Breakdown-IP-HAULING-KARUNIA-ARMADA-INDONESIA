import { KeyRound, LogIn, LogOut, ShieldCheck, Users } from 'lucide-react';
import { FormEvent, useState } from 'react';

interface OnlineAuthGateProps {
  mode: 'signin' | 'join';
  userDisplayName?: string;
  userEmail?: string | null;
  pendingInviteCode?: string;
  loading?: boolean;
  errorMessage?: string | null;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onJoinWithCode: (code: string) => Promise<{ ok: boolean; message?: string }>;
}

export function OnlineAuthGate({
  mode,
  userDisplayName,
  userEmail,
  pendingInviteCode = '',
  loading = false,
  errorMessage = null,
  onSignInGoogle,
  onSignOut,
  onJoinWithCode,
}: OnlineAuthGateProps) {
  const [inviteInput, setInviteInput] = useState(pendingInviteCode);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleJoinSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setJoinError(null);
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
                  Link undangan tim terdeteksi (<span className="font-mono font-semibold">{pendingInviteCode}</span>). Masuk dengan akun Google untuk langsung bergabung.
                </div>
              )}

              {errorMessage && (
                <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-800">
                  {errorMessage}
                </div>
              )}

              <button
                type="button"
                disabled={loading}
                onClick={() => void onSignInGoogle()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                <LogIn className="w-4 h-4" aria-hidden="true" />
                <span>{loading ? 'Menghubungkan...' : 'Masuk dengan Akun Google'}</span>
              </button>

              <div className="pt-3 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                <p>
                  Akses board operasional dibatasi hanya untuk anggota tim yang terverifikasi atau memiliki kode undangan resmi.
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

              <form onSubmit={handleJoinSubmit} className="space-y-3">
                <div>
                  <label
                    htmlFor="team-invite-code"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Kode Undangan Tim Kerja
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
                      onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
                      placeholder="Contoh: KAI-IPHAULING"
                      maxLength={64}
                      required
                      className="w-full pl-9 pr-3 py-2 text-sm font-mono uppercase bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Minta kode atau link undangan dari Admin operasional tim Anda.
                  </p>
                </div>

                {(joinError || errorMessage) && (
                  <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-800">
                    {joinError || errorMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || loading || !inviteInput.trim()}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Users className="w-4 h-4" aria-hidden="true" />
                  <span>{submitting ? 'Memverifikasi Kode...' : 'Gabung Tim Operasional'}</span>
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
