# Security Specification — Trade With Amith (MSNR Academy)

## 1. Data Invariants

1. **Privilege & VIP Isolation**: Users cannot grant or extend their own VIP status (`vipGrants/{userId}`) or book download access (`bookAccess/{accessId}`). Only verified administrators (`isAdmin()`) can create, update, or delete grants.
2. **Signal Price Confidentiality**: Public signal documents (`vipSignalsPublic/{signalId}`) never store entry, TP, or SL prices. Sensitive trade execution fields reside exclusively in `vipSignalsPrivate/{signalId}` and are readable only by `isAdmin()` or `isActiveVip()` (where `LIFETIME` or `MONTHLY` with `vipExpiry > request.time`).
3. **Per-Book Entitlement Isolation**: Paid book download URLs reside exclusively in `paidBooksProtected/{bookId}`. Access requires an explicit `APPROVED` document at `bookAccess/{uid}_{bookId}`. Purchasing Book A never unlocks Book B.
4. **PII Isolation**: `users/{userId}`, `vipRequests/{requestId}`, and `bookPurchases/{purchaseId}` contain email and Telegram identifiers and can never be read via blanket `isSignedIn()` rules—only by the document owner (`request.auth.uid`) or `isAdmin()`.
5. **Temporal & Relational Integrity**: Every write enforces `request.time` on `createdAt`/`updatedAt`, strict `hasAll`/`hasOnly` key allowlists, string `.size()` bounds, regex ID guards, and parent `exists()` / atomic `existsAfter()` checks.
6. **Market Analysis Reaction Integrity**: `marketAnalysisVideos/{videoId}` can only be written by `isAdmin()`. `marketAnalysisReactions/{reactionId}` enforces deterministic key `videoId + '_' + request.auth.uid`, verifies parent `exists(/marketAnalysisVideos/$(videoId))`, isolates ownership to `request.auth.uid`, and contains zero PII.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Self-Assigned Lifetime VIP**: Regular user attempts `setDoc('/vipGrants/attackerUid', { vipType: 'LIFETIME', vipCategory: 'EXNESS', approvalStatus: 'APPROVED', ... })` -> `PERMISSION_DENIED`.
2. **Unverified Admin Email Spoof**: Attacker signs in with `email == 'emoneywithamith@gmail.com'` and `email_verified == false` to read `/users` or write `/settings/config` -> `PERMISSION_DENIED`.
3. **Expired Monthly VIP Signal Scrape**: User with `vipGrants/uid` where `vipType == 'MONTHLY'` and `vipExpiry < request.time` calls `getDoc('/vipSignalsPrivate/sig_1')` -> `PERMISSION_DENIED`.
4. **Cross-Book Unlock Bypass**: User who purchased `book_1` (`bookAccess/uid_book_1`) attempts `getDoc('/paidBooksProtected/book_2')` -> `PERMISSION_DENIED`.
5. **Shadow Ghost Field Injection on Profile**: User sends `updateDoc('/users/uid', { name: 'Amith', isAdmin: true, updatedAt: serverTimestamp() })` -> `PERMISSION_DENIED` (`hasOnly` blocks `isAdmin`).
6. **PII Blanket Read Attack**: Authenticated `user_b` calls `getDoc('/users/user_a')` -> `PERMISSION_DENIED`.
7. **Unauthorized Query Scraping on VIP Requests**: Authenticated `user_b` runs unfiltered `getDocs(collection(db, 'vipRequests'))` -> `PERMISSION_DENIED` (`allow list` enforces `resource.data.userId == request.auth.uid`).
8. **State Shortcutting on VIP Request**: User submits `setDoc('/vipRequests/req_1', { ..., status: 'APPROVED' })` -> `PERMISSION_DENIED` (`create` mandates `status == 'PENDING'`).
9. **ID Poisoning / Denial of Wallet**: Attacker creates `/users/bad$id!with/slashes` or 2KB string in `name` -> `PERMISSION_DENIED` (`isValidId` + `maxLength: 100`).
10. **Client Timestamp Forgery**: User creates `/bookPurchases/pur_1` with backdated `createdAt: Timestamp(2020, 1, 1)` -> `PERMISSION_DENIED` (`createdAt == request.time`).
11. **Market Analysis Reaction Spoof / Vote Stuffing**: `user_a` attempts `setDoc('/marketAnalysisReactions/vid1_user_b', { videoId: 'vid1', userId: 'user_b', reaction: 'LIKE', ... })` or reacts to nonexistent `ghost_vid` -> `PERMISSION_DENIED`.
12. **Free Book Counter Manipulation**: User attempts `updateDoc('/freeBooks/b1', { downloads: 999999, updatedAt: serverTimestamp() })` -> `PERMISSION_DENIED` (must increment by exactly `+1`).
