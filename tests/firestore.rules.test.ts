// File: tests/firestore.rules.test.ts
/**
 * Firestore Security Rules Tests
 * 
 * Tests the security rules to ensure proper access control.
 * Run with: npm run test:rules
 * 
 * Prerequisites:
 * - Firestore emulator available (handled automatically by test:rules script).
 */

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;
const hasFirestoreEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const rulesDescribe = hasFirestoreEmulator ? describe : describe.skip;

// Test user IDs
const ADMIN_UID = 'admin-user-123';
const SUBADMIN_UID = 'subadmin-user-456';
const VENDOR_UID = 'vendor-user-789';
const PARTNER_UID = 'partner-user-222';
const ORG_UID = 'org-user-333';
const USER_UID = 'regular-user-abc';
const OTHER_USER_UID = 'other-user-xyz';

async function seedBaseData() {
    if (!testEnv) return;

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();

        // Create users with different roles
        await setDoc(doc(db, 'users', ADMIN_UID), { role: 'admin', name: 'Admin' });
        await setDoc(doc(db, 'users', SUBADMIN_UID), { role: 'sub_admin', name: 'SubAdmin' });
        await setDoc(doc(db, 'users', VENDOR_UID), {
            role: 'vendor',
            name: 'Vendor',
            vendorConfig: { vendorId: VENDOR_UID }
        });
        await setDoc(doc(db, 'users', PARTNER_UID), {
            role: 'partner',
            name: 'Partner',
            city: 'Karachi'
        });
        await setDoc(doc(db, 'users', ORG_UID), {
            role: 'organization',
            name: 'Organization',
            orgConfig: { orgName: 'Org One' }
        });
        await setDoc(doc(db, 'users', USER_UID), { role: 'user', name: 'User' });
        await setDoc(doc(db, 'users', OTHER_USER_UID), { role: 'user', name: 'Other User' });

        // Create wallets
        await setDoc(doc(db, 'wallets', USER_UID), { coinBalance: 1000, cashBalance: 100 });
        await setDoc(doc(db, 'wallets', OTHER_USER_UID), { coinBalance: 500, cashBalance: 50 });

        // Create a product
        await setDoc(doc(db, 'products', 'product-1'), {
            name: 'Test Product',
            price: 100,
            vendorId: VENDOR_UID,
            isDeleted: false
        });

        // Create an order
        await setDoc(doc(db, 'orders', 'order-1'), {
            userId: USER_UID,
            productId: 'product-1',
            vendorIds: [VENDOR_UID],
            status: 'delivered'
        });

        // Create a review
        await setDoc(doc(db, 'reviews', 'review-1'), {
            userId: USER_UID,
            productId: 'product-1',
            status: 'approved',
            rating: 5
        });

        // Create admin settings
        await setDoc(doc(db, 'admin_settings', 'config'), {
            maintenanceMode: false,
            withdrawalMin: 100
        });

        await setDoc(doc(db, 'public_settings', 'config'), {
            maintenanceMode: false,
            signupsEnabled: true
        });
    });
}

beforeAll(async () => {
    if (!hasFirestoreEmulator) {
        console.warn(
            'Skipping Firestore rules tests: FIRESTORE_EMULATOR_HOST is not set. Use `npm run test:rules`.'
        );
        return;
    }

    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
    testEnv = await initializeTestEnvironment({
        projectId: 'thinkmart-test',
        firestore: {
            rules: readFileSync('firestore.rules', 'utf8'),
            host,
            port: Number(port || 8080),
        },
    });
    await seedBaseData();
});

afterAll(async () => {
    if (testEnv) {
        await testEnv.cleanup();
    }
});

beforeEach(async () => {
    if (!testEnv) return;
    await testEnv.clearFirestore();
    await seedBaseData();
});

// ============================================================================
// USER COLLECTION TESTS
// ============================================================================

