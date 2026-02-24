// File: functions/src/partner/partner.ts
// Partner Dashboard Cloud Functions - Simplified Single City Model

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// TYPES (Single City Model)
// ============================================================================

interface PartnerConfig {
    assignedCity: string;           // Single city assignment
    commissionPercentage: number;   // Partner's % of the 20% pool
    assignedAt?: FirebaseFirestore.Timestamp;
    assignedBy?: string;
}

// ============================================================================
// HELPER: Distribute Partner Commission (Multi-Partner per City Support)
// ============================================================================

/**
 * Distributes commission to ALL partners assigned to a city.
 * Each partner receives their allocated % of the 20% pool.
 * Commission comes from platform funds, NOT deducted from user.
 * 
 * @param city - City where transaction occurred
 * @param amount - Transaction amount (withdrawal/purchase)
 * @param sourceType - 'withdrawal' or 'purchase'
 * @param sourceId - ID of the withdrawal/order
 * @param sourceUserId - User who made the transaction
 */
export async function distributePartnerCommission(
    city: string,
    amount: number,
    sourceType: 'withdrawal' | 'purchase',
    sourceId: string,
    sourceUserId: string
) {
    if (!city || amount <= 0) return;

    try {
        // Query ALL partners assigned to this city (single city field)
        const partnersQuery = await db.collection('users')
            .where('role', '==', 'partner')
            .where('partnerConfig.assignedCity', '==', city)
            .get();

        if (partnersQuery.empty) {
            functions.logger.info(`No partners found for city: ${city}`);
            return;
        }

        const batch = db.batch();
        const cityPool = Math.floor(amount * 0.20); // Total 20% commission pool

        for (const partnerDoc of partnersQuery.docs) {
            const partnerData = partnerDoc.data();
            const config = partnerData.partnerConfig as PartnerConfig | undefined;
            const partnerPercentage = config?.commissionPercentage || 0;

            if (partnerPercentage > 0 && cityPool > 0) {
                // Calculate this partner's share: (partnerPercentage / 20) * cityPool
                const commission = Math.floor(cityPool * (partnerPercentage / 20));

                if (commission > 0) {
                    // Credit to partner_wallets (separate from user wallets)
                    const walletRef = db.doc(`partner_wallets/${partnerDoc.id}`);
                    batch.set(walletRef, {
                        cashBalance: admin.firestore.FieldValue.increment(commission),
                        totalEarnings: admin.firestore.FieldValue.increment(commission),
                        lastEarningAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });

                    // Log commission for transparency
                    const logRef = db.collection('partner_commission_logs').doc();
                    batch.set(logRef, {
                        partnerId: partnerDoc.id,
                        partnerName: partnerData.name || 'Partner',
                        partnerEmail: partnerData.email || '',
                        city,
                        sourceType,
                        sourceId,
                        sourceUserId,
                        sourceAmount: amount,
                        poolAmount: cityPool,
                        commissionPercentage: partnerPercentage,
                        commissionAmount: commission,
                        status: 'credited',
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    functions.logger.info(
                        `Partner ${partnerDoc.id} earned ₹${commission} (${partnerPercentage}% of pool) from ${sourceType} in ${city}`
                    );
                }
            }
        }

        await batch.commit();
    } catch (err) {
        functions.logger.error(`Failed to distribute partner commission for ${city}:`, err);
    }
}

// ============================================================================
// CLOUD FUNCTION: Get Partner Dashboard Stats (Single City Model)
// ============================================================================

export const getPartnerDashboardStats = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const partnerId = context.auth.uid;

    // Verify partner role
    const partnerDoc = await db.doc(`users/${partnerId}`).get();
    if (!partnerDoc.exists || partnerDoc.data()?.role !== 'partner') {
        throw new functions.https.HttpsError('permission-denied', 'Partner access required');
    }

    const partnerData = partnerDoc.data()!;
    const config = partnerData.partnerConfig as PartnerConfig | undefined;
    const assignedCity = config?.assignedCity || '';
    const commissionPercentage = config?.commissionPercentage || 0;

    if (!assignedCity) {
        return {
            assignedCity: null,
            commissionPercentage: 0,
            totalStats: {
                totalUsers: 0,
                activeUsers7d: 0,
                totalWithdrawals: 0,
                totalCommissionEarned: 0,
                walletBalance: 0,
                totalEarnings: 0
            }
        };
    }

    // Get partner wallet
    const walletDoc = await db.doc(`partner_wallets/${partnerId}`).get();
    const wallet = walletDoc.data() || { cashBalance: 0, totalEarnings: 0 };

    // Count users in city (simple query, no composite index needed)
    let totalUsers = 0;
    let activeUsers7d = 0;
    try {
        const usersQuery = await db.collection('users')
            .where('city', '==', assignedCity)
            .get();

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        usersQuery.docs.forEach(doc => {
            const data = doc.data();
            if (data.role === 'user') {
                totalUsers++;
                // Check if active in last 7 days (filter in memory)
                if (data.lastActiveAt?.toDate?.() >= sevenDaysAgo) {
                    activeUsers7d++;
                }
            }
        });
    } catch (err) {
        functions.logger.warn('Failed to fetch city users:', err);
    }

    // Count withdrawals from city (simple query)
    let totalWithdrawals = 0;
    try {
        const withdrawalsQuery = await db.collection('withdrawals')
            .where('userCity', '==', assignedCity)
            .get();

        withdrawalsQuery.docs.forEach(doc => {
            const data = doc.data();
            if (data.status === 'approved') {
                totalWithdrawals += data.amount || 0;
            }
        });
    } catch (err) {
        functions.logger.warn('Failed to fetch withdrawals:', err);
    }

    // Count commission earned (simple query)
    let totalCommissionEarned = 0;
    try {
        const commissionQuery = await db.collection('partner_commission_logs')
            .where('partnerId', '==', partnerId)
            .get();

        commissionQuery.docs.forEach(doc => {
            const data = doc.data();
            if (data.status === 'credited') {
                totalCommissionEarned += data.commissionAmount || 0;
            }
        });
    } catch (err) {
        functions.logger.warn('Failed to fetch commission logs:', err);
    }

    return {
        partnerId,
        partnerName: partnerData.name,
        assignedCity,
        commissionPercentage,
        totalStats: {
            totalUsers,
            activeUsers7d,
            totalWithdrawals,
            totalCommissionEarned,
            walletBalance: wallet.cashBalance || 0,
            totalEarnings: wallet.totalEarnings || 0
        }
    };
});

