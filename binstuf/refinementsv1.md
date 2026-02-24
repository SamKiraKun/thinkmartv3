# ThinkMart Marketplace Fixes & Feature Completion

## Vendor + User + Checkout + UI — Agent-Grade Implementation Prompt (Firebase/Firestore + Storage + Cloud Functions)

You are a **code-focused autonomous engineering agent** working inside an existing repository. Your job is to **fix specific broken flows** and **complete missing e-commerce features** without destabilizing production logic.

This spec is intentionally strict. Every requirement below must be implemented exactly, with **explicit validation**, **security**, **backward compatibility**, and **testable acceptance criteria**.

---

## 0) Non-Negotiable Execution Rules

### 0.1 Repository-first behavior

You must **scan the repo before coding** and treat the existing code as the source of truth:

* Identify existing Firestore collections, document shapes, query patterns, and Cloud Functions style (`onCall` vs `onRequest`).
* Identify existing UI routing approach (Next.js App Router vs Pages, React Router, etc.).
* Locate vendor/product/order/spin/lucky-box pages and their data access modules.

**Do not guess names** like `products` vs `shopProducts`—you must confirm from the repo.

### 0.2 Schema safety and backward compatibility

* **Do not rename, delete, or destructively reshape** existing Firestore collections/fields.
* You may add **optional** fields and new collections.
* Any new fields must be optional and default-safe so old UI does not break.

### 0.3 Security is server-enforced

* **UI hiding is not security.**
* Any sensitive writes (orders, wallet/earnings, lucky box rewards) must be validated by:

  * Firestore security rules **and/or**
  * Cloud Functions using Admin SDK
* If current architecture uses client-side Firestore reads, rules must allow only correct scoped access.

### 0.4 Output expectations (what you must deliver)

Your final implementation must include:

1. Concrete code changes (UI + backend + rules) that resolve each issue.
2. Explicit request/response shapes for new functions or endpoints.
3. Firestore rules changes + emulator tests.
4. A short “migration/backfill” plan if new optional fields are introduced.
5. Acceptance criteria checklist mapped to each requirement.

---

## 1) Goals and Success Conditions

### 1.1 Features that must work after completion

**Vendor**

* Create a product with **1–5 uploaded images** (no image URL field).
* Vendor product list displays all vendor-created products correctly.
* Vendor orders list displays orders for vendor products without permissions errors.

**User**

* “Lifetime earnings” shows **total withdrawn amount** (not coins).
* Daily Spin has a **guaranteed win within 3 spins** and displays reward odds clearly.
* Lucky Box opening works reliably (no 500s) and text says **daily** not weekly.
* Full checkout flow exists: **Cart → Address → Review → Place order**, and “My Orders” UI is improved.

**UI / Product Experience**

* Product images show as a **carousel** in listings + product details.
* Product detail page exists with essentials + related items.
* Text contrast is consistently readable (no disappearing text).

---

## 2) Repo Discovery Tasks (Must Do First)

Before implementing, locate and document (as comments in PR or as a short `IMPLEMENTATION_NOTES.md`):

* Firestore collections used for:

  * products
  * orders
  * withdrawals (or earnings)
  * spin state
  * lucky box state
  * addresses (if exists)
  * cart (if exists)
* How vendor identity is stored:

  * `vendorId` vs `ownerId` vs `vendorUid`
* How auth is done:

  * Firebase Auth UID
  * custom claims (vendor role)
  * user document role field
* Where Firestore rules live and whether emulator tests exist.

**Important:** the fixes below must align with the actual schema you discover.

---

## 3) Vendor Pages Requirements

### 3.1 Product creation: Image URL → Image Upload (Up to 5 images)

#### Current behavior

Vendor product creation asks for a single **Product Image URL**.

#### Required behavior

Replace URL input with **multi-file upload (max 5 images)**.

#### UI requirements (vendor add-product page)

* Replace “Product Image URL” input with:

  * Upload button
  * Preview thumbnails for selected images
  * Remove image control per thumbnail
  * Hard limit: 5 images
* Validation rules:

  * Allowed types: `image/jpeg`, `image/png`, `image/webp`
  * Max size per file: **2 MB** (enforce in UI before upload)
  * At least **1 image** required to create product
