// File: scripts/migration/test-etl-local.ts
/**
 * Local ETL Test
 * 
 * Creates realistic sample Firestore export data, then runs
 * transform → import → validate to verify the entire pipeline.
 * 
 * Usage:
 *   npx tsx test-etl-local.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXPORTED_DIR = join(__dirname, 'data', 'exported');

// ─── Sample Data Generator ─────────────────────────────────────────

function firestoreTimestamp(date: Date = new Date()) {
    return {
        _seconds: Math.floor(date.getTime() / 1000),
        _nanoseconds: 0,
    };
}

function generateSampleData() {
    console.log('📦 Generating sample Firestore export data...\n');

    if (!existsSync(EXPORTED_DIR)) {
        mkdirSync(EXPORTED_DIR, { recursive: true });
    }

    // ─── Users ────────────────────────────────────────────────────
    const users = [
        {
            _id: 'user_001',
            _path: 'users/user_001',
            _createTime: '2025-01-15T10:00:00Z',
            _updateTime: '2025-06-20T14:30:00Z',
            email: 'rahul.sharma@example.com',
            name: 'Rahul Sharma',
            phone: '+919876543210',
            photoURL: 'https://example.com/photos/rahul.jpg',
            role: 'user',
            state: 'Maharashtra',
            city: 'Mumbai',
            ownReferralCode: 'RAHUL001',
            referralCode: null,
            referredBy: null,
            uplinePath: [],
            referralProcessed: false,
            membershipActive: true,
            membershipDate: firestoreTimestamp(new Date('2025-02-01')),
            isActive: true,
            isBanned: false,
            kycStatus: 'verified',
            kycData: {
                fullName: 'Rahul Sharma',
                dateOfBirth: '1990-05-15',
                address: '123 Main St',
                city: 'Mumbai',
                state: 'Maharashtra',
                pincode: '400001',
                idType: 'Aadhaar',
                idNumber: 'XXXX-XXXX-1234',
                bankName: 'SBI',
                accountNumber: '1234567890',
                ifscCode: 'SBIN0001234',
            },
            kycSubmittedAt: firestoreTimestamp(new Date('2025-01-20')),
            kycVerifiedAt: firestoreTimestamp(new Date('2025-01-22')),
            savedAddresses: [
                {
                    fullName: 'Rahul Sharma',
                    phone: '+919876543210',
                    addressLine1: '123 Main St',
                    city: 'Mumbai',
                    state: 'Maharashtra',
                    pincode: '400001',
                },
            ],
            createdAt: firestoreTimestamp(new Date('2025-01-15')),
            updatedAt: firestoreTimestamp(new Date('2025-06-20')),
        },
        {
            _id: 'user_002',
            _path: 'users/user_002',
            _createTime: '2025-02-10T08:00:00Z',
            _updateTime: '2025-07-01T09:00:00Z',
            email: 'priya.patel@example.com',
            name: 'Priya Patel',
            phone: '+919998877665',
            role: 'user',
            state: 'Gujarat',
            city: 'Ahmedabad',
            ownReferralCode: 'PRIYA002',
            referralCode: 'RAHUL001',
            referredBy: 'user_001',
            uplinePath: ['user_001'],
            referralProcessed: true,
            membershipActive: true,
            membershipDate: firestoreTimestamp(new Date('2025-02-15')),
            isActive: true,
            isBanned: false,
            kycStatus: 'pending',
            createdAt: firestoreTimestamp(new Date('2025-02-10')),
            updatedAt: firestoreTimestamp(new Date('2025-07-01')),
        },
        {
            _id: 'admin_001',
            _path: 'users/admin_001',
            _createTime: '2025-01-01T00:00:00Z',
            _updateTime: '2025-08-01T12:00:00Z',
            email: 'admin@thinkmart.com',
            name: 'System Admin',
            role: 'admin',
            state: 'Karnataka',
            city: 'Bengaluru',
            ownReferralCode: 'ADMIN001',
            referralProcessed: false,
            membershipActive: false,
            isActive: true,
            isBanned: false,
            kycStatus: 'not_submitted',
            createdAt: firestoreTimestamp(new Date('2025-01-01')),
            updatedAt: firestoreTimestamp(new Date('2025-08-01')),
        },
    ];

    // ─── Wallets ──────────────────────────────────────────────────
    const wallets = [
        {
            _id: 'user_001',
            coinBalance: 1250.5,
            cashBalance: 4500.75,
            totalEarnings: 12000,
            totalWithdrawals: 7500,
            updatedAt: firestoreTimestamp(new Date('2025-06-20')),
        },
        {
            _id: 'user_002',
            coinBalance: 340,
            cashBalance: 1200,
            totalEarnings: 2500,
            totalWithdrawals: 1300,
            updatedAt: firestoreTimestamp(new Date('2025-07-01')),
        },
        {
            _id: 'admin_001',
            coinBalance: 0,
            cashBalance: 0,
            totalEarnings: 0,
            totalWithdrawals: 0,
            updatedAt: firestoreTimestamp(new Date('2025-08-01')),
        },
    ];

    // ─── Transactions ─────────────────────────────────────────────
    const transactions = [
        {
            _id: 'txn_001',
            userId: 'user_001',
            type: 'TASK_REWARD',
            amount: 50,
            currency: 'COIN',
            status: 'COMPLETED',
            description: 'Completed daily survey',
            taskId: 'task_001',
            taskType: 'SURVEY',
            createdAt: firestoreTimestamp(new Date('2025-03-15')),
        },
        {
            _id: 'txn_002',
            userId: 'user_001',
            type: 'REFERRAL_BONUS',
            amount: 200,
            currency: 'CASH',
            status: 'COMPLETED',
            description: 'Referral bonus for user_002',
            relatedUserId: 'user_002',
            level: 1,
            createdAt: firestoreTimestamp(new Date('2025-02-15')),
        },
        {
            _id: 'txn_003',
            userId: 'user_001',
            type: 'WITHDRAWAL',
            amount: 2000,
            currency: 'CASH',
            status: 'COMPLETED',
            description: 'Bank withdrawal',
            createdAt: firestoreTimestamp(new Date('2025-04-01')),
        },
        {
            _id: 'txn_004',
            userId: 'user_002',
            type: 'MEMBERSHIP_FEE',
            amount: 1000,
            currency: 'CASH',
            status: 'COMPLETED',
            description: 'Membership activation fee',
            createdAt: firestoreTimestamp(new Date('2025-02-15')),
        },
    ];

    // ─── Products ─────────────────────────────────────────────────
    const products = [
        {
            _id: 'prod_001',
            name: 'Organic Green Tea (100 bags)',
            description: 'Premium organic green tea sourced from Darjeeling.',
            price: 499,
            category: 'beverages',
            image: 'https://cdn.thinkmart.com/products/prod_001/main.jpg',
            images: [
                'https://cdn.thinkmart.com/products/prod_001/main.jpg',
                'https://cdn.thinkmart.com/products/prod_001/side.jpg',
            ],
            commission: 50,
            coinPrice: 200,
            inStock: true,
            stock: 150,
            deliveryDays: 5,
            vendor: 'vendor_tea',
            createdAt: firestoreTimestamp(new Date('2025-01-20')),
            updatedAt: firestoreTimestamp(new Date('2025-06-01')),
        },
        {
            _id: 'prod_002',
            name: 'ThinkMart Branded T-Shirt',
            description: 'Comfortable cotton t-shirt with ThinkMart logo.',
            price: 349,
            category: 'clothing',
            image: 'https://cdn.thinkmart.com/products/prod_002/main.jpg',
            commission: 35,
            coinOnly: true,
            coinPrice: 150,
            inStock: true,
            stock: 50,
            createdAt: firestoreTimestamp(new Date('2025-03-10')),
            updatedAt: firestoreTimestamp(new Date('2025-05-15')),
        },
    ];

    // ─── Orders ───────────────────────────────────────────────────
    const orders = [
        {
            _id: 'order_001',
            userId: 'user_001',
            userEmail: 'rahul.sharma@example.com',
            userName: 'Rahul Sharma',
            items: [
                {
                    productId: 'prod_001',
                    productName: 'Organic Green Tea (100 bags)',
                    quantity: 2,
                    unitPrice: 499,
                    coinPrice: 200,
                },
            ],
            subtotal: 998,
            cashPaid: 998,
            coinsRedeemed: 0,
            coinValue: 0,
            shippingAddress: {
                fullName: 'Rahul Sharma',
                phone: '+919876543210',
                addressLine1: '123 Main St',
                city: 'Mumbai',
                state: 'Maharashtra',
                pincode: '400001',
            },
            status: 'delivered',
            statusHistory: [
                { status: 'pending', at: firestoreTimestamp(new Date('2025-04-10')) },
                { status: 'confirmed', at: firestoreTimestamp(new Date('2025-04-10')) },
                { status: 'shipped', at: firestoreTimestamp(new Date('2025-04-12')) },
                { status: 'delivered', at: firestoreTimestamp(new Date('2025-04-15')) },
            ],
            city: 'Mumbai',
            createdAt: firestoreTimestamp(new Date('2025-04-10')),
            updatedAt: firestoreTimestamp(new Date('2025-04-15')),
        },
    ];

    // ─── Other Collections (minimal) ─────────────────────────────
    const withdrawals = [
        {
            _id: 'wd_001',
            userId: 'user_001',
            amount: 2000,
            method: 'bank',
            status: 'completed',
            requestedAt: firestoreTimestamp(new Date('2025-03-28')),
            processedAt: firestoreTimestamp(new Date('2025-04-01')),
            bankDetails: { bankName: 'SBI', accountNumber: '1234567890', ifscCode: 'SBIN0001234' },
        },
    ];

    const reviews = [
        {
            _id: 'rev_001',
            productId: 'prod_001',
            userId: 'user_001',
            orderId: 'order_001',
            rating: 5,
            title: 'Excellent Tea!',
            content: 'Best green tea I have ever tasted. Very fresh.',
            userName: 'Rahul Sharma',
            helpful: 3,
            verified: true,
            status: 'approved',
            createdAt: firestoreTimestamp(new Date('2025-04-20')),
        },
    ];

    const tasks = [
        {
            _id: 'task_001',
            title: 'Daily Survey',
            description: 'Complete a short survey about your shopping preferences.',
            type: 'SURVEY',
            reward: 50,
            rewardType: 'COIN',
            frequency: 'DAILY',
            isActive: true,
            createdAt: firestoreTimestamp(new Date('2025-01-01')),
        },
    ];

    const settings = [
        {
            _id: 'general',
            appName: 'ThinkMart',
            maintenanceMode: false,
            membershipFee: 1000,
            minWithdrawalAmount: 500,
        },
    ];

    const categories = [
        { _id: 'cat_001', name: 'Beverages', slug: 'beverages', sortOrder: 1, isActive: true, _createTime: '2025-01-01T00:00:00Z' },
        { _id: 'cat_002', name: 'Clothing', slug: 'clothing', sortOrder: 2, isActive: true, _createTime: '2025-01-01T00:00:00Z' },
    ];

    // ─── Write all files ──────────────────────────────────────────
    const collections: Record<string, any[]> = {
        users,
        wallets,
        transactions,
        products,
        orders,
        withdrawals,
        reviews,
        tasks,
        settings,
        categories,
    };

    for (const [name, data] of Object.entries(collections)) {
        const file = join(EXPORTED_DIR, `${name}.json`);
        writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`  ✅ ${name}: ${data.length} docs → ${file}`);
    }

    console.log(`\n  📁 Total: ${Object.values(collections).reduce((a, b) => a + b.length, 0)} documents\n`);
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  ThinkMart ETL Pipeline — Local Test');
    console.log('═══════════════════════════════════════════════════════\n');

    // Step 1: Generate sample data
    generateSampleData();

    // Step 2: Run transform
    console.log('🔄 Running: Transform...\n');
    try {
        execSync('npx tsx transform/transform.ts', { cwd: __dirname, stdio: 'inherit' });
    } catch (err) {
        console.error('❌ Transform step failed');
        process.exit(1);
    }

    // Step 3: Run import
    console.log('\n📥 Running: Import (--truncate for clean slate)...\n');
    try {
        execSync('npx tsx import-turso/import.ts --truncate', { cwd: __dirname, stdio: 'inherit' });
    } catch (err) {
        console.error('❌ Import step failed');
        process.exit(1);
    }

    // Step 4: Run validation
    console.log('\n🔍 Running: Validation...\n');
    try {
        execSync('npx tsx validate/validate.ts --verbose', { cwd: __dirname, stdio: 'inherit' });
    } catch (err) {
        console.error('❌ Validation step failed');
        process.exit(1);
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  🎉 Full ETL pipeline test PASSED!');
    console.log('═══════════════════════════════════════════════════════\n');
}

main().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