rulesDescribe('Users Collection', () => {
    test('authenticated user can read their own profile', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'users', USER_UID)));
    });

    test('authenticated user CANNOT read other user profiles', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(getDoc(doc(db, 'users', OTHER_USER_UID)));
    });

    test('admin can read any user profile', async () => {
        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'users', USER_UID)));
    });

    test('unauthenticated user CANNOT read profiles', async () => {
        const context = testEnv.unauthenticatedContext();
        const db = context.firestore();

        await assertFails(getDoc(doc(db, 'users', USER_UID)));
    });

    test('user CAN update safe profile fields on own doc', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertSucceeds(updateDoc(doc(db, 'users', USER_UID), { name: 'Updated Name', city: 'Lahore' }));
    });

    test('user CANNOT self-promote role to admin', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'users', USER_UID), { role: 'admin' }));
    });

    test('user CANNOT set privileged partner config on own profile', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'users', USER_UID), { partnerConfig: { assignedCity: 'Karachi' } }));
    });

    test('user CANNOT set isBanned on own profile', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'users', USER_UID), { isBanned: true }));
    });

    test('user CANNOT set orgConfig on own profile', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'users', USER_UID), { orgConfig: { orgName: 'Fake Org' } }));
    });

    test('user CANNOT set vendorConfig on own profile', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'users', USER_UID), { vendorConfig: { vendorId: USER_UID } }));
    });

    test('user CANNOT set adminPermissions on own profile', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'users', USER_UID), { adminPermissions: ['users.read'] }));
    });

    test('user CANNOT set permissions on own profile', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'users', USER_UID), { permissions: ['*'] }));
    });

    test('user CANNOT set kycStatus on own profile', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'users', USER_UID), { kycStatus: 'approved' }));
    });

    test('user CANNOT set kycVerifiedAt on own profile', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'users', USER_UID), { kycVerifiedAt: '2026-01-01T00:00:00.000Z' }));
    });

    test('user CANNOT set kycRejectionReason on own profile', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'users', USER_UID), { kycRejectionReason: 'forged-docs' }));
    });

    test('user CANNOT create own profile with admin role', async () => {
        const attackerUid = 'attacker-user-001';
        const context = testEnv.authenticatedContext(attackerUid);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'users', attackerUid), { role: 'admin', name: 'Evil User' }));
    });

    test('user CAN create own profile with default user role', async () => {
        const newUserUid = 'new-user-002';
        const context = testEnv.authenticatedContext(newUserUid);
        const db = context.firestore();

        await assertSucceeds(setDoc(doc(db, 'users', newUserUid), { role: 'user', name: 'Normal User' }));
    });

    test('user CAN create own vendor profile with self vendorConfig', async () => {
        const vendorUid = 'new-vendor-001';
        const context = testEnv.authenticatedContext(vendorUid);
        const db = context.firestore();

        await assertSucceeds(setDoc(doc(db, 'users', vendorUid), {
            role: 'vendor',
            name: 'New Vendor',
            vendorConfig: { vendorId: vendorUid, businessName: 'Shop One' }
        }));
    });

    test('user CAN create own organization profile with orgConfig', async () => {
        const orgUid = 'new-org-001';
        const context = testEnv.authenticatedContext(orgUid);
        const db = context.firestore();

        await assertSucceeds(setDoc(doc(db, 'users', orgUid), {
            role: 'organization',
            name: 'Org Owner',
            orgConfig: { orgName: 'Org One', orgType: 'school' }
        }));
    });

    test('user CANNOT create own profile with isBanned', async () => {
        const attackerUid = 'attacker-user-003';
        const context = testEnv.authenticatedContext(attackerUid);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'users', attackerUid), { role: 'user', isBanned: true, name: 'Blocked Attacker' }));
    });

    test('user CANNOT create own profile with adminPermissions', async () => {
        const attackerUid = 'attacker-user-004';
        const context = testEnv.authenticatedContext(attackerUid);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'users', attackerUid), { role: 'user', adminPermissions: ['users.write'], name: 'Privilege Attacker' }));
    });

    test('user CANNOT create own profile with orgConfig', async () => {
        const attackerUid = 'attacker-user-005';
        const context = testEnv.authenticatedContext(attackerUid);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'users', attackerUid), {
            role: 'user',
            name: 'Org Escalation Attacker',
            orgConfig: { orgName: 'Injected Org' }
        }));
    });

    test('user CANNOT create own profile with vendorConfig', async () => {
        const attackerUid = 'attacker-user-006';
        const context = testEnv.authenticatedContext(attackerUid);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'users', attackerUid), {
            role: 'user',
            name: 'Vendor Escalation Attacker',
            vendorConfig: { vendorId: attackerUid }
        }));
    });

    test('user CANNOT create vendor profile with mismatched vendorId', async () => {
        const attackerUid = 'attacker-user-008';
        const context = testEnv.authenticatedContext(attackerUid);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'users', attackerUid), {
            role: 'vendor',
            name: 'Mismatched Vendor',
            vendorConfig: { vendorId: OTHER_USER_UID }
        }));
    });

    test('user CANNOT create own profile with permissions', async () => {
        const attackerUid = 'attacker-user-007';
        const context = testEnv.authenticatedContext(attackerUid);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'users', attackerUid), {
            role: 'user',
            name: 'Permissions Escalation Attacker',
            permissions: ['*']
        }));
    });

    test('admin CAN update user privileged fields', async () => {
        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(updateDoc(doc(db, 'users', USER_UID), {
            role: 'partner',
            isBanned: true,
        }));
    });
});