* UX requirements:

  * Show upload progress per image
  * Disable “Create Product” until all uploads complete successfully
  * On failure: show per-file error and allow retry/remove

#### Backend requirements (Storage + Firestore)

Use Firebase Storage for image files. Store resulting URLs in product documents.

**Storage path convention (must be deterministic):**

* `products/{productId}/{uuid}.{ext}`

  * ensures per-product grouping
  * avoids filename collisions
  * supports multiple images cleanly

**Firestore product document requirements**

* Add a new optional field:

  ```ts
  images?: string[]  // length 1..5
  ```
* Backward compatibility:

  * If product already has `image` (single URL), do not remove it.
  * Rendering logic must prefer `images` if present, otherwise fallback to `image`.

#### Product UI updates (listings + product view)

* Product card/listing:

  * show first image as default
  * if multiple images exist, show carousel/slider controls (or auto-swipe optional)
* Product detail page:

  * show full carousel with thumbnails or dots
  * must support both `images[]` and legacy `image`

#### Technical implementation constraint (carousel)

Use one of these strategies (choose based on repo dependencies):

1. If repo already includes a carousel library, reuse it.
2. If not, implement a **minimal carousel** using:

   * CSS scroll-snap
   * left/right controls
   * dot indicators
     This avoids adding heavy dependencies.

#### Where to implement

Vendor page referenced:

* `http://localhost:3000/dashboard/vendor/products`

You must locate the actual route file(s) and update them.

---

### 3.2 Vendor products not showing (Fix query/filter mismatch)

#### Symptom

Vendor sees “No products yet” despite having added products. Main dashboard shows correct count.

#### Required debugging steps (must follow)

1. Inspect a product document created by vendor flow:

   * confirm which field stores vendor identity (`vendorId`, `ownerId`, `vendorUid`, etc.)
2. Locate vendor products query:

   * ensure it filters by the correct field and uses the authenticated vendor UID/ID correctly
3. Fix the query logic:

   * exact field name match
   * correct comparison value (UID vs vendorId)
4. Add logging (dev-only):

   * log vendor identity used in query
   * log query results count
5. Ensure pagination:

   * do not fetch “all products” into memory
   * default page size: 20

#### Acceptance criteria

* Vendor product list displays vendor-created products immediately after creation.
* Empty state appears only when there are truly zero matching products.

---

### 3.3 Vendor orders not showing + permissions error

#### Symptom

Vendor orders page is empty and console shows:

* `FirebaseError: Missing or insufficient permissions.`

#### Required behavior

Vendor can read **only orders that contain vendor’s products**, and cannot read others.

#### Data model requirement

Orders must contain a vendor identifier used for security and querying. Choose one:

* `vendorUid` (recommended, matches Firebase Auth UID)
* `vendorId` (only if the app uses a separate vendor identifier consistently)

If missing, add an optional field to orders going forward:

```ts
vendorUid?: string
```

Do not break existing orders; handle missing field gracefully in UI.

#### Rules + query strategies (choose one based on repo pattern)

**Strategy A (preferred if orders are vendor-specific already):**

* Orders stored under vendor path:

  * `vendors/{vendorUid}/orders/{orderId}`
* Vendor can read their subtree easily via rules.

**Strategy B (if orders are global collection):**

* Orders stored in top-level `orders`
* Query must include:

  * `where('vendorUid', '==', request.auth.uid)`
* Firestore rules must allow vendor reads only when vendorUid matches.

You must implement the strategy that matches the repo’s existing data layout, with minimal disruption.

#### Security rules requirement

* Vendor can read:

  * their products
  * their orders only
* Vendor cannot read:

  * other vendor orders
  * unrelated user PII beyond what order requires
* Vendor write permissions:

  * must not allow vendor to change payment status
  * status transitions must be validated (see checkout section)

#### Acceptance criteria

* Vendor orders load without Firestore permission errors.
* Vendor cannot read orders belonging to another vendor (must be proven by emulator test).

---

## 4) User Pages Requirements

### 4.1 “Lifetime earnings” calculation is wrong

#### Current behavior