// ============================================================================
// CLOUD FUNCTION: Get City Users (Read-Only, Paginated)
// ============================================================================

export const getCityUsers = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const partnerId = context.auth.uid;
    const { pageSize = 20, lastDocId, filters } = data;

    // Verify partner role
    const partnerDoc = await db.doc(`users/${partnerId}`).get();
    if (!partnerDoc.exists || partnerDoc.data()?.role !== 'partner') {
        throw new functions.https.HttpsError('permission-denied', 'Partner access required');
    }

    const config = partnerDoc.data()!.partnerConfig as PartnerConfig | undefined;
    const assignedCity = config?.assignedCity;

    if (!assignedCity) {
        return { users: [], hasMore: false, lastDocId: null };
    }

    try {
        // Simple query by city only - avoid composite indexes
        const snapshot = await db.collection('users')
            .where('city', '==', assignedCity)
            .limit(200) // Fetch more to filter in memory
            .get();

        // Filter in memory for role and kycStatus
        let filteredDocs = snapshot.docs.filter(doc => {
            const data = doc.data();
            if (data.role !== 'user') return false;
            if (filters?.kycStatus && data.kycStatus !== filters.kycStatus) return false;
            return true;
        });

        // Sort by createdAt descending
        filteredDocs.sort((a, b) => {
            const aTime = a.data().createdAt?.toMillis?.() || 0;
            const bTime = b.data().createdAt?.toMillis?.() || 0;
            return bTime - aTime;
        });

        // Pagination in memory
        let startIndex = 0;
        if (lastDocId) {
            const idx = filteredDocs.findIndex(doc => doc.id === lastDocId);
            if (idx >= 0) startIndex = idx + 1;
        }

        const paginatedDocs = filteredDocs.slice(startIndex, startIndex + pageSize);

        // Mask sensitive data for partner view
        const users = paginatedDocs.map(doc => {
            const userData = doc.data();
            return {
                id: doc.id,
                name: maskName(userData.name || ''),
                phone: maskPhone(userData.phone || ''),
                email: maskEmail(userData.email || ''),
                city: userData.city,
                kycStatus: userData.kycStatus || 'not_submitted',
                membershipActive: userData.membershipActive || false,
                createdAt: userData.createdAt,
                lastActiveAt: userData.lastActiveAt
            };
        });

        return {
            users,
            hasMore: (startIndex + pageSize) < filteredDocs.length,
            lastDocId: paginatedDocs.length > 0 ? paginatedDocs[paginatedDocs.length - 1].id : null
        };
    } catch (err: unknown) {
        functions.logger.error('getCityUsers error:', err);
        throw new functions.https.HttpsError('internal', 'Failed to fetch users');
    }
});