// ============================================================================
// WALLET COLLECTION TESTS
// ============================================================================

rulesDescribe('Wallets Collection', () => {
    test('user can read their own wallet', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'wallets', USER_UID)));
    });

    test('user CANNOT read other wallets', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(getDoc(doc(db, 'wallets', OTHER_USER_UID)));
    });

    test('user CANNOT update their own wallet directly', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'wallets', USER_UID), { coinBalance: 9999999 }));
    });

    test('admin CANNOT update wallets directly (server-only)', async () => {
        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'wallets', USER_UID), { coinBalance: 9999999 }));
    });
});

// ============================================================================
// PRODUCTS COLLECTION TESTS
// ============================================================================

rulesDescribe('Products Collection', () => {
    test('anyone can read non-deleted products', async () => {
        const context = testEnv.unauthenticatedContext();
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'products', 'product-1')));
    });

    test('vendor can update their own product', async () => {
        const context = testEnv.authenticatedContext(VENDOR_UID);
        const db = context.firestore();

        await assertSucceeds(updateDoc(doc(db, 'products', 'product-1'), { price: 150 }));
    });

    test('vendor CANNOT update other vendors products', async () => {
        const context = testEnv.authenticatedContext('other-vendor');
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'products', 'product-1'), { price: 1 }));
    });

    test('regular user CANNOT update products', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'products', 'product-1'), { price: 1 }));
    });
});

// ============================================================================
// ADMIN SETTINGS TESTS (SEC-3)
// ============================================================================

rulesDescribe('Admin Settings Collection', () => {
    test('unauthenticated user CANNOT read admin settings', async () => {
        const context = testEnv.unauthenticatedContext();
        const db = context.firestore();

        await assertFails(getDoc(doc(db, 'admin_settings', 'config')));
    });

    test('sub_admin can read admin settings', async () => {
        const context = testEnv.authenticatedContext(SUBADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'admin_settings', 'config')));
    });

    test('regular user CANNOT read admin settings', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(getDoc(doc(db, 'admin_settings', 'config')));
    });

    test('full admin CAN update admin settings', async () => {
        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(updateDoc(doc(db, 'admin_settings', 'config'), { maintenanceMode: true }));
    });

    test('sub_admin CANNOT update admin settings', async () => {
        const context = testEnv.authenticatedContext(SUBADMIN_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'admin_settings', 'config'), { maintenanceMode: true }));
    });

    test('regular user CANNOT update admin settings', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'admin_settings', 'config'), { maintenanceMode: true }));
    });
});

