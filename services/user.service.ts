// File: services/user.service.ts
/**
 * Legacy user service wrapper (API/Turso-backed where possible)
 */

import { User } from '@/types/user';
import { apiClient } from '@/lib/api/client';

function mapApiUser(api: any): User {
  return {
    uid: api.uid,
    email: api.email,
    name: api.name,
    phone: api.phone || undefined,
    photoURL: api.photoURL || undefined,
    role: api.role,
    state: api.state || undefined,
    city: api.city || undefined,
    ownReferralCode: api.ownReferralCode || '',
    referralCode: api.referralCode || null,
    referredBy: api.referredBy || null,
    uplinePath: api.uplinePath || [],
    referralProcessed: Boolean(api.referralProcessed),
    membershipActive: Boolean(api.membershipActive),
    membershipDate: api.membershipDate ? (new Date(api.membershipDate) as any) : undefined,
    createdAt: new Date(api.createdAt || Date.now()) as any,
    updatedAt: new Date(api.updatedAt || Date.now()) as any,
    isActive: Boolean(api.isActive ?? true),
    isBanned: Boolean(api.isBanned ?? false),
    kycStatus: api.kycStatus,
    kycData: api.kycData || undefined,
    savedAddresses: api.savedAddresses || [],
    paymentMethods: api.paymentMethods || undefined,
  } as User;
}

export const userService = {
  async getUser(_userId: string): Promise<User | null> {
    try {
      const res = await apiClient.get<{ data: any }>('/api/users/me');
      return mapApiUser(res.data);
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 401) return null;
      throw error;
    }
  },

  async getUserByEmail(_email: string): Promise<User | null> {
    // No admin lookup endpoint parity yet.
    return null;
  },

  async updateUser(userId: string, data: Partial<User>): Promise<void> {
    await apiClient.patch(`/api/users/${userId}`, {
      ...data,
      membershipDate: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    });
  },

  async getUsersByRole(_role: string): Promise<User[]> {
    // No admin list users endpoint parity yet.
    return [];
  },

  async getUserReferrals(_referralCode: string): Promise<User[]> {
    // No public lookup endpoint parity yet.
    return [];
  },
};

