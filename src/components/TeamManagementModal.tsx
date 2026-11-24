import {
  Check,
  CloudUpload,
  Copy,
  KeyRound,
  Link2,
  RefreshCw,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { DEFAULT_WORKSPACE_ID } from '../firebase';
import {
  WorkspaceInfo,
  WorkspaceInviteInfo,
  WorkspaceMemberInfo,
} from '../services/workspaceService';

interface TeamManagementModalProps {
  isOpen: boolean;
  workspace: WorkspaceInfo | null;
  membership: WorkspaceMemberInfo | null;
  isOwnerOrAdmin: boolean;
  currentUserUid: string;
  hasLocalMigrationData: boolean;
  localSummaryText: string;
  onClose: () => void;
  onLoadTeamDetails: () => Promise<{
    members: WorkspaceMemberInfo[];
    invites: WorkspaceInviteInfo[];
  }>;
  onCreateInviteCode: () => Promise<WorkspaceInviteInfo | null>;
  onToggleInviteActive: (code: string, active: boolean) => Promise<void>;
  onRemoveMember: (memberUid: string) => Promise<void>;
  onMigrateLocalToCloud: () => Promise<void>;
}

export function TeamManagementModal({
  isOpen,
  workspace,
  membership,
  isOwnerOrAdmin,
  currentUserUid,
  hasLocalMigrationData,
  localSummaryText,
  onClose,
  onLoadTeamDetails,
  onCreateInviteCode,
  onToggleInviteActive,
  onRemoveMember,
  onMigrateLocalToCloud,
}: TeamManagementModalProps) {
  const [members, setMembers] = useState<WorkspaceMemberInfo[]>([]);
  const [invites, setInvites] = useState<WorkspaceInviteInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refreshDetails = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await onLoadTeamDetails();
      setMembers(res.members);
      setInvites(res.invites);
    } catch {
      setErrorMsg('Gagal memuat daftar anggota dan kode undangan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && isOwnerOrAdmin) {
      void refreshDetails();
    }
  }, [isOpen, isOwnerOrAdmin]);

  if (!isOpen) return null;

  const activeInvite = invites.find((inv) => inv.active);
  const shareCode = activeInvite?.code || membership?.inviteCode || '';
  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const inviteLink = shareCode
    ? `${originUrl}/?ws=${encodeURIComponent(workspace?.id || DEFAULT_WORKSPACE_ID)}&invite=${encodeURIComponent(shareCode)}`
    : originUrl;

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      setErrorMsg('Gagal menyalin ke clipboard.');
    }
  };

  const handleGenerateInvite = async () => {
    setBusyAction('create-invite');
    try {
      const created = await onCreateInviteCode();
      if (created) {
        setInvites((prev) => [created, ...prev]);
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleInvite = async (code: string, nextActive: boolean) => {
    setBusyAction(`toggle-${code}`);
    try {
      await onToggleInviteActive(code, nextActive);
      setInvites((prev) =>
        prev.map((inv) => (inv.code === code ? { ...inv, active: nextActive } : inv))
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteMember = async (memberUid: string) => {
    setBusyAction(`remove-${memberUid}`);
    try {
      await onRemoveMember(memberUid);
      setMembers((prev) => prev.filter((m) => m.uid !== memberUid));
    } finally {
      setBusyAction(null);
    }
  };

  const handleMigrate = async () => {
    setBusyAction('migrate');
    try {
      await onMigrateLocalToCloud();
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-modal-title"
    >
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
            <h2 id="team-modal-title" className="text-sm font-bold text-slate-900 truncate">
              Tim Online &amp; Akses Rekan Kerja
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="p-1 text-slate-500 hover:text-slate-800 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto ops-scroll">
          {/* Workspace & Current User Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs">
            <div>
              <span className="text-slate-500 block">Workspace Aktif</span>
              <span className="font-semibold text-slate-900">
                {workspace?.name || 'IP HAULING KARUNIA ARMADA INDONESIA'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Peran Anda</span>
              <span className="font-semibold text-slate-900">
                {membership?.displayName || 'Anggota Tim'} ·{' '}
                {isOwnerOrAdmin ? 'Admin Tim' : 'Operator'}
              </span>
            </div>
          </div>

          {/* Share Link & Invite Code Section */}
          <div className="border border-slate-200 rounded-md p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-blue-700" aria-hidden="true" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Bagikan ke Rekan Kerja (Grup WhatsApp)
                </h3>
              </div>
              {isOwnerOrAdmin && (
                <button
                  type="button"
                  disabled={busyAction === 'create-invite'}
                  onClick={() => void handleGenerateInvite()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded cursor-pointer whitespace-nowrap shrink-0"
                >
                  <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Buat Kode Baru</span>
                </button>
              )}
            </div>

            {shareCode ? (
              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Link Masuk Otomatis (rekan kerja tinggal buka link &amp; login Google)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={inviteLink}
                      className="flex-1 text-xs font-mono bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCopy(inviteLink, 'link')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {copiedKey === 'link' ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedKey === 'link' ? 'Tersalin' : 'Salin Link'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="text-xs text-slate-600">
                    Kode Undangan Aktif:{' '}
                    <span className="font-mono font-bold text-slate-900">{shareCode}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopy(shareCode, 'code')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {copiedKey === 'code' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedKey === 'code' ? 'Kode Tersalin' : 'Salin Kode'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Belum ada kode undangan aktif. Admin dapat membuat kode undangan baru di atas.
              </p>
            )}
          </div>

          {/* Local Migration Utility */}
          {hasLocalMigrationData && (
            <div className="border border-amber-200 bg-amber-50/70 rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-amber-950">
                  Data Lokal Browser Terdeteksi
                </p>
                <p className="text-xs text-amber-800">{localSummaryText}</p>
              </div>
              <button
                type="button"
                disabled={busyAction === 'migrate'}
                onClick={() => void handleMigrate()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-60 rounded cursor-pointer whitespace-nowrap shrink-0"
              >
                <CloudUpload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {busyAction === 'migrate' ? 'Mengunggah...' : 'Unggah ke Cloud Tim'}
                </span>
              </button>
            </div>
          )}

          {/* Admin Section: Invites & Team Members */}
          {isOwnerOrAdmin && (
            <div className="space-y-4">
              {errorMsg && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-xs text-red-800">
                  {errorMsg}
                </div>
              )}

              {/* Invite Codes Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                    Daftar Kode Undangan
                  </h3>
                  <button
                    type="button"
                    onClick={() => void refreshDetails()}
                    disabled={loading}
                    className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>Muat Ulang</span>
                  </button>
                </div>
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Kode</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 font-semibold text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {invites.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-3 text-slate-500 text-center">
                            Belum ada kode undangan.
                          </td>
                        </tr>
                      ) : (
                        invites.map((inv) => (
                          <tr key={inv.code}>
                            <td className="px-3 py-2 font-mono font-semibold text-slate-900">
                              {inv.code}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {inv.active ? (
                                <span className="text-emerald-700 font-medium">Aktif</span>
                              ) : (
                                <span className="text-slate-400">Nonaktif</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                disabled={busyAction === `toggle-${inv.code}`}
                                onClick={() => void handleToggleInvite(inv.code, !inv.active)}
                                className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                              >
                                {inv.active ? 'Nonaktifkan' : 'Aktifkan'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Members Table */}
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide mb-2">
                  Anggota Tim Terdaftar ({members.length})
                </h3>
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Nama Anggota</th>
                        <th className="px-3 py-2 font-semibold">Peran</th>
                        <th className="px-3 py-2 font-semibold text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {members.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-3 text-slate-500 text-center">
                            Memuat anggota...
                          </td>
                        </tr>
                      ) : (
                        members.map((m) => (
                          <tr key={m.uid}>
                            <td className="px-3 py-2 font-medium text-slate-900">
                              {m.displayName}
                              {m.uid === currentUserUid && (
                                <span className="ml-1.5 text-[11px] text-slate-500">(Anda)</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-700 capitalize">{m.role}</td>
                            <td className="px-3 py-2 text-right">
                              {m.uid !== currentUserUid ? (
                                <button
                                  type="button"
                                  disabled={busyAction === `remove-${m.uid}`}
                                  onClick={() => void handleDeleteMember(m.uid)}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Keluarkan</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400">Owner</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-md cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
