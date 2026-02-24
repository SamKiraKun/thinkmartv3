// File: services/adminService.ts
/**
 * Admin Dashboard Service (API-only, no Firestore fallback)
 * 
 * Admin reads are new functionality that doesn't have a Firestore equivalent,
 * so this service always uses the API. Feature flag controls whether
 * the admin dashboard is accessible at all.
 */

import { apiClient, type PaginatedResponse } from '@/lib/api/client';

// ─── Types ──────────────────────────────────────────────────────

export interface PlatformStats {
    users: { total: number; activeMembers: number; banned: number };
    orders: { total: number; pending: number; delivered: number; totalRevenue: number };
    transactions: { totalValue: number };
    wallets: { totalCoinsInCirculation: number; totalCashInWallets: number };
    withdrawals: { total: number; pending: number; totalPaid: number };
    products: { total: number };
}

export interface AdminUser {
    id?: string;
    uid: string;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    state: string | null;
    city: string | null;
    membershipActive: boolean;
    isActive: boolean;
    isBanned: boolean;
    kycStatus: string;
    ownReferralCode: string;
    referredBy: string | null;
    partnerConfig?: {
        assignedCity: string;
        commissionPercentage: number;
        assignedAt?: string;
        assignedBy?: string;
    } | null;
    createdAt: string;
    updatedAt: string;
}

export interface AdminWithdrawal {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    userPhone?: string | null;
    userCity?: string | null;
    amount: number;
    method: string;
    status: string;
    bankDetails: any;
    upiId: string | null;
    rejectionReason: string | null;
    adminNotes: string | null;
    requestedAt: string;
    processedAt: string | null;
    processedBy: string | null;
}

export interface AdminUserDetail {
    uid: string;
    name: string;
    email: string;
    phone?: string | null;
    role?: string;
    city?: string | null;
    state?: string | null;
    kycStatus?: string;
    wallet?: {
        cashBalance: number;
        coinBalance: number;
    };
    withdrawalCount?: number;
}

export interface AdminOrder {
    id: string;
    userId: string;
    userEmail: string;
    userName: string;
    vendorId?: string;
    items: any[];
    subtotal: number;
    cashPaid: number;
    status: string;
    city: string;
    createdAt: string;
    updatedAt: string;
}

export interface AdminVendor {
    id: string;
    businessName: string;
    ownerName: string;
    email: string;
    phone?: string;
    city?: string;
    status: string;
    productCount: number;
    createdAt: string;
}

export interface AdminKycRequest {
    userId: string;
    userName: string;
    userEmail: string;
    userPhone?: string | null;
    userCity?: string | null;
    status: 'pending' | 'verified' | 'rejected' | string;
    submittedAt?: string | null;
    kycData?: Record<string, any> | null;
    idDocumentUrl?: string | null;
    addressProofUrl?: string | null;
    rejectionReason?: string | null;
}

export interface AdminModerationProduct {
    id: string;
    name: string;
    price: number;
    vendorId: string;
    vendorName?: string | null;
    category: string;
    status: 'pending' | 'approved' | 'rejected' | 'suspended' | string;
    stock: number;
    createdAt: string;
    rejectionReason?: string | null;
}

export interface AdminTaskItem {
    id: string;
    title: string;
    description: string;
    type: string;
    rewardAmount: number;
    rewardType: 'coins' | 'cash' | string;
    duration?: number | null;
    minDuration?: number | null;
    url?: string | null;
    youtubeId?: string | null;
    videoUrl?: string | null;
    isActive: boolean;
    isArchived: boolean;
    dailyLimit?: number | null;
    totalCompletions: number;
    priority: number;
    createdAt: string;
    questions?: Array<{ text: string; options: string[]; timeLimit?: number }> | null;
}

export interface AdminRevenueSummary {
    range: 'day' | 'week' | 'month' | string;
    grossRevenue: number;
    withdrawalsProcessed: number;
    commissionsEarned: number;
    netRevenue: number;
    orderCount: number;
    membershipRevenue: number;
}

export interface AdminCitySummary {
    city: string;
    userCount: number;
    orderCount: number;
    revenue: number;
    partnerPayout: number;
}

export interface AdminCommissionLog {
    id: string;
    type: 'partner' | 'organization' | 'referral' | string;
    recipientId: string;
    recipientName?: string | null;
    sourceUserId?: string | null;
    sourceUserName?: string | null;
    amount: number;
    percentage: number;
    sourceTransaction?: string | null;
    city?: string | null;
    createdAt: string;
}

