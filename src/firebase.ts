import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, User } from 'firebase/auth';
import {
  doc,
  Firestore,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

const firestoreDatabaseId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-fleetbdopsmonito-8b5955b7-cbb3-4d59-bf9a-9650e1e2f2e5';

let dbInstance: Firestore;
try {
  dbInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    },
    firestoreDatabaseId
  );
} catch {
  dbInstance = getFirestore(app, firestoreDatabaseId);
}

export const db = dbInstance;
export const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
] as const;

// Basic Google Sign-In provider (no sensitive Workspace scopes) so any personal email can sign in seamlessly
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Dedicated provider with Google Sheets scope, requested on-demand only when syncing Spreadsheet
export const sheetsGoogleProvider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  sheetsGoogleProvider.addScope(scope);
}
sheetsGoogleProvider.setCustomParameters({ prompt: 'select_account' });

// In-memory only cache for Google Workspace OAuth access token (never localStorage/sessionStorage)
let cachedWorkspaceAccessToken: string | null = null;

export function setCachedWorkspaceAccessToken(token: string | null): void {
  cachedWorkspaceAccessToken = token && token.trim() ? token.trim() : null;
}

export function getCachedWorkspaceAccessToken(): string | null {
  return cachedWorkspaceAccessToken;
}

export async function requestGoogleSheetsAccessToken(): Promise<{
  user: User;
  accessToken: string;
}> {
  const result = await signInWithPopup(auth, sheetsGoogleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Izin akses Google Sheets tidak diperoleh. Pastikan izin Spreadsheet dicentang saat masuk.');
  }
  setCachedWorkspaceAccessToken(credential.accessToken);
  return { user: result.user, accessToken: credential.accessToken };
}

export async function hashNormalizedEmail(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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

export function isTransientNetworkError(error: unknown): boolean {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : JSON.stringify(error ?? '');
  const lower = raw.toLowerCase();
  if (lower.includes('permission') || lower.includes('insufficient')) {
    return false;
  }
  return (
    lower.includes('unavailable') ||
    lower.includes('client is offline') ||
    lower.includes('network-request-failed') ||
    lower.includes('networkerror') ||
    lower.includes('failed to fetch') ||
    lower.includes('err_internet_disconnected') ||
    lower.includes('aborted')
  );
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
