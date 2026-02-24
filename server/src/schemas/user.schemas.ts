// File: server/src/schemas/user.schemas.ts
/**
 * Zod schemas for user-related requests and responses.
 */

import { z } from 'zod';

export const userRoleSchema = z.enum([
    'user',
    'admin',
    'sub_admin',
    'vendor',
    'partner',
    'organization',
]);

export const registerUserSchema = z.object({
    name: z.string().min(2).max(100).trim(),
    phone: z.string().optional(),
    state: z.string().min(1).max(100).optional(),
    city: z.string().min(1).max(100).optional(),
    referralCode: z.string().max(20).optional(),
});

export const updateProfileSchema = z.object({
    name: z.string().min(2).max(100).trim().optional(),
    phone: z.string().optional(),
    photoURL: z.string().url().optional(),
    state: z.string().min(1).max(100).optional(),
    city: z.string().min(1).max(100).optional(),
    savedAddresses: z
        .array(
            z.object({
                id: z.string().min(1).max(64),
                fullName: z.string().min(1).max(100),
                phone: z.string().min(1).max(20),
                addressLine1: z.string().min(1).max(200),
                addressLine2: z.string().max(200).optional().nullable(),
                city: z.string().min(1).max(100),
                state: z.string().min(1).max(100),
                pincode: z.string().min(3).max(12),
                isDefault: z.boolean().optional(),
            })
        )
        .max(20)
        .optional(),
    paymentMethods: z
        .object({
            upi: z.string().max(100).optional().nullable(),
            bank: z
                .object({
                    accountNo: z.string().max(64).optional().nullable(),
                    ifsc: z.string().max(32).optional().nullable(),
                })
                .optional()
                .nullable(),
        })
        .optional(),
});

export type RegisterUserInput = z.infer<typeof registerUserSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