rulesDescribe('Public Settings Collection', () => {
    test('anyone can read public settings', async () => {
        const context = testEnv.unauthenticatedContext();
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'public_settings', 'config')));
    });

    test('regular user CANNOT update public settings', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'public_settings', 'config'), { maintenanceMode: true }));
    });

    test('admin CAN update public settings', async () => {
        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(updateDoc(doc(db, 'public_settings', 'config'), { maintenanceMode: true }));
    });
});

// ============================================================================
// REVIEWS COLLECTION TESTS
// ============================================================================

rulesDescribe('Reviews Collection', () => {
    test('anyone can read approved reviews', async () => {
        const context = testEnv.unauthenticatedContext();
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'reviews', 'review-1')));
    });

    test('user CANNOT create review directly (must use Cloud Function)', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(addDoc(collection(db, 'reviews'), {
            userId: USER_UID,
            productId: 'product-1',
            rating: 5,
            content: 'Great product!',
            status: 'approved'
        }));
    });

    test('user can update their own review', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertSucceeds(updateDoc(doc(db, 'reviews', 'review-1'), { content: 'Updated review' }));
    });

    test('user CANNOT update other users reviews', async () => {
        const context = testEnv.authenticatedContext(OTHER_USER_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'reviews', 'review-1'), { content: 'Hacked!' }));
    });

    test('user can delete their own review', async () => {
        // Create a review to delete
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'reviews', 'review-to-delete'), {
                userId: USER_UID,
                productId: 'product-1',
                status: 'approved',
                rating: 4
            });
        });

        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertSucceeds(deleteDoc(doc(db, 'reviews', 'review-to-delete')));
    });

    test('admin can delete any review', async () => {
        // Create a review to delete
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'reviews', 'review-admin-delete'), {
                userId: OTHER_USER_UID,
                productId: 'product-1',
                status: 'approved',
                rating: 3
            });
        });

        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(deleteDoc(doc(db, 'reviews', 'review-admin-delete')));
    });
});

// ============================================================================
// REVIEW STATS TESTS
// ============================================================================

rulesDescribe('Review Stats Collection', () => {
    test('anyone can read review stats', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'review_stats', 'product-1'), {
                totalReviews: 10,
                averageRating: 4.5
            });
        });

        const context = testEnv.unauthenticatedContext();
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'review_stats', 'product-1')));
    });

    test('users CANNOT write to review stats (server-only)', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'review_stats', 'product-fake'), {
            totalReviews: 100,
            averageRating: 5.0
        }));
    });

    test('admin CANNOT write to review stats (server-only)', async () => {
        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'review_stats', 'product-fake'), {
            totalReviews: 100,
            averageRating: 5.0
        }));
    });
});

// ============================================================================
// ORDERS COLLECTION TESTS
// ============================================================================

rulesDescribe('Orders Collection', () => {
    test('user can read their own orders', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'orders', 'order-1')));
    });

    test('user CANNOT read other users orders', async () => {
        const context = testEnv.authenticatedContext(OTHER_USER_UID);
        const db = context.firestore();

        await assertFails(getDoc(doc(db, 'orders', 'order-1')));
    });

    test('user CANNOT update order status directly (server-only)', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'orders', 'order-1'), { status: 'cancelled' }));
    });
});

// ============================================================================
// ADMIN / SERVER-ONLY COLLECTION TESTS
// ============================================================================

rulesDescribe('Audit Logs Collection', () => {
    test('admin can read audit logs', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'audit_logs', 'log-1'), {
                actorId: ADMIN_UID,
                action: 'USER_ROLE_CHANGED',
            });
        });

        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'audit_logs', 'log-1')));
    });

    test('regular user CANNOT read audit logs', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'audit_logs', 'log-2'), {
                actorId: ADMIN_UID,
                action: 'WALLET_ADJUSTED',
            });
        });

        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(getDoc(doc(db, 'audit_logs', 'log-2')));
    });

    test('admin CANNOT write audit logs directly (server-only)', async () => {
        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'audit_logs', 'log-direct-write'), {
            actorId: ADMIN_UID,
            action: 'DIRECT_WRITE_ATTEMPT',
        }));
    });
});

