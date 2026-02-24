# ThinkMart Feature Flag Matrix

> Last Updated: 2026-02-22
> Status: Initial Setup

---

## Feature Flag Definitions

All feature flags follow the naming convention `tm_<domain>_<capability>_enabled`.

### Global Flags (Server + Frontend)

These control the overall migration routing behavior.

| Flag Name | Description | Default | Scope |
|:----------|:-----------|:-------:|:-----:|
| `FF_READ_API_ENABLED` | Route read operations through new API instead of Firestore | `false` | Global |
| `FF_WRITE_API_ENABLED` | Route write operations through new API instead of Cloud Functions | `false` | Global |
| `FF_REALTIME_ENABLED` | Use WebSocket/SSE instead of Firestore `onSnapshot` | `false` | Global |
| `FF_UPLOAD_R2_ENABLED` | Use R2 presigned uploads instead of Firebase Storage | `false` | Global |
| `FF_JOBS_ENABLED` | Use BullMQ workers instead of Firestore triggers | `false` | Global |

### Domain-Level Flags (Recommended Granularity)

These allow per-domain migration control for safer, incremental rollout.

| Flag Name | Domain | Read | Write | Default |
|:----------|:-------|:----:|:-----:|:-------:|
| `tm_users_read_api` | User profiles | ✅ | - | `false` |
| `tm_users_write_api` | User profiles | - | ✅ | `false` |
| `tm_wallet_read_api` | Wallet/transactions | ✅ | - | `false` |
| `tm_wallet_write_api` | Wallet/transactions | - | ✅ | `false` |
| `tm_products_read_api` | Products/catalog | ✅ | - | `false` |
| `tm_products_write_api` | Products (vendor/admin) | - | ✅ | `false` |
| `tm_orders_read_api` | Orders | ✅ | - | `false` |
| `tm_orders_write_api` | Orders | - | ✅ | `false` |
| `tm_reviews_read_api` | Reviews | ✅ | - | `false` |
| `tm_reviews_write_api` | Reviews | - | ✅ | `false` |
| `tm_wishlist_read_api` | Wishlists | ✅ | - | `false` |
| `tm_wishlist_write_api` | Wishlists | - | ✅ | `false` |
| `tm_tasks_read_api` | Tasks/gamification | ✅ | - | `false` |
| `tm_withdrawals_read_api` | Withdrawals | ✅ | - | `false` |
| `tm_withdrawals_write_api` | Withdrawals | - | ✅ | `false` |
| `tm_settings_read_api` | Public settings | ✅ | - | `false` |
| `tm_admin_read_api` | Admin dashboard | ✅ | - | `false` |
| `tm_admin_write_api` | Admin actions | - | ✅ | `false` |
| `tm_vendor_read_api` | Vendor dashboard | ✅ | - | `false` |
| `tm_partner_read_api` | Partner dashboard | ✅ | - | `false` |

---

## Implementation Strategy

### Frontend (Next.js)

Feature flags are stored in `NEXT_PUBLIC_*` environment variables on Vercel or checked via an API call.

```typescript
// lib/featureFlags.ts
export const featureFlags = {
  readApiEnabled: process.env.NEXT_PUBLIC_FF_READ_API_ENABLED === 'true',
  writeApiEnabled: process.env.NEXT_PUBLIC_FF_WRITE_API_ENABLED === 'true',
  realtimeEnabled: process.env.NEXT_PUBLIC_FF_REALTIME_ENABLED === 'true',
  uploadR2Enabled: process.env.NEXT_PUBLIC_FF_UPLOAD_R2_ENABLED === 'true',
};
```

### Server (Fastify)

Feature flags read from environment variables, loaded via the `config/env.ts` Zod schema.

```typescript
// Already defined in server/src/config/env.ts
env.FF_READ_API_ENABLED   // boolean
env.FF_WRITE_API_ENABLED  // boolean
env.FF_REALTIME_ENABLED   // boolean
env.FF_UPLOAD_R2_ENABLED  // boolean
env.FF_JOBS_ENABLED        // boolean
```

---

## Rollout Sequence (Recommended)

### Phase 4-5: Read Migration
1. Enable `tm_settings_read_api` → monitor
2. Enable `tm_products_read_api` → monitor
3. Enable `tm_reviews_read_api` → monitor
4. Enable `tm_wishlist_read_api` → monitor
5. Enable `tm_tasks_read_api` → monitor
6. Enable `tm_users_read_api`, `tm_wallet_read_api` → monitor
7. Enable `tm_orders_read_api`, `tm_withdrawals_read_api` → monitor
8. Enable `tm_admin_read_api`, `tm_vendor_read_api`, `tm_partner_read_api` → monitor
9. Enable global `FF_READ_API_ENABLED` once all domains stable

### Phase 6: Low-Risk Writes
10. Enable `tm_wishlist_write_api` → monitor
11. Enable `tm_reviews_write_api` → monitor
12. Enable `tm_users_write_api` (profile updates only) → monitor
13. Enable `tm_products_write_api` → monitor

### Phase 7: Financial Writes
14. Enable `tm_orders_write_api` → monitor + reconcile
15. Enable `tm_wallet_write_api` → monitor + reconcile
16. Enable `tm_withdrawals_write_api` → monitor + reconcile
17. Enable global `FF_WRITE_API_ENABLED` once all financial domains stable

### Phase 8: Real-time + Uploads
18. Enable `FF_REALTIME_ENABLED` → monitor WebSocket stability
19. Enable `FF_UPLOAD_R2_ENABLED` → monitor upload success rates
20. Enable `FF_JOBS_ENABLED` → monitor queue processing

---

## Rollback Procedure

To roll back any domain:
1. Set the domain-specific flag back to `false`
2. Frontend will automatically route back to Firestore/Functions
3. Verify Firebase fallback paths still work
4. Check for data inconsistencies between systems
5. Fix issues before re-enabling

To roll back globally:
1. Set `FF_READ_API_ENABLED=false` and/or `FF_WRITE_API_ENABLED=false`
2. All domains fall back to Firebase simultaneously
3. Monitor Firebase console for resumed traffic
4. Run reconciliation scripts if any writes occurred during transition

---

## Canary/Cohort Strategy (Optional)

For high-risk domains (financial), consider:
- Roll out to 5% of users first
- Monitor for 24h
- Increase to 25%, then 50%, then 100%
- Use user UID hash modulo for consistent cohort assignment

```typescript
function isInCanary(uid: string, percentage: number): boolean {
  const hash = uid.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return (hash % 100) < percentage;
}
```
