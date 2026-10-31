# Security Specification — Trade With Amith (MSNR Academy)

## 1. Data Invariants

1. **Privilege & Pending-Approval VIP Isolation**: Users cannot grant or extend their own VIP status (`vipGrants/{userId}`) or book download access (`bookAccess/{accessId}`). Submitting a `vipRequests/{requestId}` document (`PENDING` for Exness, Binance, or Custom/Public Access) grants ZERO access to `vipSignalsPrivate/{signalId}`. Only verified administrators (`isAdmin()`) can create, update, or delete grants, and `isActiveVip()` strictly requires `approvalStatus == 'APPROVED'` and `vipStatus == 'ACTIVE'` (with `vipExpiry > request.time` for non-lifetime grants).
2. **Signal Detail Confidentiality**: Public signal documents (`vipSignalsPublic/{signalId}`) store `LOCKED` placeholders for `direction` and `orderType` and never store entry, TP, extra TP, SL, or trade notes. All actionable trade execution details (`direction`, `orderType`, `entry`, `tp`, `extraTp`, `sl`, `note`) reside exclusively in `vipSignalsPrivate/{signalId}` and are readable only by `isAdmin()` or `isActiveVip()`.
3. **Per-Book Entitlement Isolation**: Paid book download URLs reside exclusively in `paidBooksProtected/{bookId}`. Access requires an explicit `APPROVED` document at `bookAccess/{uid}_{bookId}`. Purchasing Book A never unlocks Book B.
4. **PII & Push Endpoint Isolation**: `users/{userId}`, `vipRequests/{requestId}`, `bookPurchases/{purchaseId}`, and `pushSubscriptions/{subId}` contain sensitive user or endpoint identifiers and can never be read via blanket `isSignedIn()` rules—only by the document owner (`request.auth.uid`) or `isAdmin()`. `pushConfig/vapid` (VAPID private key) is strictly isolated to `isAdmin()`.
5. **Temporal & Relational Integrity**: Every write enforces `request.time` on `createdAt`/`updatedAt`, strict `hasAll`/`hasOnly` key allowlists, string `.size()` bounds, regex ID guards, and parent `exists()` / atomic `existsAfter()` checks.
6. **Market Analysis Reaction Integrity**: `marketAnalysisVideos/{videoId}` can only be written by `isAdmin()`. `marketAnalysisReactions/{reactionId}` enforces deterministic key `videoId + '_' + request.auth.uid`, verifies parent `exists(/marketAnalysisVideos/$(videoId))`, isolates ownership to `request.auth.uid`, and contains zero PII.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Self-Assigned Lifetime VIP**: Regular user attempts `setDoc('/vipGrants/attackerUid', { vipType: 'LIFETIME', vipCategory: 'EXNESS', approvalStatus: 'APPROVED', ... })` -> `PERMISSION_DENIED`.
2. **Pending VIP / Public Access Request Signal Scrape**: Member with `vipRequests/req_pending` (`status == 'PENDING'`) attempts `getDoc('/vipSignalsPrivate/sig_1')` before manual admin approval -> `PERMISSION_DENIED`.
3. **Unverified Admin Email Spoof**: Attacker signs in with `email == 'tradewithamithyt@gmail.com'` and `email_verified == false` to read `/users`, `/pushConfig/vapid`, or write `/settings/config` -> `PERMISSION_DENIED`.
4. **Expired Monthly VIP Signal Scrape**: User with `vipGrants/uid` where `vipType == 'MONTHLY'` and `vipExpiry < request.time` calls `getDoc('/vipSignalsPrivate/sig_1')` -> `PERMISSION_DENIED`.
5. **Cross-Book Unlock Bypass**: User who purchased `book_1` (`bookAccess/uid_book_1`) attempts `getDoc('/paidBooksProtected/book_2')` -> `PERMISSION_DENIED`.
6. **Shadow Ghost Field Injection on Profile**: User sends `updateDoc('/users/uid', { name: 'Amith', isAdmin: true, updatedAt: serverTimestamp() })` -> `PERMISSION_DENIED` (`hasOnly` blocks `isAdmin`).
7. **PII & Push Subscription Blanket Read Attack**: Authenticated `user_b` calls `getDoc('/users/user_a')` or `getDoc('/pushSubscriptions/sub_user_a')` or `getDoc('/pushConfig/vapid')` -> `PERMISSION_DENIED`.
8. **Unauthorized Query Scraping on VIP Requests**: Authenticated `user_b` runs unfiltered `getDocs(collection(db, 'vipRequests'))` -> `PERMISSION_DENIED` (`allow list` enforces `resource.data.userId == request.auth.uid`).
9. **State Shortcutting on VIP Request**: User submits `setDoc('/vipRequests/req_1', { ..., status: 'APPROVED' })` -> `PERMISSION_DENIED` (`create` mandates `status == 'PENDING'`).
10. **ID Poisoning / Denial of Wallet**: Attacker creates `/users/bad$id!with/slashes` or 2KB string in `name` or non-HTTPS `endpoint` in `pushSubscriptions` -> `PERMISSION_DENIED`.
11. **Market Analysis Reaction Spoof / Vote Stuffing**: `user_a` attempts `setDoc('/marketAnalysisReactions/vid1_user_b', { videoId: 'vid1', userId: 'user_b', reaction: 'LIKE', ... })` or reacts to nonexistent `ghost_vid` -> `PERMISSION_DENIED`.
12. **Free Book Counter Manipulation**: User attempts `updateDoc('/freeBooks/b1', { downloads: 999999, updatedAt: serverTimestamp() })` -> `PERMISSION_DENIED` (must increment by exactly `+1`).