Shows coin earnings.

#### Required behavior

Show total withdrawn amount = sum of withdrawals where:

* `userId == currentUserId`
* `status == 'completed'` (or repo equivalent finalized state)

#### Performance constraint

Do not scan unlimited history on every dashboard load.

Implement one of the following (choose based on existing data):

1. If withdrawals are small and already paginated, compute by querying completed withdrawals and summing.
2. If withdrawals could be large:

   * maintain an aggregate field:

     * `users/{uid}.lifetimeWithdrawn`
   * update it on withdrawal completion (Cloud Function trigger)
   * fallback to query+sum only if field missing.

#### Acceptance criteria

* Lifetime earnings equals the total of completed withdrawals shown in withdrawal history.
* Pending/failed withdrawals must not be included.

---

### 4.2 Daily Spin improvements: pity system + odds UI + design upgrade

#### Required game rule (must implement exactly)

User must receive **at least 1 guaranteed reward within 3 spins**.

* Track state per user:

  * `spinsSinceWin` (0..2)
  * last spin date / reset rules (daily reset if daily spins exist)
* On spin:

  * if `spinsSinceWin >= 2`, force a win outcome
  * else follow normal weighted odds

#### Required transparency UI

Spin page must show:

* reward list
* probability/odds per reward
* daily limit rules (if any)

#### Design requirement

Current wheel looks childish. Improve:

* typography
* spacing
* colors
* button styles
* consistent card layout

Constraint: Do not introduce large UI libraries unless repo already uses them.

#### Backend requirement

Spin outcomes must not be client-trust-based.

* Either compute outcome in Cloud Function (recommended)
* Or if computed client-side, server must validate claims before applying rewards (strongly recommended to move to server if rewards affect balances)

#### Acceptance criteria

* In a test simulation, user receives at least one win in any sequence of 3 spins.
* Odds shown match actual backend weights.

---

### 4.3 Lucky Box: fix 500 error + daily text

#### Current error

`openLuckyBox` Cloud Function returns 500.

#### Required backend fix

* Add strict validation:

  * user must be authenticated
  * user must be eligible to open box (daily limit)
  * box state exists and is consistent
* Wrap logic in try/catch and return structured errors:

  * Use `HttpsError` (if callable) or JSON error with proper status codes (if HTTP)
* Add structured logging:

  * function name, uid, eligibility status, reward selection path, exception stack

#### Required UI fix

* Update copy: “weekly” → “daily”
* Improve error messaging:

  * show friendly message for known errors (not eligible, already opened today, etc.)

#### Acceptance criteria

* No 500s for normal use cases.
* Known invalid states return clear error messages and do not crash.

---

### 4.4 Purchasing flow is incomplete: implement full checkout

#### Current behavior

Order is marked successful without a real flow.

#### Required checkout flow (must implement as multi-step)

1. **Cart**

   * add/remove items
   * quantity controls (if supported)
   * persisted state:

     * minimum: local storage
     * recommended: Firestore `carts/{uid}` if repo supports user docs
2. **Address**

   * Add new address
   * Select existing address
   * Validate required fields (name, phone, line1, city, state, pincode)
3. **Review**

   * item summary
   * pricing breakdown
   * selected address
4. **Place Order**

   * create order document with:

     * `status: 'placed'`
     * items snapshot (do not rely on product docs changing)
     * vendor references (per item and/or per order)
   * do **not** mark as delivered/completed automatically

#### Order model requirements (minimum fields; adapt to repo)

Each order must include:

```ts
userUid: string
items: Array<{
  productId: string
  title: string
  price: number
  quantity: number
  image?: string
  vendorUid?: string
}>
status: 'placed' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
createdAt: Timestamp
address: { ...snapshot... }
totalAmount: number
```

If vendor orders page expects one order per vendor, you may need:

* either split order into vendor-specific sub-orders, OR
* store vendorUid at order level when cart contains only one vendor
  You must implement the approach that matches the existing marketplace assumption:
* if app currently supports multi-vendor cart, split into separate orders per vendor at place-order time.

#### Security requirements

* Users can read only their own orders.
* Users cannot change payment fields or mark delivered.
* Vendors can read only vendor-related orders.

