# Security Specification — Monitoring Breakdown IP HAULING KARUNIA ARMADA INDONESIA

## 1. Data Invariants
1. **Default Deny & Membership Gate**: No unauthenticated or non-member user can read or modify any workspace's fleet, active BD, RFU history, or hourly PA data. Access to `workspaces/{workspaceId}/board/*`, `rfuMonths/*`, and `hourlyMonths/*` requires verified email authentication (`email_verified == true`) and active membership in `workspaces/{workspaceId}/members/{uid}` (or bootstrapped/registered admin).
2. **Instant Revocation**: Removing a coworker's `members/{uid}` document or deactivating an invite immediately revokes access on all subsequent reads/writes.
3. **Privilege Escalation Prevention**: Users self-joining via an active invite code are strictly forced to `role == 'operator'`, `uid == request.auth.uid`, and must reference an active `invites/{inviteCode}` document matching the workspace's `ownerUid`. Only the bootstrapped/workspace admin can promote/demote roles or modify invites.
4. **PII Isolation**: User email addresses are stored exclusively under `users/{userId}/private/info` and are strictly readable/writable only by the owner (`request.auth.uid == userId`) or system admin. Shared `members/{memberUid}` documents contain only `displayName` and `role`.
5. **No Blanket Reads or Vulnerable List Queries**: All operational board/shard collections disable `allow list` (`allow list: if false`) and rely on deterministic `get` document subscriptions (`onSnapshot(doc(...))`). `members` and `invites` `allow list` rules validate `resource.data` directly (`uid` or `ownerUid == request.auth.uid`) with zero `get()`/`exists()` inside `allow list`.
6. **Temporal & Structural Integrity**: All `createdAt`, `joinedAt`, and `updatedAt` timestamps must equal `request.time`. All `updatedByUid` fields must equal `request.auth.uid`. Every document enforces strict `hasAll`/`hasOnly` keys on create and `affectedKeys().hasOnly(...)` on update, plus `.size()` limits on all strings, maps, and arrays.

7. **Admin-Only High-Risk Mutations**: Modifying master fleet population (`board/fleet`), updating `targetPaPct` on `board/meta`, removing/clearing RFU logs (`rfuMonths/*`), and managing team roles/invites strictly require `isWorkspaceAdmin(workspaceId)`.
8. **Immutable Audit Trail**: `board/auditLog` allows members to read (`get`) and append bounded entries (`<= 150`) with `updatedByUid == request.auth.uid` and `updatedAt == request.time`, while prohibiting deletion (`allow delete: if false`).

## 2. The "Dirty Dozen" Attack Payloads
1. **Unauthenticated Read/Write**: Read `workspaces/ip-hauling-kai/board/activeBd` with `auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoofing**: Authenticated user with `token.email == 'einsgateindonesia@gmail.com'` and `token.email_verified == false` tries to create/read workspace -> `PERMISSION_DENIED`.
3. **Non-Member Snooping**: Signed-in verified user without a `members/{uid}` document tries to `get` `workspaces/ip-hauling-kai/board/activeBd` -> `PERMISSION_DENIED`.
4. **Privilege Escalation on Join**: Verified coworker self-joining `members/{uid}` passes `role: 'admin'` -> `PERMISSION_DENIED`.
5. **Invalid / Inactive Invite Code Join**: Verified coworker attempts to create `members/{uid}` using a non-existent or `active: false` invite code -> `PERMISSION_DENIED`.
6. **Shadow Field Injection**: Workspace member updates `board/activeBd` with an extra ghost key `isApproved: true` -> `PERMISSION_DENIED`.
7. **Author UID Spoofing**: Workspace member updates `board/activeBd` setting `updatedByUid: 'someone-else'` -> `PERMISSION_DENIED`.
8. **Client Timestamp Forgery**: Workspace member writes `updatedAt: '2026-01-01T00:00:00Z'` instead of `request.time` -> `PERMISSION_DENIED`.
9. **ID Poisoning / 1MB String Exhaustion**: Attacker uses a 2KB document ID or sends a 500-char `displayName` -> `PERMISSION_DENIED`.
10. **PII Cross-User Read**: Signed-in coworker tries to `get` `users/{otherUid}/private/info` -> `PERMISSION_DENIED`.
11. **Invite Enumeration Scraping**: Non-owner signed-in user attempts `list` on `workspaces/ip-hauling-kai/invites` -> `PERMISSION_DENIED`.
12. **Immutable Ownership & Operator RBAC Tampering**: Operator attempts to change `ownerUid`, overwrite `board/fleet`, modify `targetPaPct`, or delete/clear `rfuMonths` records -> `PERMISSION_DENIED`.
