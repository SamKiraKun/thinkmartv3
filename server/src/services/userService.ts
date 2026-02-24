// File: server/src/services/userService.ts
/**
 * User service - business logic for user operations.
 * All writes go through this service (no business logic in route handlers).
 */

import { getDb } from '../db/client.js';
import { logger } from '../config/logger.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { nanoid } from 'nanoid';
import type { RegisterUserInput, UpdateProfileInput } from '../schemas/user.schemas.js';

export interface UserRow {
    uid: string;
    email: string;
    name: string;
    phone: string | null;
    photo_url: string | null;
    role: string;
    state: string | null;
    city: string | null;
    own_referral_code: string;
    referral_code: string | null;
    referred_by: string | null;
    upline_path: string | null; // JSON array
    referral_processed: number;
    membership_active: number;
    membership_date: string | null;
    is_active: number;
    is_banned: number;
    kyc_status: string;
    kyc_data: string | null; // JSON
    saved_addresses: string | null; // JSON
    payment_methods: string | null; // JSON
    partner_config?: string | null; // JSON
    vendor_config?: string | null; // JSON
    org_config?: string | null; // JSON
    sub_admin_permissions?: string | null; // JSON
    created_at: string;
    updated_at: string;
}

/**
 * Get user profile by UID.
 */
export async function getUserById(uid: string) {
    const db = getDb();
    const result = await db.execute({
        sql: 'SELECT * FROM users WHERE uid = ?',
        args: [uid],
    });

    if (result.rows.length === 0) return null;
    return formatUserRow(result.rows[0] as unknown as UserRow);
}

/**
 * Register a new user profile.
 * Called after Firebase Auth user creation.
 */
export async function registerUser(
    uid: string,
    email: string,
    input: RegisterUserInput
) {
    const db = getDb();

    // Check if user already exists
    const existing = await db.execute({
        sql: 'SELECT uid FROM users WHERE uid = ?',
        args: [uid],
    });

    if (existing.rows.length > 0) {
        throw new ConflictError('User profile already exists');
    }

    // Generate unique referral code
    const ownReferralCode = nanoid(8).toUpperCase();
    const now = new Date().toISOString();

    // Create user and wallet in a transaction
    const batch = [
        {
            sql: `INSERT INTO users (
        uid, email, name, phone, role, state, city,
        own_referral_code, referral_code, referral_processed,
        membership_active, is_active, is_banned, kyc_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'user', ?, ?, ?, ?, 0, 0, 1, 0, 'not_submitted', ?, ?)`,
            args: [
                uid, email, input.name, input.phone || null,
                input.state || null, input.city || null,
                ownReferralCode, input.referralCode || null,
                now, now,
            ],
        },
        {
            sql: `INSERT INTO wallets (
        user_id, coin_balance, cash_balance,
        total_earnings, total_withdrawals, updated_at
      ) VALUES (?, 0, 0, 0, 0, ?)`,
            args: [uid, now],
        },
    ];

    await db.batch(batch, 'write');

    logger.info({ uid, email }, 'User registered successfully');

    return getUserById(uid);
}

/**
 * Update user profile (safe self-update fields only).
 */
export async function updateUserProfile(
    uid: string,
    input: UpdateProfileInput
) {
    const db = getDb();

    // Build dynamic update query
    const updates: string[] = [];
    const args: (string | null)[] = [];

    if (input.name !== undefined) {
        updates.push('name = ?');
        args.push(input.name);
    }
    if (input.phone !== undefined) {
        updates.push('phone = ?');
        args.push(input.phone);
    }
    if (input.photoURL !== undefined) {
        updates.push('photo_url = ?');
        args.push(input.photoURL);
    }
    if (input.state !== undefined) {
        updates.push('state = ?');
        args.push(input.state);
    }
    if (input.city !== undefined) {
        updates.push('city = ?');
        args.push(input.city);
    }
    if ((input as any).savedAddresses !== undefined) {
        updates.push('saved_addresses = ?');
        args.push(JSON.stringify((input as any).savedAddresses ?? []));
    }
    if ((input as any).paymentMethods !== undefined) {
        updates.push('payment_methods = ?');
        args.push(JSON.stringify((input as any).paymentMethods ?? {}));
    }

    if (updates.length === 0) {
        return getUserById(uid);
    }

    updates.push('updated_at = ?');
    args.push(new Date().toISOString());
    args.push(uid);

    await db.execute({
        sql: `UPDATE users SET ${updates.join(', ')} WHERE uid = ?`,
        args,
    });

    return getUserById(uid);
}

/**
 * Format a database row to API response shape.
 */
function formatUserRow(row: UserRow) {
    return {
        uid: row.uid,
        email: row.email,
        name: row.name,
        phone: row.phone,
        photoURL: row.photo_url,
        role: row.role,
        state: row.state,
        city: row.city,
        ownReferralCode: row.own_referral_code,
        referralCode: row.referral_code,
        referredBy: row.referred_by,
        uplinePath: row.upline_path ? JSON.parse(row.upline_path) : [],
        referralProcessed: Boolean(row.referral_processed),
        membershipActive: Boolean(row.membership_active),
        membershipDate: row.membership_date,
        isActive: Boolean(row.is_active),
        isBanned: Boolean(row.is_banned),
        kycStatus: row.kyc_status,
        kycData: row.kyc_data ? JSON.parse(row.kyc_data) : null,
        savedAddresses: row.saved_addresses ? JSON.parse(row.saved_addresses) : [],
        paymentMethods: row.payment_methods ? JSON.parse(row.payment_methods) : null,
        partnerConfig: row.partner_config ? JSON.parse(row.partner_config) : null,
        vendorConfig: row.vendor_config ? JSON.parse(row.vendor_config) : null,
        orgConfig: row.org_config ? JSON.parse(row.org_config) : null,
        subAdminPermissions: row.sub_admin_permissions ? JSON.parse(row.sub_admin_permissions) : [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
