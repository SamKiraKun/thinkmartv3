# ThinkMart v2 - Complete Testing Documentation

> **Generated:** 2026-02-06  
> **Version:** 2.0  
> **Project:** ThinkMart – Earn & Shop Platform

---

## 1. Project Testing Overview

### 1.1 What This Project Does

ThinkMart is a **multi-role earning and e-commerce platform** built on Next.js + Firebase with the following core systems:

| System | Description |
|--------|-------------|
| **User Earning** | Complete tasks (videos, surveys, website visits) to earn coins |
| **Games** | Spin Wheel & Lucky Box with daily limits and weighted RNG |
| **E-Commerce** | Shop with mixed payment (Cash + Coins) |
| **MLM/Referrals** | 6-level team income distribution |
| **Membership** | ₹1000 premium upgrade to unlock team income |
| **Wallet** | Dual currency (Cash INR + Coins), conversion, and withdrawals |
| **KYC** | Identity verification required for withdrawals |
| **Partner System** | City-based partners earn 20% commission |
| **Vendor System** | Third-party vendors list products |
| **Admin Dashboard** | Full control over users, orders, products, withdrawals, KYC |

### 1.2 User Roles

| Role | Access Level |
|------|-------------|
| `user` | Standard user – tasks, shop, withdraw |
| `admin` | Full system control |
| `sub_admin` | Limited admin with permission-based access |
| `partner` | City-based commission earner |
| `vendor` | Product seller |
| `organization` | MLM organization head |

### 1.3 Testing Goals

1. Validate all user flows work correctly end-to-end
2. Verify security rules prevent unauthorized access
3. Ensure financial calculations are accurate (wallet, MLM, commissions)
4. Test rate limits, cooldowns, and abuse prevention
5. Verify admin operations are logged and idempotent
6. Confirm database consistency across transactions

---

## 2. Environment Setup

### 2.1 Required Dependencies

```bash
# Frontend
node >= 18.x
npm >= 9.x

# Firebase
firebase-tools >= 13.x

# Backend Functions
Node.js 18 (Firebase Functions runtime)
```

### 2.2 Environment Variables Checklist

Create `.env.local` with:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | ✅ | Firebase Web API Key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | ✅ | Auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | ✅ | Project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | ✅ | Storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | ✅ | FCM sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | ✅ | App ID |

### 2.3 Setup Steps

```bash
# 1. Install frontend dependencies
npm install

# 2. Install function dependencies
cd functions && npm install && cd ..

# 3. Login to Firebase
firebase login

# 4. Start emulators (for local testing)
firebase emulators:start --only functions,firestore,auth

# 5. Start frontend
npm run dev
```

### 2.4 Required Test Accounts

Create these accounts before testing:

| Email | Role | Purpose |
|-------|------|---------|
| `admin@thinkmart.test` | `admin` | Full admin testing |
| `user1@thinkmart.test` | `user` | Standard user flow |
| `user2@thinkmart.test` | `user` | Referral testing (referred by user1) |
| `partner@thinkmart.test` | `partner` | Partner commission testing |
| `vendor@thinkmart.test` | `vendor` | Vendor product testing |

### 2.5 Required Firestore Collections (Seed Data)

| Collection | Required Documents |
|------------|-------------------|
| `admin_settings` | 1 doc with `id: global` containing fees, limits |
| `tasks` | At least 3 active tasks (VIDEO, SURVEY, WEBSITE) |
| `products` | At least 2 approved products with stock |
| `game_config` | Spin wheel and lucky box prize configurations |

---

## 3. Complete End-to-End Test Workflow

### 3.1 Startup & Initialization Testing

| Step | Action | Expected Result | DB Check |
|------|--------|-----------------|----------|
| 3.1.1 | Open `http://localhost:3000` | Landing page loads | - |
| 3.1.2 | Check console for errors | No Firebase/React errors | - |
| 3.1.3 | Click "Login" | Redirect to `/auth/login` | - |
| 3.1.4 | Click "Register" | Redirect to `/auth/register` | - |

