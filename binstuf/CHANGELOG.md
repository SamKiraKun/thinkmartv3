# ThinkMart Changelog

All notable changes to this project are documented here. This changelog follows semantic versioning.

---

## [v1.6.0] - 2026-01-17 (Production Fixes)

### 🐛 Bug Fixes

#### Authentication System Overhaul
- **Fixed**: Login redirect loop on Firebase Hosting production environment
- **Root Cause**: Cookie-based middleware authentication doesn't work with Firebase Cloud Functions
- **Solution**: Implemented client-side auth protection using `useAuth` hook

#### Files Modified
| File | Change |
|------|--------|
| `middleware.ts` | Removed cookie-based auth checks, simplified to pass-through |
| `app/auth/login/page.tsx` | Removed cookie setting logic, direct redirect with `window.location.href` |
| `app/dashboard/layout.tsx` | Added `useAuth()` hook with loading state and redirect logic |

#### Technical Details
```typescript
// Before (broken on production)
document.cookie = `userRole=${role}; path=/; max-age=86400; SameSite=Lax; Secure`;
router.push(`/dashboard/${role}`);

// After (working)
window.location.href = `/dashboard/${role}`;
// Auth check moved to dashboard layout using useAuth hook
```

### 🛠️ Other Fixes
- **Fixed**: Cart drawer state management - exposed `isOpen` and `setIsOpen` in `CartContext`
- **Fixed**: Type error in Product Detail Page - corrected `addItem()` function signature
- **Fixed**: Missing `role` variable declaration in login handler

---

## [v1.5.0] - 2026-01-09 (Firebase Hosting Deployment)

### 🚀 New Features

#### Firebase Hosting Configuration
- Added Next.js Web Frameworks support for Firebase Hosting
- Configured SSR deployment via Cloud Functions (2nd Gen)

#### Files Added/Modified
| File | Change |
|------|--------|
| `firebase.json` | Added `hosting` section with `frameworksBackend` |
| `deployment.md` | Created comprehensive deployment guide |

#### Configuration Added
```json
{
  "hosting": {
    "source": ".",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "frameworksBackend": {
      "region": "us-central1"
    }
  }
}
```

### 📚 Documentation
- Created `deployment.md` with step-by-step Firebase Hosting instructions
- Documented required environment variables for production

---

## [v1.4.0] - 2026-01-08 (Production Shop Enhancements)

### 🚀 New Features

#### Phase 14A: Strict Inventory Management
- **Stock Decrement**: Orders now atomically decrement product stock
- **Stock Restoration**: Cancelled orders automatically restore stock
- **Overselling Prevention**: Transaction-based validation prevents negative stock

##### Files Modified
| File | Change |
|------|--------|
| `functions/src/orders/createOrderMultiItem.ts` | Added stock validation and decrement logic |
| `functions/src/orders/cancelOrder.ts` | Added stock restoration on cancellation |

##### Code Changes
```typescript
// createOrderMultiItem.ts - Stock validation
const currentStock = product.stock ?? 0;
if (currentStock < item.quantity) {
  throw new functions.https.HttpsError(
    'failed-precondition',
    `Insufficient stock for ${product.name}. Available: ${currentStock}`
  );
}

// Decrement stock atomically
transaction.update(db.doc(`products/${item.productId}`), {
  stock: admin.firestore.FieldValue.increment(-item.quantity),
  inStock: currentStock - item.quantity > 0
});
```

#### Phase 14B: Product Detail Page (PDP)
- Created rich product detail page at `/dashboard/user/shop/[id]`
- Large image display with hover zoom effect
- Stock status indicators (In Stock, Low Stock, Out of Stock)
- Buy Now button for direct purchase
- Add to Cart button with cart drawer integration
- Vendor information display
- Delivery estimate display
- Product badges (Popular, New, Bestseller, Coin-Only)

##### Files Added
| File | Description |
|------|-------------|
| `app/dashboard/user/shop/[id]/page.tsx` | Product detail page component |

#### Phase 14C: Advanced Discovery
- Enhanced shop filters in sidebar
- Price range filters (min/max cash price)
- Coin price range filters (min/max coins)
- Category filtering with dynamic categories
- "In Stock Only" toggle
- Sort options (Newest, Price Low-High, Price High-Low)
- Responsive filter drawer for mobile

##### Files Added/Modified
| File | Change |
|------|--------|
| `components/shop/ShopFilters.tsx` | New filter component |
| `app/dashboard/user/shop/page.tsx` | Integrated filters, enhanced product grid |

