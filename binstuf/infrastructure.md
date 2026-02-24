# Infrastructure Design

> **Document Version**: 2.0  
> **Last Updated**: January 2026  
> **Audience**: DevOps, Platform Engineers, SREs

---

## Table of Contents
1. [Cloud Strategy](#cloud-strategy)
2. [Infrastructure Diagram](#infrastructure-diagram)
3. [Compute Layer](#compute-layer)
4. [Networking Model](#networking-model)
5. [Load Balancing](#load-balancing)
6. [Auto Scaling](#auto-scaling)
7. [Storage Systems](#storage-systems)
8. [CDN Strategy](#cdn-strategy)
9. [Secrets Management](#secrets-management)
10. [CI/CD Pipeline](#cicd-pipeline)
11. [Environment Strategy](#environment-strategy)
12. [Cost Awareness Strategy](#cost-awareness-strategy)
13. [Disaster Recovery](#disaster-recovery)

---

## Cloud Strategy

### Multi-Cloud Architecture

```mermaid
flowchart TD
    subgraph "Vercel (Frontend)"
        V1[Static Assets]
        V2[Edge Functions]
        V3[API Routes]
        V4[Preview Deployments]
    end
    
    subgraph "Google Cloud Platform (Backend)"
        G1[Firebase Auth]
        G2[Cloud Firestore]
        G3[Cloud Functions]
        G4[Cloud Storage]
        G5[Cloud Logging]
        G6[Secret Manager]
    end
    
    subgraph "Cloudflare (Edge Security)"
        C1[DNS]
        C2[WAF]
        C3[DDoS Protection]
    end
    
    Internet --> C1
    C1 --> V1 & V2 & V3
    V2 --> G1 & G2
    V3 --> G3
    G3 --> G2 & G4
```

### Platform Selection Rationale

| Component | Platform | Why |
|:----------|:---------|:----|
| **Frontend Hosting** | Vercel | Best-in-class Next.js support, global edge network |
| **Authentication** | Firebase Auth | Native Firestore integration, managed security |
| **Database** | Cloud Firestore | Real-time sync, serverless, auto-scaling |
| **Serverless Compute** | Cloud Functions | Firebase triggers, pay-per-use |
| **Blob Storage** | Cloud Storage | Cheap, reliable, CDN-ready |
| **DNS & Security** | Cloudflare | DDoS protection, global anycast |

---

## Infrastructure Diagram

```mermaid
graph TB
    subgraph "Users"
        U1[Web Browser]
        U2[Mobile App - Planned]
    end
    
    subgraph "Edge Layer"
        CF[Cloudflare WAF/CDN]
        VE[Vercel Edge Network]
    end
    
    subgraph "Application Layer"
        NJ[Next.js App]
        MW[Middleware]
    end
    
    subgraph "API Layer"
        FA[Firebase Auth]
        SR[Security Rules]
        CF1[Callable Functions]
        CF2[Trigger Functions]
        CF3[HTTP Functions]
        CF4[Scheduled Functions]
    end
    
    subgraph "Data Layer"
        FS[(Firestore)]
        GCS[(Cloud Storage)]
        BQ[(BigQuery)]
    end
    
    subgraph "Messaging Layer"
        FCM[FCM Push]
        SM[SendGrid Email]
    end
    
    subgraph "Observability"
        CL[Cloud Logging]
        CM[Cloud Monitoring]
        ER[Error Reporting]
    end
    
    U1 --> CF
    U2 --> CF
    CF --> VE
    VE --> NJ
    NJ --> MW
    MW --> FA
    FA --> SR
    SR --> FS
    
    FS --> CF2
    NJ --> CF1
    CF1 --> FS
    CF3 --> FS
    CF4 --> FS
    
    CF2 --> FCM
    CF2 --> SM
    
    FS --> BQ
    
    CF1 & CF2 & CF3 & CF4 --> CL
    CL --> CM
    CL --> ER
```

---

## Compute Layer

### Cloud Functions Configuration

| Function | Runtime | Memory | Timeout | Min Instances | Max Instances |
|:---------|:--------|:-------|:--------|:--------------|:--------------|
| `createOrder` | Node.js 18 | 512 MB | 60s | 1 | 100 |
| `requestWithdrawal` | Node.js 18 | 256 MB | 30s | 1 | 50 |
| `verifyTask` | Node.js 18 | 256 MB | 30s | 1 | 200 |
| `calculateCommission` | Node.js 18 | 512 MB | 120s | 1 | 100 |
| `processScheduledJobs` | Node.js 18 | 1 GB | 540s | 0 | 10 |
| `userOnCreate` | Node.js 18 | 256 MB | 30s | 0 | 100 |

### Cold Start Mitigation

```mermaid
flowchart LR
    subgraph "Strategy 1: Min Instances"
        M1[Critical functions: minInstances=1]
    end
    
    subgraph "Strategy 2: Warmup Pings"
        M2[Cloud Scheduler every 1 min]
        M2 --> P[Ping critical functions]
    end
    
    subgraph "Strategy 3: Gen2 Migration"
        M3[Cloud Run based]
        M3 --> F[Faster cold starts]
    end
```

---

## Networking Model

### VPC Configuration (Future)

```mermaid
flowchart TD
    subgraph "Public Subnet"
        LB[Load Balancer]
    end
    
    subgraph "Private Subnet"
        CF[Cloud Functions VPC Connector]
        FS[(Firestore)]
        RD[(Redis - Future)]
    end
    
    subgraph "Isolated Subnet"
        BQ[(BigQuery)]
    end
    
    Internet --> LB
    LB --> CF
    CF --> FS
    CF --> RD
    FS --> BQ
```

### Firewall Rules

| Rule | Source | Destination | Port | Action |
|:-----|:-------|:------------|:-----|:-------|
| Allow HTTPS | 0.0.0.0/0 | Load Balancer | 443 | Allow |
| Allow Functions | VPC Connector | Firestore | 443 | Allow |
| Deny All | * | * | * | Deny |

---

## Load Balancing

### Current Architecture

```mermaid
flowchart LR
    subgraph "Vercel (Frontend)"
        VLB[Vercel Global Anycast]
        VLB --> E1[Edge POP 1]
        VLB --> E2[Edge POP 2]
        VLB --> E3[Edge POP N]
    end
    
    subgraph "GCP (Backend)"
        GLB[Google Cloud Load Balancer]
        GLB --> CF1[Function Instance 1]
        GLB --> CF2[Function Instance 2]
        GLB --> CFN[Function Instance N]
    end
```

### Load Balancing Strategy

| Traffic Type | Handler | Algorithm |
|:-------------|:--------|:----------|
| **Static Assets** | Vercel CDN | Geolocation |
| **API Routes** | Vercel Edge | Geolocation |
| **Callable Functions** | GCP LB | Round-robin |
| **Webhooks** | GCP LB | Round-robin |

---

## Auto Scaling

### Scaling Configuration

```yaml
# Cloud Functions scaling (conceptual)
scaling:
  createOrder:
    minInstances: 1
    maxInstances: 100
    targetConcurrency: 80  # Scale up at 80% utilization
    
  verifyTask:
    minInstances: 1
    maxInstances: 200
    targetConcurrency: 60  # More aggressive for time-sensitive
    
  processScheduledJobs:
    minInstances: 0
    maxInstances: 10
    targetConcurrency: 1  # One job per instance
```

### Scaling Triggers

| Metric | Threshold | Action |
|:-------|:----------|:-------|
| CPU Utilization | > 70% | Scale up |
| Request Count | > 1000/min | Scale up |
| Error Rate | > 5% | Alert + Hold |
| Cold Start Ratio | > 20% | Increase min instances |

---

## Storage Systems

### Storage Tiers

```mermaid
flowchart TD
    subgraph "Hot Storage"
        FS[(Firestore)]
        FS --> D1[User Data]
        FS --> D2[Transactions]
        FS --> D3[Orders]
    end
    
    subgraph "Warm Storage"
        GCS[(Cloud Storage)]
        GCS --> D4[User Uploads]
        GCS --> D5[Product Images]
        GCS --> D6[Proof Screenshots]
    end
    
    subgraph "Cold Storage"
        BQ[(BigQuery)]
        BQ --> D7[Analytics]
        BQ --> D8[Archived Transactions]
    end
```

### Storage Configuration

| Storage | Type | Region | Redundancy | Cost |
|:--------|:-----|:-------|:-----------|:-----|
| **Firestore** | Multi-region | nam5 | 99.999% SLA | $0.18/100K reads |
| **Cloud Storage** | Regional | us-central1 | 99.99% SLA | $0.02/GB/month |
| **BigQuery** | Multi-region | US | 99.99% SLA | $5/TB queried |

---

## CDN Strategy

### Asset Caching

```mermaid
flowchart LR
    subgraph "Origin"
        O1[Next.js Build Output]
        O2[Cloud Storage Buckets]
    end
    
    subgraph "CDN Edge"
        C1[Vercel Edge]
        C2[Cloud CDN]
    end
    
    subgraph "User"
        U[Browser Cache]
    end
    
    O1 --> C1
    O2 --> C2
    C1 --> U
    C2 --> U
```

### Cache Policy

| Asset Type | TTL | Cache-Control | Invalidation |
|:-----------|:----|:--------------|:-------------|
| **Static JS/CSS** | 1 year | `immutable` | Filename hash |
| **Images** | 7 days | `max-age=604800` | Cache-bust param |
| **HTML** | 0 | `no-cache` | On deploy |
| **API Responses** | 0 | `no-store` | N/A |

---

## Secrets Management

### Secret Hierarchy

```mermaid
flowchart TD
    subgraph "Google Secret Manager"
        S1[STRIPE_SECRET_KEY]
        S2[FIREBASE_ADMIN_SDK]
        S3[WEBHOOK_SECRET]
        S4[ENCRYPTION_KEY]
    end
    
    subgraph "Environment Variables"
        E1[PUBLIC_API_URL]
        E2[FIREBASE_PROJECT_ID]
    end
    
    subgraph "Build Time"
        B1[NEXT_PUBLIC_* vars]
    end
    
    S1 & S2 & S3 & S4 --> CF[Cloud Functions]
    E1 & E2 --> CF
    B1 --> NJ[Next.js Build]
```

### Secret Access Policy

| Secret | Access | Rotation |
|:-------|:-------|:---------|
| `STRIPE_SECRET_KEY` | Functions only | 90 days |
| `FIREBASE_ADMIN_SDK` | Functions only | Never (service account) |
| `WEBHOOK_SECRET` | Functions only | On compromise |
| `ENCRYPTION_KEY` | Functions only | Annual |

---

## CI/CD Pipeline

### Pipeline Architecture

```mermaid
flowchart TD
    subgraph "Trigger"
        T1[Push to main]
        T2[Pull Request]
        T3[Manual Deploy]
    end
    
    subgraph "Build Stage"
        B1[Install Dependencies]
        B2[Lint & Type Check]
        B3[Run Unit Tests]
        B4[Build Next.js]
        B5[Build Functions]
    end
    
    subgraph "Deploy Stage"
        D1{Branch?}
        D1 -->|main| D2[Deploy to Production]
        D1 -->|PR| D3[Deploy to Preview]
        D2 --> D4[Vercel Production]
        D2 --> D5[Firebase Production]
        D3 --> D6[Vercel Preview]
    end
    
    subgraph "Post-Deploy"
        P1[Run E2E Tests]
        P2[Smoke Tests]
        P3[Notify Slack]
    end
    
    T1 & T2 & T3 --> B1
    B1 --> B2 --> B3 --> B4 --> B5
    B5 --> D1
    D2 & D3 --> P1 --> P2 --> P3
```

### GitHub Actions Workflow

```yaml
name: Deploy
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm test
      - run: npm run build

  deploy-preview:
    needs: build
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}

  deploy-production:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-args: '--prod'
      
      - uses: w9jds/firebase-action@master
        with:
          args: deploy --only functions,firestore:rules
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
```

---

## Environment Strategy

### Environment Matrix

| Environment | URL | Database | Purpose |
|:------------|:----|:---------|:--------|
| **Local** | localhost:3000 | Firebase Emulators | Development |
| **Preview** | *.vercel.app | thinkmart-staging | PR Review |
| **Staging** | staging.thinkmart.com | thinkmart-staging | QA/UAT |
| **Production** | thinkmart.com | thinkmart-prod | Live Users |

### Environment Variables

| Variable | Local | Preview | Staging | Production |
|:---------|:------|:--------|:--------|:-----------|
| `FIREBASE_PROJECT` | emulator | staging | staging | prod |
| `API_URL` | localhost | preview | staging | prod |
| `DEBUG` | true | true | true | false |
| `SENTRY_DSN` | - | staging | staging | prod |

---

## Cost Awareness Strategy

### Monthly Cost Breakdown (Projected at 100K MAU)

| Service | Estimated Cost | Optimization |
|:--------|:---------------|:-------------|
| **Firestore** | $500 | Pagination, caching |
| **Cloud Functions** | $200 | Min instances, efficient code |
| **Cloud Storage** | $50 | Lifecycle policies |
| **Vercel** | $20 (Pro) | - |
| **Cloudflare** | $0 (Free) | - |
| **Total** | ~$770/month | |

### Cost Alerts

| Threshold | Action |
|:----------|:-------|
| 80% of budget | Email alert |
| 100% of budget | Slack + PagerDuty |
| 150% of budget | Auto-disable non-critical |

---

## Disaster Recovery

### Backup Strategy

| Data | Backup Frequency | Retention | Recovery Time |
|:-----|:-----------------|:----------|:--------------|
| **Firestore** | Daily (PITR) | 7 days | < 1 hour |
| **Cloud Storage** | No backup (CDN source) | - | - |
| **Secrets** | Manual export | As needed | < 15 min |

### Recovery Procedures

```mermaid
flowchart TD
    A[Incident Detected] --> B{Severity?}
    B -->|P1: Data Loss| C[Initiate PITR Restore]
    B -->|P2: Service Down| D[Check GCP Status]
    B -->|P3: Degraded| E[Scale Up Resources]
    
    C --> F[Validate Restored Data]
    D --> G[Wait for Recovery / Failover]
    E --> H[Monitor Metrics]
    
    F & G & H --> I[Post-Incident Review]
```

---

*This infrastructure document defines the production environment. All changes require change request approval.*
