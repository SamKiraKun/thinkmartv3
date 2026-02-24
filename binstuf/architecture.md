# System Architecture

> **Document Version**: 2.0  
> **Last Updated**: January 2026  
> **Audience**: Staff Engineers, Architects, Technical Leadership

---

## Table of Contents
1. [High-Level Architecture](#high-level-architecture)
2. [Service Boundaries](#service-boundaries)
3. [Monolith vs Microservices Analysis](#monolith-vs-microservices-analysis)
4. [Request Lifecycle](#request-lifecycle)
5. [Concurrency Model](#concurrency-model)
6. [Consistency Model](#consistency-model)
7. [Caching Strategy](#caching-strategy)
8. [Background Processing](#background-processing)
9. [Idempotency Strategy](#idempotency-strategy)
10. [Failure Recovery Patterns](#failure-recovery-patterns)
11. [Architectural Tradeoffs](#architectural-tradeoffs)

---

## High-Level Architecture

```mermaid
graph TB
    subgraph "Client Tier"
        Web[Next.js Web App]
        PWA[Progressive Web App]
        Mobile[React Native - Planned]
    end
    
    subgraph "Edge Tier"
        CDN[Vercel Edge Network]
        MW[Next.js Middleware]
        CF_EDGE[Cloudflare WAF]
    end
    
    subgraph "API Gateway Tier"
        AUTH[Firebase Auth]
        RULES[Firestore Security Rules]
    end
    
    subgraph "Compute Tier"
        CF1[onCreate Triggers]
        CF2[onUpdate Triggers]
        CF3[onDelete Triggers]
        CF4[Callable Functions]
        CF5[HTTP Functions]
        CF6[Scheduled Functions]
    end
    
    subgraph "Data Tier"
        FS[(Cloud Firestore)]
        GCS[(Cloud Storage)]
        BQ[(BigQuery - Analytics)]
    end
    
    subgraph "Messaging Tier"
        FCM[Firebase Cloud Messaging]
        EMAIL[Email Service]
    end
    
    Web & PWA & Mobile -->|HTTPS| CDN
    CDN --> MW
    MW --> AUTH
    AUTH -->|JWT| RULES
    RULES -->|Read/Write| FS
    
    FS -->|Trigger| CF1 & CF2 & CF3
    Web -->|Callable| CF4
    Web -->|HTTP| CF5
    CF6 -->|Scheduled| FS
    
    CF1 & CF2 & CF3 & CF4 --> FS
    CF1 & CF2 --> FCM
    CF4 --> GCS
    FS -->|Export| BQ
```

### Component Descriptions

| Component | Technology | Purpose |
|:----------|:-----------|:--------|
| **Web Client** | Next.js 14 (App Router) | Server-Rendered React with Edge capabilities |
| **Edge Network** | Vercel Edge | Global CDN, automatic HTTPS, DDoS protection |
| **Identity** | Firebase Auth | OAuth, Email/Password, Session management |
| **Authorization** | Firestore Security Rules | Declarative access control |
| **Compute** | Cloud Functions Gen 2 | Serverless event handlers |
| **Database** | Cloud Firestore | Real-time NoSQL document store |
| **Blob Storage** | Cloud Storage | User uploads, proof screenshots |
| **Push** | Firebase Cloud Messaging | Cross-platform push notifications |

---

## Service Boundaries

### Domain Decomposition

```mermaid
flowchart TD
    subgraph "Identity Domain"
        IS[Identity Service]
        IS --> U[users collection]
        IS --> AUTH[Firebase Auth Integration]
    end
    
    subgraph "Financial Domain"
        FS_FIN[Ledger Service]
        FS_FIN --> W[wallets collection]
        FS_FIN --> T[transactions collection]
        FS_FIN --> WD[withdrawals collection]
    end
    
    subgraph "Commerce Domain"
        CS[Commerce Service]
        CS --> P[products collection]
        CS --> O[orders collection]
    end
    
    subgraph "Engagement Domain"
        ES[Engagement Service]
        ES --> TK[tasks collection]
        ES --> TC[task_completions collection]
        ES --> SV[surveys collection]
        ES --> SR[survey_responses collection]
    end
    
    subgraph "Network Domain"
        NS[Graph Service]
        NS --> TM[teams collection]
        NS --> UL[uplinePath on users]
    end
```

### Service Responsibility Matrix

| Service | Owns | Reads From | Writes To | Triggers |
|:--------|:-----|:-----------|:----------|:---------|
| **Identity** | `users` | - | `users`, `wallets` | `users.onCreate` |
| **Ledger** | `wallets`, `transactions`, `withdrawals` | `users` | `wallets`, `transactions` | `task_completions.onCreate`, `orders.onCreate` |
| **Commerce** | `products`, `orders` | `wallets` | `orders`, `wallets` | `orders.onUpdate` |
| **Engagement** | `tasks`, `task_completions`, `surveys` | `users` | `task_completions` | Callable: `verifyTask` |
| **Graph** | `teams`, `uplinePath` logic | `users` | `users`, `wallets` | `users.onCreate`, `task_completions.onCreate` |

### Cross-Service Communication

```mermaid
sequenceDiagram
    participant Engagement as Engagement Service
    participant Ledger as Ledger Service
    participant Graph as Graph Service
    participant Notification as Notification Service
    
    Note over Engagement: User completes task
    Engagement->>Ledger: Credit user wallet
    Engagement->>Graph: Request upline distribution
    Graph->>Ledger: Credit each ancestor
    Ledger->>Notification: Trigger earning notifications
```

---

## Monolith vs Microservices Analysis

### Current State: Modular Serverless Monolith

```mermaid
flowchart LR
    subgraph "Single Repository"
        direction TB
        SRC[/functions/src/]
        SRC --> AUTH_MOD[auth/]
        SRC --> WALLET_MOD[wallet/]
        SRC --> ORDERS_MOD[orders/]
        SRC --> TASKS_MOD[tasks/]
        SRC --> MLM_MOD[mlm/]
        SRC --> INDEX[index.ts - exports all]
    end
    
    subgraph "Deployment"
        DEPLOY[firebase deploy --only functions]
        DEPLOY --> CF1[createUser]
        DEPLOY --> CF2[processOrder]
        DEPLOY --> CF3[calculateCommission]
        DEPLOY --> CF4[requestWithdrawal]
    end
```

### Decision Matrix

| Factor | Monolith | Modular Monolith (Current) | Full Microservices |
|:-------|:---------|:---------------------------|:-------------------|
| **Deployment Complexity** | ✅ Simple | ✅ Simple | ❌ Complex |
| **Independent Scaling** | ❌ No | ✅ Per-function | ✅ Per-service |
| **Team Autonomy** | ✅ Full | ✅ Full (module owners) | ✅ Full |
| **Operational Overhead** | ✅ Low | ✅ Low | ❌ High |
| **Cold Start Impact** | ❌ All code loads | ✅ Only function loads | ✅ Isolated |
| **Testing Complexity** | ✅ Simple | ✅ Simple | ❌ Integration hell |

### Why Modular Serverless Monolith?

1. **Right Size for Stage**: We have <10 engineers. Microservices operational burden is not justified.
2. **Firebase Native**: The functions framework naturally encourages small, focused functions.
3. **Escape Hatch Ready**: Each module can become a separate service when needed (clear boundaries).
4. **Shared Types**: TypeScript interfaces are shared across modules without versioning headaches.

---

## Request Lifecycle

### Example: User Places an Order

```mermaid
sequenceDiagram
    autonumber
    participant U as User Browser
    participant VE as Vercel Edge
    participant MW as Next.js Middleware
    participant FA as Firebase Auth
    participant CF as createOrder Function
    participant FS as Firestore
    participant FCM as Push Service
    
    U->>VE: POST /api/createOrder
    VE->>MW: Forward request
    MW->>MW: Verify session cookie
    MW->>FA: Validate ID Token
    FA-->>MW: Token valid (uid: user123)
    MW->>CF: httpsCallable with auth context
    
    Note over CF: Transaction begins
    CF->>FS: Read products/{ids}
    FS-->>CF: Product data
    CF->>CF: Validate inventory
    CF->>FS: Read wallets/user123
    FS-->>CF: Balance: $50
    CF->>CF: Validate balance >= total
    CF->>FS: Decrement inventory
    CF->>FS: Debit wallet
    CF->>FS: Create transactions/{txnId}
    CF->>FS: Create orders/{orderId}
    Note over CF: Transaction commits
    
    CF-->>MW: { success: true, orderId }
    MW-->>VE: Response
    VE-->>U: Order confirmation
    
    Note over FS: Async trigger
    FS->>CF: orders.onCreate trigger
    CF->>FCM: Send push notification
    FCM-->>U: "Order #123 confirmed!"
```

### Latency Budget

| Phase | Target | Reality |
|:------|:-------|:--------|
| Edge → Middleware | <20ms | 10-15ms |
| Auth Validation | <50ms | 30-40ms |
| Function Cold Start | <500ms | 200-2000ms (depends on instance state) |
| Firestore Transaction | <200ms | 100-150ms |
| Total P95 | <1000ms | 500-800ms (warm) |

---

## Concurrency Model

### The Problem: Double Spending

```mermaid
sequenceDiagram
    participant A as Request A
    participant B as Request B
    participant FS as Firestore
    
    Note over A,B: Balance = $100
    A->>FS: Read balance ($100)
    B->>FS: Read balance ($100)
    A->>A: Calculate: $100 - $80 = $20 ✓
    B->>B: Calculate: $100 - $50 = $50 ✓
    A->>FS: Write balance = $20
    B->>FS: Write balance = $50
    Note over FS: FINAL: $50 (should be -$30!)
```

### The Solution: Optimistic Concurrency Control

```mermaid
sequenceDiagram
    participant A as Request A
    participant B as Request B
    participant FS as Firestore
    
    Note over FS: Using runTransaction()
    A->>FS: Transaction START
    A->>FS: Read balance ($100) + acquire lock
    B->>FS: Transaction START
    B->>FS: Read balance - blocked
    A->>A: Calculate: $100 - $80 = $20 ✓
    A->>FS: Write balance = $20
    A->>FS: COMMIT
    Note over FS: Balance = $20
    B->>FS: Read balance ($20)
    B->>B: Calculate: $20 - $50 = -$30 ✗
    B->>FS: ABORT (insufficient funds)
```

### Implementation Pattern

```typescript
// All financial mutations use this pattern
async function debitWallet(uid: string, amount: number, idempotencyKey: string) {
  return firestore.runTransaction(async (txn) => {
    // Check idempotency
    const keyRef = db.collection('processed_keys').doc(idempotencyKey);
    const keySnap = await txn.get(keyRef);
    if (keySnap.exists) {
      return keySnap.data().result; // Return cached result
    }
    
    // Read current balance
    const walletRef = db.collection('wallets').doc(uid);
    const walletSnap = await txn.get(walletRef);
    const balance = walletSnap.data().cashBalance;
    
    // Validate
    if (balance < amount) {
      throw new functions.https.HttpsError('failed-precondition', 'Insufficient balance');
    }
    
    // Write new balance + ledger entry + idempotency key
    const newBalance = balance - amount;
    txn.update(walletRef, { cashBalance: newBalance });
    txn.set(db.collection('transactions').doc(), { /* ... */ });
    txn.set(keyRef, { result: { success: true, newBalance }, processedAt: FieldValue.serverTimestamp() });
    
    return { success: true, newBalance };
  });
}
```

---

## Consistency Model

### Hybrid Approach

```mermaid
flowchart TD
    subgraph "Strong Consistency (ACID)"
        SC1[Wallet Balances]
        SC2[Transaction Records]
        SC3[Inventory Counts]
        SC4[Order Status]
    end
    
    subgraph "Eventual Consistency"
        EC1[Leaderboard Rankings]
        EC2[Team Statistics]
        EC3[Activity Feeds]
        EC4[Analytics Aggregates]
    end
    
    SC1 & SC2 & SC3 & SC4 -->|runTransaction| FS[(Firestore)]
    EC1 & EC2 & EC3 & EC4 -->|Scheduled Jobs| FS
```

### Justification

| Data Type | Consistency | Why |
|:----------|:------------|:----|
| **Wallet Balance** | Strong | User cannot see money they don't have |
| **Inventory** | Strong | Cannot sell item that doesn't exist |
| **Leaderboard** | Eventual (60s lag) | Acceptable; reduces write contention |
| **Team Sales Total** | Eventual (5m lag) | Statistical; not transactional |

---

## Caching Strategy

### Cache Layers

```mermaid
flowchart LR
    subgraph "Layer 1: Edge"
        CDN[Vercel Edge Cache]
        CDN --> ST[Static Assets: 1 year]
        CDN --> IMG[Images: 1 week]
        CDN --> HTML[Dynamic HTML: 0 - SSR]
    end
    
    subgraph "Layer 2: Client"
        RQ[React Query / SWR]
        RQ --> STALE[stale-while-revalidate: 30s]
        ZU[Zustand Store]
        ZU --> SESSION[Session-scoped state]
    end
    
    subgraph "Layer 3: Firestore"
        FS_CACHE[Firestore SDK Cache]
        FS_CACHE --> OFFLINE[Offline persistence]
        FS_CACHE --> SNAP[Snapshot listeners]
    end
```

### Cache Policy by Data Type

| Data | Cache Location | TTL | Invalidation |
|:-----|:---------------|:----|:-------------|
| **Product Images** | CDN | 7 days | Cache-bust on upload |
| **Product Catalog** | React Query | 5 min | Manual refetch on admin update |
| **User Profile** | Zustand + Firestore | Session | Real-time listener |
| **Wallet Balance** | Firestore Listener | Real-time | Automatic |
| **Transaction History** | React Query | 1 min | Refetch on navigation |

---

## Background Processing

### Job Types

```mermaid
flowchart TD
    subgraph "Trigger-Based (Immediate)"
        T1[onCreate: User] --> J1[Initialize Wallet]
        T2[onCreate: Task Completion] --> J2[Calculate Commission]
        T3[onUpdate: Order] --> J3[Send Status Notification]
    end
    
    subgraph "Scheduled (Periodic)"
        S1[Every 1 min] --> J4[Process Withdrawal Queue]
        S2[Every 1 hour] --> J5[Update Leaderboards]
        S3[Every 24 hours] --> J6[Archive Old Transactions]
        S4[Every 24 hours] --> J7[Reconciliation Check]
    end
    
    subgraph "Queue-Based (Deferred)"
        Q1[Cloud Tasks] --> J8[Send Email Digests]
        Q2[Cloud Tasks] --> J9[Generate Reports]
    end
```

### Job Configuration

| Job | Trigger | Retry Policy | Timeout | Min Instances |
|:----|:--------|:-------------|:--------|:--------------|
| `initializeWallet` | `users.onCreate` | 3 retries, exponential backoff | 30s | 0 |
| `calculateCommission` | `task_completions.onCreate` | 5 retries | 60s | 1 |
| `processWithdrawals` | Scheduled (1 min) | N/A | 540s | 1 |
| `updateLeaderboards` | Scheduled (1 hour) | N/A | 540s | 0 |

---

## Idempotency Strategy

### Why It Matters

```mermaid
sequenceDiagram
    participant C as Client
    participant LB as Load Balancer
    participant CF as Cloud Function
    participant FS as Firestore
    
    C->>LB: POST /withdraw (key: abc123)
    LB->>CF: Forward
    CF->>FS: Process withdrawal
    FS-->>CF: Success
    CF-->>LB: 200 OK
    LB--xC: Network timeout
    
    Note over C: Client doesn't know if it succeeded
    C->>LB: RETRY POST /withdraw (key: abc123)
    LB->>CF: Forward
    CF->>FS: Check processed_keys/abc123
    FS-->>CF: Exists! Return cached result
    CF-->>LB: 200 OK (idempotent)
    LB-->>C: Success (no double withdrawal)
```

### Implementation

```typescript
// Idempotency key pattern
interface IdempotencyRecord {
  key: string;              // UUID from client
  operation: string;        // 'WITHDRAWAL' | 'ORDER' | etc.
  result: any;              // Cached response
  processedAt: Timestamp;
  expiresAt: Timestamp;     // 24-hour TTL
}

// Collection: processed_keys/{idempotencyKey}
```

### Key Generation Rules

| Operation | Key Format | Client Responsibility |
|:----------|:-----------|:----------------------|
| **Withdrawal** | `wd-{uid}-{timestamp}-{random}` | Generate once, retry with same key |
| **Order** | `ord-{uid}-{cartHash}-{random}` | Same cart = same key |
| **Task Completion** | `tc-{uid}-{taskId}-{date}` | Automatic dedup per day |

---

## Failure Recovery Patterns

### Circuit Breaker (External APIs)

```mermaid
stateDiagram-v2
    [*] --> Closed
    Closed --> Open: 5 failures in 60s
    Open --> HalfOpen: After 30s cooldown
    HalfOpen --> Closed: Success
    HalfOpen --> Open: Failure
```

### Dead Letter Queue

```mermaid
flowchart TD
    E[Event: task_completions.onCreate] --> F1{Function succeeds?}
    F1 -->|Yes| D[Done]
    F1 -->|No| R[Retry with backoff]
    R --> F2{Retry succeeds?}
    F2 -->|Yes| D
    F2 -->|No| DLQ[Dead Letter Queue]
    DLQ --> A[Alert: Manual Review]
    A --> M[Manual Resolution]
    M --> RE[Re-process]
```

### Saga Pattern (Multi-Step Workflows)

```mermaid
sequenceDiagram
    participant O as Order Service
    participant W as Wallet Service
    participant I as Inventory Service
    
    O->>O: Create order (status: PENDING)
    O->>W: Debit wallet
    alt Wallet success
        O->>I: Reserve inventory
        alt Inventory success
            O->>O: Update order (status: CONFIRMED)
        else Inventory failed
            O->>W: Compensate: Refund wallet
            O->>O: Update order (status: CANCELLED)
        end
    else Wallet failed
        O->>O: Update order (status: FAILED)
    end
```

---

## Architectural Tradeoffs

### Decision Log

| Decision | Alternatives Considered | Why This Choice | Tradeoff Accepted |
|:---------|:------------------------|:----------------|:------------------|
| **Firestore over Postgres** | Supabase, PlanetScale | Real-time sync, serverless, infinite scale | Complex queries are limited |
| **Cloud Functions over ECS** | AWS Lambda, Cloud Run | Firebase integration, auto-scaling | Cold starts on infrequent paths |
| **Vercel over Amplify** | Firebase Hosting, Netlify | Best Next.js support, preview deploys | Vendor lock-in |
| **Materialized Path over Graph DB** | Neo4j, Neptune | Simple reads, no new tech to manage | Reparenting is expensive |
| **Client-Side Cart** | Server-Side Cart | No abandoned cart cleanup needed | Cart lost on logout |
| **JWT over Sessions** | Redis sessions | Stateless, edge-verifiable | Harder to revoke |

### Technical Debt Acknowledgment

| Debt Item | Impact | Remediation Plan |
|:----------|:-------|:-----------------|
| **Gen1 Functions** | Higher cold starts | Migrate to Gen2 in Q2 |
| **No Message Queue** | Tight coupling | Add Pub/Sub for v2 |
| **Monolithic Index File** | IDE slowdown | Split into barrel exports |
| **No API Rate Limiting** | Abuse risk | Add Cloud Armor rules |

---

*This architecture document is the source of truth for system design decisions. All significant changes require RFC and review.*
