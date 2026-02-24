# ThinkMart: Hybrid Migration Plan v2
## Firebase Auth (KEEP) + TursoDB (NEW) + Custom API Server

> **Document Version**: 2.0
> **Generated**: 2026-02-21
> **Strategy**: Keep Firebase Authentication. Migrate Firestore → TursoDB, Cloud Functions → Fastify API, Storage → Cloudflare R2.
> **Estimated Timeline**: 10–12 weeks with 2 senior engineers

---

## 1. Executive Summary

### Strategy: Hybrid — Firebase Auth + TursoDB

Instead of migrating everything away from Firebase, we **keep Firebase Authentication** and only migrate:

| Component | Action | Reason |
|:----------|:-------|:-------|
| **Firebase Auth** | ✅ **KEEP** | Zero user disruption, free tier, battle-tested security, already working |
| **Firestore** | ❌ **MIGRATE** → TursoDB | Cost driver, no JOINs, limited query power, vendor lock-in |
| **Cloud Functions** | ❌ **MIGRATE** → Fastify API | Cold starts, limited runtime control, tight Firestore coupling |
| **Firebase Storage** | ❌ **MIGRATE** → Cloudflare R2 | Cost reduction, S3-compatible, no Firebase dependency |
| **Firestore Rules** | ❌ **REPLACE** → API middleware | Untestable at scale, reimplemented as RBAC middleware |

### Why Keep Firebase Auth?

1. **Zero user disruption** — No password resets, no re-registration required
2. **Free up to 10K MAU** — Auth is not a cost driver
3. **Battle-tested security** — Password hashing (scrypt), brute-force protection, email verification all handled
4. **Already integrated** — `getIdToken()` pattern exists in `lib/firebase/callable.ts:147`
5. **Can migrate later** — If you eventually want full independence, auth can be migrated as a separate project
6. **Eliminates highest-risk phase** — Auth migration was estimated at 3 weeks / HIGH risk; now it's ~3 days / LOW risk

### Timeline Comparison

| Approach | Timeline | Risk |
|:---------|:---------|:-----|
| Full Firebase migration (mig-plan.md) | 12–16 weeks | High |
| **Hybrid: Keep Auth, migrate rest** | **10–12 weeks** | **Medium** |

---

## 2. Architecture Overview

### 2.1 System Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  Next.js 14 Frontend (existing app)                              │
│                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐   │
│  │  Firebase Auth SDK  │  │  API Client (NEW)               │   │
│  │  (KEPT AS-IS)       │  │  lib/api/client.ts              │   │
│  │                     │  │  - Attaches Firebase ID Token   │   │
│  │  • Login/Register   │  │  - Calls your API server        │   │
│  │  • onAuthStateChange│  │  - Replaces Firestore SDK calls │   │
│  │  • getIdToken()     │  │  - Replaces httpsCallable()     │   │
│  └─────────┬───────────┘  └──────────────┬──────────────────┘   │
│            │                             │                       │
└────────────┼─────────────────────────────┼───────────────────────┘
             │                             │
             │ Firebase ID Token           │ Authorization: Bearer <token>
             │ (for auth state)            │ (for all data operations)
             │                             │
             ▼                             ▼
