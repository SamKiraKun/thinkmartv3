// File: ThinkMart/app/dashboard/user/page.tsx
'use client';

import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import {
  Wallet,
  TrendingUp,
  Users,
  Gift,
  ArrowRight,
  Gamepad2,
  ClipboardList
} from 'lucide-react';
import Link from 'next/link';
import { DailyCheckin } from '@/components/tasks/DailyCheckin';
import { DashboardSkeleton } from '@/components/ui/Skeleton';

export default function UserDashboard() {
  const { profile } = useAuth();
  const { wallet, loading, lifetimeWithdrawn } = useWallet();

  const firstName = profile?.name?.split(' ')[0] || 'User';

  // Show skeleton while loading wallet data
  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-8 pb-10">
      {/* 1. Welcome Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {firstName}! 👋
          </h1>
          <p className="text-gray-500">
            {profile?.membershipActive
              ? "Premium Member 💎 - You are earning max rewards!"
              : "Free Member - Upgrade to unlock 6-level income."}
          </p>
        </div>
        {!profile?.membershipActive && (
          <Link
            href="/dashboard/user/upgrade"
            className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg hover:shadow-xl transition transform hover:-translate-y-0.5"
          >
            Unlock Premium (₹1000)
          </Link>
        )}
      </div>

      {/* 2. Stats Grid (Connected to Wallet Hook) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Cash Balance */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Wallet size={64} className="text-indigo-600" />
          </div>
          <p className="text-gray-500 font-medium text-sm">Total Balance</p>
          <h3 className="text-3xl font-bold text-gray-900 mt-2">
            ₹{loading ? '...' : wallet?.cashBalance.toLocaleString('en-IN') || '0.00'}
          </h3>
          <div className="mt-4 flex gap-2">
            <Link href="/dashboard/user/withdraw" className="text-sm font-bold text-indigo-600 hover:text-indigo-700">
              Withdraw →
            </Link>
          </div>
        </div>

        {/* Coin Balance */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Gamepad2 size={64} className="text-yellow-500" />
          </div>
          <p className="text-gray-500 font-medium text-sm">ThinkCoins</p>
          <h3 className="text-3xl font-bold text-gray-900 mt-2 flex items-center gap-2">
            {loading ? '...' : wallet?.coinBalance.toLocaleString() || '0'}
            <span className="text-sm font-normal text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full">
              🪙
            </span>
          </h3>
          <p className="text-xs text-gray-500 mt-2">
            Can convert to ₹{(wallet?.coinBalance || 0) / 1000}
          </p>
        </div>

        {/* Total Withdrawn (Lifetime) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <TrendingUp size={64} className="text-green-500" />
          </div>
          <p className="text-gray-500 font-medium text-sm">Total Withdrawn</p>
          <h3 className="text-3xl font-bold text-gray-900 mt-2">
            ₹{loading ? '...' : lifetimeWithdrawn.toLocaleString('en-IN')}
          </h3>
          <p className="text-xs text-green-600 font-medium mt-2 flex items-center gap-1">
            <TrendingUp size={12} /> Completed withdrawals
          </p>
        </div>
      </div>

      {/* NEW: Daily Check-in Section */}
      <DailyCheckin />

      {/* KYC Status Card */}
      <div className={`rounded-2xl p-5 border ${profile?.kycStatus === 'verified'
        ? 'bg-green-50 border-green-200'
        : profile?.kycStatus === 'pending'
          ? 'bg-yellow-50 border-yellow-200'
          : 'bg-red-50 border-red-200'
        }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${profile?.kycStatus === 'verified'
              ? 'bg-green-100'
              : profile?.kycStatus === 'pending'
                ? 'bg-yellow-100'
                : 'bg-red-100'
              }`}>
              {profile?.kycStatus === 'verified' ? '✅' : profile?.kycStatus === 'pending' ? '⏳' : '⚠️'}
            </div>
            <div>
              <p className={`font-bold ${profile?.kycStatus === 'verified'
                ? 'text-green-800'
                : profile?.kycStatus === 'pending'
                  ? 'text-yellow-800'
                  : 'text-red-800'
                }`}>
                {profile?.kycStatus === 'verified'
                  ? 'KYC Verified'
                  : profile?.kycStatus === 'pending'
                    ? 'KYC Under Review'
                    : 'Complete Your KYC'}
              </p>
              <p className={`text-sm ${profile?.kycStatus === 'verified'
                ? 'text-green-600'
                : profile?.kycStatus === 'pending'
                  ? 'text-yellow-600'
                  : 'text-red-600'
                }`}>
                {profile?.kycStatus === 'verified'
                  ? 'You can now withdraw funds'
                  : profile?.kycStatus === 'pending'
                    ? 'Your documents are being reviewed'
                    : 'Required for withdrawals'}
              </p>
            </div>
          </div>
          {profile?.kycStatus !== 'verified' && (
            <Link
              href="/dashboard/user/kyc"
              className={`px-4 py-2 rounded-lg font-medium text-sm transition ${profile?.kycStatus === 'pending'
                ? 'bg-yellow-200 text-yellow-800 hover:bg-yellow-300'
                : 'bg-red-600 text-white hover:bg-red-700'
                }`}
            >
              {profile?.kycStatus === 'pending' ? 'View Status' : 'Complete KYC'}
            </Link>
          )}
        </div>
      </div>

      {/* 3. Quick Actions */}
      <h2 className="text-lg font-bold text-gray-900">Start Earning</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* Surveys */}
        <Link href="/dashboard/user/tasks" className="group bg-gradient-to-br from-indigo-500 to-purple-600 p-6 rounded-2xl text-white shadow-md hover:shadow-xl transition">
          <div className="flex justify-between items-start">
            <div className="bg-white/20 p-3 rounded-xl backdrop-blur-sm">
              <ClipboardList size={24} className="text-white" />
            </div>
            <span className="bg-white/20 text-xs font-bold px-2 py-1 rounded backdrop-blur-sm">
              High Reward
            </span>
          </div>
          <h3 className="text-xl font-bold mt-4">Complete Surveys</h3>
          <p className="text-indigo-100 text-sm mt-1 mb-4">Earn up to 500 coins per survey. Takes 2 mins.</p>
          <div className="flex items-center gap-2 text-sm font-bold group-hover:gap-3 transition-all">
            Start Now <ArrowRight size={16} />
          </div>
        </Link>

        {/* Spin Wheel */}
        <Link href="/dashboard/user/spin" className="group bg-white border border-gray-200 p-6 rounded-2xl hover:border-indigo-300 hover:shadow-lg transition">
          <div className="flex justify-between items-start">
            <div className="bg-orange-100 p-3 rounded-xl">
              <Gamepad2 size={24} className="text-orange-600" />
            </div>
          </div>
          <h3 className="text-xl font-bold mt-4 text-gray-900">Spin the Wheel</h3>
          <p className="text-gray-500 text-sm mt-1 mb-4">Try your luck! Win coins every 6 hours.</p>
          <div className="flex items-center gap-2 text-sm font-bold text-orange-600 group-hover:gap-3 transition-all">
            Play Now <ArrowRight size={16} />
          </div>
        </Link>

        {/* Refer */}
        <Link href="/dashboard/user/referrals" className="group bg-white border border-gray-200 p-6 rounded-2xl hover:border-blue-300 hover:shadow-lg transition">
          <div className="flex justify-between items-start">
            <div className="bg-blue-100 p-3 rounded-xl">
              <Users size={24} className="text-blue-600" />
            </div>
          </div>
          <h3 className="text-xl font-bold mt-4 text-gray-900">Refer & Earn</h3>
          <p className="text-gray-500 text-sm mt-1 mb-4">Get 500 coins + 5% commission for every friend.</p>
          <div className="flex items-center gap-2 text-sm font-bold text-blue-600 group-hover:gap-3 transition-all">
            Invite Friends <ArrowRight size={16} />
          </div>
        </Link>
      </div>
    </div>
  );
}