export interface AdminAuditLogEntry {
    id: string;
    action: string;
    actorId: string;
    actorName?: string | null;
    targetId: string;
    targetType: string;
    metadata?: Record<string, any> | null;
    createdAt: string;
}

export interface AdminAuditLogStats {
    totalLogs: number;
    logsToday: number;
    topActions: Array<{ action: string; count: number }>;
    topActors: Array<{ actorId: string; actorName?: string | null; count: number }>;
}

export interface AdminFeatureFlag {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    targetRoles?: string[];
    targetCities?: string[];
    rolloutPercentage?: number;
    createdAt: string;
    updatedAt?: string;
    updatedBy?: string;
}

export interface AdminPartnerListItem {
    id: string;
    name: string;
    email: string;
    phone?: string;
    assignedCity: string;
    assignedCities?: string[];
    commissionPercentage: number;
    commissionPercentages?: Record<string, number>;
    totalEarnings: number;
    withdrawableBalance: number;
    status: string;
    createdAt: string;
    partnerConfig?: {
        assignedCity?: string;
        commissionPercentage?: number;
        assignedCities?: string[];
        commissionPercentages?: Record<string, number>;
        status?: string;
    } | null;
}

export interface AdminOrganizationListItem {
    id: string;
    orgName: string;
    orgType: string;
    ownerName: string;
    email: string;
    referralCode: string;
    memberCount: number;
    totalCommissions: number;
    commissionPercentage?: number;
    status: string;
    createdAt: string;
    orgConfig?: Record<string, any> | null;
}

export interface AdminTransaction {
    id: string;
    userId: string | null;
    userName: string | null;
    fromUid: string | null;
    fromName: string | null;
    toUid: string | null;
    toName: string | null;
    amount: number;
    coinAmount: number;
    type: string;
    category: string;
    description: string;
    referenceId: string | null;
    timestampMs: number;
}

export interface AdminSettings {
    minWithdrawalAmount: number;
    maxWithdrawalAmount: number;
    dailyWithdrawalLimit: number;
    withdrawalFeePercent: number;
    referralBonusAmount: number;
    referralCommissionPercent: number;
    orgCommissionPercent: number;
    partnerCommissionPercent: number;
    dailyTaskLimit: number;
    taskCooldownMinutes: number;
    dailySpinLimit: number;
    dailyLuckyBoxLimit: number;
    maintenanceMode: boolean;
    signupsEnabled: boolean;
    withdrawalsEnabled: boolean;
    updatedAt?: string;
    updatedBy?: string;
}

export interface AdminGamePrize {
    id: string;
    label: string;
    value: number;
    probability: number;
    color?: string;
}

export interface AdminGameConfig {
    id: string;
    type: 'spin_wheel' | 'lucky_box';
    name: string;
    enabled: boolean;
    dailyLimit: number;
    cooldownMinutes: number;
    prizes: AdminGamePrize[];
    updatedAt?: string;
    updatedBy?: string;
}

// ─── API Calls ──────────────────────────────────────────────────

export async function fetchPlatformStats(): Promise<PlatformStats> {
    const res = await apiClient.get<{ data: PlatformStats }>('/api/admin/stats');
    return res.data;
}

export async function fetchAdminRevenueSummary(
    range: 'day' | 'week' | 'month'
): Promise<AdminRevenueSummary> {
    const res = await apiClient.get<{ data: AdminRevenueSummary }>(
        `/api/admin/analytics/revenue-summary?range=${encodeURIComponent(range)}`
    );
    return res.data;
}

export async function fetchAdminCitySummary(): Promise<AdminCitySummary[]> {
    const res = await apiClient.get<{ data: AdminCitySummary[] }>('/api/admin/analytics/city-summary');
    return res.data || [];
}

export async function fetchAdminCommissionLogs(
    page = 1,
    limit = 50,
    filters?: {
        type?: string;
        city?: string;
        recipientId?: string;
        fromDate?: string;
        toDate?: string;
    }
): Promise<PaginatedResponse<AdminCommissionLog>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters?.type) params.set('type', filters.type);
    if (filters?.city) params.set('city', filters.city);
    if (filters?.recipientId) params.set('recipientId', filters.recipientId);
    if (filters?.fromDate) params.set('fromDate', filters.fromDate);
    if (filters?.toDate) params.set('toDate', filters.toDate);
    return apiClient.get<PaginatedResponse<AdminCommissionLog>>(`/api/admin/commission-logs?${params.toString()}`);
}

