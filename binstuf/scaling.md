# Scaling Strategy

> **Document Version**: 2.0  
> **Last Updated**: January 2026  
> **Audience**: Platform Engineers, SREs, Technical Leadership

---

## Table of Contents
1. [Bottleneck Forecasting](#bottleneck-forecasting)
2. [Horizontal Scaling Plan](#horizontal-scaling-plan)
3. [Read vs Write Scaling](#read-vs-write-scaling)
4. [Queue-Based Architectures](#queue-based-architectures)
5. [Event-Driven Evolution](#event-driven-evolution)
6. [SLOs / SLAs](#slos--slas)
7. [Capacity Planning](#capacity-planning)
8. [Traffic Surge Handling](#traffic-surge-handling)
9. [Scaling Activation Triggers](#scaling-activation-triggers)

---

## Bottleneck Forecasting

### System Bottleneck Map

```mermaid
flowchart TD
    subgraph "Tier 1: Likely Bottlenecks"
        B1[Firestore Document Write Rate]
        B2[Cloud Functions Cold Starts]
        B3[Wallet Hotspot]
    end
    
    subgraph "Tier 2: Potential Bottlenecks"
        B4[Composite Index Limits]
        B5[Outbound Connection Limits]
        B6[BigQuery Export Throughput]
    end
    
    subgraph "Tier 3: Unlikely Bottlenecks"
        B7[Firestore Read Capacity]
        B8[Cloud Storage Bandwidth]
        B9[FCM Delivery]
    end
    
    B1 --> M1[Sharded Counters]
    B2 --> M2[Min Instances + Gen2]
    B3 --> M3[Batch Writes]
    B4 --> M4[Query Optimization]
    B5 --> M5[Cloud NAT]
    B6 --> M6[Streaming Exports]
```

### Bottleneck Thresholds

| Resource | Soft Limit | Hard Limit | Current Usage | Risk Level |
|:---------|:-----------|:-----------|:--------------|:-----------|
| **Document Write Rate** | 1/sec | 10/sec (burst) | 0.1/sec | 🟢 Low |
| **Cold Start Latency** | 500ms | 2000ms | 800ms avg | 🟡 Medium |
| **Concurrent Function Instances** | 3,000 | 3,000 | 50 | 🟢 Low |
| **Firestore Index Count** | 200 | 200 | 45 | 🟢 Low |
| **Daily Firestore Reads** | 50M | Unlimited | 1M | 🟢 Low |

---

## Horizontal Scaling Plan

### Scaling Dimensions

```mermaid
flowchart LR
    subgraph "Automatic Scaling"
        A1[Cloud Functions] --> S1[0 to 3000 instances]
        A2[Firestore] --> S2[Automatic sharding]
        A3[Vercel Edge] --> S3[Global auto-scale]
    end
    
    subgraph "Manual Scaling"
        M1[Min Instances] --> C1[Config change]
        M2[Region Expansion] --> C2[Architecture change]
        M3[Database Sharding] --> C3[Code change]
    end
```

### Scaling by Component

| Component | Scaling Type | Trigger | Action |
|:----------|:-------------|:--------|:-------|
| **Cloud Functions** | Automatic | Request volume | Add instances |
| **Firestore** | Automatic | Data volume | Split tablets |
| **CDN Edge** | Automatic | Traffic | Add POPs |
| **BigQuery** | Automatic | Query load | Add slots |

---

## Read vs Write Scaling

### Read Scaling Strategy

```mermaid
flowchart TD
    subgraph "Read Path Optimization"
        R1[Client Request] --> R2{Cached?}
        R2 -->|Yes| R3[Return from Cache]
        R2 -->|No| R4[Query Firestore]
        R4 --> R5[Cache Result]
        R5 --> R6[Return to Client]
    end
    
    subgraph "Cache Layers"
        C1[Browser Cache]
        C2[React Query Cache]
        C3[Firestore SDK Cache]
        C4[CDN Cache]
    end
```

### Write Scaling Strategy

```mermaid
flowchart TD
    subgraph "Write Path Optimization"
        W1[Client Write] --> W2{Immediate Required?}
        W2 -->|Yes| W3[Direct Firestore Write]
        W2 -->|No| W4[Queue for Batch]
        W4 --> W5[Batch Processor]
        W5 --> W6[Batched Firestore Write]
    end
    
    subgraph "Write Patterns"
        P1[Single Doc Update]
        P2[Batched Write - 500 ops]
        P3[Transaction - 500 ops]
    end
```

### Read/Write Ratio Analysis

| Operation | Read:Write Ratio | Optimization |
|:----------|:-----------------|:-------------|
| **Product Browsing** | 1000:1 | Aggressive caching |
| **Wallet Check** | 100:1 | Real-time listener |
| **Task Completion** | 1:3 | Write batching |
| **Order Placement** | 1:5 | Transaction optimization |

---

## Queue-Based Architectures

### Current Architecture

```mermaid
sequenceDiagram
    participant C as Client
    participant CF as Cloud Function
    participant FS as Firestore
    
    C->>CF: createOrder()
    CF->>FS: Transaction
    CF-->>C: Success (synchronous)
    
    Note over CF,FS: Side effects via Triggers
    FS->>CF: onCreate trigger
    CF->>CF: Send notification
    CF->>CF: Calculate commission
```

### Future: Queue-Based Architecture

```mermaid
sequenceDiagram
    participant C as Client
    participant API as API Function
    participant Q as Cloud Tasks Queue
    participant W as Worker Function
    participant FS as Firestore
    
    C->>API: createOrder()
    API->>FS: Create order (PENDING)
    API->>Q: Enqueue processing task
    API-->>C: 202 Accepted (async)
    
    Note over Q,W: Deferred processing
    Q->>W: Process order
    W->>FS: Validate + Execute
    W->>FS: Update order (CONFIRMED)
    W->>C: Push notification
```

### Queue Configuration

| Queue | Rate Limit | Retry Policy | Use Case |
|:------|:-----------|:-------------|:---------|
| **order-processing** | 100/sec | 3 retries, exponential | Order fulfillment |
| **commission-distribution** | 500/sec | 5 retries, exponential | MLM payouts |
| **notification-delivery** | 1000/sec | 3 retries, linear | Push/Email |
| **export-jobs** | 10/sec | 1 retry | Analytics export |

---

## Event-Driven Evolution

### Evolution Path

```mermaid
flowchart LR
    subgraph "Phase 1: Current"
        E1[Firestore Triggers]
        E1 --> F1[Direct function calls]
    end
    
    subgraph "Phase 2: Pub/Sub"
        E2[Event Published]
        E2 --> T1[Topic: order.created]
        T1 --> S1[Subscriber: Commission]
        T1 --> S2[Subscriber: Notification]
        T1 --> S3[Subscriber: Analytics]
    end
    
    subgraph "Phase 3: Event Sourcing"
        E3[Event Store]
        E3 --> P1[Projection: Wallet Balance]
        E3 --> P2[Projection: Leaderboard]
        E3 --> P3[Projection: Reports]
    end
    
    E1 -->|Migration| E2
    E2 -->|Migration| E3
```

### Event Catalog (Proposed)

| Event | Trigger | Subscribers |
|:------|:--------|:------------|
| `user.created` | User signup | Wallet init, Welcome email, Referral bonus |
| `task.completed` | Task verification | Credit wallet, Commission calc, Notification |
| `order.created` | Order placement | Inventory update, Notification, Analytics |
| `order.shipped` | Admin action | Customer notification, Tracking |
| `withdrawal.approved` | Admin action | Payout processor, Notification |

---

## SLOs / SLAs

### Service Level Objectives

| Service | Metric | Target | Measurement |
|:--------|:-------|:-------|:------------|
| **API Availability** | Uptime | 99.9% | Synthetic monitoring |
| **Order Latency** | P95 | < 1000ms | Cloud Monitoring |
| **Task Verification** | P95 | < 500ms | Cloud Monitoring |
| **Notification Delivery** | Success Rate | 99.5% | FCM reports |
| **Withdrawal Processing** | Completion Time | < 24 hours | Manual tracking |

### Error Budget

```mermaid
pie title Monthly Error Budget (99.9% SLO)
    "Allowed Downtime" : 43.2
    "Used This Month" : 12.5
    "Remaining" : 30.7
```

### SLA Commitments (Future)

| Tier | Availability | Support | Price |
|:-----|:-------------|:--------|:------|
| **Free** | Best effort | Community | $0 |
| **Pro** | 99.9% | Email (48h) | $29/mo |
| **Enterprise** | 99.99% | Dedicated (4h) | Custom |

---

## Capacity Planning

### Traffic Projections

```mermaid
xychart-beta
    title "Projected Daily Transactions (Next 12 Months)"
    x-axis [Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec]
    y-axis "Transactions (Thousands)" 0 --> 1000
    line [25, 40, 60, 90, 130, 180, 250, 340, 450, 580, 750, 950]
```

### Resource Requirements by Scale

| MAU | Firestore Reads/Day | Function Invocations/Day | Estimated Cost |
|:----|:--------------------|:-------------------------|:---------------|
| 10K | 500K | 50K | $100/mo |
| 100K | 5M | 500K | $800/mo |
| 1M | 50M | 5M | $5,000/mo |
| 10M | 500M | 50M | $40,000/mo |

### Scaling Milestones

| Milestone | Trigger | Actions Required |
|:----------|:--------|:-----------------|
| **10K MAU** | - | Current architecture sufficient |
| **100K MAU** | Cold starts noticeable | Increase min instances |
| **500K MAU** | Wallet hotspotting | Implement sharded counters |
| **1M MAU** | Query latency | Add caching layer (Redis) |
| **5M MAU** | Single region limits | Multi-region deployment |

---

## Traffic Surge Handling

### Surge Scenarios

| Scenario | Expected Spike | Duration | Strategy |
|:---------|:---------------|:---------|:---------|
| **Marketing Campaign** | 10x normal | 2-4 hours | Pre-warm functions |
| **Viral Referral** | 50x normal | 1-2 days | Rate limiting + queueing |
| **Flash Sale** | 100x normal | 1 hour | Queue + graceful degradation |
| **DDoS Attack** | 1000x normal | Variable | Cloudflare + App Check |

### Graceful Degradation Hierarchy

```mermaid
flowchart TD
    L1[Level 0: Normal Operation] --> L2[Level 1: Disable Real-Time Features]
    L2 --> L3[Level 2: Enable Strict Rate Limiting]
    L3 --> L4[Level 3: Queue All Non-Critical Writes]
    L4 --> L5[Level 4: Read-Only Mode]
    L5 --> L6[Level 5: Maintenance Page]
    
    subgraph "Disabled at Each Level"
        D1[L1: Live typing, Presence]
        D2[L2: 50% rate limit]
        D3[L3: Tasks, Surveys queued]
        D4[L4: Orders, Withdrawals blocked]
        D5[L5: All traffic blocked]
    end
```

### Surge Response Playbook

```mermaid
sequenceDiagram
    participant A as Alert
    participant O as On-Call
    participant S as System
    
    A->>O: Traffic spike detected
    O->>S: Check metrics dashboard
    
    alt Organic Growth
        O->>S: Verify no attack
        O->>S: Pre-scale functions
        O->>O: Monitor
    else Attack Suspected
        O->>S: Enable Cloudflare Under Attack Mode
        O->>S: Block suspicious IPs
        O->>S: Enable App Check enforcement
    end
```

---

## Scaling Activation Triggers

### When to Scale

| Indicator | Threshold | Scaling Action |
|:----------|:----------|:---------------|
| **P95 Latency > 1s** | 5 min sustained | Scale up functions |
| **Error Rate > 5%** | 2 min sustained | Investigate + scale |
| **Queue Depth > 1000** | 1 min sustained | Scale workers |
| **Cold Start Ratio > 30%** | 1 hour | Increase min instances |
| **Wallet Write Contention** | 10 retries/min | Enable sharding |

### Scaling Decision Tree

```mermaid
flowchart TD
    A[Latency Increase Detected] --> B{Is it cold starts?}
    B -->|Yes| C[Increase minInstances]
    B -->|No| D{Is it DB contention?}
    D -->|Yes| E[Enable sharding / batching]
    D -->|No| F{Is it CPU bound?}
    F -->|Yes| G[Increase memory allocation]
    F -->|No| H[Investigate code / external deps]
```

---

*This scaling document guides capacity decisions. Review quarterly or after significant traffic changes.*
