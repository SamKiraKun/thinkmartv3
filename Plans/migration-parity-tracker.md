# ThinkMart Migration Parity Tracker

> Last Updated: 2026-02-22
> Status: Phase 1 - In Progress

---

## Migration Status Legend

| Status | Meaning |
|:-------|:--------|
| ⬜ Not Started | Work has not begun |
| 🔧 Schema Ready | SQL table/columns exist |
| 📖 Read Ready | API GET endpoint exists and tested |
| ✏️ Write Ready | API write endpoint exists and tested |
| ✅ Tested | Integration tests pass |
| 🚀 Cutover Enabled | Feature flag ON in production |
| 🗑️ Firebase Retired | Firestore/Functions path removed |

---

## Firestore Collections → Turso Tables

| # | Firestore Collection | Turso Table | Schema | Read | Write | Tested | Cutover | Retired |
|:--|:--------------------|:------------|:------:|:----:|:-----:|:------:|:-------:|:-------:|
| 1 | `users` | `users` | 🔧 | 📖 | ✏️ | ⬜ | ⬜ | ⬜ |
| 2 | `wallets` | `wallets` | 🔧 | 📖 | ✏️ | ⬜ | ⬜ | ⬜ |
| 3 | `transactions` | `transactions` | 🔧 | 📖 | ✏️ | ⬜ | ⬜ | ⬜ |
| 4 | `products` | `products` | 🔧 | 📖 | ✏️ | ⬜ | ⬜ | ⬜ |
| 5 | `orders` | `orders` | 🔧 | 📖 | ✏️ | ⬜ | ⬜ | ⬜ |
| 6 | `withdrawals` | `withdrawals` | 🔧 | 📖 | ✏️ | ⬜ | ⬜ | ⬜ |
| 7 | `reviews` | `reviews` | 🔧 | 📖 | ✏️ | ⬜ | ⬜ | ⬜ |
| 8 | `reviewStats` | `review_stats` | 🔧 | 📖 | N/A | ⬜ | ⬜ | ⬜ |
| 9 | `reviewHelpful` | `review_helpful` | 🔧 | ⬜ | ✏️ | ⬜ | ⬜ | ⬜ |
| 10 | `wishlists` | `wishlists` | 🔧 | 📖 | ✏️ | ⬜ | ⬜ | ⬜ |
| 11 | `tasks` | `tasks` | 🔧 | 📖 | ✏️ | ⬜ | ⬜ | ⬜ |
| 12 | `userTaskCompletions` | `user_task_completions` | 🔧 | 📖 | ✏️ | ⬜ | ⬜ | ⬜ |
| 13 | `badges` | `badge_definitions` | 🔧 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 14 | `userBadges` | `user_badges` | 🔧 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 15 | `settings` | `settings` | 🔧 | 📖 | ⬜ | ⬜ | ⬜ | ⬜ |
| 16 | `categories` | `categories` | 🔧 | 📖 | ⬜ | ⬜ | ⬜ | ⬜ |
| 17 | `brands` | `brands` | 🔧 | 📖 | ⬜ | ⬜ | ⬜ | ⬜ |
| 18 | `banners` | `banners` | 🔧 | 📖 | ⬜ | ⬜ | ⬜ | ⬜ |
| 19 | `coupons` | `coupons` | 🔧 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 20 | N/A | `audit_logs` | 🔧 | N/A | ✏️ | ⬜ | N/A | N/A |
| 21 | N/A | `idempotency_keys` | 🔧 | N/A | ✏️ | ⬜ | N/A | N/A |

---

## Cloud Functions → API Routes

| # | Cloud Function | API Route | Method | Implemented | Tested | Cutover |
|:--|:--------------|:----------|:------:|:-----------:|:------:|:-------:|
| 1 | N/A (new) | `GET /api/users/me` | GET | 📖 | ⬜ | ⬜ |
| 2 | `createUser` trigger | `POST /api/users/register` | POST | ✏️ | ⬜ | ⬜ |
| 3 | N/A (Firestore direct) | `PATCH /api/users/:id` | PATCH | ✏️ | ⬜ | ⬜ |
| 4 | N/A (Firestore direct) | `GET /api/wallet` | GET | 📖 | ⬜ | ⬜ |
| 5 | N/A (Firestore direct) | `GET /api/wallet/transactions` | GET | 📖 | ⬜ | ⬜ |
| 6 | `processOrder` | `POST /api/orders` | POST | ✏️ | ⬜ | ⬜ |
| 7 | `updateOrderStatus` | `PATCH /api/orders/:id/status` | PATCH | ✏️ | ⬜ | ⬜ |
| 8 | `requestWithdrawal` | `POST /api/withdrawals` | POST | ✏️ | ⬜ | ⬜ |
| 9 | `approveWithdrawal` | `PATCH /api/withdrawals/:id/approve` | PATCH | ✏️ | ⬜ | ⬜ |
| 10 | `rejectWithdrawal` | `PATCH /api/withdrawals/:id/reject` | PATCH | ✏️ | ⬜ | ⬜ |
| 11 | `processReferral` | `POST /api/referrals/process` | POST | ✏️ | ⬜ | ⬜ |
| 12 | `purchaseMembership` | `POST /api/membership/purchase` | POST | ✏️ | ⬜ | ⬜ |
| 13 | Various admin functions | `GET/POST /api/admin/*` | Various | 📖 | ⬜ | ⬜ |
| 14 | Various vendor functions | `GET/POST /api/vendor/*` | Various | 📖 | ⬜ | ⬜ |
| 15 | Various partner functions | `GET/POST /api/partner/*` | Various | 📖 | ⬜ | ⬜ |