export async function fetchAdminAuditLogs(
    page = 1,
    limit = 50,
    filters?: { action?: string; targetType?: string; fromDate?: string; toDate?: string }
): Promise<PaginatedResponse<AdminAuditLogEntry>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters?.action) params.set('action', filters.action);
    if (filters?.targetType) params.set('targetType', filters.targetType);
    if (filters?.fromDate) params.set('fromDate', filters.fromDate);
    if (filters?.toDate) params.set('toDate', filters.toDate);
    return apiClient.get<PaginatedResponse<AdminAuditLogEntry>>(`/api/admin/audit-logs?${params.toString()}`);
}

export async function fetchAdminAuditLogStats(): Promise<AdminAuditLogStats> {
    const res = await apiClient.get<{ data: AdminAuditLogStats }>('/api/admin/audit-logs/stats');
    return res.data;
}

export async function fetchAdminAuditActionTypes(): Promise<string[]> {
    const res = await apiClient.get<{ data: { actions: string[] } }>('/api/admin/audit-logs/action-types');
    return res.data?.actions || [];
}

export async function fetchAdminFeatureFlags(): Promise<AdminFeatureFlag[]> {
    const res = await apiClient.get<{ data: { flags: AdminFeatureFlag[] } }>('/api/admin/feature-flags');
    return res.data?.flags || [];
}

export async function createAdminFeatureFlag(
    input: Omit<AdminFeatureFlag, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'> & { name: string; requestId?: string }
): Promise<void> {
    await apiClient.post(
        '/api/admin/feature-flags',
        input,
        input.requestId ? { idempotencyKey: input.requestId } : undefined
    );
}

export async function updateAdminFeatureFlag(
    flagId: string,
    patch: Partial<Pick<AdminFeatureFlag, 'description' | 'enabled' | 'targetRoles' | 'targetCities' | 'rolloutPercentage'>> & { requestId?: string }
): Promise<void> {
    const { requestId, ...body } = patch as any;
    await apiClient.patch(
        `/api/admin/feature-flags/${flagId}`,
        body,
        requestId ? { idempotencyKey: requestId } : undefined
    );
}

export async function deleteAdminFeatureFlag(flagId: string, requestId?: string): Promise<void> {
    await apiClient.delete(
        `/api/admin/feature-flags/${flagId}`,
        requestId ? { idempotencyKey: requestId } : undefined
    );
}

export async function fetchAdminUsers(
    page = 1,
    limit = 20,
    filters?: { search?: string; role?: string; membership?: string; city?: string; kycStatus?: string }
): Promise<PaginatedResponse<AdminUser>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters?.search) params.set('search', filters.search);
    if (filters?.role) params.set('role', filters.role);
    if (filters?.membership) params.set('membership', filters.membership);
    if (filters?.city) params.set('city', filters.city);
    if (filters?.kycStatus) params.set('kycStatus', filters.kycStatus);
    return apiClient.get<PaginatedResponse<AdminUser>>(`/api/admin/users?${params.toString()}`);
}

export async function fetchAdminWithdrawals(
    page = 1,
    limit = 20,
    status?: string,
    filters?: { city?: string; minAmount?: number; maxAmount?: number }
): Promise<PaginatedResponse<AdminWithdrawal>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.set('status', status);
    if (filters?.city) params.set('city', filters.city);
    if (typeof filters?.minAmount === 'number') params.set('minAmount', String(filters.minAmount));
    if (typeof filters?.maxAmount === 'number') params.set('maxAmount', String(filters.maxAmount));
    return apiClient.get<PaginatedResponse<AdminWithdrawal>>(`/api/admin/withdrawals?${params.toString()}`);
}

export async function fetchAdminOrders(
    page = 1,
    limit = 20,
    filters?: { status?: string; city?: string; fromDate?: string; toDate?: string }
): Promise<PaginatedResponse<AdminOrder>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters?.status) params.set('status', filters.status);
    if (filters?.city) params.set('city', filters.city);
    if (filters?.fromDate) params.set('fromDate', filters.fromDate);
    if (filters?.toDate) params.set('toDate', filters.toDate);
    return apiClient.get<PaginatedResponse<AdminOrder>>(`/api/admin/orders?${params.toString()}`);
}

