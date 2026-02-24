"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchPlatformStats } from "@/services/adminService";
import type { PlatformStats } from "@/services/adminService";
import {
  Users, UserPlus, Wallet, Clock, FileCheck, RefreshCw,
  TrendingUp, Activity, AlertCircle, CheckCircle,
  ShieldAlert, Package, AlertTriangle
} from "lucide-react";

// Using PlatformStats imported from adminService}

interface QueueItem {
  label: string;
  count: number;
  oldestItemAge: string | null;
  trend: "up" | "down" | "stable";
}

interface QueueHealthData {
  queues: {
    pendingKyc: QueueItem;
    pendingWithdrawals: QueueItem;
    pendingOrders: QueueItem;
    pendingProducts: QueueItem;
  };
  alerts: Array<{
    severity: "warning" | "critical";
    message: string;
    queue: string;
  }>;
  timestamp: string;
}

interface AdminHealthCheck {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  admin: {
    uid: string;
    role: string | null;
    permissions: string[];
  };
  collections: Record<string, { accessible: boolean; sampleCount: number; error?: string }>;
  latencyMs: number;
}

const QUEUE_COLOR_STYLES = {
  amber: {
    iconBg: "bg-amber-100",
    iconText: "text-amber-600",
    countText: "text-amber-600",
  },
  orange: {
    iconBg: "bg-orange-100",
    iconText: "text-orange-600",
    countText: "text-orange-600",
  },
  blue: {
    iconBg: "bg-blue-100",
    iconText: "text-blue-600",
    countText: "text-blue-600",
  },
  purple: {
    iconBg: "bg-purple-100",
    iconText: "text-purple-600",
    countText: "text-purple-600",
  },
} as const;

type QueueColor = keyof typeof QUEUE_COLOR_STYLES;

