// File: functions/src/lib/validation.ts
/**
 * Zod Validation Utilities for Cloud Functions
 * Provides runtime input validation with proper error handling
 */

import { z, ZodSchema, ZodError } from 'zod';
import * as functions from 'firebase-functions';

/**
 * Wraps a Cloud Function handler with Zod validation
 * Automatically parses input and converts Zod errors to HttpsErrors
 */
export function withValidation<T>(
    schema: ZodSchema<T>,
    handler: (data: T, context: functions.https.CallableContext) => Promise<unknown>
): (data: unknown, context: functions.https.CallableContext) => Promise<unknown> {
    return async (data: unknown, context: functions.https.CallableContext) => {
        try {
            const validatedData = schema.parse(data);
            return await handler(validatedData, context);
        } catch (error) {
            if (error instanceof ZodError) {
                const formattedErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
                throw new functions.https.HttpsError('invalid-argument', `Validation failed: ${formattedErrors}`);
            }
            throw error;
        }
    };
}

/**
 * Validates data against a schema and throws HttpsError on failure
 */
export function validate<T>(schema: ZodSchema<T>, data: unknown): T {
    try {
        return schema.parse(data);
    } catch (error) {
        if (error instanceof ZodError) {
            const formattedErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
            throw new functions.https.HttpsError('invalid-argument', `Validation failed: ${formattedErrors}`);
        }
        throw error;
    }
}

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

/** MongoDB-style ObjectId or Firestore document ID */
export const DocumentIdSchema = z.string().min(1).max(128);

/** User ID (Firebase Auth UID) */
export const UserIdSchema = z.string().min(1).max(128);

/** Positive integer for amounts */
export const PositiveIntSchema = z.number().int().positive();

/** Non-negative integer (includes 0) */
export const NonNegativeIntSchema = z.number().int().nonnegative();

/** Pagination parameters */
export const PaginationSchema = z.object({
    limit: z.number().int().min(1).max(100).default(20),
    startAfter: z.string().optional(),
});

// ============================================================================
// PRODUCT SCHEMAS
// ============================================================================

export const CreateProductSchema = z.object({
    name: z.string().min(3).max(200),
    description: z.string().min(10).max(5000),
    price: PositiveIntSchema,
    category: z.string().min(1).max(100),
    inStock: z.boolean().default(true),
    images: z.array(z.string().url()).max(10).optional(),
    vendorId: UserIdSchema.optional(),
});

export const UpdateProductSchema = z.object({
    productId: DocumentIdSchema,
    name: z.string().min(3).max(200).optional(),
    description: z.string().min(10).max(5000).optional(),
    price: PositiveIntSchema.optional(),
    category: z.string().min(1).max(100).optional(),
    inStock: z.boolean().optional(),
    images: z.array(z.string().url()).max(10).optional(),
});

// ============================================================================
// ORDER SCHEMAS
// ============================================================================

export const CreateOrderSchema = z.object({
    productId: DocumentIdSchema,
    useCoins: NonNegativeIntSchema.default(0),
});

export const CreateMultiItemOrderSchema = z.object({
    items: z.array(z.object({
        productId: DocumentIdSchema,
        quantity: z.number().int().min(1).max(10),
    })).min(1).max(20),
    useCoins: NonNegativeIntSchema.default(0),
    shippingAddress: z.object({
        fullName: z.string().min(2).max(100),
        phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian phone number'),
        addressLine1: z.string().min(5).max(200),
        addressLine2: z.string().max(200).optional(),
        city: z.string().min(2).max(100),
        state: z.string().min(2).max(100),
        pincode: z.string().regex(/^\d{6}$/, 'Invalid pincode'),
    }),
});

export const UpdateOrderStatusSchema = z.object({
    orderId: DocumentIdSchema,
    status: z.enum(['confirmed', 'shipped', 'delivered', 'cancelled']),
    trackingNumber: z.string().max(100).optional(),
    notes: z.string().max(500).optional(),
});

// ============================================================================
// WITHDRAWAL SCHEMAS
// ============================================================================