rulesDescribe('Admin Permissions Collection', () => {
    test('admin can read admin permissions', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'admin_permissions', SUBADMIN_UID), {
                permissions: ['users.read'],
            });
        });

        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'admin_permissions', SUBADMIN_UID)));
    });

    test('sub_admin can read admin permissions', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'admin_permissions', SUBADMIN_UID), {
                permissions: ['users.read'],
            });
        });

        const context = testEnv.authenticatedContext(SUBADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'admin_permissions', SUBADMIN_UID)));
    });

    test('regular user CANNOT read admin permissions', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'admin_permissions', SUBADMIN_UID), {
                permissions: ['users.read'],
            });
        });

        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(getDoc(doc(db, 'admin_permissions', SUBADMIN_UID)));
    });

    test('admin CANNOT write admin permissions directly (server-only)', async () => {
        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'admin_permissions', USER_UID), {
            permissions: ['users.write'],
        }));
    });
});

rulesDescribe('Idempotency Keys Collection', () => {
    test('admin CANNOT read idempotency keys', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'idempotency_keys', 'idemp-1'), {
                status: 'complete',
            });
        });

        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertFails(getDoc(doc(db, 'idempotency_keys', 'idemp-1')));
    });

    test('admin CANNOT write idempotency keys', async () => {
        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'idempotency_keys', 'idemp-direct-write'), {
            status: 'pending',
        }));
    });
});

// ============================================================================
// ADDITIONAL SERVER-ONLY / ROLE-SCOPED COLLECTION TESTS
// ============================================================================

rulesDescribe('Partner Wallets Collection', () => {
    test('partner can read own partner wallet', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'partner_wallets', PARTNER_UID), {
                balance: 1200,
            });
        });

        const context = testEnv.authenticatedContext(PARTNER_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'partner_wallets', PARTNER_UID)));
    });

    test('admin can read partner wallet', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'partner_wallets', PARTNER_UID), {
                balance: 1200,
            });
        });

        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'partner_wallets', PARTNER_UID)));
    });

    test('regular user CANNOT read partner wallet', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'partner_wallets', PARTNER_UID), {
                balance: 1200,
            });
        });

        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(getDoc(doc(db, 'partner_wallets', PARTNER_UID)));
    });

    test('partner CANNOT write partner wallet', async () => {
        const context = testEnv.authenticatedContext(PARTNER_UID);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'partner_wallets', PARTNER_UID), { balance: 999999 }));
    });
});

rulesDescribe('Partner Commission Logs Collection', () => {
    test('partner can read own commission log', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'partner_commission_logs', 'log-1'), {
                partnerId: PARTNER_UID,
                amount: 50,
            });
        });

        const context = testEnv.authenticatedContext(PARTNER_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'partner_commission_logs', 'log-1')));
    });

    test('admin can read commission log', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'partner_commission_logs', 'log-2'), {
                partnerId: PARTNER_UID,
                amount: 80,
            });
        });

        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'partner_commission_logs', 'log-2')));
    });

    test('regular user CANNOT read commission log', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'partner_commission_logs', 'log-3'), {
                partnerId: PARTNER_UID,
                amount: 80,
            });
        });

        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(getDoc(doc(db, 'partner_commission_logs', 'log-3')));
    });

    test('admin CANNOT write commission log directly', async () => {
        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'partner_commission_logs', 'log-direct-write'), {
            partnerId: PARTNER_UID,
            amount: 100,
        }));
    });
});