### 3.2 User Registration Flow

| Step | Action | Expected Result | DB Check |
|------|--------|-----------------|----------|
| 3.2.1 | Fill registration form (no referral code) | Form accepts input | - |
| 3.2.2 | Submit registration | Success, redirect to dashboard | `users/{uid}` created |
| 3.2.3 | Check wallet creation | Wallet shows 0 Cash, 0 Coins | `wallets/{uid}` exists with `cashBalance: 0, coinBalance: 0` |
| 3.2.4 | Check profile | `ownReferralCode` generated | `users/{uid}.ownReferralCode` is 8-char alphanumeric |
| 3.2.5 | Check role | Role is `user` | `users/{uid}.role == 'user'` |

### 3.3 Registration with Referral Code

| Step | Action | Expected Result | DB Check |
|------|--------|-----------------|----------|
| 3.3.1 | Copy referral code from user1 | - | - |
| 3.3.2 | Register user2 with referral code | Success | `users/{user2}.referralCode == {user1's ownReferralCode}` |
| 3.3.3 | Check uplinePath | Array populated | `users/{user2}.uplinePath` contains user1's UID |
| 3.3.4 | Check referredBy | Points to user1 | `users/{user2}.referredBy == {user1.uid}` |

### 3.4 Task Completion Flow

| Step | Action | Expected Result | DB Check |
|------|--------|-----------------|----------|
| 3.4.1 | Navigate to `/dashboard/user/tasks` | Task list loads | - |
| 3.4.2 | Click a VIDEO task | Task detail opens | - |
| 3.4.3 | Click "Start Task" | `startTask` Cloud Function called | `task_sessions/{id}` created with `startedAt` |
| 3.4.4 | Wait required duration | Timer completes | - |
| 3.4.5 | Click "Claim Reward" | `rewardTask` called | `wallets/{uid}.coinBalance` increased |
| 3.4.6 | Try to complete same task again | Blocked (daily limit) | `task_completions/{id}` prevents duplicate |

### 3.5 Game Testing (Spin Wheel)

| Step | Action | Expected Result | DB Check |
|------|--------|-----------------|----------|
| 3.5.1 | Navigate to `/dashboard/user/spin` | Spin wheel loads | - |
| 3.5.2 | Click "Spin" | Animation plays, prize awarded | `game_limits/{uid}_spin_{date}.count++` |
| 3.5.3 | Spin 2 more times | Both succeed | Count = 3 |
| 3.5.4 | Try 4th spin | Blocked: "Daily limit reached (3/3)" | Count stays 3 |
| 3.5.5 | Verify wallet | Coins added | `wallets/{uid}.coinBalance` increased |

### 3.6 Game Testing (Lucky Box)

| Step | Action | Expected Result | DB Check |
|------|--------|-----------------|----------|
| 3.6.1 | Navigate to `/dashboard/user/lucky-box` | Lucky box loads | - |
| 3.6.2 | Open 3 boxes | All succeed | `game_limits/{uid}_luckybox_{date}.count == 3` |
| 3.6.3 | Try 4th open | Blocked | Error shown |

### 3.7 Coin to Cash Conversion

| Step | Action | Expected Result | DB Check |
|------|--------|-----------------|----------|
| 3.7.1 | Navigate to wallet | Shows coin balance | - |
| 3.7.2 | Convert 100,000 coins | ₹100 added to cashBalance | `coinBalance -= 100000`, `cashBalance += 100` |
| 3.7.3 | Transaction logged | Entry visible | `transactions/{id}` with `category: 'conversion'` |

### 3.8 Membership Purchase

| Step | Action | Expected Result | DB Check |
|------|--------|-----------------|----------|
| 3.8.1 | Navigate to `/dashboard/user/upgrade` | Upgrade page loads | - |
| 3.8.2 | Click "Purchase Membership" | Payment flow triggered | - |
| 3.8.3 | Complete payment | Success message | `users/{uid}.membershipActive == true` |
| 3.8.4 | Check membership date | Timestamp set | `users/{uid}.membershipDate` exists |
| 3.8.5 | Verify MLM unlocked | Team income section visible | - |

