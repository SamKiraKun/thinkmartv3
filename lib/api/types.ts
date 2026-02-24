// File: lib/api/types.ts
/**
 * Shared API response types.
 * These match the DTOs returned by the Fastify API server.
 */

// ─── User ───────────────────────────────────────────────────────────

export interface ApiUserProfile {
    uid: string;
    email: string;
    name: string;
    phone: string | null;
    photoURL: string | null;
    role: 'user' | 'admin' | 'sub_admin' | 'vendor' | 'partner' | 'organization';
    state: string | null;
    city: string | null;
    ownReferralCode: string;
    referralCode: string | null;
    referredBy: string | null;
    uplinePath: string[];
    referralProcessed: boolean;
    membershipActive: boolean;
    membershipDate: string | null;
    isActive: boolean;
    isBanned: boolean;
    kycStatus: 'not_submitted' | 'pending' | 'verified' | 'rejected';
    kycData: {
        fullName: string;
        dateOfBirth: string;
        address: string;
        city: string;
        state: string;
        pincode: string;
        idType: string;
        idNumber: string;
        bankName: string;
        accountNumber: string;
        ifscCode: string;
        idDocumentUrl?: string | null;
        addressProofUrl?: string | null;
    } | null;
    savedAddresses?: SavedAddress[];
    paymentMethods?: {
        upi?: string | null;
        bank?: {
            accountNo?: string | null;
            ifsc?: string | null;
        } | null;
    } | null;
    partnerConfig?: {
        assignedCity?: string;
        commissionPercentage?: number;
        assignedCities?: string[];
        commissionPercentages?: Record<string, number>;
        status?: string;
        assignedAt?: string;
        assignedBy?: string;
    } | null;
    vendorConfig?: Record<string, any> | null;
    orgConfig?: Record<string, any> | null;
    subAdminPermissions?: string[] | null;
    createdAt: string;
    updatedAt: string;
}

export interface SavedAddress {
    id: string;
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    pincode: string;
    isDefault?: boolean;
}

// ─── Wallet ─────────────────────────────────────────────────────────

export interface ApiWallet {
    userId: string;
    coinBalance: number;
    cashBalance: number;
    totalEarnings: number;
    totalWithdrawals: number;
    updatedAt?: string;
}

export interface ApiTransaction {
    id: string;
    userId: string;
    type:
        | 'TASK_REWARD'
        | 'REFERRAL_BONUS'
        | 'TEAM_INCOME'
        | 'WITHDRAWAL'
        | 'PURCHASE'
        | 'MEMBERSHIP_FEE'
        | 'PARTNER_COMMISSION'
        | 'ADMIN_CREDIT';
    amount: number;
    currency: 'COIN' | 'INR' | 'CASH';
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    description: string;
    relatedUserId?: string;
    taskId?: string;
    taskType?: string;
    level?: number;
    sourceTxnId?: string;
    createdAt: string;
}

// ─── Registration ───────────────────────────────────────────────────

export interface RegisterUserPayload {
    name: string;
    phone?: string;
    state?: string;
    city?: string;
    referralCode?: string;
}

export interface UpdateProfilePayload {
    name?: string;
    phone?: string;
    photoURL?: string;
    state?: string;
    city?: string;
    savedAddresses?: SavedAddress[];
    paymentMethods?: {
        upi?: string | null;
        bank?: {
            accountNo?: string | null;
            ifsc?: string | null;
        } | null;
    };
}

// ─── Products ───────────────────────────────────────────────────

export interface ApiProduct {
    id: string;
    name: string;
    description: string;
    price: number;
    category: string;
    image: string;
    images: string[];
    commission: number;
    coinPrice: number;
    inStock: boolean;
    stock: number;
    badges: string[];
    coinOnly: boolean;
    cashOnly: boolean;
    deliveryDays: number;
    vendor: string;
    status?: string;
    moderationReason?: string | null;
    createdAt: string;
    updatedAt: string;
}

// ─── Catalog ────────────────────────────────────────────────────

export interface ApiCategory {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    image: string | null;
    parentId: string | null;
    sortOrder: number;
    isActive: boolean;
    createdAt: string;
}

export interface ApiBrand {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    sortOrder?: number;
    isActive: boolean;
    createdAt: string;
}

export interface ApiBanner {
    id: string;
    title: string;
    image: string;
    link: string | null;
    linkType: string | null;
    placement: string | null;
    sortOrder: number;
    isActive: boolean;
    startDate: string | null;
    endDate: string | null;
    createdAt: string;
}

// ─── Reviews ────────────────────────────────────────────────────

export interface ApiReview {
    id: string;
    productId: string;
    userId: string;
    orderId: string | null;
    rating: number;
    title: string | null;
    content: string;
    images: string[];
    userName: string;
    userAvatar?: string | null;
    helpful: number;
    verified: boolean;
    status: string;
    createdAt: string;
    updatedAt?: string | null;
}

export interface ApiReviewStats {
    productId: string;
    averageRating: number;
    totalReviews: number;
    ratingDistribution: Record<number, number>;
    updatedAt?: string;
}

// ─── Tasks ──────────────────────────────────────────────────────

export interface ApiTask {
    id: string;
    title: string;
    description: string;
    type: string;
    reward: number;
    rewardType: string;
    frequency: string;
    minDuration?: number | null;
    cooldownHours?: number | null;
    maxCompletionsPerDay?: number | null;
    possibleRewards?: Array<{ amount: number; weight: number; label?: string }> | null;
    questions?: Array<{ text: string; options: string[]; timeLimit?: number }> | null;
    maxCompletions: number | null;
    config: Record<string, any> | null;
    isActive: boolean;
    sortOrder: number;
    startDate: string | null;
    endDate: string | null;
    createdAt: string;
}

export interface ApiTaskCompletion {
    id: string;
    taskId: string;
    taskTitle: string;
    taskType: string;
    reward: number;
    rewardType: string;
    rewardedAmount: number;
    data: Record<string, any> | null;
    completedAt: string;
}

// ─── Wishlists ──────────────────────────────────────────────────

export interface ApiWishlistItem {
    id: string;
    productId: string;
    addedAt: string;
    product: {
        name: string;
        price: number;
        image: string;
        category: string | null;
        inStock: boolean | null;
        coinPrice: number | null;
    };
}

// ─── Settings ───────────────────────────────────────────────────

export interface ApiPublicSettings {
    appName: string;
    maintenanceMode: boolean;
    signupsEnabled: boolean;
    withdrawalsEnabled?: boolean;
    membershipFee: number;
    minWithdrawalAmount: number;
    updatedAt?: string;
}
