import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const BOOTSTRAPPED_ADMIN_EMAIL = 'einsgateindonesia@gmail.com';
export const DEFAULT_WORKSPACE_ID = 'ip-hauling-kai';
export const DEFAULT_WORKSPACE_NAME = 'IP HAULING KARUNIA ARMADA INDONESIA';

export const BLUEPRINT_LIMITS = {
  maxIdLength: 128,
  maxDisplayNameLength: 80,
  maxEmailLength: 160,
  maxWorkspaceNameLength: 120,
  maxInviteCodeLength: 64,
  maxMonthsCount: 120,
  maxUnitsCount: 1000,
  maxActiveBdCount: 500,
  maxRfuPerMonthCount: 1500,
  maxHourlyPerMonthCount: 1000,
  validIdRegex: /^[a-zA-Z0-9_-]+$/,
} as const;

export function sanitizeDisplayName(rawName: string | null | undefined, email?: string | null): string {
  const fallback = email ? email.split('@')[0] : 'Operator Tim';
  const cleaned = (rawName || fallback || 'Operator Tim').trim().replace(/\s+/g, ' ');
  return cleaned.slice(0, BLUEPRINT_LIMITS.maxDisplayNameLength) || 'Operator Tim';
}

export function sanitizeId(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, BLUEPRINT_LIMITS.maxIdLength);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