### 3.9 Shop & Order Flow

| Step | Action | Expected Result | DB Check |
|------|--------|-----------------|----------|
| 3.9.1 | Navigate to `/dashboard/user/shop` | Products load | - |
| 3.9.2 | Add product to cart | Cart updated | - |
| 3.9.3 | Checkout with 50% coins | Order created | `orders/{id}` with `coinsRedeemed > 0` |
| 3.9.4 | Check wallet deduction | Cash + Coins deducted | `wallets/{uid}` updated |
| 3.9.5 | View order history | Order appears | - |

### 3.10 KYC Submission

| Step | Action | Expected Result | DB Check |
|------|--------|-----------------|----------|
| 3.10.1 | Navigate to `/dashboard/user/kyc` | KYC form loads | - |
| 3.10.2 | Fill all fields | Form validates | - |
| 3.10.3 | Upload ID document | File uploaded | Storage file created |
| 3.10.4 | Submit | Success message | `users/{uid}.kycStatus == 'pending'` |
| 3.10.5 | Check kycData | All fields saved | `users/{uid}.kycData` populated |

### 3.11 Withdrawal Request

| Step | Action | Expected Result | DB Check |
|------|--------|-----------------|----------|
| 3.11.1 | Try withdraw without KYC | Blocked: "KYC verification required" | - |
| 3.11.2 | Admin approves KYC | Status changes | `users/{uid}.kycStatus == 'verified'` |
| 3.11.3 | Request ₹500 withdrawal | Success | `withdrawals/{id}` created with `status: 'pending'` |
| 3.11.4 | Check wallet | Balance deducted | `wallets/{uid}.cashBalance -= 500` |
| 3.11.5 | Immediately request another | Blocked: "Pending withdrawal exists" | - |

---

## 4. Feature Test Cases

### 4.1 Authentication

| Test ID | Test Name | Steps | Expected | Exploit Check |
|---------|-----------|-------|----------|---------------|
| AUTH-01 | Valid Email Login | Login with valid credentials | Success, redirect to dashboard | - |
| AUTH-02 | Invalid Password | Wrong password | Error message, no login | Attempt count not logged (potential brute force) |
| AUTH-03 | Non-existent Email | Email not registered | "User not found" error | - |
| AUTH-04 | Empty Fields | Submit with empty form | Validation error | - |
| AUTH-05 | SQL Injection in Email | `admin' OR '1'='1` | Rejected by Firebase Auth | - |
| AUTH-06 | Session Persistence | Login, close browser, reopen | Still logged in | - |
| AUTH-07 | Logout | Click logout | Session destroyed, redirect to login | - |

### 4.2 Tasks System

| Test ID | Test Name | Steps | Expected | DB Verification |
|---------|-----------|-------|----------|-----------------|
| TASK-01 | Start Video Task | Click start on VIDEO task | Session created | `task_sessions` entry |
| TASK-02 | Complete Before Duration | Try claim before timer | Blocked: "Task not complete" | - |
| TASK-03 | Complete After Duration | Wait, then claim | Coins awarded | `coinBalance` increased |
| TASK-04 | Daily Limit | Complete same task twice | Second attempt blocked | `task_completions` prevents |
| TASK-05 | Archived Task | Try to access archived task | Task not visible | `tasks/{id}.status != 'active'` |
| TASK-06 | Task Manipulation | Modify `startTime` in request | Server rejects (uses DB time) | - |
| TASK-07 | Concurrent Start | Start same task in 2 tabs | Only 1 session created | Idempotency check |

### 4.3 Games