export const RequestWithdrawalSchema = z.object({
    amount: z.number().int().min(100, 'Minimum withdrawal is ₹100').max(100000, 'Maximum is ₹1,00,000'),
    upiId: z.string().regex(/^[\w.-]+@[\w]+$/, 'Invalid UPI ID format').optional(),
    bankDetails: z.object({
        accountNumber: z.string().min(9).max(18),
        ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC format'),
        accountHolderName: z.string().min(3).max(100),
    }).optional(),
}).refine(
    data => data.upiId || data.bankDetails,
    { message: 'Either UPI ID or bank details required' }
);

export const ProcessWithdrawalSchema = z.object({
    withdrawalId: DocumentIdSchema,
    action: z.enum(['approve', 'reject']),
    transactionId: z.string().max(100).optional(),
    rejectionReason: z.string().max(500).optional(),
});

// ============================================================================
// TASK SCHEMAS
// ============================================================================

export const StartTaskSchema = z.object({
    taskId: DocumentIdSchema,
});

export const RewardTaskSchema = z.object({
    taskId: DocumentIdSchema,
    completionProof: z.string().max(1000).optional(),
});

export const SubmitSurveySchema = z.object({
    surveyId: DocumentIdSchema,
    answers: z.array(z.object({
        questionId: z.string(),
        answer: z.union([z.string(), z.array(z.string())]),
    })).min(1),
});

// ============================================================================
// USER MANAGEMENT SCHEMAS
// ============================================================================

export const UpdateUserRoleSchema = z.object({
    userId: UserIdSchema,
    role: z.enum(['user', 'partner', 'vendor', 'organization', 'sub_admin', 'admin']),
});

export const AdjustWalletSchema = z.object({
    userId: UserIdSchema,
    amount: z.number().int(), // Can be negative for deductions
    type: z.enum(['cash', 'coins']),
    reason: z.string().min(5).max(500),
});

export const UpdateUserStatusSchema = z.object({
    userId: UserIdSchema,
    status: z.enum(['active', 'suspended', 'banned']),
    reason: z.string().max(500).optional(),
});

// ============================================================================
// KYC SCHEMAS
// ============================================================================

export const SubmitKycSchema = z.object({
    documentType: z.enum(['aadhaar', 'pan', 'voter_id', 'passport']),
    documentNumber: z.string().min(8).max(20),
    documentFrontUrl: z.string().url(),
    documentBackUrl: z.string().url().optional(),
    selfieUrl: z.string().url().optional(),
});

export const ProcessKycSchema = z.object({
    kycId: DocumentIdSchema,
    action: z.enum(['approve', 'reject']),
    rejectionReason: z.string().max(500).optional(),
});

// ============================================================================
// ADMIN SETTINGS SCHEMAS
// ============================================================================

export const UpdateSettingsSchema = z.object({
    key: z.string().min(1).max(100),
    value: z.unknown(),
});

export const UpdateGameConfigSchema = z.object({
    gameType: z.enum(['spin_wheel', 'lucky_box', 'daily_checkin']),
    config: z.object({
        enabled: z.boolean().optional(),
        dailyLimit: z.number().int().min(0).max(100).optional(),
        rewards: z.array(z.object({
            label: z.string(),
            value: z.number().int().nonnegative(),
            weight: z.number().int().positive(),
        })).optional(),
    }),
});

// ============================================================================
// PRODUCT IMAGE UPLOAD SCHEMA
// ============================================================================

export const UploadProductImageSchema = z.object({
    productId: DocumentIdSchema,
    imageBase64: z.string().min(1).max(10 * 1024 * 1024), // Max ~7.5MB after base64 overhead
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    position: z.number().int().min(0).max(9).default(0),
});

// Type exports for use in handlers
export type CreateProduct = z.infer<typeof CreateProductSchema>;
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;
export type CreateOrder = z.infer<typeof CreateOrderSchema>;
export type CreateMultiItemOrder = z.infer<typeof CreateMultiItemOrderSchema>;
export type UpdateOrderStatus = z.infer<typeof UpdateOrderStatusSchema>;
export type RequestWithdrawal = z.infer<typeof RequestWithdrawalSchema>;
export type ProcessWithdrawal = z.infer<typeof ProcessWithdrawalSchema>;
export type StartTask = z.infer<typeof StartTaskSchema>;
export type RewardTask = z.infer<typeof RewardTaskSchema>;
export type SubmitKyc = z.infer<typeof SubmitKycSchema>;
export type ProcessKyc = z.infer<typeof ProcessKycSchema>;
export type UploadProductImage = z.infer<typeof UploadProductImageSchema>;
