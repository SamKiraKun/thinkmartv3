// File: myecom/services/referral.service.ts
/**
 * Legacy referral service wrapper (API/Turso-backed)
 */

import { User } from '@/types/user';
import { fetchReferralEarnings, fetchTeam } from '@/services/referralService';

function toUser(row: any): User {
  return {
    uid: row.uid,
    name: row.name || '',
    email: row.email || '',
    phone: row.phone || undefined,
    city: row.city || undefined,
    state: row.state || undefined,
    role: 'user',
    ownReferralCode: '',
    membershipActive: Boolean(row.membershipActive),
    createdAt: new Date(row.createdAt || Date.now()) as any,
    updatedAt: new Date(row.createdAt || Date.now()) as any,
    isActive: true,
  } as User;
}

export const referralService = {
  async getReferrals(_referralCode: string, _ancestorCode?: string): Promise<User[]> {
    const res = await fetchTeam('self', 1, 100);
    return res.data.map(toUser);
  },

  async calculateReferralEarnings(userId: string): Promise<number> {
    const res = await fetchReferralEarnings(userId, 1, 100);
    return res.data.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  },

  async validateReferralCode(_code: string): Promise<boolean> {
    // No public validation endpoint exists in Turso API yet; preserve safe behavior.
    return false;
  },
};