| Test ID | Test Name | Steps | Expected | Rate Limit |
|---------|-----------|-------|----------|------------|
| GAME-01 | Spin Wheel Normal | Spin 1-3 times | Success | `count <= 3` |
| GAME-02 | Spin Wheel Limit | Spin 4th time | Blocked | `count == 3` at block |
| GAME-03 | Lucky Box Normal | Open 1-3 boxes | Success | `count <= 3` |
| GAME-04 | Lucky Box Limit | Open 4th box | Blocked | - |
| GAME-05 | Date Reset | Wait until next UTC day | Limits reset | New date key |
| GAME-06 | Timezone Exploit | Change device timezone | Server uses UTC | DB stores UTC date |
| GAME-07 | RNG Manipulation | Send custom prize value | Server determines prize | - |

### 4.4 Wallet & Transactions

| Test ID | Test Name | Steps | Expected | Validation |
|---------|-----------|-------|----------|------------|
| WALL-01 | View Balance | Open wallet page | Shows correct balances | Match `wallets/{uid}` |
| WALL-02 | Transaction History | View transactions | All entries visible | `transactions` query |
| WALL-03 | Coin Conversion | Convert coins | Cash increases | `coinBalance -= X`, `cashBalance += Y` |
| WALL-04 | Negative Conversion | Convert more than balance | Error: "Insufficient coins" | - |
| WALL-05 | Zero Conversion | Convert 0 coins | Error: "Invalid amount" | - |
| WALL-06 | Minimum Conversion | Convert less than ₹1 worth | Error: "Minimum ₹1" | - |
| WALL-07 | Race Condition | 2 concurrent conversions | Only 1 succeeds | Transaction lock |

### 4.5 Withdrawals

| Test ID | Test Name | Steps | Expected | Security Check |
|---------|-----------|-------|----------|----------------|
| WITH-01 | Valid Withdrawal | Request valid amount | Success | `withdraw_requests` created |
| WITH-02 | No KYC | Request without KYC | Error: "KYC required" | `kycStatus != 'verified'` |
| WITH-03 | Below Minimum | Request ₹50 (min ₹100) | Error: "Min ₹100" | - |
| WITH-04 | Above Maximum | Request ₹100000+ | Error: "Max exceeded" | - |
| WITH-05 | Insufficient Balance | Request more than balance | Error: "Insufficient" | - |
| WITH-06 | Pending Exists | Request while pending | Error: "Pending exists" | - |
| WITH-07 | Cooldown Active | Request within 24 days | Error: "Cooldown active" | Date check |
| WITH-08 | Monthly Limit | 3rd request in month | Error: "Max 2 per month" | Count check |
| WITH-09 | Risk Flags | New account, high amount | Risk flags set | `riskFlags` array populated |

### 4.6 MLM / Referrals

| Test ID | Test Name | Steps | Expected | Commission Check |
|---------|-----------|-------|----------|------------------|
| MLM-01 | Direct Referral | User2 registers with User1's code | Linked | `uplinePath` set |
| MLM-02 | 6-Level Income | User completes task | Upline gets income | Check 6 wallets |
| MLM-03 | Non-Member Blocked | User1 not premium | No team income | `membershipActive` check |
| MLM-04 | Member Gets Income | User1 is premium | Team income credited | `coinBalance` increased |
| MLM-05 | Invalid Code | Register with fake code | Error or ignored | Code validation |
| MLM-06 | Self-Referral | Use own code | Rejected | Backend validation |

### 4.7 Shop & Orders

| Test ID | Test Name | Steps | Expected | Financial Check |
|---------|-----------|-------|----------|-----------------|
| SHOP-01 | Browse Products | Open shop | Products load | - |
| SHOP-02 | Product Detail | Click product | Detail page opens | - |
| SHOP-03 | Add to Cart | Add product | Cart updated | - |
| SHOP-04 | Checkout Cash Only | Pay with cash | Order created | `cashPaid == total` |
| SHOP-05 | Checkout Mixed | Pay with cash + coins | Both deducted | `cashPaid + coinValue == total` |
| SHOP-06 | Checkout All Coins | Pay with all coins | Valid if enough | `coinsRedeemed` max |
| SHOP-07 | Insufficient Funds | Total > balance | Error shown | - |
| SHOP-08 | Out of Stock | Order OOS product | Error: "Out of stock" | `inStock` check |
| SHOP-09 | Order Status | Track order | Status updates visible | `statusHistory` array |

