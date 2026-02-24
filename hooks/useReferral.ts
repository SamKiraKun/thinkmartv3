// File: ThinkMart/hooks/useReferral.ts
import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { UserProfile } from '@/types/user';
import { fetchTeam, fetchReferralEarnings } from '@/services/referralService';

export function useReferral() {
  const { user, profile } = useAuth();
  const [referrals, setReferrals] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [referralEarnings, setReferralEarnings] = useState(0);

  useEffect(() => {
    // Wait until user AND profile (specifically ownReferralCode) are loaded
    if (!user || !profile?.ownReferralCode) {
        if (!user) setLoading(false); // Stop loading if no user
        return;
    }

    const fetchReferrals = async () => {
      setLoading(true);
      try {
        const [teamRes, earningsRes] = await Promise.all([
          fetchTeam(user.uid, 1, 100),
          fetchReferralEarnings(user.uid, 1, 200),
        ]);

        const refList = teamRes.data.map((member) => ({
          uid: member.uid,
          name: member.name,
          email: member.email,
          phone: member.phone ?? undefined,
          city: member.city ?? undefined,
          state: member.state ?? undefined,
          membershipActive: member.membershipActive,
          role: 'user',
          ownReferralCode: '',
          createdAt: new Date(member.createdAt) as any,
          updatedAt: new Date(member.createdAt) as any,
          isActive: true,
        })) as UserProfile[];
        setReferrals(refList);

        let total = 0;
        earningsRes.data.forEach((entry) => {
          total += Number(entry.amount) || 0;
        });
        setReferralEarnings(total);

      } catch (error) {
        console.error("Error fetching referrals:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReferrals();
  }, [user, profile?.ownReferralCode]); // Dependency ensures this runs when code is loaded

  return { 
    referrals, 
    referralCode: profile?.ownReferralCode, 
    referralEarnings,
    loading 
  };
}