// ============================================================================
// CLOUD FUNCTION: Get Commission History
// ============================================================================

export const getPartnerCommissionHistory = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const partnerId = context.auth.uid;
    const { pageSize = 30, startAfterTimestamp } = data;

    // Verify partner role
    const partnerDoc = await db.doc(`users/${partnerId}`).get();
    if (!partnerDoc.exists || partnerDoc.data()?.role !== 'partner') {
        throw new functions.https.HttpsError('permission-denied', 'Partner access required');
    }

    let query: FirebaseFirestore.Query = db.collection('partner_commission_logs')
        .where('partnerId', '==', partnerId)
        .orderBy('createdAt', 'desc')
        .limit(pageSize);

    if (startAfterTimestamp) {
        query = query.startAfter(new Date(startAfterTimestamp));
    }

    const snapshot = await query.get();

    const commissions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));

    return {
        commissions,
        hasMore: snapshot.docs.length === pageSize
    };
});

// ============================================================================
// CLOUD FUNCTION: Get Partner Analytics Data
// ============================================================================

export const getPartnerAnalytics = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const partnerId = context.auth.uid;
    const { days = 30 } = data;

    // Verify partner role
    const partnerDoc = await db.doc(`users/${partnerId}`).get();
    if (!partnerDoc.exists || partnerDoc.data()?.role !== 'partner') {
        throw new functions.https.HttpsError('permission-denied', 'Partner access required');
    }

    const config = partnerDoc.data()!.partnerConfig as PartnerConfig | undefined;
    const assignedCity = config?.assignedCity || '';

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get commission logs for date range
    const logsQuery = await db.collection('partner_commission_logs')
        .where('partnerId', '==', partnerId)
        .where('createdAt', '>=', startDate)
        .orderBy('createdAt', 'asc')
        .get();

    // Process into daily aggregates
    const dailyData: { [date: string]: { earnings: number; transactions: number } } = {};

    logsQuery.docs.forEach(doc => {
        const docData = doc.data();
        const date = docData.createdAt?.toDate?.()?.toISOString?.()?.split('T')[0] || '';
        if (date) {
            if (!dailyData[date]) {
                dailyData[date] = { earnings: 0, transactions: 0 };
            }
            dailyData[date].earnings += docData.commissionAmount || 0;
            dailyData[date].transactions += 1;
        }
    });

    // Convert to array for charting
    const earningsChart = Object.entries(dailyData).map(([date, chartData]) => ({
        date,
        earnings: chartData.earnings,
        transactions: chartData.transactions
    }));

    // Get user growth data (single city)
    let userGrowthFlat: { date: string }[] = [];
    if (assignedCity) {
        const usersQuery = await db.collection('users')
            .where('city', '==', assignedCity)
            .where('role', '==', 'user')
            .where('createdAt', '>=', startDate)
            .orderBy('createdAt', 'asc')
            .get();

        userGrowthFlat = usersQuery.docs.map(doc => ({
            date: doc.data().createdAt?.toDate?.()?.toISOString?.()?.split('T')[0] || ''
        }));
    }

    // Aggregate user growth by date
    const userGrowthByDate: { [date: string]: number } = {};
    userGrowthFlat.forEach(item => {
        if (item.date) {
            userGrowthByDate[item.date] = (userGrowthByDate[item.date] || 0) + 1;
        }
    });

    const userGrowthChart = Object.entries(userGrowthByDate).map(([date, count]) => ({
        date,
        newUsers: count
    }));

    // Find top earning days
    const topDays = [...earningsChart]
        .sort((a, b) => b.earnings - a.earnings)
        .slice(0, 5);

    const totalEarnings = logsQuery.docs.reduce((sum, doc) => sum + (doc.data().commissionAmount || 0), 0);

    return {
        earningsChart,
        userGrowthChart,
        topDays,
        summary: {
            totalEarnings,
            totalTransactions: logsQuery.docs.length,
            newUsers: userGrowthFlat.length,
            avgDailyEarnings: earningsChart.length > 0
                ? Math.round(totalEarnings / earningsChart.length)
                : 0
        }
    };
});