### 4.8 KYC Management

| Test ID | Test Name | Steps | Expected | Admin Action |
|---------|-----------|-------|----------|--------------|
| KYC-01 | Submit KYC | Fill and submit | Status: pending | `kycStatus: 'pending'` |
| KYC-02 | Invalid Data | Missing required fields | Form validation error | - |
| KYC-03 | Admin Approve | Admin approves | Status: verified | Audit log created |
| KYC-04 | Admin Reject | Admin rejects with reason | Status: rejected | `kycRejectionReason` set |
| KYC-05 | Resubmit After Reject | User submits again | Allowed | New submission |
| KYC-06 | Duplicate Submission | Submit while pending | Blocked | - |

### 4.9 Admin Functions

| Test ID | Test Name | Steps | Expected | Audit Trail |
|---------|-----------|-------|----------|-------------|
| ADM-01 | View Dashboard | Open `/admin` | Stats load | - |
| ADM-02 | User List | Open users page | Paginated list | - |
| ADM-03 | Ban User | Ban a user | User banned | `audit_logs` entry |
| ADM-04 | Unban User | Unban user | User unbanned | Audit entry |
| ADM-05 | Change Role | Set user to partner | Role updated | Audit entry |
| ADM-06 | Wallet Adjust | Add ₹100 | Balance updated | Ledger entry + audit |
| ADM-07 | Approve Withdrawal | Approve pending | Status: approved | Audit entry |
| ADM-08 | Reject Withdrawal | Reject with reason | Status: rejected | Refund + audit |
| ADM-09 | Approve KYC | Approve submission | Status: verified | Audit entry |
| ADM-10 | Verify Vendor | Verify vendor | Vendor verified | Audit entry |
| ADM-11 | Suspend Vendor | Suspend with reason | Vendor suspended | Audit entry |
| ADM-12 | Approve Product | Approve product | Product published | - |
| ADM-13 | Update Order Status | Confirm → Ship → Deliver | Status changes | `statusHistory` |
| ADM-14 | Cancel Order | Admin cancels | Refund triggered | Wallet credited |

### 4.10 Partner System

| Test ID | Test Name | Steps | Expected | Commission |
|---------|-----------|-------|----------|------------|
| PART-01 | Partner Dashboard | Login as partner | Stats load | - |
| PART-02 | City Users | View city users | Correct list | `city` filter |
| PART-03 | Order Commission | User in city orders | Partner gets 20% | `partner_commission_logs` |
| PART-04 | Withdrawal Commission | User in city withdraws | Partner gets share | Commission logged |
| PART-05 | Wrong City | User from other city | No commission | - |

### 4.11 Vendor System

| Test ID | Test Name | Steps | Expected | DB Check |
|---------|-----------|-------|----------|----------|
| VEND-01 | Vendor Dashboard | Login as vendor | Dashboard loads | - |
| VEND-02 | Add Product | Create product | Status: pending | `products/{id}` created |
| VEND-03 | Edit Own Product | Update product | Updated | `vendorId` match |
| VEND-04 | Edit Other's Product | Try to edit | Permission denied | Firestore rules |
| VEND-05 | Delete Product | Soft delete | Product archived | - |
| VEND-06 | View Orders | See orders for products | Correct orders | `vendorId` filter |

---

## 5. Security & Permission Testing

### 5.1 Firestore Rules Testing