┌────────────────────┐    ┌────────────────────────────────────────┐
│  Firebase Auth     │    │  API Server (NEW — Fastify)            │
│  (Google-hosted)   │    │                                        │
│                    │    │  ┌──────────────────────────────────┐  │
│  • User accounts   │    │  │  Auth Middleware                 │  │
│  • Password hashing│    │  │  firebase-admin.verifyIdToken()  │  │
│  • Rate limiting   │    │  │  + TursoDB role lookup           │  │
│  • Email service   │    │  └──────────────────────────────────┘  │
│                    │    │                                        │
│                    │    │  ┌──────────────────────────────────┐  │
│                    │    │  │  Route Modules                   │  │
│                    │    │  │  (replaces 50+ Cloud Functions)  │  │
│                    │    │  │  • /api/users/*                  │  │
│                    │    │  │  • /api/orders/*                 │  │
│                    │    │  │  • /api/products/*               │  │
│                    │    │  │  • /api/wallet/*                 │  │
│                    │    │  │  • /api/tasks/*                  │  │
│                    │    │  │  • /api/withdrawals/*            │  │
│                    │    │  │  • /api/admin/*                  │  │
│                    │    │  │  • /api/reviews/*                │  │
│                    │    │  │  • /api/gamification/*           │  │
│                    │    │  └──────────────┬───────────────────┘  │
│                    │    │                 │                       │
│                    │    │  ┌──────────────▼───────────────────┐  │
│                    │    │  │  WebSocket Server (Socket.io)    │  │
│                    │    │  │  • Wallet balance updates        │  │
│                    │    │  │  • Order status changes          │  │
│                    │    │  │  • Profile sync                  │  │
│                    │    │  └──────────────────────────────────┘  │
└────────────────────┘    └──────────┬──────────┬──────────────────┘
                                    │          │
                          ┌─────────▼──┐  ┌────▼─────┐  ┌────────────┐
                          │  TursoDB   │  │  Redis   │  │ Cloudflare │
                          │  (Primary) │  │          │  │ R2         │
                          │            │  │ Sessions │  │            │
                          │ All data   │  │ BullMQ   │  │ Images     │
                          │ tables     │  │ Cache    │  │ KYC docs   │
                          │            │  │ Rate lim │  │ Products   │
                          └────────────┘  └──────────┘  └────────────┘
```

### 2.2 Auth Flow (Hybrid)

```
User clicks "Login" in Next.js app
    │
    ▼
Firebase Auth SDK (client-side)
    │ signInWithEmailAndPassword(email, password)
    │
    ▼
Firebase Auth Service (Google-hosted)
    │ Returns: UserCredential { user.uid, user.email }
    │
    ▼
Frontend calls: user.getIdToken()
    │ Returns: Firebase ID Token (JWT signed by Google)
    │
    ▼
Frontend sends to YOUR API:
    │ GET /api/users/me
    │ Headers: { Authorization: "Bearer <Firebase ID Token>" }
    │
    ▼
Your API Middleware:
    │ admin.auth().verifyIdToken(token)
    │   → Extracts: { uid, email }
    │ db.execute("SELECT * FROM users WHERE id = ?", [uid])
    │   → Gets: { role, name, city, membership_active, ... }
    │
    ▼
API returns user profile from TursoDB
```

### 2.3 Registration Flow (Hybrid)

```
User fills registration form
    │
    ▼
Firebase Auth SDK (client-side)
    │ createUserWithEmailAndPassword(email, password)
    │ updateProfile({ displayName })
    │
    ▼
Firebase Auth creates account → returns UserCredential
    │
    ▼
Frontend calls YOUR API:                          ← KEY CHANGE
    │ POST /api/users/register
    │ Headers: { Authorization: "Bearer <Firebase ID Token>" }
    │ Body: { name, phone, state, city, referralCode, accountType, ... }
    │
    ▼
Your API:
    │ 1. verifyIdToken(token) → get uid, email
    │ 2. INSERT INTO users (...) VALUES (...)
    │ 3. INSERT INTO wallets (user_id, cash_balance, coin_balance) VALUES (?, 0, 0)
    │ 4. Process referral code if provided
    │ 5. Return { success: true, profile }
```

> **Key difference from current code**: Currently, `app/auth/register/page.tsx:147` writes directly to Firestore with `setDoc(doc(db, 'users', user.uid), {...})`. In the new system, this is replaced with an API call. Firebase Auth still handles account creation.

---

## 3. What Changes in Each File

### 3.1 Files That Stay the Same (Firebase Auth — NO CHANGES)

| File | What It Does | Why It Stays |
|:-----|:------------|:-------------|
| `lib/firebase/auth.ts` | `loginWithEmail`, `registerWithEmail`, `logoutUser`, `resetPassword`, `onAuthChange` | All auth functions stay as-is |
| `lib/auth/sessionCookie.ts` | Sets/clears `tm_session` cookie | Dashboard guard stays as-is |
| `app/auth/forgot-password/page.tsx` | Password reset page | Uses Firebase Auth `sendPasswordResetEmail` |

### 3.2 Files That Get Modified

#### Auth & Login Pages

| File | Current | New |
|:-----|:--------|:----|
| `lib/firebase/config.ts` | Exports `auth`, `db`, `functions`, `storage` | Keep only `auth` export; remove `db`, `functions`, `storage` |
| `app/auth/login/page.tsx` | Firebase Auth + Firestore `getDoc` for role | Firebase Auth + **API call** `GET /api/users/me` for role |
| `app/auth/register/page.tsx` | Firebase Auth + `setDoc` to create Firestore doc | Firebase Auth + **API call** `POST /api/users/register` |
| `app/providers.tsx` | `onAuthStateChanged` → Firestore `onSnapshot` listeners | `onAuthStateChanged` → **API fetch** + **WebSocket connect** |
| `hooks/useAuth.ts` | `onSnapshot(doc(db, 'users', uid))` for profile | **API call** `GET /api/users/me` + **WebSocket** for live updates |

#### Hooks (Replace Firestore → API)

| File | Current | New |
|:-----|:--------|:----|
| `hooks/useWallet.ts` | `onSnapshot(doc(db, 'wallets', uid))` | **WebSocket** for live balance + **API** for transactions |
| `hooks/useTasks.ts` | `queryDocuments('tasks')` | **API call** `GET /api/tasks/active` |
| `hooks/useReferral.ts` | Firestore query on `users` collection | **API call** `GET /api/referrals` |
| `hooks/usePublicSettings.ts` | `getDoc(doc(db, 'public_settings'))` | **API call** `GET /api/settings/public` |
| `store/useStore.ts` | Zustand + `onSnapshot` listeners | Zustand + **WebSocket** listeners |

#### Services (Replace Firestore/Callable → API)

| File | Current | New |
|:-----|:--------|:----|
| `services/order.service.ts` | `httpsCallable(functions, 'createOrderMultiItem')` | `apiClient.post('/api/orders')` |
| `services/product.service.ts` | Firestore reads + `httpsCallable` for CRUD | `apiClient` calls to `/api/products` |
| `services/wallet.service.ts` | `getDocumentById('wallets')` | `apiClient.get('/api/wallet')` |
| `services/withdrawal.service.ts` | `queryDocuments('withdrawals')` | `apiClient.get('/api/withdrawals')` |
| `services/task.service.ts` | `queryDocuments('tasks')` | `apiClient.get('/api/tasks')` |
| `services/review.service.ts` | Firestore reads + `httpsCallable` writes | `apiClient` calls to `/api/reviews` |
| `services/payment.service.ts` | `httpsCallable(functions, 'purchaseMembership')` | `apiClient.post('/api/membership/purchase')` |
| `services/referral.service.ts` | `queryDocuments('users')` | `apiClient.get('/api/referrals')` |
| `services/search.service.ts` | Typesense (API key via Cloud Function) | Keep Typesense; get API key from your API |
| `services/wishlist.service.ts` | Direct Firestore CRUD | `apiClient` calls to `/api/wishlists` |
| `services/user.service.ts` | `getDocumentById('users')` | `apiClient.get('/api/users/:id')` |

#### Dashboard Pages (Replace onSnapshot → WebSocket/API)

| File | Current | New |
|:-----|:--------|:----|
| `app/dashboard/user/orders/page.tsx` | `onSnapshot` for order list | **API** `GET /api/orders` + WebSocket for updates |
| `app/dashboard/user/orders/[id]/page.tsx` | `onSnapshot` for order detail | **WebSocket** subscription |
| `app/dashboard/user/withdraw/page.tsx` | `onSnapshot` for history + `httpsCallable` to request | **API** `GET /api/withdrawals` + `apiClient.post` |
| `app/dashboard/user/kyc/page.tsx` | Firestore read + Storage upload + Firestore update | **API** for KYC status + **R2 presigned URL** for upload |

### 3.3 Files to DELETE

| File/Directory | Reason |
|:---------------|:-------|
| `lib/firebase/firestore.ts` | No more Firestore reads |
| `lib/firebase/callable.ts` | No more Cloud Functions calls |
| `lib/firebase/functions.ts` | No more Cloud Functions calls |
| `lib/firebase/productImageUpload.ts` | Replaced by R2 upload |
| `lib/firebase/storage.ts` | Replaced by R2 presigned URLs |
| `functions/` (entire directory) | Cloud Functions replaced by API server |
| `firestore.rules` | Replaced by API middleware |
| `firestore.indexes.json` | Replaced by SQL indexes |
| `storage.rules` | Replaced by R2 bucket policies |

### 3.4 NEW Files to Create

| File | Purpose |
|:-----|:--------|
| `lib/api/client.ts` | API client that auto-attaches Firebase ID Token to requests |
| `lib/api/types.ts` | Shared request/response types |
| `lib/api/websocket.ts` | WebSocket client (Socket.io) for real-time subscriptions |
| `server/` (new project) | Entire Fastify API server |

---

## 4. API Client Design (Frontend)

### 4.1 Core API Client

```typescript
// lib/api/client.ts — NEW FILE
import { auth } from '@/lib/firebase/config';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(await getAuthHeaders()),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || `API error: ${res.status}`);
  }

  return res.json();
}

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
```

### 4.2 WebSocket Client

```typescript
// lib/api/websocket.ts — NEW FILE
import { io, Socket } from 'socket.io-client';
import { auth } from '@/lib/firebase/config';

let socket: Socket | null = null;

export async function connectWebSocket(): Promise<Socket> {
  if (socket?.connected) return socket;
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();

  socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001', {
    auth: { token },
    transports: ['websocket'],
  });
  return socket;
}

export function getSocket(): Socket | null { return socket; }
export function disconnectWebSocket(): void { socket?.disconnect(); socket = null; }
```

### 4.3 Example: Migrated useWallet Hook

```typescript
// hooks/useWallet.ts — MIGRATED
import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { apiClient } from '@/lib/api/client';
import { getSocket, connectWebSocket } from '@/lib/api/websocket';

export function useWallet() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Initial fetch via API
  useEffect(() => {
    if (!user) return;
    Promise.all([
      apiClient.get('/api/wallet'),
      apiClient.get('/api/wallet/transactions?limit=20'),
    ]).then(([w, txns]) => { setWallet(w); setTransactions(txns); })
      .finally(() => setLoading(false));
  }, [user]);

  // Real-time updates via WebSocket (replaces onSnapshot)
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    connectWebSocket().then((socket) => {
      if (!mounted) return;
      socket.on('wallet:updated', (updated) => setWallet(updated));
      socket.on('transaction:new', (txn) =>
        setTransactions(prev => [txn, ...prev.slice(0, 19)]));
    });
    return () => { mounted = false; getSocket()?.off('wallet:updated'); getSocket()?.off('transaction:new'); };
  }, [user]);

  const estimatedCashValue = wallet ? (wallet.coinBalance / 1000).toFixed(2) : '0.00';
  return { wallet, transactions, loading, estimatedCashValue };
}
```

---

## 5. API Server Design

### 5.1 Tech Stack

| Component | Choice | Rationale |
|:----------|:-------|:----------|
| **Runtime** | Node.js 20 | Matches current Cloud Functions |
| **Framework** | Fastify | Fast, built-in validation, TS-first |
| **Database** | TursoDB (`@libsql/client`) | SQLite-compatible, edge replicas |
| **Auth** | `firebase-admin` `verifyIdToken()` | Verify Firebase tokens server-side |
| **Validation** | Zod | Already used in Cloud Functions |
| **Real-time** | Socket.io | Replaces `onSnapshot` |
| **Job queue** | BullMQ + Redis | Replaces Firestore triggers |
| **Storage** | Cloudflare R2 (S3-compat) | Replaces Firebase Storage |
| **Rate limiting** | `@fastify/rate-limit` + Redis | Replaces `rate_limits` collection |

### 5.2 Auth Middleware

```typescript
// server/middleware/auth.ts
import admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();

export async function authMiddleware(request, reply) {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) return reply.status(401).send({ error: 'Authentication required' });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const result = await db.execute({
      sql: 'SELECT role, is_banned FROM users WHERE id = ?',
      args: [decoded.uid],
    });
    const user = result.rows[0];
    if (!user) return reply.status(403).send({ error: 'Profile not found' });
    if (user.is_banned) return reply.status(403).send({ error: 'Account suspended' });

    request.uid = decoded.uid;
    request.email = decoded.email || '';
    request.role = user.role;
  } catch {
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles) {
  return async (request, reply) => {
    if (!roles.includes(request.role)) {
      return reply.status(403).send({ error: `Requires: ${roles.join(' or ')}` });
    }
  };
}
```

### 5.3 Route Structure (Maps 1:1 to Cloud Functions)

```
server/
├── index.ts                    # Fastify app setup
├── db/
│   ├── client.ts               # TursoDB connection
│   └── migrations/             # SQL migration files
├── middleware/
│   ├── auth.ts                 # Firebase token verification + TursoDB role
│   ├── rateLimit.ts            # Redis-backed
│   └── validate.ts             # Zod validation
├── routes/
│   ├── users/                  # register, me, update, kyc
│   ├── wallet/                 # balance, transactions, convert-coins
│   ├── orders/                 # create, list, detail, cancel, status
│   ├── products/               # list, detail, shop (paginated)
│   ├── tasks/                  # active, completions, reward, start, survey, checkin
│   ├── withdrawals/            # list, request
│   ├── reviews/                # product reviews, submit, update, delete, helpful
│   ├── wishlists/              # list, toggle, clear
│   ├── referrals/              # list, earnings
│   ├── membership/             # purchase
│   ├── gamification/           # leaderboard, badges, spin, lucky-box
│   ├── coupons/                # validate
│   ├── search/                 # proxy to Typesense
│   ├── settings/               # public settings
│   ├── uploads/                # R2 presigned URLs
│   ├── admin/                  # 18+ admin endpoints
│   ├── vendor/                 # vendor dashboard, products, orders, analytics
│   └── partner/                # partner dashboard, commissions
├── services/                   # Ported Cloud Function logic
│   ├── walletService.ts        # Atomic balance ops
│   ├── orderService.ts         # Order creation + wallet debit
│   ├── mlmService.ts           # 6-level referral distribution
│   ├── withdrawalService.ts
│   ├── taskService.ts
│   ├── reviewService.ts
│   └── auditService.ts
├── jobs/                       # BullMQ workers
│   ├── referralProcessor.ts
│   ├── incomeDistributor.ts
│   ├── badgeChecker.ts
│   ├── leaderboardUpdater.ts
│   └── notificationSender.ts
└── websocket/
    ├── index.ts                # Socket.io setup + Firebase token auth
    └── emitters.ts             # Emit events after DB mutations
```

### 5.4 WebSocket Events (Replaces onSnapshot)

| Event | Direction | Replaces |
|:------|:---------|:---------|
| `wallet:updated` | Server → Client | `onSnapshot(doc(db, 'wallets', uid))` |
| `profile:updated` | Server → Client | `onSnapshot(doc(db, 'users', uid))` |
| `order:updated` | Server → Client | `onSnapshot(doc(db, 'orders', id))` |
| `transaction:new` | Server → Client | N/A (removes need for transaction refetch) |
| `notification:new` | Server → Client | Replaces FCM for in-app |

---

## 6. TursoDB Schema

The `users` table in this hybrid approach has **no `password_hash` column** (Firebase handles passwords):

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,                    -- Firebase Auth UID
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  photo_url TEXT,
  -- NO password_hash! Firebase Auth handles this.
  role TEXT NOT NULL DEFAULT 'user'
    CHECK(role IN ('user','admin','sub_admin','vendor','partner','organization')),
  state TEXT,
  city TEXT,
  own_referral_code TEXT UNIQUE NOT NULL,
  referral_code TEXT,
  referred_by TEXT,
  upline_path TEXT,                       -- JSON array
  referral_processed INTEGER DEFAULT 0,
  membership_active INTEGER DEFAULT 0,
  membership_date TEXT,
  is_active INTEGER DEFAULT 1,
  is_banned INTEGER DEFAULT 0,
  kyc_status TEXT DEFAULT 'not_submitted'
    CHECK(kyc_status IN ('not_submitted','pending','verified','rejected')),
  kyc_data TEXT,                          -- JSON
  kyc_submitted_at TEXT,
  kyc_verified_at TEXT,
  kyc_rejection_reason TEXT,
  saved_addresses TEXT,                   -- JSON array
  partner_config TEXT,                    -- JSON
  vendor_config TEXT,                     -- JSON
  org_config TEXT,                        -- JSON
  sub_admin_permissions TEXT,             -- JSON array
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role_created ON users(role, created_at DESC);
CREATE INDEX idx_users_referral_code ON users(referral_code, created_at DESC);
CREATE INDEX idx_users_own_referral_code ON users(own_referral_code);
CREATE INDEX idx_users_city_role ON users(city, role, created_at DESC);
CREATE INDEX idx_users_kyc_status ON users(kyc_status, kyc_submitted_at);
```

All other tables (wallets, transactions, orders, products, withdrawals, tasks, task_completions, reviews, wishlists, etc.) are **identical** to `mig-plan.md` Section 6. Refer there for the full DDL.

The only table that is **removed** vs full migration: `refresh_tokens` (not needed — Firebase handles sessions).

---

## 7. Phased Execution Plan

### Phase 0: Infrastructure & Foundation (Week 1–2)

- [ ] Set up TursoDB instance (production + staging)
- [ ] Set up Redis instance
- [ ] Set up Cloudflare R2 bucket
- [ ] Initialize Fastify API server project with TypeScript
- [ ] Install `firebase-admin` for token verification
- [ ] Create DB migration files (all tables)
- [ ] Run migrations on staging DB
- [ ] Create `lib/api/client.ts` on frontend
- [ ] Set up CI/CD for API server

**✅ Acceptance**: API server starts, connects to TursoDB, verifies a Firebase ID token.

### Phase 1: Auth Bridge + User Profile API (Week 3)

- [ ] Implement auth middleware (`verifyIdToken()` + DB role lookup)
- [ ] Implement `GET /api/users/me`
- [ ] Implement `POST /api/users/register`
- [ ] Implement `PATCH /api/users/:id`
- [ ] **Data migration**: Export Firestore `users` + `wallets` → import to TursoDB
- [ ] Modify `app/auth/register/page.tsx`: replace `setDoc` → `apiClient.post`
- [ ] Modify `app/auth/login/page.tsx`: replace `getDoc` → `apiClient.get`
- [ ] Modify `hooks/useAuth.ts`: replace `onSnapshot` → API call

**✅ Acceptance**: Register → login → see profile from TursoDB. Firebase Auth handles passwords.

### Phase 2: Read-Path Migration (Week 4–6)

- [ ] Implement all GET endpoints
- [ ] **Data migration**: Export all remaining collections → TursoDB
- [ ] Replace all `services/*.service.ts` read methods with API calls
- [ ] Replace all hooks' Firestore reads with API calls
- [ ] Implement admin GET endpoints
- [ ] **Dual-read validation**: Compare API vs Firestore for 100 users

**✅ Acceptance**: All dashboard pages render from TursoDB via API.

### Phase 3: Write-Path Migration (Week 7–9)

- [ ] Port all Cloud Functions to API endpoints (orders, withdrawals, tasks, reviews, membership, admin ops, vendor ops, gamification, coupons)
- [ ] Implement idempotency key checking
- [ ] Implement MLM income distribution as DB transaction
- [ ] Replace all `httpsCallable()` with `apiClient` calls
- [ ] Delete `lib/firebase/callable.ts`, `functions.ts`

**✅ Acceptance**: Full order cycle works. All admin operations functional.

### Phase 4: Real-Time + Storage Migration (Week 10–11)

- [ ] Implement Socket.io WebSocket server
- [ ] Replace all `onSnapshot` listeners with WebSocket/polling
- [ ] Implement R2 presigned URL upload
- [ ] Migrate KYC + product image upload flows to R2
- [ ] Migrate existing Storage files to R2
- [ ] Delete `lib/firebase/storage.ts`, `productImageUpload.ts`

**✅ Acceptance**: Real-time wallet updates via WebSocket. File uploads work with R2.

### Phase 5: Background Jobs + Cleanup (Week 11–12)

- [ ] Set up BullMQ workers (referral processing, MLM distribution, badges, leaderboard, notifications)
- [ ] Port Firestore triggers as event-driven jobs
- [ ] Delete `functions/` directory
- [ ] Slim down `lib/firebase/config.ts` (keep only `auth`)
- [ ] Delete `firestore.rules`, `firestore.indexes.json`, `storage.rules`
- [ ] Clean up `firebase.json`, `.env` files
- [ ] Monitor for 7 days

**✅ Acceptance**: Zero Firestore/Storage/Functions API calls for 7 consecutive days.

### Rollback Strategy

| Phase | Rollback |
|:------|:---------|
| Phase 1–2 | Feature flag toggles between Firestore and API reads |
| Phase 3 | Feature flag toggles between `httpsCallable` and `apiClient` |
| Phase 4 | Feature flag toggles between `onSnapshot` and WebSocket |
| Phase 5 | Re-enable Firestore SDK via feature flag |

---

## 8. Testing Plan

### Unit Tests
- [ ] Auth middleware: valid/expired/banned scenarios
- [ ] Wallet: concurrent debit safety, insufficient balance
- [ ] Orders: idempotency, stock check, wallet debit atomicity
- [ ] MLM: 6-level distribution accuracy

### Integration Tests
- [ ] Register (Firebase Auth) → create profile (API) → fetch → matches
- [ ] Order → wallet debit → transaction log → order visible
- [ ] Withdrawal request → admin approve → balance updated
- [ ] KYC upload (R2) → submit → admin approve → status verified

### E2E Tests
- [ ] User: register → task → earn → shop → order → review
- [ ] Admin: login → dashboard → manage users → KYC → withdrawal
- [ ] Real-time: wallet change → WebSocket delivers within 2s

### Data Validation
- [ ] Row counts: Firestore == TursoDB for all collections
- [ ] Wallet balance = sum(credits) - sum(debits) for all users
- [ ] Referral tree: no orphans or cycles
- [ ] All image URLs resolve

---

## 9. Effort Estimates

| Phase | Effort (person-weeks) | Risk |
|:------|:---------------------|:-----|
| Phase 0: Infrastructure | 2 | Low |
| Phase 1: Auth Bridge | **1** (was 3 in full migration) | **Low** (was High) |
| Phase 2: Read Path | 4 | Medium |
| Phase 3: Write Path | 5 | High |
| Phase 4: Real-Time + Storage | 2.5 | Medium |
| Phase 5: Jobs + Cleanup | 1.5 | Medium |
| **Total** | **16 person-weeks** | — |

| Team Size | Calendar Weeks |
|:----------|:--------------|
| 2 senior engineers | ~10–12 weeks |
| 3 senior engineers | ~7–9 weeks |

---

## 10. Environment Variables

### Frontend (.env)
```bash
# KEPT — Firebase Auth
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# NEW — Your API server
NEXT_PUBLIC_API_URL=https://api.thinkmart.com
NEXT_PUBLIC_WS_URL=wss://api.thinkmart.com
```

### API Server (.env)
```bash
# Firebase Admin (token verification only)
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json

# TursoDB
TURSO_DATABASE_URL=libsql://thinkmart-prod.turso.io
TURSO_AUTH_TOKEN=...

# Redis
REDIS_URL=redis://...

# Cloudflare R2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=thinkmart-uploads
R2_PUBLIC_URL=https://cdn.thinkmart.com

# Typesense
TYPESENSE_HOST=...
TYPESENSE_API_KEY=...
```

---

## 11. Firebase Auth — Final State Checklist

### NPM Dependencies
```json
// Frontend package.json — KEEP
{ "firebase": "^10.7.0" }

// API server package.json — ADD
{ "firebase-admin": "^12.0.0" }
```

### Firebase Console After Migration
| Service | Status |
|:--------|:-------|
| Authentication | ✅ Keep enabled |
| Firestore Database | 🔴 Disable |
| Cloud Functions | 🔴 Disable |
| Storage | 🔴 Disable |
| Hosting | ❓ Depends on deployment |

### Slimmed Config File
```typescript
// lib/firebase/config.ts — AFTER MIGRATION
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
// REMOVED: db, functions, storage
```

---

## 12. Open Questions

| # | Question | Impact |
|:--|:---------|:-------|
| 1 | **Firebase plan**: Spark (free) or Blaze? Free allows 10K MAU for auth. | Confirm auth remains free post-migration |
| 2 | **FCM**: Active? Can be kept alongside Firebase Auth independently. | If yes, keep FCM; if no, use alternative push |
| 3 | **Typesense hosting**: Cloud or self-hosted? | Determines if API key endpoint changes |
| 4 | **Payment gateway**: Razorpay/Stripe planned? | Current code simulates payment |
| 5 | **Firebase Hosting**: Used for deployment? | Need alternative (Vercel recommended) |
| 6 | **Custom claims**: Add roles to Firebase tokens? | Avoids DB lookup per request (optimization) |
| 7 | **Real-time frequency**: How often do wallets update? | If rare, polling may suffice vs WebSocket |

---

*This hybrid plan preserves Firebase Auth while migrating all data and logic to TursoDB. Recommended approach: lower risk, faster delivery, zero user disruption.*