type DashboardStats = PlatformStats & { lastUpdated?: string };

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [queueHealth, setQueueHealth] = useState<QueueHealthData | null>(null);
  const [queueHealthError, setQueueHealthError] = useState<string | null>(null);
  const [healthCheck, setHealthCheck] = useState<AdminHealthCheck | null>(null);
  const [healthCheckError, setHealthCheckError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setError(null);
      const result = await fetchPlatformStats();
      setStats({ ...result, lastUpdated: new Date().toISOString() } as any);
    } catch (err: any) {
      console.error("Error fetching admin stats:", err);
      setError(err?.message || "Failed to load statistics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Removed health and queue checks for Turso migration since API provides unified stats
  const fetchQueueHealth = useCallback(async () => { }, []);
  const fetchHealthCheck = useCallback(async () => { }, []);

  useEffect(() => {
    fetchStats();
    fetchQueueHealth();
    fetchHealthCheck();
  }, [fetchStats, fetchQueueHealth, fetchHealthCheck]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStats();
    fetchQueueHealth();
    fetchHealthCheck();
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

  const inaccessibleCollections = healthCheck
    ? Object.entries(healthCheck.collections).filter(([, value]) => !value.accessible)
    : [];
  const queueCards: Array<{
    key: keyof QueueHealthData["queues"];
    icon: typeof FileCheck | typeof Wallet | typeof Package;
    color: QueueColor;
    href: string;
  }> = [
      { key: 'pendingKyc', icon: FileCheck, color: 'amber', href: '/dashboard/admin/kyc' },
      { key: 'pendingWithdrawals', icon: Wallet, color: 'orange', href: '/dashboard/admin/withdrawals' },
      { key: 'pendingOrders', icon: Package, color: 'blue', href: '/dashboard/admin/orders' },
      { key: 'pendingProducts', icon: Package, color: 'purple', href: '/dashboard/admin/products' },
    ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-500 mt-1">
            {stats?.lastUpdated
              ? `Last updated: ${new Date(stats.lastUpdated).toLocaleTimeString()}`
              : "Loading..."
            }
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}
      {queueHealthError && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3 text-amber-700">
          <AlertTriangle className="w-5 h-5" />
          <span>{queueHealthError}</span>
        </div>
      )}
      {healthCheckError && (
        <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-3 text-slate-700">
          <ShieldAlert className="w-5 h-5" />
          <span>{healthCheckError}</span>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="h-8 bg-gray-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Main Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Users</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {stats ? formatNumber(stats.users.total) : "0"}
                  </p>
                </div>
                <div className="p-3 bg-indigo-100 rounded-lg">
                  <Users className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm text-green-600">
                <UserPlus className="w-4 h-4 mr-1" />
                {stats?.users.activeMembers || 0} active
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Active Today</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {stats ? formatNumber(stats.users.activeMembers) : "0"}
                  </p>
                </div>
                <div className="p-3 bg-green-100 rounded-lg">
                  <Activity className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm text-gray-500">
                <TrendingUp className="w-4 h-4 mr-1" />
                Live activity
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Revenue</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {stats ? formatCurrency(stats.orders.totalRevenue) : "₹0"}
                  </p>
                </div>
                <div className="p-3 bg-emerald-100 rounded-lg">
                  <Wallet className="w-6 h-6 text-emerald-600" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm text-gray-500">
                Orders + Memberships
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Pending Withdrawals</p>
                  <p className="text-3xl font-bold text-orange-600 mt-1">
                    {stats?.withdrawals.pending || 0}
                  </p>
                </div>
                <div className="p-3 bg-orange-100 rounded-lg">
                  <Clock className="w-6 h-6 text-orange-600" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm text-green-600">
                <CheckCircle className="w-4 h-4 mr-1" />
                {stats?.withdrawals.totalPaid ? formatCurrency(stats.withdrawals.totalPaid) + ' paid' : '0 paid'}
              </div>
            </div>
          </div>

          {/* Action Items */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <a
              href="/dashboard/admin/kyc"
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Pending KYC</p>
                  <p className="text-2xl font-bold text-amber-600 mt-1">
                    0
                  </p>
                </div>
                <FileCheck className="w-8 h-8 text-amber-500" />
              </div>
              <p className="text-sm text-indigo-600 mt-4">Review KYC →</p>
            </a>

            <a
              href="/dashboard/admin/withdrawals"
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Pending Withdrawals</p>
                  <p className="text-2xl font-bold text-orange-600 mt-1">
                    {stats?.withdrawals.pending || 0}
                  </p>
                </div>
                <Wallet className="w-8 h-8 text-orange-500" />
              </div>
              <p className="text-sm text-indigo-600 mt-4">Process Withdrawals →</p>
            </a>

            <a
              href="/dashboard/admin/users"
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Manage Users</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {stats ? formatNumber(stats.users.total) : "0"}
                  </p>
                </div>
                <Users className="w-8 h-8 text-indigo-500" />
              </div>
              <p className="text-sm text-indigo-600 mt-4">View Users →</p>
            </a>
          </div>

          {/* System Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold mb-4">System Health</h2>
              {healthCheck ? (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm text-gray-500">Overall</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${healthCheck.status === "healthy"
                        ? "bg-green-100 text-green-700"
                        : healthCheck.status === "degraded"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                        }`}
                    >
                      {healthCheck.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-4">
                    Latency {healthCheck.latencyMs} ms · Checked{" "}
                    {new Date(healthCheck.timestamp).toLocaleTimeString()}
                  </p>
                  <ul className="space-y-3">
                    <li className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="w-5 h-5" />
                      <span className="text-gray-700">
                        Admin role validated ({healthCheck.admin.role || "unknown"})
                      </span>
                    </li>
                    <li className={`flex items-center gap-2 ${inaccessibleCollections.length === 0 ? "text-green-600" : "text-amber-600"}`}>
                      {inaccessibleCollections.length === 0 ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5" />
                      )}
                      <span className="text-gray-700">
                        Collections reachable: {Object.keys(healthCheck.collections).length - inaccessibleCollections.length}/
                        {Object.keys(healthCheck.collections).length}
                      </span>
                    </li>
                    {inaccessibleCollections.slice(0, 2).map(([name, value]) => (
                      <li key={name} className="flex items-center gap-2 text-red-600">
                        <AlertCircle className="w-5 h-5" />
                        <span className="text-gray-700">
                          {name}: {value.error || "unavailable"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-gray-500">Running health diagnostics...</p>
              )}
            </div>
          </div>

          {queueHealth && (
            <div className="mt-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-indigo-600" />
                Operational Queue Health
              </h2>

              {/* SLA Alerts */}
              {queueHealth.alerts.length > 0 && (
                <div className="space-y-2 mb-6">
                  {queueHealth.alerts.map((alert, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 p-3 rounded-lg text-sm ${alert.severity === 'critical'
                        ? 'bg-red-50 border border-red-200 text-red-700'
                        : 'bg-amber-50 border border-amber-200 text-amber-700'
                        }`}
                    >
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>{alert.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Queue Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {queueCards.map(({ key, icon: Icon, color, href }) => {
                  const queue = queueHealth.queues[key];
                  const colorStyles = QUEUE_COLOR_STYLES[color];
                  return (
                    <a
                      key={key}
                      href={href}
                      className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className={`p-2 rounded-lg ${colorStyles.iconBg}`}>
                          <Icon className={`w-5 h-5 ${colorStyles.iconText}`} />
                        </div>
                        <span
                          className={`text-2xl font-bold ${queue.count > 0 ? colorStyles.countText : "text-gray-400"}`}
                        >
                          {queue.count}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-700 truncate">{queue.label}</p>
                      {queue.oldestItemAge && (
                        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Oldest: {queue.oldestItemAge}
                        </p>
                      )}
                      {queue.count === 0 && (
                        <p className="text-xs text-green-500 mt-1 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          All clear
                        </p>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