---

## [v1.3.0] - 2026-01-06 (Advanced Shop & Orders System)

### 🚀 New Features

#### Phase 13A: Cart & Checkout System

##### Shopping Cart
- Global cart state with React Context
- LocalStorage persistence across sessions
- Add/remove items with quantity controls
- Slide-out cart drawer from any page
- Real-time totals (cash subtotal, coin total)

##### Files Added
| File | Description |
|------|-------------|
| `contexts/CartContext.tsx` | Global cart state management |
| `components/shop/CartDrawer.tsx` | Slide-out cart UI |

##### CartContext Interface
```typescript
interface CartContextType {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  coinTotal: number;
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  isInCart: (productId: string) => boolean;
  getItemQuantity: (productId: string) => number;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}
```

##### Multi-Item Checkout
- Full checkout page with order summary
- Shipping address form
- Payment method selector:
  - Full Cash payment
  - Full Coins payment
  - Split payment with slider control
- Order confirmation with success modal

##### Files Added
| File | Description |
|------|-------------|
| `app/dashboard/user/checkout/page.tsx` | Complete checkout flow |
| `components/checkout/PaymentSelector.tsx` | Payment method UI |
| `components/checkout/AddressForm.tsx` | Shipping address input |

##### Backend Updates
| File | Change |
|------|--------|
| `functions/src/orders/createOrderMultiItem.ts` | Support for multi-item orders |

#### Phase 13B: Order Lifecycle Management