rulesDescribe('Withdrawal Logs Collection', () => {
    test('admin can read withdrawal log', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'withdrawal_logs', 'wlog-1'), {
                action: 'WITHDRAWAL_APPROVED',
            });
        });

        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'withdrawal_logs', 'wlog-1')));
    });

    test('sub_admin can read withdrawal log', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'withdrawal_logs', 'wlog-2'), {
                action: 'WITHDRAWAL_REJECTED',
            });
        });

        const context = testEnv.authenticatedContext(SUBADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'withdrawal_logs', 'wlog-2')));
    });

    test('regular user CANNOT read withdrawal log', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'withdrawal_logs', 'wlog-3'), {
                action: 'WITHDRAWAL_REJECTED',
            });
        });

        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(getDoc(doc(db, 'withdrawal_logs', 'wlog-3')));
    });
});

rulesDescribe('Organization Commission Logs Collection', () => {
    test('organization can read own commission log', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'org_commission_logs', 'olog-1'), {
                orgId: ORG_UID,
                amount: 200,
            });
        });

        const context = testEnv.authenticatedContext(ORG_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'org_commission_logs', 'olog-1')));
    });

    test('admin can read organization commission log', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'org_commission_logs', 'olog-2'), {
                orgId: ORG_UID,
                amount: 200,
            });
        });

        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'org_commission_logs', 'olog-2')));
    });

    test('regular user CANNOT read organization commission log', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'org_commission_logs', 'olog-3'), {
                orgId: ORG_UID,
                amount: 200,
            });
        });

        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(getDoc(doc(db, 'org_commission_logs', 'olog-3')));
    });
});

rulesDescribe('City Stats Collection', () => {
    test('partner can read city stats', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'city_stats', 'karachi'), {
                totalUsers: 100,
            });
        });

        const context = testEnv.authenticatedContext(PARTNER_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'city_stats', 'karachi')));
    });

    test('admin can read city stats', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'city_stats', 'lahore'), {
                totalUsers: 80,
            });
        });

        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'city_stats', 'lahore')));
    });

    test('regular user CANNOT read city stats', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'city_stats', 'islamabad'), {
                totalUsers: 20,
            });
        });

        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(getDoc(doc(db, 'city_stats', 'islamabad')));
    });
});

rulesDescribe('KYC Documents Collection', () => {
    test('user can create own kyc document', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertSucceeds(setDoc(doc(db, 'kyc_documents', 'kyc-1'), {
            userId: USER_UID,
            fileUrl: 'https://example.com/doc.pdf',
        }));
    });

    test('user CANNOT create kyc document for another user', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'kyc_documents', 'kyc-2'), {
            userId: OTHER_USER_UID,
            fileUrl: 'https://example.com/doc.pdf',
        }));
    });

    test('admin can read any kyc document', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'kyc_documents', 'kyc-admin-read'), {
                userId: USER_UID,
                fileUrl: 'https://example.com/doc.pdf',
            });
        });

        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'kyc_documents', 'kyc-admin-read')));
    });

    test('user CANNOT update own kyc document', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'kyc_documents', 'kyc-no-update'), {
                userId: USER_UID,
                fileUrl: 'https://example.com/doc.pdf',
            });
        });

        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(updateDoc(doc(db, 'kyc_documents', 'kyc-no-update'), {
            fileUrl: 'https://example.com/new.pdf',
        }));
    });
});

rulesDescribe('Game Limits Collection', () => {
    test('user can read own game limit', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'game_limits', 'limit-1'), {
                userId: USER_UID,
                spinCount: 1,
            });
        });

        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'game_limits', 'limit-1')));
    });

    test('user CANNOT read other user game limit', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'game_limits', 'limit-2'), {
                userId: USER_UID,
                spinCount: 1,
            });
        });

        const context = testEnv.authenticatedContext(OTHER_USER_UID);
        const db = context.firestore();

        await assertFails(getDoc(doc(db, 'game_limits', 'limit-2')));
    });

    test('user CANNOT write own game limit', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'game_limits', 'limit-3'), {
            userId: USER_UID,
            spinCount: 999,
        }));
    });
});