#### UI improvements required

* Improve “User → My Orders” page:

  * clearer status pill
  * order detail view (click order)
  * empty state and loading state
  * pagination (page size 10–20)

#### Acceptance criteria

* User can add to cart, add/select address, review, place order.
* Orders appear in user My Orders and vendor orders (where applicable).
* No order auto-completes incorrectly.

---

## 5) Overall UI / Product Experience

### 5.1 Color/contrast issues

#### Problem

Text disappears on white backgrounds due to poor contrast.

#### Required fix

* Identify all affected components/pages and correct tokens/styles.
* Enforce accessible contrast:

  * body text must be clearly readable on white surfaces
* If Tailwind exists:

  * standardize to `text-gray-900` / `text-gray-700` on light backgrounds
* If CSS variables/theme exists:

  * fix at token level so changes propagate.

Acceptance:

* No page shows invisible text on default theme.

---

### 5.2 Product detail page required

#### Required route

Implement a dedicated product details page:

* `/product/:productId` or Next.js equivalent

#### Required content

* Image carousel (multi-image support + legacy fallback)
* title, price, description
* vendor info (name/store, rating if exists)
* add to cart button
* related/recommended products:

  * query by category/tags or same vendor
  * show 4–8 items max
  * must be paginated or limited (no full scans)

#### Acceptance criteria

* Every product card links to a functioning product detail page.
* Product detail page loads correctly for both new (images[]) and old (image) products.

---

## 6) Implementation Strategy and Technical Standards

### 6.1 Mandatory engineering patterns

* Centralize Firestore queries into a small number of modules (avoid copy/paste queries in components).
* Validate inputs both:

  * client-side (for UX)
  * server-side (for security)
* For any stateful “daily” actions (spin, lucky box):

  * enforce daily limits server-side using timestamps and date boundaries.

### 6.2 Transactions and idempotency (for rewards/orders)

* If rewards modify balances or entitlement:

  * use Firestore transactions to prevent double-grants
  * store “openedAt/spunAt” markers per day
* For checkout Place Order:

  * use transaction to:

    * create order
    * clear cart
    * ensure consistency if user double-clicks

### 6.3 Error handling requirements

* All async operations must return:

  * user-friendly message
  * developer log details (console / Cloud logging)
* No silent failures.

---

## 7) Testing Requirements (Must Implement)

### 7.1 Firestore rules emulator tests

Add tests proving:

* Vendor cannot read other vendors’ orders/products.
* User cannot read other users’ orders.
* Vendor can read only their vendor-matching orders.

### 7.2 Unit/integration tests (minimum set)

* Spin pity logic: simulate sequences and assert guaranteed reward within 3 spins.
* Lucky box function: returns correct error for ineligible user, does not 500.
* Checkout: order creation produces correct document shape and status.

If repo has no test framework, add minimal emulator test harness and document commands.

---

## 8) Delivery Format (How You Must Respond / What Code You Must Produce)

When you implement, you must produce:

1. A short **“Repo Findings”** summary (paths + what exists).
2. A **file-by-file change plan** listing exactly which modules will be edited/added.
3. Concrete implementation:

   * vendor product upload + images[] support
   * vendor products query fix
   * vendor orders permission + query fix
   * lifetime earnings corrected
   * spin pity + odds UI + design improvements
   * lucky box function fix + daily text fix
   * complete checkout flow + improved My Orders
   * product detail page
   * contrast fixes
4. Tests + instructions to run locally (emulator, dev server).

---

## Start Here (Mandatory First Step)

1. Locate vendor products page at or near:
   `http://localhost:3000/dashboard/vendor/products`
   Identify the actual route file and product creation component.
2. Identify product schema and vendor identity field.
3. Fix vendor product list query (visibility bug).
4. Implement image upload + images[] field + carousel rendering.
5. Fix vendor orders access (rules + query or server function approach).
6. Then proceed to user earnings, spin, lucky box, checkout, product detail, and UI polish.


IMPORTANT NOTE:

DONT RUN "npm run build" YOURSELF, ALWAYS ASK ME TO RUN IT MANUALLY AFTER THE UPDATES