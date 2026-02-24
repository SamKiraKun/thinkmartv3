'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fetchVendorDashboardStats } from '@/services/vendorService';
import {
    Package, ShoppingCart, TrendingUp, Loader2, Activity,
    Building2,
    AlertCircle
} from 'lucide-react';
import Link from 'next/link';

interface VendorStats {
    totalProducts: number;
    activeProducts: number;
    totalOrders: number;
    pendingOrders: number;
    totalRevenue: number;
}

export default function VendorDashboard() {
    const { profile } = useAuth();
    const [stats, setStats] = useState<VendorStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const getErrorMessage = (error: unknown, fallback: string) => {
        return error instanceof Error ? error.message : fallback;
    };

    const fetchStats = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            setStats(await fetchVendorDashboardStats());
        } catch (error: unknown) {
            console.error('Vendor Stats Error:', error);
            setStats({
                totalProducts: 0,
                activeProducts: 0,
                totalOrders: 0,
                pendingOrders: 0,
                totalRevenue: 0
            });
            setError(getErrorMessage(error, 'Failed to fetch vendor stats'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (profile?.role === 'vendor') {
            fetchStats();
        }
    }, [profile, fetchStats]);

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="animate-spin text-indigo-600" size={40} />
            </div>
        );
    }

    // Check role
    if (profile?.role !== 'vendor') {
        return (
            <div className="flex h-96 items-center justify-center">
                <div className="text-center">
                    <AlertCircle size={48} className="mx-auto text-amber-500 mb-4" />
                    <h2 className="text-xl font-bold text-gray-800">Vendor Access Required</h2>
                    <p className="text-gray-500 mt-2">
                        This dashboard is only available to verified vendors.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Vendor Dashboard</h1>
                    <p className="text-gray-500 mt-1">
                        Welcome back, {profile?.name || 'Vendor'}
                    </p>
                </div>
                <button
                    onClick={fetchStats}
                    className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition flex items-center gap-2"
                >
                    <Activity size={18} /> Refresh Data
                </button>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="text-red-600">{error}</p>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Products"
                    value={stats?.totalProducts || 0}
                    icon={Package}
                    color="bg-blue-500"
                    subtitle={`${stats?.activeProducts || 0} active`}
                />
                <StatCard
                    title="Total Orders"
                    value={stats?.totalOrders || 0}
                    icon={ShoppingCart}
                    color="bg-green-500"
                    subtitle={`${stats?.pendingOrders || 0} pending`}
                />
                <StatCard
                    title="Total Revenue"
                    value={`₹${(stats?.totalRevenue || 0).toLocaleString('en-IN')}`}
                    icon={TrendingUp}
                    color="bg-purple-500"
                    subtitle="All-time earnings"
                />
            </div>

            {/* Quick Links */}
            <div className="grid md:grid-cols-2 gap-4">
                <Link
                    href="/dashboard/vendor/products"
                    className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 hover:shadow-md transition group"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition">
                            <Package size={24} className="text-blue-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900">My Products</h3>
                            <p className="text-sm text-gray-500">Manage your product catalog</p>
                        </div>
                    </div>
                </Link>

                <Link
                    href="/dashboard/vendor/orders"
                    className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-100 hover:shadow-md transition group"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-green-100 rounded-lg group-hover:bg-green-200 transition">
                            <ShoppingCart size={24} className="text-green-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900">Orders</h3>
                            <p className="text-sm text-gray-500">View and process customer orders</p>
                        </div>
                    </div>
                </Link>

                <Link
                    href="/dashboard/vendor/analytics"
                    className="p-6 bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl border border-purple-100 hover:shadow-md transition group"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition">
                            <TrendingUp size={24} className="text-purple-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900">Analytics</h3>
                            <p className="text-sm text-gray-500">Revenue trends & fulfillment SLAs</p>
                        </div>
                    </div>
                </Link>

                <Link
                    href="/dashboard/vendor/store"
                    className="p-6 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-100 hover:shadow-md transition group"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-100 rounded-lg group-hover:bg-amber-200 transition">
                            <Building2 size={24} className="text-amber-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900">Store Profile</h3>
                            <p className="text-sm text-gray-500">Update contact, address, and payout info</p>
                        </div>
                    </div>
                </Link>
            </div>

            {/* Info Banner */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6">
                <h3 className="font-bold text-indigo-900 mb-2">Vendor Guidelines</h3>
                <p className="text-sm text-indigo-700">
                    As a verified vendor, you can add products to the ThinkMart marketplace.
                    Products must comply with our quality guidelines. Orders should be processed
                    within 24 hours of confirmation.
                </p>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon: Icon, color, subtitle }: any) {
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
                <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
            )}
        </div>
    );
}