export async function fetchAdminKycRequests(
    page = 1,
    limit = 30,
    status?: 'pending' | 'verified' | 'rejected'
): Promise<PaginatedResponse<AdminKycRequest>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.set('status', status);
    return apiClient.get<PaginatedResponse<AdminKycRequest>>(`/api/admin/kyc/requests?${params.toString()}`);
}

export async function approveAdminKyc(userId: string, requestId?: string): Promise<void> {
    await apiClient.post(
        `/api/admin/kyc/${userId}/approve`,
        {},
        requestId ? { idempotencyKey: requestId } : undefined
    );
}

export async function rejectAdminKyc(userId: string, reason: string, requestId?: string): Promise<void> {
    await apiClient.post(
        `/api/admin/kyc/${userId}/reject`,
        { reason },
        requestId ? { idempotencyKey: requestId } : undefined
    );
}

export async function fetchAdminProductsForModeration(
    page = 1,
    limit = 20,
    status?: 'pending' | 'approved' | 'rejected' | 'suspended'
): Promise<PaginatedResponse<AdminModerationProduct>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.set('status', status);
    return apiClient.get<PaginatedResponse<AdminModerationProduct>>(`/api/admin/products/moderation?${params.toString()}`);
}

export async function fetchAdminTasks(
    page = 1,
    limit = 20,
    filters?: { type?: string; status?: string; search?: string }
): Promise<PaginatedResponse<AdminTaskItem>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters?.type) params.set('type', filters.type);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.search) params.set('search', filters.search);
    return apiClient.get<PaginatedResponse<AdminTaskItem>>(`/api/admin/tasks?${params.toString()}`);
}

export async function createAdminTask(input: {
    title: string;
    description?: string;
    rewardAmount?: number;
    rewardType?: 'coins' | 'cash' | 'COIN' | 'CASH';
    type: string;
    isActive?: boolean;
    questions?: Array<{ text: string; options: string[]; timeLimit?: number }>;
    minDuration?: number;
    duration?: number;
    videoUrl?: string;
    youtubeId?: string;
    url?: string;
    dailyLimit?: number;
    frequency?: string;
    requestId?: string;
}): Promise<{ id: string }> {
    const res = await apiClient.post<{ data: { id: string } }>(
        '/api/admin/tasks',
        input,
        input.requestId ? { idempotencyKey: input.requestId } : undefined
    );
    return res.data;
}

export async function updateAdminTask(
    taskId: string,
    patch: Partial<{
        title: string;
        description: string;
        isActive: boolean;
        rewardAmount: number;
        rewardType: 'coins' | 'cash' | 'COIN' | 'CASH';
        minDuration: number | null;
        duration: number | null;
        dailyLimit: number | null;
        questions: Array<{ text: string; options: string[]; timeLimit?: number }> | null;
        url: string | null;
        videoUrl: string | null;
        youtubeId: string | null;
    }>
): Promise<void> {
    await apiClient.patch(`/api/admin/tasks/${taskId}`, patch);
}

export async function archiveAdminTask(taskId: string, requestId?: string): Promise<void> {
    await apiClient.post(
        `/api/admin/tasks/${taskId}/archive`,
        {},
        requestId ? { idempotencyKey: requestId } : undefined
    );
}

export async function approveAdminProduct(productId: string, requestId?: string): Promise<void> {
    await apiClient.post(
        `/api/admin/products/${productId}/approve`,
        {},
        requestId ? { idempotencyKey: requestId } : undefined
    );
}

export async function rejectAdminProduct(productId: string, reason: string, requestId?: string): Promise<void> {
    await apiClient.post(
        `/api/admin/products/${productId}/reject`,
        { reason },
        requestId ? { idempotencyKey: requestId } : undefined
    );
}

export async function fetchAdminUserDetail(uid: string): Promise<AdminUserDetail> {
    const res = await apiClient.get<{ data: AdminUserDetail }>(`/api/admin/users/${uid}`);
    return res.data;
}

export async function updateAdminUserStatus(
    uid: string,
    status: 'active' | 'banned',
    reason?: string
): Promise<void> {
    await apiClient.patch(`/api/admin/users/${uid}/status`, { status, reason });
}

export async function updateAdminUserRole(uid: string, role: string): Promise<void> {
    await apiClient.patch(`/api/admin/users/${uid}/role`, { role });
}