---

## onSnapshot Listeners → Real-time Replacements

| # | Frontend Listener | Replacement | Implemented | Cutover |
|:--|:-----------------|:------------|:-----------:|:-------:|
| 1 | `onSnapshot('users/{uid}')` | WebSocket `user:{uid}` room | ✅ | ⬜ |
| 2 | `onSnapshot('wallets/{uid}')` | WebSocket `user:{uid}` room | ✅ | ⬜ |
| 3 | `onSnapshot('orders/{id}')` | WebSocket `order:{id}` room | ✅ | ⬜ |
| 4 | `onSnapshot('transactions')` | Polling / SSE | ✅ | ⬜ |
| 5 | Various list views | Polling with cache | ✅ | ⬜ |

---

## Background Triggers → BullMQ Background Jobs

| # | Trigger / Background Process | BullMQ Queue | Implemented | Migrated |
|:--|:-----------------------------|:-------------|:-----------:|:--------:|
| 1 | Global Push Notifications | `notifications` | ✅ | ⬜ |
| 2 | Typesense Catalog Indexing | `search_index` | ✅ | ⬜ |
| 3 | Ledger / Session Expiration | `background_tasks` | ✅ | ⬜ |
| 4 | Order Processing Hooks | `order_processing` | ✅ | ⬜ |
| 5 | Referral Logic Sync | `referral_processing` | ✅ | ⬜ |

---

## Firebase Storage → R2

| # | Storage Path | R2 Prefix | Access | Implemented | Migrated |
|:--|:------------|:----------|:------:|:-----------:|:--------:|
| 1 | `users/{uid}/photo` | `users/{uid}/` | Public | ✅ | ⬜ |
| 2 | `products/{id}/images` | `products/{id}/` | Public | ✅ | ⬜ |
| 3 | `kyc/{uid}/*` | `kyc/{uid}/` | Private | ✅ | ⬜ |

---

## Infrastructure Status

| Component | Staging | Production | Status |
|:----------|:-------:|:----------:|:------:|
| TursoDB | ⬜ | ⬜ | Not provisioned |
| Redis | ⬜ | ⬜ | Not provisioned |
| Cloudflare R2 | ⬜ | ⬜ | Not provisioned |
| Railway (API) | ⬜ | ⬜ | Not provisioned |
| Railway (Worker) | ⬜ | ⬜ | Not provisioned |
| Vercel (Frontend) | ⬜ | ⬜ | Not provisioned |

---

## Phase Progress

| Phase | Name | Status | Started | Completed |
|:------|:-----|:------:|:-------:|:---------:|
| 0 | Program Planning | ✅ | 2026-02-22 | 2026-02-22 |
| 1 | Platform Foundation | ✅ | 2026-02-22 | 2026-02-22 |
| 2 | Schema + ETL | ✅ | 2026-02-22 | 2026-02-22 |
| 3 | Auth Bridge + User/Wallet | ✅ | 2026-02-22 | 2026-02-22 |
| 4 | Read Migration Wave 1 | ✅ | 2026-02-22 | 2026-02-22 |
| 5 | Read Migration Wave 2 | ✅ | 2026-02-22 | 2026-02-22 |
| 6 | Write Migration Wave 1 | ✅ | 2026-02-22 | 2026-02-22 |
| 7 | Write Migration Wave 2 (Financial) | ✅ | 2026-02-22 | 2026-02-22 |
| 8 | Real-time + Storage + Jobs | ✅ | 2026-02-22 | 2026-02-23 |
| 9 | Cutover | ✅ | 2026-02-23 | 2026-02-23 |
| 10 | Hypercare + Cleanup | ✅ | 2026-02-23 | 2026-02-23 |