| Test ID | Collection | Action | Expected | Rule |
|---------|------------|--------|----------|------|
| SEC-01 | `users` | Read own | ✅ Allowed | `request.auth.uid == userId` |
| SEC-02 | `users` | Read other | ❌ Blocked | Unless admin/upline |
| SEC-03 | `wallets` | Read own | ✅ Allowed | Auth check |
| SEC-04 | `wallets` | Write | ❌ Blocked | Server-only |
| SEC-05 | `transactions` | Read own | ✅ Allowed | `userId` match |
| SEC-06 | `transactions` | Write | ❌ Blocked | Server-only |
| SEC-07 | `withdrawals` | Create | ❌ Blocked | Server-only |
| SEC-08 | `audit_logs` | Read | ✅ Admin only | `isAdminOrSubAdmin()` |
| SEC-09 | `audit_logs` | Write | ❌ Blocked | Server-only |
| SEC-10 | `products` | Read | ✅ Public | Anyone can browse |
| SEC-11 | `products` | Write | ✅ Admin/Vendor | Role check |

### 5.2 Cloud Function Permission Testing

| Test ID | Function | As | Expected |
|---------|----------|-----|----------|
| PERM-01 | `getAdminStats` | User | Permission denied |
| PERM-02 | `getAdminStats` | Admin | Success |
| PERM-03 | `approveWithdrawal` | User | Permission denied |
| PERM-04 | `adjustWallet` | Sub-admin without permission | Permission denied |
| PERM-05 | `adjustWallet` | Admin | Success |
| PERM-06 | `banUser` | Non-admin | Permission denied |

### 5.3 Exploit Attempt Testing

| Test ID | Exploit | Method | Expected Prevention |
|---------|---------|--------|---------------------|
| EXP-01 | Task Reward Replay | Replay `rewardTask` call | Idempotency key blocks |
| EXP-02 | Balance Manipulation | Send false balance | Server reads from DB |
| EXP-03 | Spin Result Override | Send prize in request | Server determines prize |
| EXP-04 | Bypass KYC | Call withdraw directly | `kycStatus` check |
| EXP-05 | Cooldown Bypass | Modify date in request | Server uses DB timestamps |
| EXP-06 | Double Withdrawal | Concurrent requests | Transaction lock |
| EXP-07 | Negative Amount | Withdraw -₹1000 | `amount > 0` validation |
| EXP-08 | XSS in Name | `<script>alert(1)</script>` | Sanitized in display |
| EXP-09 | Admin Impersonation | Modify role in request | Role from DB, not request |

---

## 6. Error Handling & Stability Testing

### 6.1 Missing Record Handling

| Scenario | Action | Expected |
|----------|--------|----------|
| User deleted mid-action | Any operation | Graceful error: "User not found" |
| Wallet not created | Complete task | Auto-create wallet |
| Product deleted after cart | Checkout | Error: "Product unavailable" |
| Withdrawal deleted | Admin action | Error: "Record not found" |

### 6.2 Database Failure Simulation

| Scenario | Expected Behavior |
|----------|-------------------|
| Firestore unavailable | Retry with exponential backoff |
| Transaction conflict | Retry (Firestore default) |
| Timeout on write | Transaction rolled back |
| Partial write failure | Atomic rollback |

### 6.3 Timeout & Retry Handling

| Function | Timeout | Retry Policy |
|----------|---------|--------------|
| `rewardTask` | 60s | No retry (idempotent) |
| `requestWithdrawal` | 60s | No retry (uses idempotency key) |
| `createOrder` | 60s | No retry (transaction-protected) |

### 6.4 Crash Recovery Testing

| Scenario | Recovery |
|----------|----------|
| Page reload mid-task | Resume from `task_sessions` |
| Server restart | Stateless – no impact |
| Auth token expired | Auto-refresh or re-login |

---

## 7. Performance & Load Testing

| Test | Method | Target |
|------|--------|--------|
| Page Load Time | Lighthouse | < 3s FCP |
| API Response Time | Manual timing | < 500ms |
| Concurrent Users | Load test | 100 simultaneous users |
| Database Queries | Firestore dashboard | No unbounded queries |
| Function Cold Start | First call timing | < 2s |

---

## 8. Final QA Release Checklist

### 8.1 Pre-Deployment Checks

