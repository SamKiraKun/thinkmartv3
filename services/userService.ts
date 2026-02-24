// File: services/userService.ts
/**
 * User Service (API/Turso-backed)
 */

import { apiClient, ApiError } from '@/lib/api/client';
import type { UserProfile } from '@/types/user';
import type { ApiUserProfile, RegisterUserPayload, UpdateProfilePayload } from '@/lib/api/types';

export function subscribeToUserProfile(
    _uid: string,
    onData: (profile: UserProfile | null) => void,
    onError?: (error: Error) => void
): () => void {
    let cancelled = false;

    void apiClient
        .get<{ data: ApiUserProfile }>('/api/users/me')
        .then((res) => {
            if (!cancelled) onData(apiProfileToUserProfile(res.data));
        })
        .catch((err) => {
            if (cancelled) return;
            if (err instanceof ApiError && err.statusCode === 404) {
                onData(null);
                return;
            }
            onError?.(err instanceof Error ? err : new Error(String(err)));
        });

    return () => {
        cancelled = true;
    };
}

export async function registerUserProfile(
    _uid: string,
    data: {
        name: string;
        email: string;
        phone: string;
        state: string;
        city: string;
        referralCode?: string;
        role: string;
        ownReferralCode: string;
        orgConfig?: Record<string, any>;
        vendorConfig?: Record<string, any>;
    }
): Promise<void> {
    const payload: RegisterUserPayload = {
        name: data.name,
        phone: data.phone || undefined,
        state: data.state || undefined,
        city: data.city || undefined,
        referralCode: data.referralCode || undefined,
    };
    await apiClient.post('/api/users/register', payload);
}

export async function updateUserProfile(
    uid: string,
    updates: UpdateProfilePayload
): Promise<void> {
    await apiClient.patch(`/api/users/${uid}`, updates);
}

export interface ProfileUpdates {
    name?: string;
    phone?: string;
    photoURL?: string;
    state?: string;
    city?: string;
}

export async function updateProfile(updates: ProfileUpdates): Promise<void> {
    await apiClient.patch('/api/users/me/profile', updates);
}

export interface KycSubmission {
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
}

export async function submitKyc(data: KycSubmission): Promise<void> {
    await apiClient.post('/api/users/me/kyc', data);
}

function apiProfileToUserProfile(api: ApiUserProfile): UserProfile {
    return {
        uid: api.uid,
        email: api.email,
        name: api.name,
        phone: api.phone ?? undefined,
        photoURL: api.photoURL ?? undefined,
        role: api.role as any,
        state: api.state ?? undefined,
        city: api.city ?? undefined,
        ownReferralCode: api.ownReferralCode,
        referralCode: api.referralCode,
        referredBy: api.referredBy,
        uplinePath: api.uplinePath,
        referralProcessed: api.referralProcessed,
        membershipActive: api.membershipActive,
        membershipDate: api.membershipDate ? (new Date(api.membershipDate) as any) : undefined,
        createdAt: new Date(api.createdAt) as any,
        updatedAt: new Date(api.updatedAt) as any,
        isActive: api.isActive,
        isBanned: api.isBanned,
        kycStatus: api.kycStatus,
        kycData: api.kycData ?? undefined,
        savedAddresses: api.savedAddresses ?? [],
        paymentMethods: api.paymentMethods ?? undefined,
        partnerConfig: api.partnerConfig ?? undefined,
        vendorConfig: api.vendorConfig ?? undefined,
        orgConfig: api.orgConfig ?? undefined,
        subAdminPermissions: api.subAdminPermissions ?? undefined,
    } as UserProfile;
}
