/**
 * Dirty Dozen Security Specification Verification Suite
 * Verifies all 12 adversarial payloads against the Firestore security invariants.
 */

export interface AdversarialCase {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: AdversarialCase[] = [
  {
    id: 1,
    name: 'Self-Assigned Lifetime VIP Grant',
    collection: '/vipGrants/attacker_1',
    operation: 'create',
    auth: { uid: 'attacker_1', email: 'attacker@example.com', email_verified: true },
    payload: {
      userId: 'attacker_1',
      vipStatus: 'ACTIVE',
      vipType: 'LIFETIME',
      approvalStatus: 'APPROVED',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Pending VIP / Public Access Applicant Private Signal Read Before Approval',
    collection: '/vipSignalsPrivate/sig_gold_01',
    operation: 'get',
    auth: { uid: 'pending_applicant', email: 'pending@example.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Unverified Bootstrapped Admin Email Spoof',
    collection: '/settings/config',
    operation: 'update',
    auth: { uid: 'spoof_1', email: 'tradewithamithyt@gmail.com', email_verified: false },
    payload: { winRate: '100%' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Expired Monthly VIP Private Signal Read',
    collection: '/vipSignalsPrivate/sig_gold_01',
    operation: 'get',
    auth: { uid: 'expired_vip', email: 'expired@example.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Cross-Book Entitlement Bypass',
    collection: '/paidBooksProtected/book_02',
    operation: 'get',
    auth: { uid: 'buyer_book_01', email: 'buyer@example.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Shadow Ghost Field Injection on User Profile',
    collection: '/users/user_01',
    operation: 'update',
    auth: { uid: 'user_01', email: 'user1@example.com', email_verified: true },
    payload: { name: 'Amith', isAdmin: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'PII & VAPID Private Key Blanket Read Attack',
    collection: '/pushConfig/vapid',
    operation: 'get',
    auth: { uid: 'user_02', email: 'user2@example.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Unfiltered List Scrape on Push Subscriptions',
    collection: '/pushSubscriptions',
    operation: 'list',
    auth: { uid: 'user_02', email: 'user2@example.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'State Shortcutting on VIP Request Creation',
    collection: '/vipRequests/req_01',
    operation: 'create',
    auth: { uid: 'user_01', email: 'user1@example.com', email_verified: true },
    payload: { status: 'APPROVED' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Resource Poisoning Oversized String on Profile',
    collection: '/users/user_01',
    operation: 'create',
    auth: { uid: 'user_01', email: 'user1@example.com', email_verified: true },
    payload: { name: 'X'.repeat(500) },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Market Analysis Reaction Identity Spoof & Vote Stuffing',
    collection: '/marketAnalysisReactions/ma_01_user_02',
    operation: 'create',
    auth: { uid: 'user_01', email: 'user1@example.com', email_verified: true },
    payload: {
      id: 'ma_01_user_02',
      videoId: 'ma_01',
      userId: 'user_02',
      reaction: 'LIKE',
      status: 'ACTIVE',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Arbitrary Free Book Download Counter Inflation',
    collection: '/freeBooks/free_01',
    operation: 'update',
    auth: { uid: 'user_01', email: 'user1@example.com', email_verified: true },
    payload: { downloads: 999999 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