// ============================================================================
// LEGACY COMPATIBILITY: Partner Stats / Users
// ============================================================================
// Kept to preserve callable names used by older clients during migration.

export const getPartnerStats = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');
    const userId = context.auth.uid;

    const userDoc = await db.doc(`users/${userId}`).get();
    const userData = userDoc.data();

    if (userData?.role !== 'partner') throw new functions.https.HttpsError('permission-denied', 'Not a partner account');

    const city = userData.city;
    if (!city) return { city: 'Unassigned', totalUsers: 0, premiumUsers: 0 };

    const usersQuery = await db.collection('users').where('city', '==', city).count().get();
    const totalUsers = usersQuery.data().count;

    const premiumQuery = await db.collection('users')
        .where('city', '==', city)
        .where('membershipActive', '==', true)
        .count()
        .get();
    const premiumUsers = premiumQuery.data().count;

    return { city, totalUsers, premiumUsers };
});

export const getPartnerUsers = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');
    const userId = context.auth.uid;

    try {
        const userDoc = await db.doc(`users/${userId}`).get();
        if (!userDoc.exists) throw new functions.https.HttpsError('not-found', 'User profile not found');
        const userData = userDoc.data();

        if (userData?.role !== 'partner') throw new functions.https.HttpsError('permission-denied', 'Not a partner account');
        const city = userData?.city;
        if (!city) return { users: [], city: 'Unassigned (Contact Admin)' };

        const usersQuery = await db.collection('users')
            .where('city', '==', city)
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();

        const users = usersQuery.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                displayName: d.displayName || 'Unknown',
                email: d.email || '',
                membershipActive: !!d.membershipActive,
                createdAt: d.createdAt ? (d.createdAt.toMillis ? d.createdAt.toMillis() : Date.now()) : Date.now(),
                role: d.role || 'user'
            };
        });

        return { users, city };

    } catch (error: unknown) {
        if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (error as { code?: unknown }).code === 9
        ) {
            throw new functions.https.HttpsError('failed-precondition', 'Missing Firestore Index. Check logs.');
        }
        if (error instanceof Error && error.message.includes('index')) {
            throw new functions.https.HttpsError('failed-precondition', 'Missing Firestore Index. Check logs.');
        }
        throw new functions.https.HttpsError('internal', error instanceof Error ? error.message : 'Failed to fetch users');
    }
});

// ============================================================================
// CLOUD FUNCTION: Partner Product Management (CRUD)
// ============================================================================

interface ProductInput {
    name: string;
    description: string;
    price: number;
    category?: string;
    imageUrl?: string;
    stock?: number;
    isActive?: boolean;
}

/**
 * Create a new product (Partner-only)
 * Products created by partners are tagged with their partnerId.
 */
export const createPartnerProduct = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const partnerId = context.auth.uid;

    // Verify partner role
    const partnerDoc = await db.doc(`users/${partnerId}`).get();
    if (!partnerDoc.exists || partnerDoc.data()?.role !== 'partner') {
        throw new functions.https.HttpsError('permission-denied', 'Partner access required');
    }

    const partnerData = partnerDoc.data()!;
    const config = partnerData.partnerConfig as PartnerConfig | undefined;
    const assignedCity = config?.assignedCity || '';

    const { name, description, price, category, imageUrl, stock, isActive } = data as ProductInput;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length < 3) {
        throw new functions.https.HttpsError('invalid-argument', 'Product name must be at least 3 characters');
    }
    if (typeof price !== 'number' || price <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Price must be a positive number');
    }

    const productRef = db.collection('products').doc();
    await productRef.set({
        id: productRef.id,
        name: name.trim(),
        description: description?.trim() || '',
        price: Math.round(price * 100) / 100, // Round to 2 decimals
        category: category || 'general',
        imageUrl: imageUrl || null,
        stock: stock ?? 100,
        inStock: (stock ?? 100) > 0,
        isActive: isActive ?? true,
        partnerId: partnerId, // Tag with partner
        partnerName: partnerData.name || 'Partner',
        partnerCity: assignedCity,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    functions.logger.info(`Partner ${partnerId} created product ${productRef.id}`);

    return {
        success: true,
        productId: productRef.id,
        message: 'Product created successfully'
    };
});

/**
 * Update an existing product (Partner-only, own products)
 */