| Item | Status |
|------|--------|
| [ ] All environment variables set in production |
| [ ] Firebase Security Rules deployed |
| [ ] All indexes created (check `firestore.indexes.json`) |
| [ ] Cloud Functions deployed without errors |
| [ ] SSL certificate valid |
| [ ] Error monitoring configured (Sentry/Firebase Crashlytics) |

### 8.2 Core Feature Verification

| Feature | Test Result |
|---------|-------------|
| [ ] User registration (with/without referral) |
| [ ] Login / Logout |
| [ ] Task completion flow |
| [ ] Spin Wheel (3/day limit) |
| [ ] Lucky Box (3/day limit) |
| [ ] Coin to Cash conversion |
| [ ] Shop checkout (cash, coins, mixed) |
| [ ] Order tracking |
| [ ] KYC submission |
| [ ] Withdrawal request |
| [ ] MLM income distribution |
| [ ] Membership purchase |

### 8.3 Admin Feature Verification

| Feature | Test Result |
|---------|-------------|
| [ ] Dashboard stats loading |
| [ ] User list and search |
| [ ] User ban/unban |
| [ ] Role assignment |
| [ ] Wallet adjustment |
| [ ] KYC approval/rejection |
| [ ] Withdrawal approval/rejection |
| [ ] Order status management |
| [ ] Product moderation |
| [ ] Vendor verification |
| [ ] Audit log visibility |
| [ ] Analytics page |
| [ ] Commission logs |

### 8.4 Security Verification

| Check | Status |
|-------|--------|
| [ ] Firestore rules block unauthorized access |
| [ ] All sensitive functions have permission checks |
| [ ] Idempotency keys prevent replay attacks |
| [ ] Rate limits enforced |
| [ ] Audit logs for all admin actions |
| [ ] No sensitive data in client logs |

### 8.5 Database Consistency

| Check | Method |
|-------|--------|
| [ ] All users have wallets | Query count comparison |
| [ ] Wallet balance >= 0 | Range query |
| [ ] No orphaned transactions | `userId` exists check |
| [ ] No duplicate completions | Unique constraint on `userId + taskId + date` |

### 8.6 Final Sign-Off

| Role | Signature | Date |
|------|-----------|------|
| Developer | _______________ | ________ |
| QA Lead | _______________ | ________ |
| Project Manager | _______________ | ________ |

---

## Appendix A: Test Data Templates

### Sample User Registration Payload
```json
{
  "email": "testuser@example.com",
  "password": "SecurePass123!",
  "name": "Test User",
  "phone": "+919876543210",
  "city": "Mumbai",
  "state": "Maharashtra",
  "referralCode": "ABC12345"
}
```

### Sample Withdrawal Request
```json
{
  "amount": 500,
  "method": "bank_transfer",
  "details": {
    "accountNumber": "1234567890",
    "ifscCode": "SBIN0001234",
    "bankName": "State Bank of India"
  }
}
```

### Sample Order Payload
```json
{
  "items": [
    { "productId": "prod_123", "quantity": 2 }
  ],
  "useCoins": 50000,
  "shippingAddress": {
    "fullName": "Test User",
    "phone": "+919876543210",
    "addressLine1": "123 Test Street",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400001"
  }
}
```

---

## Appendix B: Known Issues & Limitations

| Issue | Severity | Workaround |
|-------|----------|------------|
| ESLint warnings in `components/shop` | Low | Fix `next/image` usage |
| `useEffect` dependency warnings | Low | Add exhaustive deps |
| No email verification | Medium | Implement Firebase email verification |
| No 2FA for admin | High | Implement before production |

---

## Appendix C: Test Automation Recommendations

| Area | Tool | Priority |
|------|------|----------|
| Unit Tests | Jest | High |
| Integration Tests | Firebase Emulator Suite | High |
| E2E Tests | Playwright/Cypress | Medium |
| API Tests | Postman/Newman | High |
| Security Scans | Firebase App Check | High |
| Load Testing | Artillery | Medium |

---

**Document End**
