import { User } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import { INITIAL_FLEET_UNITS } from '../data/initialUnits';
import {
  BLUEPRINT_LIMITS,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_NAME,
  handleFirestoreError,
  OperationType,
  sanitizeDisplayName,
  sanitizeId,
} from '../firebase';
import {
  BreakdownRecord,
  FleetUnit,
  HourlySlotOverride,
  RfuHistoryRecord,
} from '../types/fleet';
import { getCurrentDateYYYYMMDD, normalizeMrList } from '../utils/fleetUtils';

export interface WorkspaceMemberInfo {
  uid: string;
  workspaceId: string;
  ownerUid: string;
  displayName: string;
  role: 'admin' | 'operator';
  inviteCode: string;
  joinedAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface WorkspaceInviteInfo {
  code: string;
  workspaceId: string;
  ownerUid: string;
  active: boolean;
  createdByUid: string;
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  ownerUid: string;
}

export interface BoardMetaState {
  rfuMonths: string[];
  hourlyMonths: string[];
}

export interface SyncActor {
  uid: string;
  displayName: string;
}

const DEFAULT_INVITE_CODE = 'KAI-IPHAULING';

function toActor(user: User): SyncActor {
  return {
    uid: user.uid,
    displayName: sanitizeDisplayName(user.displayName, user.email),
  };
}

export function cleanFleetUnit(unit: FleetUnit): FleetUnit {
  return {
    id: sanitizeId(unit.id || `unit-${Date.now()}`),
    code: String(unit.code ?? '').trim().toUpperCase().slice(0, 40),
    fleetGroup: unit.fleetGroup,
    orderIndex: Number.isFinite(unit.orderIndex) ? unit.orderIndex : 0,
  };
}

export function cleanBreakdownRecord(rec: BreakdownRecord): BreakdownRecord {
  return {
    id: sanitizeId(rec.id || `bd-${Date.now()}`),
    unitCode: String(rec.unitCode ?? '').trim().toUpperCase().slice(0, 40),
    fleetGroup: rec.fleetGroup,
    jamBd: String(rec.jamBd ?? '').slice(0, 10),
    tanggalBd: String(rec.tanggalBd ?? '').slice(0, 16),
    lokasi: String(rec.lokasi ?? '').slice(0, 160),
    mrNumbers: normalizeMrList(rec.mrNumbers).slice(0, 30),
    keterangan: String(rec.keterangan ?? '').slice(0, 500),
    status: rec.status,
    updatedAt: String(rec.updatedAt ?? new Date().toISOString()).slice(0, 40),
  };
}

export function cleanRfuRecord(rec: RfuHistoryRecord): RfuHistoryRecord {
  return {
    id: sanitizeId(rec.id || `rfu-${Date.now()}`),
    unitCode: String(rec.unitCode ?? '').trim().toUpperCase().slice(0, 40),
    fleetGroup: rec.fleetGroup,
    jamBd: String(rec.jamBd ?? '').slice(0, 10),
    tanggalBd: String(rec.tanggalBd ?? '').slice(0, 16),
    jamRfu: String(rec.jamRfu ?? '').slice(0, 10),
    tanggalRfu: String(rec.tanggalRfu ?? '').slice(0, 16),
    lokasi: String(rec.lokasi ?? '').slice(0, 160),
    mrNumbers: normalizeMrList(rec.mrNumbers).slice(0, 30),
    keterangan: String(rec.keterangan ?? '').slice(0, 500),
    komponen: String(rec.komponen ?? '').slice(0, 120),
    subKomponen: String(rec.subKomponen ?? '').slice(0, 120),
    detailSubKomponen: String(rec.detailSubKomponen ?? '').slice(0, 160),
    activityPerbaikan: String(rec.activityPerbaikan ?? '').slice(0, 500),
    lastStatus: rec.lastStatus,
  };
}

export function cleanHourlyOverride(ov: HourlySlotOverride): HourlySlotOverride {
  return {
    key: sanitizeId(ov.key),
    shiftDate: String(ov.shiftDate ?? '').slice(0, 16),
    slotIndex: Number.isFinite(ov.slotIndex) ? ov.slotIndex : 0,
    totalPopulasi: Number.isFinite(ov.totalPopulasi) ? ov.totalPopulasi : 0,
    bdCount: Number.isFinite(ov.bdCount) ? ov.bdCount : 0,
    updatedAt: String(ov.updatedAt ?? new Date().toISOString()).slice(0, 40),
  };
}

export function getMonthKeyFromDate(dateStr?: string): string {
  const candidate = (dateStr ?? '').trim().slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(candidate)) return candidate;
  return getCurrentDateYYYYMMDD().slice(0, 7);
}