export const updatePartnerProduct = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const partnerId = context.auth.uid;
    const { productId, updates } = data as { productId: string; updates: Partial<ProductInput> };

    if (!productId) {
        throw new functions.https.HttpsError('invalid-argument', 'Product ID required');
    }

    // Verify partner role
    const partnerDoc = await db.doc(`users/${partnerId}`).get();
    if (!partnerDoc.exists || partnerDoc.data()?.role !== 'partner') {
        throw new functions.https.HttpsError('permission-denied', 'Partner access required');
    }

    // Verify product ownership
    const productRef = db.doc(`products/${productId}`);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Product not found');
    }

    const productData = productDoc.data()!;
    if (productData.partnerId !== partnerId) {
        throw new functions.https.HttpsError('permission-denied', 'You can only edit your own products');
    }

    // Build safe update object
    const safeUpdates: Record<string, any> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (updates.name !== undefined && typeof updates.name === 'string') {
        safeUpdates.name = updates.name.trim();
    }
    if (updates.description !== undefined && typeof updates.description === 'string') {
        safeUpdates.description = updates.description.trim();
    }
    if (updates.price !== undefined && typeof updates.price === 'number' && updates.price > 0) {
        safeUpdates.price = Math.round(updates.price * 100) / 100;
    }
    if (updates.category !== undefined) {
        safeUpdates.category = updates.category;
    }
    if (updates.imageUrl !== undefined) {
        safeUpdates.imageUrl = updates.imageUrl || null;
    }
    if (updates.stock !== undefined && typeof updates.stock === 'number') {
        safeUpdates.stock = Math.max(0, Math.floor(updates.stock));
        safeUpdates.inStock = safeUpdates.stock > 0;
    }
    if (updates.isActive !== undefined && typeof updates.isActive === 'boolean') {
        safeUpdates.isActive = updates.isActive;
    }

    await productRef.update(safeUpdates);

    functions.logger.info(`Partner ${partnerId} updated product ${productId}`);

    return { success: true, message: 'Product updated successfully' };
});

/**
 * Delete (soft-delete) a product (Partner-only, own products)
 */
export const deletePartnerProduct = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const partnerId = context.auth.uid;
    const { productId } = data as { productId: string };

    if (!productId) {
        throw new functions.https.HttpsError('invalid-argument', 'Product ID required');
    }

    // Verify partner role
    const partnerDoc = await db.doc(`users/${partnerId}`).get();
    if (!partnerDoc.exists || partnerDoc.data()?.role !== 'partner') {
        throw new functions.https.HttpsError('permission-denied', 'Partner access required');
    }

    // Verify product ownership
    const productRef = db.doc(`products/${productId}`);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Product not found');
    }

    const productData = productDoc.data()!;
    if (productData.partnerId !== partnerId) {
        throw new functions.https.HttpsError('permission-denied', 'You can only delete your own products');
    }

    // Soft delete: mark as inactive and deleted
    await productRef.update({
        isActive: false,
        isDeleted: true,
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    functions.logger.info(`Partner ${partnerId} deleted product ${productId}`);

    return { success: true, message: 'Product deleted successfully' };
});

/**
 * Get partner's own products (Partner-only)
 */
export const getPartnerProducts = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const partnerId = context.auth.uid;
    const { includeDeleted = false } = data || {};

    // Verify partner role
    const partnerDoc = await db.doc(`users/${partnerId}`).get();
    if (!partnerDoc.exists || partnerDoc.data()?.role !== 'partner') {
        throw new functions.https.HttpsError('permission-denied', 'Partner access required');
    }

    let query = db.collection('products')
        .where('partnerId', '==', partnerId)
        .orderBy('createdAt', 'desc');

    if (!includeDeleted) {
        query = query.where('isDeleted', '!=', true);
    }

    const snapshot = await query.limit(100).get();

    const products = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));

    return { success: true, products };
});

// ============================================================================
// HELPER FUNCTIONS: Data Masking
// ============================================================================

function maskName(name: string): string {
    if (!name || name.length < 2) return '***';
    return name[0] + '***' + name[name.length - 1];
}

function maskPhone(phone: string): string {
    if (!phone || phone.length < 4) return '****';
    return '****' + phone.slice(-4);
}

function maskEmail(email: string): string {
    if (!email || !email.includes('@')) return '***@***.***';
    const [local, domain] = email.split('@');
    return local[0] + '***@' + domain;
}