rulesDescribe('Cooldowns Collection', () => {
    test('user can read own cooldown doc', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'cooldowns', USER_UID), {
                spin: { nextAvailableAt: new Date().toISOString() },
            });
        });

        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();
        await assertSucceeds(getDoc(doc(db, 'cooldowns', USER_UID)));
    });

    test('user CANNOT read another user cooldown doc', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'cooldowns', USER_UID), {
                spin: { nextAvailableAt: new Date().toISOString() },
            });
        });

        const context = testEnv.authenticatedContext(OTHER_USER_UID);
        const db = context.firestore();
        await assertFails(getDoc(doc(db, 'cooldowns', USER_UID)));
    });

    test('user CANNOT write cooldown doc directly', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();
        await assertFails(setDoc(doc(db, 'cooldowns', USER_UID), {
            spin: { nextAvailableAt: new Date().toISOString() },
        }));
    });
});

rulesDescribe('Feature Flags Collection', () => {
    test('admin can read feature flag', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'feature_flags', 'flag-1'), {
                enabled: true,
            });
        });

        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'feature_flags', 'flag-1')));
    });

    test('sub_admin can read feature flag', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'feature_flags', 'flag-2'), {
                enabled: true,
            });
        });

        const context = testEnv.authenticatedContext(SUBADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'feature_flags', 'flag-2')));
    });

    test('regular user CANNOT read feature flag', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'feature_flags', 'flag-3'), {
                enabled: true,
            });
        });

        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(getDoc(doc(db, 'feature_flags', 'flag-3')));
    });
});

rulesDescribe('Public Catalog Collections', () => {
    test('unauthenticated user can read product category', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'product_categories', 'cat-1'), {
                name: 'Electronics',
            });
        });

        const context = testEnv.unauthenticatedContext();
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'product_categories', 'cat-1')));
    });

    test('regular user CANNOT write product category', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'product_categories', 'cat-2'), {
            name: 'Unauthorized',
        }));
    });

    test('sub_admin can write product brand', async () => {
        const context = testEnv.authenticatedContext(SUBADMIN_UID);
        const db = context.firestore();

        await assertSucceeds(setDoc(doc(db, 'product_brands', 'brand-1'), {
            name: 'Brand One',
        }));
    });

    test('unauthenticated user can read banner', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'banners', 'banner-1'), {
                title: 'Sale',
            });
        });

        const context = testEnv.unauthenticatedContext();
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'banners', 'banner-1')));
    });
});

// ============================================================================
// SERVER-ONLY COLLECTION WRITE-DENIAL TESTS
// ============================================================================

rulesDescribe('Transactions Collection (server-only writes)', () => {
    test('user CANNOT write to transactions', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'transactions', 'tx-1'), {
            userId: USER_UID,
            amount: 100,
            type: 'credit',
            category: 'task',
        }));
    });

    test('admin CANNOT write to transactions', async () => {
        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'transactions', 'tx-2'), {
            userId: USER_UID,
            amount: 100,
            type: 'credit',
            category: 'task',
        }));
    });

    test('user can read own transactions', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const adminDb = adminContext.firestore();
            await setDoc(doc(adminDb, 'transactions', 'tx-read-1'), {
                userId: USER_UID,
                amount: 50,
                type: 'credit',
            });
        });

        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertSucceeds(getDoc(doc(db, 'transactions', 'tx-read-1')));
    });
});

rulesDescribe('Idempotency Keys Collection (server-only writes)', () => {
    test('user CANNOT write to idempotency_keys', async () => {
        const context = testEnv.authenticatedContext(USER_UID);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'idempotency_keys', 'key-1'), {
            completedAt: new Date(),
        }));
    });

    test('admin CANNOT write to idempotency_keys', async () => {
        const context = testEnv.authenticatedContext(ADMIN_UID);
        const db = context.firestore();

        await assertFails(setDoc(doc(db, 'idempotency_keys', 'key-2'), {
            completedAt: new Date(),
        }));
    });
});