export function isBootstrappedAdminUser(user: User | null): boolean {
  return Boolean(
    user &&
      user.emailVerified &&
      user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
  );
}

export async function syncUserProfile(user: User): Promise<void> {
  const displayName = sanitizeDisplayName(user.displayName, user.email);
  const email = (user.email ?? '').trim().slice(0, BLUEPRINT_LIMITS.maxEmailLength);
  const publicPath = `users/${user.uid}`;
  const privatePath = `users/${user.uid}/private/info`;

  try {
    const publicRef = doc(db, 'users', user.uid);
    const existingPublic = await getDoc(publicRef);
    if (!existingPublic.exists()) {
      await setDoc(publicRef, {
        uid: user.uid,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (existingPublic.data()?.displayName !== displayName) {
      await updateDoc(publicRef, {
        displayName,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, publicPath);
  }

  if (email) {
    try {
      const privateRef = doc(db, 'users', user.uid, 'private', 'info');
      const existingPrivate = await getDoc(privateRef);
      if (!existingPrivate.exists()) {
        await setDoc(privateRef, {
          uid: user.uid,
          email,
          updatedAt: serverTimestamp(),
        });
      } else if (existingPrivate.data()?.email !== email) {
        await updateDoc(privateRef, {
          email,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, privatePath);
    }
  }
}

export async function ensureWorkspaceForBootstrappedAdmin(
  user: User,
  workspaceId = DEFAULT_WORKSPACE_ID
): Promise<{ workspace: WorkspaceInfo; membership: WorkspaceMemberInfo }> {
  const actor = toActor(user);
  const wsPath = `workspaces/${workspaceId}`;
  const wsRef = doc(db, 'workspaces', workspaceId);

  let ownerUid = user.uid;
  let name = DEFAULT_WORKSPACE_NAME;

  try {
    const wsSnap = await getDoc(wsRef);
    if (!wsSnap.exists()) {
      await setDoc(wsRef, {
        name: DEFAULT_WORKSPACE_NAME,
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      ownerUid = String(wsSnap.data().ownerUid ?? user.uid);
      name = String(wsSnap.data().name ?? DEFAULT_WORKSPACE_NAME);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, wsPath);
  }

  // Ensure admin marker doc exists
  const adminRef = doc(db, 'admins', user.uid);
  try {
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists()) {
      await setDoc(adminRef, {
        uid: user.uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `admins/${user.uid}`);
  }

  // Ensure admin membership doc exists
  const memberPath = `workspaces/${workspaceId}/members/${user.uid}`;
  const memberRef = doc(db, 'workspaces', workspaceId, 'members', user.uid);
  let membership: WorkspaceMemberInfo = {
    uid: user.uid,
    workspaceId,
    ownerUid,
    displayName: actor.displayName,
    role: 'admin',
    inviteCode: DEFAULT_INVITE_CODE,
  };

  try {
    const memberSnap = await getDoc(memberRef);
    if (!memberSnap.exists()) {
      await setDoc(memberRef, {
        ...membership,
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const data = memberSnap.data();
      membership = {
        uid: String(data.uid ?? user.uid),
        workspaceId,
        ownerUid: String(data.ownerUid ?? ownerUid),
        displayName: String(data.displayName ?? actor.displayName),
        role: data.role === 'admin' ? 'admin' : 'operator',
        inviteCode: String(data.inviteCode ?? DEFAULT_INVITE_CODE),
      };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, memberPath);
  }

  // Ensure at least one invite code exists if user is owner
  if (ownerUid === user.uid) {
    try {
      const invitesQuery = query(
        collection(db, 'workspaces', workspaceId, 'invites'),
        where('ownerUid', '==', ownerUid)
      );
      const invitesSnap = await getDocs(invitesQuery);
      if (invitesSnap.empty) {
        const inviteRef = doc(db, 'workspaces', workspaceId, 'invites', DEFAULT_INVITE_CODE);
        await setDoc(inviteRef, {
          code: DEFAULT_INVITE_CODE,
          workspaceId,
          ownerUid,
          active: true,
          createdByUid: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `workspaces/${workspaceId}/invites`);
    }
  }

  // Ensure initial board documents exist
  await ensureInitialBoardDocs(workspaceId, actor);

  return {
    workspace: { id: workspaceId, name, ownerUid },
    membership,
  };
}

export async function ensureInitialBoardDocs(
  workspaceId: string,
  actor: SyncActor
): Promise<void> {
  const fleetRef = doc(db, 'workspaces', workspaceId, 'board', 'fleet');
  const activeBdRef = doc(db, 'workspaces', workspaceId, 'board', 'activeBd');
  const metaRef = doc(db, 'workspaces', workspaceId, 'board', 'meta');

  try {
    const [fleetSnap, bdSnap, metaSnap] = await Promise.all([
      getDoc(fleetRef),
      getDoc(activeBdRef),
      getDoc(metaRef),
    ]);

    if (!fleetSnap.exists()) {
      const unitsMap: Record<string, FleetUnit> = {};
      for (const u of INITIAL_FLEET_UNITS) {
        const cleaned = cleanFleetUnit(u);
        unitsMap[cleaned.id] = cleaned;
      }
      await setDoc(fleetRef, {
        units: unitsMap,
        updatedAt: serverTimestamp(),
        updatedByUid: actor.uid,
        updatedByName: actor.displayName,
      });
    }

    if (!bdSnap.exists()) {
      await setDoc(activeBdRef, {
        records: {},
        updatedAt: serverTimestamp(),
        updatedByUid: actor.uid,
        updatedByName: actor.displayName,
      });
    }

    if (!metaSnap.exists()) {
      const currentMonth = getMonthKeyFromDate();
      await setDoc(metaRef, {
        rfuMonths: [currentMonth],
        hourlyMonths: [currentMonth],
        updatedAt: serverTimestamp(),
        updatedByUid: actor.uid,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `workspaces/${workspaceId}/board`);
  }
}

export async function fetchMembership(
  workspaceId: string,
  uid: string
): Promise<WorkspaceMemberInfo | null> {
  const path = `workspaces/${workspaceId}/members/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'workspaces', workspaceId, 'members', uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      uid: String(data.uid ?? uid),
      workspaceId: String(data.workspaceId ?? workspaceId),
      ownerUid: String(data.ownerUid ?? ''),
      displayName: String(data.displayName ?? 'Operator Tim'),
      role: data.role === 'admin' ? 'admin' : 'operator',
      inviteCode: String(data.inviteCode ?? ''),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function fetchWorkspaceInfo(workspaceId: string): Promise<WorkspaceInfo | null> {
  const path = `workspaces/${workspaceId}`;
  try {
    const snap = await getDoc(doc(db, 'workspaces', workspaceId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id: snap.id,
      name: String(data.name ?? DEFAULT_WORKSPACE_NAME),
      ownerUid: String(data.ownerUid ?? ''),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function joinWorkspaceWithInvite(
  workspaceId: string,
  rawInviteCode: string,
  user: User
): Promise<{ ok: boolean; message?: string; membership?: WorkspaceMemberInfo }> {
  const inviteCode = sanitizeId(rawInviteCode.trim().toUpperCase());
  if (!inviteCode) {
    return { ok: false, message: 'Masukkan kode undangan tim terlebih dahulu.' };
  }

  const invitePath = `workspaces/${workspaceId}/invites/${inviteCode}`;
  try {
    const inviteSnap = await getDoc(doc(db, 'workspaces', workspaceId, 'invites', inviteCode));
    if (!inviteSnap.exists()) {
      return {
        ok: false,
        message: 'Kode undangan tidak ditemukan atau tim belum diinisialisasi oleh Admin.',
      };
    }

    const inviteData = inviteSnap.data();
    if (!inviteData.active) {
      return {
        ok: false,
        message: 'Kode undangan ini sudah dinonaktifkan. Minta kode terbaru ke Admin tim.',
      };
    }

    const ownerUid = String(inviteData.ownerUid ?? '');
    const displayName = sanitizeDisplayName(user.displayName, user.email);
    const memberRef = doc(db, 'workspaces', workspaceId, 'members', user.uid);

    await setDoc(memberRef, {
      uid: user.uid,
      workspaceId,
      ownerUid,
      displayName,
      role: 'operator',
      inviteCode,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      ok: true,
      membership: {
        uid: user.uid,
        workspaceId,
        ownerUid,
        displayName,
        role: 'operator',
        inviteCode,
      },
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, invitePath);
  }
}

export async function listWorkspaceMembers(
  workspaceId: string,
  ownerUid: string
): Promise<WorkspaceMemberInfo[]> {
  const path = `workspaces/${workspaceId}/members`;
  try {
    const q = query(
      collection(db, 'workspaces', workspaceId, 'members'),
      where('ownerUid', '==', ownerUid)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        uid: String(data.uid ?? d.id),
        workspaceId: String(data.workspaceId ?? workspaceId),
        ownerUid: String(data.ownerUid ?? ownerUid),
        displayName: String(data.displayName ?? 'Operator Tim'),
        role: data.role === 'admin' ? 'admin' : 'operator',
        inviteCode: String(data.inviteCode ?? ''),
        joinedAt: (data.joinedAt as Timestamp | undefined) ?? null,
        updatedAt: (data.updatedAt as Timestamp | undefined) ?? null,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function listWorkspaceInvites(
  workspaceId: string,
  ownerUid: string
): Promise<WorkspaceInviteInfo[]> {
  const path = `workspaces/${workspaceId}/invites`;
  try {
    const q = query(
      collection(db, 'workspaces', workspaceId, 'invites'),
      where('ownerUid', '==', ownerUid)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        code: String(data.code ?? d.id),
        workspaceId: String(data.workspaceId ?? workspaceId),
        ownerUid: String(data.ownerUid ?? ownerUid),
        active: Boolean(data.active),
        createdByUid: String(data.createdByUid ?? ''),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function createNewInviteCode(
  workspaceId: string,
  ownerUid: string,
  user: User
): Promise<WorkspaceInviteInfo> {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const code = `KAI-${suffix}`;
  const path = `workspaces/${workspaceId}/invites/${code}`;
  try {
    await setDoc(doc(db, 'workspaces', workspaceId, 'invites', code), {
      code,
      workspaceId,
      ownerUid,
      active: true,
      createdByUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return {
      code,
      workspaceId,
      ownerUid,
      active: true,
      createdByUid: user.uid,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function setInviteActiveState(
  workspaceId: string,
  inviteCode: string,
  active: boolean
): Promise<void> {
  const path = `workspaces/${workspaceId}/invites/${inviteCode}`;
  try {
    await updateDoc(doc(db, 'workspaces', workspaceId, 'invites', inviteCode), {
      active,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function removeWorkspaceMember(
  workspaceId: string,
  memberUid: string
): Promise<void> {
  const path = `workspaces/${workspaceId}/members/${memberUid}`;
  try {
    await deleteDoc(doc(db, 'workspaces', workspaceId, 'members', memberUid));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeBoardFleet(
  workspaceId: string,
  onData: (units: FleetUnit[], meta: { updatedByName?: string }) => void
): Unsubscribe {
  const path = `workspaces/${workspaceId}/board/fleet`;
  return onSnapshot(
    doc(db, 'workspaces', workspaceId, 'board', 'fleet'),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const rawUnits = (data.units ?? {}) as Record<string, FleetUnit>;
      const list = Object.values(rawUnits)
        .map(cleanFleetUnit)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      onData(list, {
        updatedByName: typeof data.updatedByName === 'string' ? data.updatedByName : undefined,
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeBoardActiveBd(
  workspaceId: string,
  onData: (records: BreakdownRecord[], meta: { updatedByName?: string }) => void
): Unsubscribe {
  const path = `workspaces/${workspaceId}/board/activeBd`;
  return onSnapshot(
    doc(db, 'workspaces', workspaceId, 'board', 'activeBd'),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const rawRecords = (data.records ?? {}) as Record<string, BreakdownRecord>;
      const list = Object.values(rawRecords)
        .map(cleanBreakdownRecord)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      onData(list, {
        updatedByName: typeof data.updatedByName === 'string' ? data.updatedByName : undefined,
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeBoardMeta(
  workspaceId: string,
  onData: (meta: BoardMetaState) => void
): Unsubscribe {
  const path = `workspaces/${workspaceId}/board/meta`;
  return onSnapshot(
    doc(db, 'workspaces', workspaceId, 'board', 'meta'),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      onData({
        rfuMonths: Array.isArray(data.rfuMonths)
          ? data.rfuMonths.filter((m): m is string => typeof m === 'string')
          : [],
        hourlyMonths: Array.isArray(data.hourlyMonths)
          ? data.hourlyMonths.filter((m): m is string => typeof m === 'string')
          : [],
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeRfuMonth(
  workspaceId: string,
  monthKey: string,
  onData: (records: Record<string, RfuHistoryRecord>) => void
): Unsubscribe {
  const path = `workspaces/${workspaceId}/rfuMonths/${monthKey}`;
  return onSnapshot(
    doc(db, 'workspaces', workspaceId, 'rfuMonths', monthKey),
    (snap) => {
      if (!snap.exists()) {
        onData({});
        return;
      }
      const raw = (snap.data().records ?? {}) as Record<string, RfuHistoryRecord>;
      const cleaned: Record<string, RfuHistoryRecord> = {};
      for (const [k, v] of Object.entries(raw)) {
        cleaned[k] = cleanRfuRecord(v);
      }
      onData(cleaned);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeHourlyMonth(
  workspaceId: string,
  monthKey: string,
  onData: (overrides: Record<string, HourlySlotOverride>) => void
): Unsubscribe {
  const path = `workspaces/${workspaceId}/hourlyMonths/${monthKey}`;
  return onSnapshot(
    doc(db, 'workspaces', workspaceId, 'hourlyMonths', monthKey),
    (snap) => {
      if (!snap.exists()) {
        onData({});
        return;
      }
      const raw = (snap.data().overrides ?? {}) as Record<string, HourlySlotOverride>;
      const cleaned: Record<string, HourlySlotOverride> = {};
      for (const [k, v] of Object.entries(raw)) {
        cleaned[k] = cleanHourlyOverride(v);
      }
      onData(cleaned);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

// --- Cloud Mutation Helpers ---

export async function saveFleetUnitsReplace(
  workspaceId: string,
  units: FleetUnit[],
  user: User
): Promise<void> {
  const actor = toActor(user);
  const path = `workspaces/${workspaceId}/board/fleet`;
  const unitsMap: Record<string, FleetUnit> = {};
  for (const unit of units.slice(0, BLUEPRINT_LIMITS.maxUnitsCount)) {
    const cleaned = cleanFleetUnit(unit);
    unitsMap[cleaned.id] = cleaned;
  }
  try {
    await setDoc(doc(db, 'workspaces', workspaceId, 'board', 'fleet'), {
      units: unitsMap,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.displayName,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function upsertFleetUnitsCloud(
  workspaceId: string,
  units: FleetUnit[],
  user: User
): Promise<void> {
  const actor = toActor(user);
  const path = `workspaces/${workspaceId}/board/fleet`;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    updatedByUid: actor.uid,
    updatedByName: actor.displayName,
  };
  for (const unit of units) {
    const cleaned = cleanFleetUnit(unit);
    payload[`units.${cleaned.id}`] = cleaned;
  }
  try {
    await updateDoc(doc(db, 'workspaces', workspaceId, 'board', 'fleet'), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteFleetUnitCloud(
  workspaceId: string,
  unitId: string,
  user: User
): Promise<void> {
  const actor = toActor(user);
  const safeId = sanitizeId(unitId);
  const path = `workspaces/${workspaceId}/board/fleet`;
  try {
    await updateDoc(doc(db, 'workspaces', workspaceId, 'board', 'fleet'), {
      [`units.${safeId}`]: deleteField(),
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.displayName,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function upsertBdRecordCloud(
  workspaceId: string,
  record: BreakdownRecord,
  user: User
): Promise<void> {
  const actor = toActor(user);
  const cleaned = cleanBreakdownRecord(record);
  const path = `workspaces/${workspaceId}/board/activeBd`;
  try {
    await updateDoc(doc(db, 'workspaces', workspaceId, 'board', 'activeBd'), {
      [`records.${cleaned.id}`]: cleaned,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.displayName,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteBdRecordCloud(
  workspaceId: string,
  recordId: string,
  user: User
): Promise<void> {
  const actor = toActor(user);
  const safeId = sanitizeId(recordId);
  const path = `workspaces/${workspaceId}/board/activeBd`;
  try {
    await updateDoc(doc(db, 'workspaces', workspaceId, 'board', 'activeBd'), {
      [`records.${safeId}`]: deleteField(),
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.displayName,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function replaceActiveBdCloud(
  workspaceId: string,
  records: BreakdownRecord[],
  user: User
): Promise<void> {
  const actor = toActor(user);
  const path = `workspaces/${workspaceId}/board/activeBd`;
  const map: Record<string, BreakdownRecord> = {};
  for (const rec of records.slice(0, BLUEPRINT_LIMITS.maxActiveBdCount)) {
    const cleaned = cleanBreakdownRecord(rec);
    map[cleaned.id] = cleaned;
  }
  try {
    await setDoc(doc(db, 'workspaces', workspaceId, 'board', 'activeBd'), {
      records: map,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.displayName,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function upsertManyBdRecordsCloud(
  workspaceId: string,
  records: BreakdownRecord[],
  user: User
): Promise<void> {
  if (records.length === 0) return;
  const actor = toActor(user);
  const path = `workspaces/${workspaceId}/board/activeBd`;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    updatedByUid: actor.uid,
    updatedByName: actor.displayName,
  };
  for (const rec of records) {
    const cleaned = cleanBreakdownRecord(rec);
    payload[`records.${cleaned.id}`] = cleaned;
  }
  try {
    await updateDoc(doc(db, 'workspaces', workspaceId, 'board', 'activeBd'), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

async function ensureMonthKeyInMeta(
  workspaceId: string,
  field: 'rfuMonths' | 'hourlyMonths',
  monthKey: string,
  uid: string
): Promise<void> {
  const metaPath = `workspaces/${workspaceId}/board/meta`;
  try {
    await updateDoc(doc(db, 'workspaces', workspaceId, 'board', 'meta'), {
      [field]: arrayUnion(monthKey),
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, metaPath);
  }
}

export async function upsertRfuRecordsCloud(
  workspaceId: string,
  entries: RfuHistoryRecord[],
  knownRfuMonths: string[],
  user: User
): Promise<void> {
  if (entries.length === 0) return;
  const actor = toActor(user);

  const byMonth = new Map<string, RfuHistoryRecord[]>();
  for (const item of entries) {
    const cleaned = cleanRfuRecord(item);
    const monthKey = getMonthKeyFromDate(cleaned.tanggalRfu);
    const bucket = byMonth.get(monthKey) ?? [];
    bucket.push(cleaned);
    byMonth.set(monthKey, bucket);
  }

  for (const [monthKey, monthItems] of byMonth.entries()) {
    const monthPath = `workspaces/${workspaceId}/rfuMonths/${monthKey}`;
    const monthRef = doc(db, 'workspaces', workspaceId, 'rfuMonths', monthKey);

    try {
      const snap = await getDoc(monthRef);
      if (!snap.exists()) {
        const recordsMap: Record<string, RfuHistoryRecord> = {};
        for (const item of monthItems) {
          recordsMap[item.id] = item;
        }
        await setDoc(monthRef, {
          monthKey,
          records: recordsMap,
          updatedAt: serverTimestamp(),
          updatedByUid: actor.uid,
          updatedByName: actor.displayName,
        });
      } else {
        const payload: Record<string, unknown> = {
          updatedAt: serverTimestamp(),
          updatedByUid: actor.uid,
          updatedByName: actor.displayName,
        };
        for (const item of monthItems) {
          payload[`records.${item.id}`] = item;
        }
        await updateDoc(monthRef, payload);
      }

      if (!knownRfuMonths.includes(monthKey)) {
        await ensureMonthKeyInMeta(workspaceId, 'rfuMonths', monthKey, actor.uid);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, monthPath);
    }
  }
}

export async function deleteRfuRecordCloud(
  workspaceId: string,
  record: RfuHistoryRecord,
  user: User
): Promise<void> {
  const actor = toActor(user);
  const safeId = sanitizeId(record.id);
  const monthKey = getMonthKeyFromDate(record.tanggalRfu);
  const monthPath = `workspaces/${workspaceId}/rfuMonths/${monthKey}`;
  try {
    await updateDoc(doc(db, 'workspaces', workspaceId, 'rfuMonths', monthKey), {
      [`records.${safeId}`]: deleteField(),
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.displayName,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, monthPath);
  }
}

export async function clearAllRfuMonthsCloud(
  workspaceId: string,
  monthKeys: string[],
  user: User
): Promise<void> {
  const actor = toActor(user);
  for (const monthKey of monthKeys) {
    const path = `workspaces/${workspaceId}/rfuMonths/${monthKey}`;
    try {
      const ref = doc(db, 'workspaces', workspaceId, 'rfuMonths', monthKey);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await setDoc(ref, {
          monthKey,
          records: {},
          updatedAt: serverTimestamp(),
          updatedByUid: actor.uid,
          updatedByName: actor.displayName,
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }
}

export async function setHourlyOverrideCloud(
  workspaceId: string,
  override: HourlySlotOverride,
  knownHourlyMonths: string[],
  user: User
): Promise<void> {
  const actor = toActor(user);
  const cleaned = cleanHourlyOverride(override);
  const monthKey = getMonthKeyFromDate(cleaned.shiftDate);
  const monthPath = `workspaces/${workspaceId}/hourlyMonths/${monthKey}`;
  const monthRef = doc(db, 'workspaces', workspaceId, 'hourlyMonths', monthKey);

  try {
    const snap = await getDoc(monthRef);
    if (!snap.exists()) {
      await setDoc(monthRef, {
        monthKey,
        overrides: { [cleaned.key]: cleaned },
        updatedAt: serverTimestamp(),
        updatedByUid: actor.uid,
        updatedByName: actor.displayName,
      });
    } else {
      await updateDoc(monthRef, {
        [`overrides.${cleaned.key}`]: cleaned,
        updatedAt: serverTimestamp(),
        updatedByUid: actor.uid,
        updatedByName: actor.displayName,
      });
    }

    if (!knownHourlyMonths.includes(monthKey)) {
      await ensureMonthKeyInMeta(workspaceId, 'hourlyMonths', monthKey, actor.uid);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, monthPath);
  }
}

export async function clearHourlyOverrideCloud(
  workspaceId: string,
  overrideKey: string,
  user: User
): Promise<void> {
  const actor = toActor(user);
  const safeKey = sanitizeId(overrideKey);
  const shiftDatePart = overrideKey.split('__')[0] ?? '';
  const monthKey = getMonthKeyFromDate(shiftDatePart);
  const monthPath = `workspaces/${workspaceId}/hourlyMonths/${monthKey}`;

  try {
    await updateDoc(doc(db, 'workspaces', workspaceId, 'hourlyMonths', monthKey), {
      [`overrides.${safeKey}`]: deleteField(),
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.displayName,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, monthPath);
  }
}

export async function migrateLocalSnapshotToCloud(
  workspaceId: string,
  localData: {
    masterUnits: FleetUnit[];
    bdRecords: BreakdownRecord[];
    rfuHistory: RfuHistoryRecord[];
    hourlyOverrides: Record<string, HourlySlotOverride>;
  },
  knownRfuMonths: string[],
  knownHourlyMonths: string[],
  user: User
): Promise<void> {
  if (localData.masterUnits.length > 0) {
    await saveFleetUnitsReplace(workspaceId, localData.masterUnits, user);
  }
  if (localData.bdRecords.length > 0) {
    await upsertManyBdRecordsCloud(workspaceId, localData.bdRecords, user);
  }
  if (localData.rfuHistory.length > 0) {
    await upsertRfuRecordsCloud(workspaceId, localData.rfuHistory, knownRfuMonths, user);
  }
  for (const ov of Object.values(localData.hourlyOverrides)) {
    await setHourlyOverrideCloud(workspaceId, ov, knownHourlyMonths, user);
  }
}
