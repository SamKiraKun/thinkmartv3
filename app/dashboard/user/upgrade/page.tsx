// File: ThinkMart/app/dashboard/user/upgrade/page.tsx
'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/auth.store';
import { purchaseMembership } from '@/services/membershipService';
import { Button } from '@/components/ui/Button';
import { ShieldCheck, Users, TrendingUp, Lock, Loader2 } from 'lucide-react';

export default function UpgradePage() {
  const { user, profile } = useAuth();
  const { setProfile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [notice, setNotice] = useState('');

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const handleUpgrade = async () => {
    if (!user) return;
    setNotice('');
    setLoading(true);

    try {
      await purchaseMembership();
      if (profile) {
        setProfile({ ...profile, membershipActive: true });
      }
      setSuccess(true);
    } catch (error) {
      console.error('Upgrade failed:', error);
      setNotice(getErrorMessage(error, 'Upgrade failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (success || profile?.membershipActive) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="bg-green-100 p-6 rounded-full mb-6 animate-bounce">
          <ShieldCheck className="w-16 h-16 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Membership Active!</h1>
        <p className="text-gray-600 max-w-md mb-8">
          Congratulations! You are now a Premium Member. Your team income is unlocked, and you are earning from 6 levels deep.
        </p>
        <Button href="/dashboard/user" className="px-8">
          Go to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-8">
      {notice && (
        <div className="p-4 rounded-xl border bg-red-50 border-red-200 text-red-700 text-sm font-medium">
          {notice}
        </div>
      )}

      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Upgrade to Premium</h1>
        <p className="text-gray-600 mt-2">Unlock Team Income and maximize your earnings</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 items-center">
        <div className="space-y-6">
          <BenefitItem
            icon={<Users className="w-6 h-6 text-blue-600" />}
            color="bg-blue-100"
            title="6-Level Team Income"
            desc="Earn commissions from your direct referrals and their network down to 6 levels."
          />
          <BenefitItem
            icon={<TrendingUp className="w-6 h-6 text-purple-600" />}
            color="bg-purple-100"
            title="Passive Earnings"
            desc="Earn while you sleep. Every time your team completes tasks, you get paid."
          />
          <BenefitItem
            icon={<ShieldCheck className="w-6 h-6 text-orange-600" />}
            color="bg-orange-100"
            title="Priority Support"
            desc="Get faster responses for withdrawal requests and support queries."
          />
        </div>

        <div className="bg-white border rounded-2xl shadow-xl p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
            RECOMMENDED
          </div>

          <div className="text-center mb-8">
            <span className="text-5xl font-extrabold text-gray-900">₹1,000</span>
            <span className="text-gray-500 ml-2">/ one-time</span>
          </div>

          <ul className="space-y-3 mb-8 text-sm text-gray-600">
            <li className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-green-500" /> Lifetime Validity
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-green-500" /> Instant Activation
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-green-500" /> Secure Payment
            </li>
          </ul>

          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full h-12 text-lg bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="animate-spin mr-2" /> : <Lock size={18} className="mr-2" />}
            {loading ? 'Processing...' : 'Pay ₹1,000 & Unlock'}
          </button>

          <p className="text-xs text-center text-gray-400 mt-4">
            By proceeding, you agree to our Terms of Service.
          </p>
        </div>
      </div>
    </div>
  );
}

function BenefitItem({
  icon,
  color,
  title,
  desc,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-4">
      <div className={`${color} p-3 rounded-lg h-fit`}>
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-lg">{title}</h3>
        <p className="text-gray-600 text-sm">{desc}</p>
      </div>
    </div>
  );
}