export async function updateAdminPartnerConfig(
    uid: string,
    input: {
        assignedCity?: string;
        commissionPercentage?: number;
        assignedCities?: string[];
        commissionPercentages?: Record<string, number>;
        status?: 'active' | 'suspended' | 'pending' | string;
    }
): Promise<void> {
    await apiClient.patch(`/api/admin/users/${uid}/partner-config`, input);
}

export async function updateAdminOrgConfig(
    uid: string,
    input: { commissionPercentage?: number; status?: 'active' | 'suspended' | 'pending' | string; orgName?: string; orgType?: string }
): Promise<void> {
    await apiClient.patch(`/api/admin/users/${uid}/org-config`, input);
}

export async function fetchAdminPartnersPageLike(page = 1, pageSize = 20): Promise<{
    partners: AdminPartnerListItem[];
    nextCursor: { page: number } | null;
    hasMore: boolean;
}> {
    const res = await apiClient.get<{ data: { partners: AdminPartnerListItem[]; nextCursor: { page: number } | null; hasMore: boolean } }>(
        `/api/admin/partners/page?page=${page}&pageSize=${pageSize}`
    );
    return res.data;
}

export async function fetchAdminOrganizationsPageLike(page = 1, pageSize = 20): Promise<{
    organizations: AdminOrganizationListItem[];
    nextCursor: { page: number } | null;
    hasMore: boolean;
}> {
    const res = await apiClient.get<{ data: { organizations: AdminOrganizationListItem[]; nextCursor: { page: number } | null; hasMore: boolean } }>(
        `/api/admin/organizations/page?page=${page}&pageSize=${pageSize}`
    );
    return res.data;
}

export async function adjustAdminUserWallet(
    uid: string,
    input: {
        deltaAmount: number;
        currency: 'CASH' | 'COIN';
        reason: string;
        referenceId?: string;
        requestId?: string;
    }
): Promise<void> {
    await apiClient.post(
        `/api/admin/users/${uid}/wallet-adjust`,
        {
            deltaAmount: input.deltaAmount,
            currency: input.currency,
            reason: input.reason,
            referenceId: input.referenceId,
        },
        input.requestId ? { idempotencyKey: input.requestId } : undefined
    );
}

export async function fetchAdminVendors(
    page = 1,
    limit = 20,
    status?: string
): Promise<PaginatedResponse<AdminVendor>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.set('status', status);
    return apiClient.get<PaginatedResponse<AdminVendor>>(`/api/admin/vendors?${params.toString()}`);
}

export async function verifyAdminVendor(vendorId: string, note?: string): Promise<void> {
    await apiClient.post(`/api/admin/vendors/${vendorId}/verify`, { note });
}

export async function suspendAdminVendor(vendorId: string, reason: string): Promise<void> {
    await apiClient.post(`/api/admin/vendors/${vendorId}/suspend`, { reason });
}

export async function fetchAdminTransactions(
    page = 1,
    limit = 20,
    filters?: { category?: string; search?: string }
): Promise<PaginatedResponse<AdminTransaction>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters?.category) params.set('category', filters.category);
    if (filters?.search) params.set('search', filters.search);
    return apiClient.get<PaginatedResponse<AdminTransaction>>(`/api/admin/transactions?${params.toString()}`);
}

export async function fetchAdminSettings(): Promise<AdminSettings> {
    const res = await apiClient.get<{ data: AdminSettings }>('/api/admin/settings');
    return res.data || (res as any);
}

export async function updateAdminSettings(settings: Partial<AdminSettings>): Promise<void> {
    await apiClient.put('/api/admin/settings', settings);
}

export async function fetchAdminGameConfigs(): Promise<AdminGameConfig[]> {
    const res = await apiClient.get<{ data: AdminGameConfig[] }>('/api/admin/games');
    return res.data || (res as any);
}

export async function updateAdminGameConfig(config: Partial<AdminGameConfig>): Promise<void> {
    await apiClient.put(`/api/admin/games/${config.id}`, config);
}

export async function updateAdminWithdrawalStatus(
    id: string,
    status: 'completed' | 'rejected',
    rejectionReason?: string,
    adminNotes?: string
): Promise<void> {
    await apiClient.patch(`/api/admin/withdrawals/${id}/status`, {
        status,
        rejectionReason,
        adminNotes
    });
}
