// File: ThinkMart/app/dashboard/partner/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fetchPartnerDashboardStats } from '@/services/partnerService';
import {
  Users, TrendingUp, MapPin, Loader2, Wallet, ArrowDownLeft,
  Building, Percent, Activity, Package
} from 'lucide-react';
import Link from 'next/link';

interface DashboardData {
  partnerId: string;
  partnerName: string;
  assignedCity: string | null;
  commissionPercentage: number;
  totalStats: {
    totalUsers: number;
    activeUsers7d: number;
    totalWithdrawals: number;
    totalCommissionEarned: number;
    walletBalance: number;
    totalEarnings: number;
  };
}

export default function PartnerDashboard() {
  const { profile } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(await fetchPartnerDashboardStats());
    } catch (err) {
      console.error('Partner Stats Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile?.role === 'partner') {
      fetchStats();
    }
  }, [fetchStats, profile?.role]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={fetchStats}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const stats = data?.totalStats || {
    totalUsers: 0,
    activeUsers7d: 0,
    totalWithdrawals: 0,
    totalCommissionEarned: 0,
    walletBalance: 0,
    totalEarnings: 0
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Partner Dashboard</h1>
          <div className="flex items-center gap-4 mt-2">
            <p className="text-gray-500 flex items-center gap-2">
              <MapPin size={16} className="text-indigo-600" />
              {data?.assignedCity ? (
                <span>
                  Territory: <span className="font-semibold text-gray-900">{data.assignedCity}</span>
                </span>
              ) : (
                <span className="text-amber-600">No city assigned yet</span>
              )}
            </p>
            {data?.commissionPercentage ? (
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-bold flex items-center gap-1">
                <Percent size={14} /> {data.commissionPercentage}% Commission
              </span>
            ) : null}
          </div>
        </div>
        <button
          onClick={fetchStats}
          className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition flex items-center gap-2"
        >
          <Activity size={18} /> Refresh Data
        </button>
      </div>

      {/* No City Assigned Warning */}
      {!data?.assignedCity && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <Building size={48} className="mx-auto text-amber-400 mb-3" />
          <h2 className="text-xl font-bold text-amber-800">No City Assigned</h2>
          <p className="text-amber-600 mt-2">
            Please contact the admin to get a city assigned to your partner account.
          </p>
        </div>
      )}

      {/* Main Stats Grid */}
      {data?.assignedCity && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              title="Wallet Balance"
              value={`₹${(stats.walletBalance || 0).toLocaleString('en-IN')}`}
              icon={Wallet}
              color="bg-green-500"
              subtitle="Available to withdraw"
            />
            <StatCard
              title="Total Earnings"
              value={`₹${(stats.totalEarnings || 0).toLocaleString('en-IN')}`}
              icon={TrendingUp}
              color="bg-purple-500"
              subtitle="All-time commission"
            />
            <StatCard
              title="City Users"
              value={stats.totalUsers || 0}
              icon={Users}
              color="bg-blue-500"
              subtitle={`${stats.activeUsers7d || 0} active this week`}
            />
            <StatCard
              title="City Withdrawals"
              value={`₹${(stats.totalWithdrawals || 0).toLocaleString('en-IN')}`}
              icon={ArrowDownLeft}
              color="bg-amber-500"
              subtitle="Total approved"
            />
          </div>

          {/* Quick Links */}
          <div className="grid md:grid-cols-4 gap-4">
            <Link
              href="/dashboard/partner/products"
              className="p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-100 hover:shadow-md transition group"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition">
                  <Package size={24} className="text-purple-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">My Products</h3>
                  <p className="text-sm text-gray-500">Manage your store</p>
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/partner/users"
              className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 hover:shadow-md transition group"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition">
                  <Users size={24} className="text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">City Users</h3>
                  <p className="text-sm text-gray-500">View users in {data.assignedCity}</p>
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/partner/earnings"
              className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-100 hover:shadow-md transition group"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg group-hover:bg-green-200 transition">
                  <TrendingUp size={24} className="text-green-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Commission History</h3>
                  <p className="text-sm text-gray-500">Detailed earnings breakdown</p>
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/partner/withdrawals"
              className="p-6 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-100 hover:shadow-md transition group"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-100 rounded-lg group-hover:bg-amber-200 transition">
                  <ArrowDownLeft size={24} className="text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Withdraw Funds</h3>
                  <p className="text-sm text-gray-500">Request commission payout</p>
                </div>
              </div>
            </Link>
          </div>
        </>
      )}

      {/* Info Banner */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6">
        <h3 className="font-bold text-indigo-900 mb-2 flex items-center gap-2">
          <Percent size={18} /> Commission Structure
        </h3>
        <p className="text-sm text-indigo-700">
          You earn <strong>{data?.commissionPercentage || 0}%</strong> of the 20% commission pool on every
          approved withdrawal from users in <strong>{data?.assignedCity || 'your city'}</strong>.
          Commissions are credited automatically and can be withdrawn at any time.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-xl text-white ${color}`}>
          <Icon size={24} />
        </div>
      </div>
      <p className="text-gray-500 text-sm font-medium">{title}</p>
      <h3 className="text-2xl font-bold text-gray-900 mt-1">{value}</h3>
      {subtitle && (
        <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
      )}
    </div>
  );
}
