'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { fetchVendorAnalytics } from '@/services/vendorService';
import {
    TrendingUp, Package, Clock, AlertTriangle,
    Loader2, BarChart3, ArrowUpRight, ArrowDownRight,
    CheckCircle, XCircle, RefreshCw
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface RevenueTrendPoint {
    date: string;
    revenue: number;
    orderCount: number;
}

interface TopProduct {
    productId: string;
    name: string;
    totalSold: number;
    totalRevenue: number;
    imageUrl: string | null;
}

interface FulfillmentStats {
    averageProcessingHours: number;
    onTimeRate: number;
    pendingCount: number;
    confirmedCount: number;
    shippedCount: number;
    deliveredCount: number;
    cancelledCount: number;
}

interface VendorAnalytics {
    revenueTrend: RevenueTrendPoint[];
    topProducts: TopProduct[];
    fulfillment: FulfillmentStats;
    summary: {
        totalRevenueLast30Days: number;
        totalOrdersLast30Days: number;
        averageOrderValue: number;
        returnRate: number;
    };
}

// ============================================================================
// Mini Bar Chart Component (CSS-only, no external libs)
// ============================================================================

function MiniBarChart({ data, maxBars = 30 }: { data: RevenueTrendPoint[]; maxBars?: number }) {
    const sliced = data.slice(-maxBars);
    const maxRevenue = Math.max(...sliced.map(d => d.revenue), 1);

    return (
        <div className="flex items-end gap-[2px] h-32 w-full">
            {sliced.map((point, i) => {
                const height = Math.max(2, (point.revenue / maxRevenue) * 100);
                const isToday = i === sliced.length - 1;
                return (
                    <div
                        key={point.date}
                        className="group relative flex-1 flex flex-col items-center justify-end"
                    >
                        <div
                            className={`w-full rounded-t transition-all duration-200 ${isToday
                                ? 'bg-indigo-500'
                                : 'bg-indigo-200 hover:bg-indigo-400'
                                }`}
                            style={{ height: `${height}%`, minHeight: '2px' }}
                        />
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                            <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                                <p className="font-medium">{new Date(point.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</p>
                                <p>₹{point.revenue.toLocaleString('en-IN')}</p>
                                <p>{point.orderCount} order{point.orderCount !== 1 ? 's' : ''}</p>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ============================================================================
// Fulfillment Pipeline
// ============================================================================

function FulfillmentPipeline({ stats }: { stats: FulfillmentStats }) {
    const stages = [
        { label: 'Pending', count: stats.pendingCount, color: 'bg-amber-500' },
        { label: 'Confirmed', count: stats.confirmedCount, color: 'bg-blue-500' },
        { label: 'Shipped', count: stats.shippedCount, color: 'bg-indigo-500' },
        { label: 'Delivered', count: stats.deliveredCount, color: 'bg-green-500' },
        { label: 'Cancelled', count: stats.cancelledCount, color: 'bg-red-400' },
    ];

    const total = stages.reduce((sum, s) => sum + s.count, 0) || 1;

    return (
        <div className="space-y-4">
            {/* Bar */}
            <div className="flex h-4 rounded-full overflow-hidden bg-gray-100">
                {stages.map(stage => {
                    const width = (stage.count / total) * 100;
                    if (width === 0) return null;
                    return (
                        <div
                            key={stage.label}
                            className={`${stage.color} transition-all duration-500`}
                            style={{ width: `${width}%` }}
                            title={`${stage.label}: ${stage.count}`}
                        />
                    );
                })}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-xs">
                {stages.map(stage => (
                    <div key={stage.label} className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                        <span className="text-gray-600">{stage.label}</span>
                        <span className="font-bold text-gray-900">{stage.count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ============================================================================
// Main Page
// ============================================================================

export default function VendorAnalyticsPage() {
    const { profile } = useAuth();
    const [analytics, setAnalytics] = useState<VendorAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchAnalytics = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            setAnalytics(await fetchVendorAnalytics());
        } catch (err: any) {
            console.error('Vendor Analytics Error:', err);
            setError(err?.message || 'Failed to load analytics');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (profile?.role === 'vendor') {
            fetchAnalytics();
        }
    }, [profile, fetchAnalytics]);

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
                    <AlertTriangle size={48} className="mx-auto text-amber-500 mb-4" />
                    <h2 className="text-xl font-bold text-gray-800">Analytics Unavailable</h2>
                    <p className="text-gray-500 mt-2 max-w-md">{error}</p>
                    <button onClick={fetchAnalytics} className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    if (!analytics) return null;

    const { summary, revenueTrend, topProducts, fulfillment } = analytics;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
                    <p className="text-gray-500 mt-1">Last 30 days performance overview</p>
                </div>
                <button
                    onClick={fetchAnalytics}
                    className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition flex items-center gap-2"
                >
                    <RefreshCw size={18} /> Refresh
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-3 bg-green-100 rounded-xl">
                            <TrendingUp className="text-green-600" size={22} />
                        </div>
                        <ArrowUpRight className="text-green-500" size={18} />
                    </div>
                    <p className="text-sm text-gray-500 font-medium">Revenue (30d)</p>
                    <h3 className="text-2xl font-bold text-gray-900 mt-1">
                        ₹{summary.totalRevenueLast30Days.toLocaleString('en-IN')}
                    </h3>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-3 bg-blue-100 rounded-xl">
                            <Package className="text-blue-600" size={22} />
                        </div>
                    </div>
                    <p className="text-sm text-gray-500 font-medium">Orders (30d)</p>
                    <h3 className="text-2xl font-bold text-gray-900 mt-1">
                        {summary.totalOrdersLast30Days}
                    </h3>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-3 bg-purple-100 rounded-xl">
                            <BarChart3 className="text-purple-600" size={22} />
                        </div>
                    </div>
                    <p className="text-sm text-gray-500 font-medium">Avg Order Value</p>
                    <h3 className="text-2xl font-bold text-gray-900 mt-1">
                        ₹{summary.averageOrderValue.toLocaleString('en-IN')}
                    </h3>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-3 bg-red-100 rounded-xl">
                            <ArrowDownRight className="text-red-500" size={22} />
                        </div>
                    </div>
                    <p className="text-sm text-gray-500 font-medium">Return Rate</p>
                    <h3 className="text-2xl font-bold text-gray-900 mt-1">
                        {summary.returnRate}%
                    </h3>
                </div>
            </div>

            {/* Revenue Trend Chart */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trend (30 Days)</h2>
                <MiniBarChart data={revenueTrend} />
                <div className="flex justify-between mt-3 text-xs text-gray-400">
                    <span>{revenueTrend[0]?.date ? new Date(revenueTrend[0].date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : ''}</span>
                    <span>Today</span>
                </div>
            </div>

            {/* Two-column: Top Products + Fulfillment */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Products */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Products</h2>
                    {topProducts.length === 0 ? (
                        <p className="text-gray-400 text-sm py-8 text-center">No sales data yet</p>
                    ) : (
                        <div className="space-y-3">
                            {topProducts.map((product, i) => (
                                <div key={product.productId} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition">
                                    <span className="text-sm font-bold text-gray-400 w-6 text-center">
                                        {i + 1}
                                    </span>
                                    <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                                        {product.imageUrl ? (
                                            <Image
                                                src={product.imageUrl}
                                                alt=""
                                                width={40}
                                                height={40}
                                                className="w-full h-full object-cover"
                                                unoptimized
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Package size={16} className="text-gray-400" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                                        <p className="text-xs text-gray-400">{product.totalSold} sold</p>
                                    </div>
                                    <p className="text-sm font-bold text-gray-900">
                                        ₹{product.totalRevenue.toLocaleString('en-IN')}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Fulfillment SLA */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Fulfillment Overview</h2>

                    {/* SLA Metrics */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="p-4 rounded-xl bg-gray-50">
                            <div className="flex items-center gap-2 mb-1">
                                <Clock size={14} className="text-gray-500" />
                                <span className="text-xs text-gray-500">Avg Processing</span>
                            </div>
                            <p className="text-xl font-bold text-gray-900">
                                {fulfillment.averageProcessingHours}h
                            </p>
                        </div>
                        <div className="p-4 rounded-xl bg-gray-50">
                            <div className="flex items-center gap-2 mb-1">
                                {fulfillment.onTimeRate >= 90 ? (
                                    <CheckCircle size={14} className="text-green-500" />
                                ) : (
                                    <XCircle size={14} className="text-red-500" />
                                )}
                                <span className="text-xs text-gray-500">On-Time Rate</span>
                            </div>
                            <p className={`text-xl font-bold ${fulfillment.onTimeRate >= 90 ? 'text-green-600' : 'text-red-600'}`}>
                                {fulfillment.onTimeRate}%
                            </p>
                        </div>
                    </div>

                    {/* Pipeline */}
                    <FulfillmentPipeline stats={fulfillment} />
                </div>
            </div>
        </div>
    );
}