##### Enhanced Order Type
```typescript
interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  subtotal: number;
  cashPaid: number;
  coinsRedeemed: number;
  coinValue: number;
  shippingAddress?: Address;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  statusHistory: StatusHistoryEntry[];
  city?: string;
  refundReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

##### User Order Pages
- Order list with status tabs (All, Pending, Completed, Cancelled)
- Order detail page with:
  - Full order timeline
  - Item list with images
  - Payment breakdown
  - Cancel button for pending orders

##### Files Added
| File | Description |
|------|-------------|
| `app/dashboard/user/orders/page.tsx` | Order history list |
| `app/dashboard/user/orders/[id]/page.tsx` | Order detail view |

##### Cancel & Refund System
- Users can cancel pending orders
- Admins can cancel any non-delivered order
- Automatic refund of:
  - Cash → cashBalance
  - Coins → coinBalance
- Refund transaction logging

##### Files Added
| File | Description |
|------|-------------|
| `functions/src/orders/cancelOrder.ts` | Cancel order Cloud Function |

#### Phase 13C: Admin Order Controls

##### Admin Order Dashboard
- Filter by status (All, Pending, Confirmed, Shipped, Delivered, Cancelled)
- Filter by city dropdown
- Date range picker
- Order detail drawer with:
  - Customer information
  - Order items with images
  - Payment breakdown (cash vs coins)
  - Status history timeline
  - Status change dropdown
  - Cancel with reason input

##### Files Added/Modified
| File | Change |
|------|--------|
| `functions/src/orders/updateOrderStatus.ts` | Admin status update function |
| `app/dashboard/admin/orders/page.tsx` | Enhanced admin orders UI |
| `app/dashboard/admin/products/page.tsx` | Added stock management column |

---

## [v1.2.0] - 2026-01-04 (Partner & KYC Systems)

### 🚀 New Features

#### Phase 12: Partner Dashboard Enhancement

##### Data Model Updates
```typescript
// Added to UserProfile
interface PartnerConfig {
  assignedCity: string;
  commissionPercentage: number;
  isActive: boolean;
}
```

##### New Collections
| Collection | Purpose |
|------------|---------|
| `partner_wallets` | Partner earnings balance |
| `partner_commission_logs` | Commission transaction history |

##### Backend Functions
| Function | Description |
|----------|-------------|
| `getPartnerDashboardStats` | Fetch partner KPIs and analytics |
| `getCityUsers` | Get users in partner's assigned city |

##### Partner Dashboard Features
- KPI cards (Total Commissions, Active Users, Orders, Pending Payouts)
- City users table (read-only view)
- Commission history with source breakdown
- Analytics charts (earnings over time, user growth)

##### Admin Partner Management
- Assign cities to partners
- Set commission percentages
- Toggle partner active status
- Partner list with filters

##### Files Added
| File | Description |
|------|-------------|
| `app/dashboard/partner/page.tsx` | Partner dashboard home |
| `app/dashboard/partner/earnings/page.tsx` | Commission history |
| `app/dashboard/partner/users/page.tsx` | City users view |
| `app/dashboard/admin/partners/manage/page.tsx` | Admin partner config |
| `functions/src/partners/getPartnerDashboardStats.ts` | Stats function |
| `functions/src/partners/getCityUsers.ts` | City users function |

#### Phase 11: KYC Verification System

##### User KYC Submission
- Document upload (ID proof, address proof)
- Selfie capture
- Form validation
- Submission status tracking

##### Admin KYC Review
- Pending KYC requests list
- Document preview
- Approve/Reject with reason
- Status filters

##### KYC Fields Added to UserProfile
```typescript
interface KYCData {
  status: 'not_submitted' | 'pending' | 'approved' | 'rejected';
  documentType?: string;
  documentNumber?: string;
  documentUrl?: string;
  addressProofUrl?: string;
  selfieUrl?: string;
  submittedAt?: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  rejectionReason?: string;
}
```

##### Files Added
| File | Description |
|------|-------------|
| `app/dashboard/user/kyc/page.tsx` | KYC submission form |
| `app/dashboard/admin/kyc/page.tsx` | Admin KYC review |

#### Phase 10: Production Withdrawal System

##### Security Checks Implemented
| Check | Requirement |
|-------|-------------|
| KYC Verification | `kycStatus === 'approved'` |
| Cooldown Period | 24 days between withdrawals |
| Monthly Limit | Max 2 withdrawals per month |
| Minimum Amount | ₹500 minimum |
| Maximum Amount | Configurable per user |
| Duplicate Prevention | No pending withdrawal exists |

##### Backend Validation
```typescript
// functions/src/withdrawals/requestWithdrawal.ts
// Validation checks before creating withdrawal request
if (user.kycStatus !== 'approved') {
  throw new HttpsError('failed-precondition', 'KYC verification required');
}
if (daysSinceLastWithdrawal < 24) {
  throw new HttpsError('failed-precondition', `Wait ${24 - daysSinceLastWithdrawal} more days`);
}
if (withdrawalsThisMonth >= 2) {
  throw new HttpsError('failed-precondition', 'Monthly limit reached');
}
```

##### Enhanced Admin Withdrawal UI
- Withdrawal detail drawer with:
  - User profile information
  - Wallet snapshot (current balance, recent transactions)
  - Risk indicators (new account, rapid withdrawals, etc.)
  - Approve/Reject with notes
- Filters: City, Amount range, Date range, Status
- Admin action logging

##### Files Modified
| File | Change |
|------|--------|
| `functions/src/withdrawals/requestWithdrawal.ts` | Added security checks |
| `functions/src/withdrawals/processWithdrawal.ts` | Enhanced admin processing |
| `app/dashboard/admin/withdrawals/page.tsx` | Complete UI overhaul |
| `app/dashboard/user/withdraw/page.tsx` | Validation feedback |

---

## [v1.1.0] - 2026-01-02 (Task & Referral Enhancements)

### 🚀 New Features

#### Phase 9: Task System Enhancements

##### New Task Types
| Type | Constant | Description |
|------|----------|-------------|
| Watch Video | `WATCH_VIDEO` | View sponsored video content |
| Daily Check-in | `DAILY_CHECKIN` | Daily login bonus |

##### Watch Video Feature
- Video player with completion tracking
- Minimum watch time validation
- Ad slots during video playback
- Reward on completion

##### Daily Check-in Logic
- Once per day limit (server-validated)
- Streak tracking
- Bonus for consecutive days

##### Admin Video Task Management
- Create video tasks with YouTube URL
- Set reward amount
- Set minimum watch duration
- Enable/disable tasks

##### Files Added
| File | Description |
|------|-------------|
| `types/task.ts` | Updated TaskType enum |
| `app/dashboard/user/tasks/video/[taskId]/page.tsx` | Video task runner |
| `app/dashboard/admin/tasks/create-video/page.tsx` | Video task creation |
| `functions/src/tasks/dailyCheckin.ts` | Check-in logic |

#### Phase 8: Referral System Enhancements

##### Two-Way Referral Rewards
- Referrer receives 500 coins on successful referral
- New user receives 500 coins welcome bonus
- Both rewards logged as transactions

##### Implementation
```typescript
// functions/src/triggers/user.ts - onUserCreate
// Award referrer
await walletRef.update({
  coinBalance: admin.firestore.FieldValue.increment(500)
});
await transactionsRef.add({
  type: 'credit',
  category: 'referral_bonus',
  amount: 500,
  description: `Referral bonus for inviting ${newUser.displayName}`
});

