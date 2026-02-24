// File: ThinkMart/app/dashboard/partner/earnings/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fetchPartnerAnalytics, fetchPartnerCommissionHistory } from '@/services/partnerService';
import {
  TrendingUp, Loader2, Calendar, ArrowDownLeft, ShoppingBag,
  RefreshCw, Wallet, Award, BarChart3, Users
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, LineChart, Line
} from 'recharts';

interface CommissionLog {
  id: string;
  city: string;
  sourceType: 'withdrawal' | 'purchase';
  sourceAmount: number;
  commissionPercentage: number;
  commissionAmount: number;
  status: string;
  createdAt: any;
}

interface AnalyticsData {
  earningsChart: { date: string; earnings: number; transactions: number }[];
  userGrowthChart: { date: string; newUsers: number }[];
  topDays: { date: string; earnings: number }[];
  summary: {
    totalEarnings: number;
    totalTransactions: number;
    newUsers: number;
    avgDailyEarnings: number;
  };
}

export default function PartnerEarningsPage() {
  const { profile } = useAuth();
  const [commissions, setCommissions] = useState<CommissionLog[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [activeTab, setActiveTab] = useState<'history' | 'analytics'>('analytics');
  const [days, setDays] = useState(30);
  const [historyPage, setHistoryPage] = useState(1);
  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  useEffect(() => {
    if (profile?.role === 'partner') {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch analytics
      setAnalytics(await fetchPartnerAnalytics(days) as unknown as AnalyticsData);

      // Fetch commission history
      const historyResult = await fetchPartnerCommissionHistory(1, 30);
      setCommissions((historyResult.data || []) as unknown as CommissionLog[]);
      setHasMore(Boolean(historyResult.pagination?.hasNext));
      setHistoryPage(1);
    } catch (err) {
      console.error(getErrorMessage(err, 'Failed to fetch earnings data'));
    } finally {
      setLoading(false);
    }
  };

  const loadMoreHistory = async () => {
    if (commissions.length === 0) return;
    setLoadingMore(true);
    try {
      const nextPage = historyPage + 1;
      const result = await fetchPartnerCommissionHistory(nextPage, 30);
      setCommissions([...commissions, ...((result.data || []) as unknown as CommissionLog[])]);
      setHasMore(Boolean(result.pagination?.hasNext));
      setHistoryPage(nextPage);
    } catch (err) {
      console.error('Failed to load more:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = typeof timestamp === 'string'
      ? new Date(timestamp)
      : timestamp?.seconds
        ? new Date(timestamp.seconds * 1000)
        : null;
    if (!date || Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  const summary = analytics?.summary || {
    totalEarnings: 0,
    totalTransactions: 0,
    newUsers: 0,
    avgDailyEarnings: 0
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="text-green-600" /> Earnings & Analytics
          </h1>
          <p className="text-gray-500 text-sm mt-1">Track your commission earnings and performance</p>
        </div>
        <div className="flex gap-2">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 transition"
          >
            <RefreshCw size={18} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-xl p-5">
          <Wallet size={24} className="mb-2 opacity-80" />
          <p className="text-green-100 text-sm">Total Earnings ({days}d)</p>
          <p className="text-2xl font-bold mt-1">₹{summary.totalEarnings.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl p-5">
          <BarChart3 size={24} className="mb-2 opacity-80" />
          <p className="text-blue-100 text-sm">Transactions</p>
          <p className="text-2xl font-bold mt-1">{summary.totalTransactions}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-pink-600 text-white rounded-xl p-5">
          <Users size={24} className="mb-2 opacity-80" />
          <p className="text-purple-100 text-sm">New Users</p>
          <p className="text-2xl font-bold mt-1">{summary.newUsers}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-xl p-5">
          <Award size={24} className="mb-2 opacity-80" />
          <p className="text-amber-100 text-sm">Avg Daily</p>
          <p className="text-2xl font-bold mt-1">₹{summary.avgDailyEarnings.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition ${activeTab === 'analytics'
            ? 'border-indigo-600 text-indigo-700'
            : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
        >
          📊 Analytics Charts
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition ${activeTab === 'history'
            ? 'border-indigo-600 text-indigo-700'
            : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
        >
          📜 Commission History
        </button>
      </div>

      {/* Analytics Tab */}
      {activeTab === 'analytics' && analytics && (
        <div className="space-y-6">
          {/* Earnings Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-bold text-gray-900 mb-4">Daily Earnings Trend</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.earningsChart}>
                  <defs>
                    <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: any) => [`₹${value}`, 'Earnings']}
                    labelStyle={{ fontWeight: 'bold' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="earnings"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorEarnings)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* User Growth Chart */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-bold text-gray-900 mb-4">User Growth</h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.userGrowthChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="newUsers" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Earning Days */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-bold text-gray-900 mb-4">🏆 Top Earning Days</h3>
              <div className="space-y-3">
                {analytics.topDays.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">No earnings data yet</p>
                ) : (
                  analytics.topDays.map((day, index) => (
                    <div
                      key={day.date}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${index === 0 ? 'bg-yellow-100 text-yellow-700' :
                          index === 1 ? 'bg-gray-200 text-gray-700' :
                            index === 2 ? 'bg-amber-100 text-amber-700' :
                              'bg-gray-100 text-gray-600'
                          }`}>
                          {index + 1}
                        </span>
                        <span className="text-gray-700">{day.date}</span>
                      </div>
                      <span className="font-bold text-green-600">
                        ₹{day.earnings.toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
              <tr>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">City</th>
                <th className="px-6 py-4">Source</th>
                <th className="px-6 py-4">Transaction Amount</th>
                <th className="px-6 py-4">Your %</th>
                <th className="px-6 py-4">Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {commissions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-gray-400">
                    No commission history yet
                  </td>
                </tr>
              ) : (
                commissions.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 text-gray-500 text-xs">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">
                        {log.city}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-1.5">
                        {log.sourceType === 'withdrawal' ? (
                          <><ArrowDownLeft size={14} className="text-amber-500" /> Withdrawal</>
                        ) : (
                          <><ShoppingBag size={14} className="text-blue-500" /> Purchase</>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono">
                      ₹{log.sourceAmount.toLocaleString('en-IN')}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-bold rounded">
                        {log.commissionPercentage}%
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-green-600">
                        +₹{log.commissionAmount.toLocaleString('en-IN')}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Load More */}
          {hasMore && (
            <div className="p-4 border-t border-gray-100 text-center">
              <button
                onClick={loadMoreHistory}
                disabled={loadingMore}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 className="animate-spin inline mr-2" size={16} />
                ) : null}
                Load More
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
