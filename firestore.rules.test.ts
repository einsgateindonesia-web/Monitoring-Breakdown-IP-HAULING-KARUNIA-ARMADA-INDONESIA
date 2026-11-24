/**
 * Phase 0 Security TDD Specification for firestore.rules
 * Verifies the "Dirty Dozen" adversarial payloads and expected PERMISSION_DENIED outcomes.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: {
    uid: string;
    email?: string;
    email_verified?: boolean;
  } | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED' | 'ALLOW';
}

export const DIRTY_DOZEN_TEST_CASES: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated read on activeBd',
    operation: 'get',
    path: '/workspaces/ip-hauling-kai/board/activeBd',
    auth: null,
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified email spoofing bootstrapped admin',
    operation: 'create',
    path: '/workspaces/ip-hauling-kai',
    auth: {
      uid: 'spoof-uid',
      email: 'einsgateindonesia@gmail.com',
      email_verified: false,
    },
    payload: {
      name: 'Spoofed',
      ownerUid: 'spoof-uid',
      createdAt: 'SERVER_TIME',
      updatedAt: 'SERVER_TIME',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Non-member verified user reading board/activeBd',
    operation: 'get',
    path: '/workspaces/ip-hauling-kai/board/activeBd',
    auth: { uid: 'stranger-1', email: 'stranger@example.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Self-join privilege escalation to admin',
    operation: 'create',
    path: '/workspaces/ip-hauling-kai/members/coworker-1',
    auth: { uid: 'coworker-1', email: 'coworker1@example.com', email_verified: true },
    payload: {
      uid: 'coworker-1',
      workspaceId: 'ip-hauling-kai',
      ownerUid: 'admin-uid',
      displayName: 'Budi',
      role: 'admin',
      inviteCode: 'KAI-VALID',
      joinedAt: 'SERVER_TIME',
      updatedAt: 'SERVER_TIME',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Self-join with bogus inviteCode',
    operation: 'create',
    path: '/workspaces/ip-hauling-kai/members/coworker-2',
    auth: { uid: 'coworker-2', email: 'coworker2@example.com', email_verified: true },
    payload: {
      uid: 'coworker-2',
      workspaceId: 'ip-hauling-kai',
      ownerUid: 'admin-uid',
      displayName: 'Andi',
      role: 'operator',
      inviteCode: 'BOGUS-CODE',
      joinedAt: 'SERVER_TIME',
      updatedAt: 'SERVER_TIME',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Shadow field injection on board/activeBd update',
    operation: 'update',
    path: '/workspaces/ip-hauling-kai/board/activeBd',
    auth: { uid: 'coworker-1', email: 'coworker1@example.com', email_verified: true },
    payload: {
      records: {},
      updatedAt: 'SERVER_TIME',
      updatedByUid: 'coworker-1',
      updatedByName: 'Budi',
      shadowAdminOverride: true,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Author UID spoofing on board/activeBd',
    operation: 'update',
    path: '/workspaces/ip-hauling-kai/board/activeBd',
    auth: { uid: 'coworker-1', email: 'coworker1@example.com', email_verified: true },
    payload: {
      records: {},
      updatedAt: 'SERVER_TIME',
      updatedByUid: 'admin-uid',
      updatedByName: 'Admin',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Client timestamp forgery on board/fleet',
    operation: 'update',
    path: '/workspaces/ip-hauling-kai/board/fleet',
    auth: { uid: 'coworker-1', email: 'coworker1@example.com', email_verified: true },
    payload: {
      units: {},
      updatedAt: '2026-01-01T00:00:00.000Z',
      updatedByUid: 'coworker-1',
      updatedByName: 'Budi',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'ID poisoning & oversized displayName',
    operation: 'create',
    path: '/users/coworker-1',
    auth: { uid: 'coworker-1', email: 'coworker1@example.com', email_verified: true },
    payload: {
      uid: 'coworker-1',
      displayName: 'X'.repeat(300),
      createdAt: 'SERVER_TIME',
      updatedAt: 'SERVER_TIME',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Cross-user PII read on users/{otherUid}/private/info',
    operation: 'get',
    path: '/users/admin-uid/private/info',
    auth: { uid: 'coworker-1', email: 'coworker1@example.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Non-owner listing invites collection',
    operation: 'list',
    path: '/workspaces/ip-hauling-kai/invites',
    auth: { uid: 'coworker-1', email: 'coworker1@example.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Tampering immutable monthKey on rfuMonths update',
    operation: 'update',
    path: '/workspaces/ip-hauling-kai/rfuMonths/2026-11',
    auth: { uid: 'coworker-1', email: 'coworker1@example.com', email_verified: true },
    payload: {
      monthKey: '2027-01',
      records: {},
      updatedAt: 'SERVER_TIME',
      updatedByUid: 'coworker-1',
      updatedByName: 'Budi',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