// Award new user
await newUserWalletRef.update({
  coinBalance: admin.firestore.FieldValue.increment(500)
});
await transactionsRef.add({
  type: 'credit',
  category: 'welcome_bonus',
  amount: 500,
  description: 'Welcome bonus for joining ThinkMart'
});
```

#### Interactive Referral Map Fix
- Added missing Firestore index for `uplinePath` queries
- Smart query logic differentiating direct vs indirect referrals
- Debug logging for troubleshooting

##### Files Modified
| File | Change |
|------|--------|
| `components/referral/TreeNode.tsx` | Query logic updates |
| `firestore.indexes.json` | Added uplinePath index |

---

## [v1.0.0] - 2025-12-28 (Initial Release)

### 🚀 Core Features

#### Phase 2: Earning Engine

##### Survey Tasks
- Question-based surveys with coin rewards
- Ad slot integration (top banner, interstitial)
- Answer tracking and validation
- 2-hour cooldown between task repeats

##### Spin Wheel Game
- Daily spin limit (3 per day)
- Random reward selection
- Visual spinning animation
- Backend reward validation

##### Lucky Box Game
- Daily opens limit (5 per day)
- Random reward tier system
- Animation on reveal
- Backend reward validation

##### Backend Task System
| Function | Description |
|----------|-------------|
| `startTask` | Initialize task session |
| `submitAnswer` | Track survey answers |
| `rewardTask` | Validate and award coins |

##### Files Added
| File | Description |
|------|-------------|
| `app/dashboard/user/tasks/page.tsx` | Task listing |
| `app/dashboard/user/tasks/[taskId]/page.tsx` | Survey runner |
| `app/dashboard/user/games/spin/page.tsx` | Spin wheel |
| `app/dashboard/user/games/lucky-box/page.tsx` | Lucky box |
| `components/tasks/SpinWheel.tsx` | Wheel component |
| `components/tasks/LuckyBox.tsx` | Box component |
| `functions/src/tasks/startTask.ts` | Start function |
| `functions/src/tasks/submitAnswer.ts` | Answer tracker |
| `functions/src/tasks/rewardTask.ts` | Reward function |

#### Phase 3: E-Commerce Store

##### Product Listing
- Grid view with product cards
- Category filtering
- Search functionality
- Stock status indicators

##### Purchase Flow
- Product modal with details
- Payment method selection (Cash/Coins)
- Order creation with wallet deduction
- Order confirmation

##### Mixed Payment Support
```typescript
// Payment calculation
const coinValue = coinsToUse / 1000; // 1000 coins = ₹1
const cashToPay = totalAmount - coinValue;
```

##### MLM Commission Distribution
- Up to 10 levels of upline
- Membership requirement check
- Configurable percentage per level

#### Phase 4: Admin Dashboard

##### User Management
- User list with search and filters
- Ban/Unban functionality
- Role changes (User → Partner → Admin)
- User detail drawer

##### Financial Analytics
- Total revenue tracking
- Coin liability calculation
- Active users count
- Order volume metrics

##### Withdrawal Processing
- Pending requests queue
- Approve/Reject workflow
- Transaction logging

##### Content Management
- Create/Edit/Delete tasks
- Create/Edit/Delete products
- Image upload support

#### Phase 5: Partner Dashboard

##### Dashboard Overview
- Commission summary
- User count in city
- Recent orders

##### Commission History
- Transaction list with filters
- Export functionality

##### Franchise Statistics
- City-based user breakdown
- Order volume by city

#### Phase 6: UI/UX Polish

##### Auth Page Redesign
- Split layout (brand sidebar + form)
- Gradient backgrounds
- Animated elements
- Responsive design

##### Files Modified
| File | Change |
|------|--------|
| `app/auth/login/page.tsx` | Complete redesign |
| `app/auth/register/page.tsx` | Complete redesign |
| `app/auth/layout.tsx` | Removed width restrictions |

---

## Technical Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| Styling | TailwindCSS, Lucide Icons |
| State | Zustand, React Context |
| Backend | Firebase Cloud Functions (Node.js) |
| Database | Firestore |
| Storage | Firebase Storage |
| Auth | Firebase Authentication |
| Hosting | Firebase Hosting |

---

## Contributors

- Development & Architecture: AI-Assisted Development
- Project Management: Sameer

---

*This changelog is automatically generated based on the project's task tracking system.*
