'use client';

import { useState, useEffect } from 'react';
import {
  fetchAdminCitySummary,
  fetchAdminRevenueSummary,
  type AdminCitySummary as CitySummary,
  type AdminRevenueSummary as RevenueSummary,
} from '@/services/adminService';
import {
  BarChart3, TrendingUp, MapPin, Calendar,
  RefreshCw, DollarSign, Wallet, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

type TimeRange = 'day' | 'week' | 'month';

export default function AdminAnalyticsPage() {
  const [range, setRange] = useState<TimeRange>('week');
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [cityStats, setCityStats] = useState<CitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    const getErrorMessage = (error: unknown, fallback: string) =>
      error instanceof Error ? error.message : fallback;
    try {
      const [revenueResult, cityResult] = await Promise.allSettled([
        fetchAdminRevenueSummary(range),
        fetchAdminCitySummary()
      ]);

      const notices: string[] = [];

      if (revenueResult.status === 'fulfilled') {
        setRevenue(revenueResult.value);
      } else {
        console.error("Revenue summary error:", revenueResult.reason);
        setRevenue({
          range,
          grossRevenue: 0,
          withdrawalsProcessed: 0,
          commissionsEarned: 0,
          netRevenue: 0,
          orderCount: 0,
          membershipRevenue: 0,
        });
        notices.push(
          getErrorMessage(revenueResult.reason, 'Revenue summary unavailable')
        );
      }

      if (cityResult.status === 'fulfilled') {
        setCityStats(cityResult.value);
      } else {
        console.error("City summary error:", cityResult.reason);
        setCityStats([]);
        notices.push(
          getErrorMessage(cityResult.reason, 'City summary unavailable')
        );
      }

      setError(notices.length ? notices.join(' ') : null);
    } catch (err) {
      console.error("Analytics Error:", err);
      setError(getErrorMessage(err, 'Failed to load analytics'));
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-IN").format(num);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-indigo-600" />
            Analytics Dashboard
          </h1>
          <p className="text-gray-500 mt-1">Platform performance and revenue breakdown</p>
        </div>

        <div className="flex bg-white rounded-lg border border-gray-200 p-1">
          {(['day', 'week', 'month'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors
                ${range === r ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:text-gray-900'}
              `}
            >
              This {r}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      ) : (
        <>
          {/* Revenue Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <p className="text-sm font-medium text-gray-500">Gross Revenue</p>
              <div className="flex items-baseline gap-2 mt-2">
                <h3 className="text-2xl font-bold text-gray-900">
                  {formatCurrency(revenue?.grossRevenue || 0)}
                </h3>
              </div>
              <div className="mt-4 flex items-center text-xs text-indigo-600">
                <Wallet className="w-4 h-4 mr-1" />
                From orders & memberships
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <p className="text-sm font-medium text-gray-500">Withdrawals Paid</p>
              <div className="flex items-baseline gap-2 mt-2">
                <h3 className="text-2xl font-bold text-gray-900">
                  {formatCurrency(revenue?.withdrawalsProcessed || 0)}
                </h3>
              </div>
              <div className="mt-4 flex items-center text-xs text-orange-600">
                <ArrowUpRight className="w-4 h-4 mr-1" />
                Processed payouts
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <p className="text-sm font-medium text-gray-500">Commissions Paid</p>
              <div className="flex items-baseline gap-2 mt-2">
                <h3 className="text-2xl font-bold text-gray-900">
                  {formatCurrency(revenue?.commissionsEarned || 0)}
                </h3>
              </div>
              <div className="mt-4 flex items-center text-xs text-purple-600">
                <ShareIcon className="w-4 h-4 mr-1" />
                To partners & orgs
              </div>
            </div>

            <div className={`p-6 rounded-xl border shadow-sm
              ${(revenue?.netRevenue || 0) >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}
            `}>
              <p className={`text-sm font-medium ${(revenue?.netRevenue || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                Net Profit (Estimated)
              </p>
              <div className="flex items-baseline gap-2 mt-2">
                <h3 className={`text-2xl font-bold ${(revenue?.netRevenue || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {formatCurrency(revenue?.netRevenue || 0)}
                </h3>
              </div>
              <div className="mt-4 text-xs opacity-75">
                Gross - Withdrawals
              </div>
            </div>
          </div>

          {/* City Stats Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-semibold text-gray-900">City Performance</h3>
              <span className="text-xs font-medium px-2 py-1 bg-gray-100 rounded-full text-gray-600">
                Top 50 Cities
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                  <tr>
                    <th className="px-6 py-3">City</th>
                    <th className="px-6 py-3 text-right">Users</th>
                    <th className="px-6 py-3 text-right">Orders</th>
                    <th className="px-6 py-3 text-right">Revenue</th>
                    <th className="px-6 py-3 text-right">Partner Payouts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cityStats.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        No city data available yet.
                      </td>
                    </tr>
                  ) : (
                    cityStats.map((city) => (
                      <tr key={city.city} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          {city.city}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-600">
                          {formatNumber(city.userCount)}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-600">
                          {formatNumber(city.orderCount)}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-emerald-600">
                          {formatCurrency(city.revenue)}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-indigo-600">
                          {formatCurrency(city.partnerPayout)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ShareIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" x2="12" y1="2" y2="15" />
    </svg>
  );
}
