'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { fetchOrganizationEarnings } from '@/services/organizationService';
import {
    DollarSign, TrendingUp, Loader2, ArrowLeft, Calendar, Wallet
} from 'lucide-react';
import Link from 'next/link';

interface EarningLog {
    id: string;
    amount: number;
    sourceType: string;
    sourceUserId: string;
    sourceUserName?: string;
    createdAt: any;
}

export default function OrganizationEarningsPage() {
    const router = useRouter();
    const { user, profile, loading: authLoading } = useAuth();
    const [logs, setLogs] = useState<EarningLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalEarnings: 0,
        thisMonth: 0,
        pendingPayout: 0
    });

    const loadEarnings = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        try {
            const res = await fetchOrganizationEarnings(1, 50);
            setLogs((res.logs || []) as any);
            setStats({
                totalEarnings: Number(res.stats?.totalEarnings || 0),
                thisMonth: Number(res.stats?.thisMonth || 0),
                pendingPayout: Number(res.stats?.pendingPayout || 0)
            });

        } catch (err) {
            console.error('Failed to load earnings:', err);
        } finally {
            setLoading(false);
        }
    }, [profile, user]);

    useEffect(() => {
        if (!authLoading && profile) {
            if (profile.role !== 'organization') {
                router.push('/dashboard/user');
                return;
            }
            loadEarnings();
        }
    }, [authLoading, profile, router, loadEarnings]);

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link
                    href="/dashboard/organization"
                    className="p-2 hover:bg-gray-100 rounded-lg transition"
                    aria-label="Back to organization dashboard"
                >
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <DollarSign className="text-green-600" /> Organization Earnings
                    </h1>
                    <p className="text-gray-500 text-sm">Track your commission earnings from members</p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <DollarSign className="w-5 h-5 text-green-600" />
                        </div>
                        <span className="text-gray-500 text-sm">Total Earnings</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">₹{stats.totalEarnings.toFixed(2)}</p>
                </div>

                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-blue-600" />
                        </div>
                        <span className="text-gray-500 text-sm">This Month</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">₹{stats.thisMonth.toFixed(2)}</p>
                </div>

                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                            <Wallet className="w-5 h-5 text-amber-600" />
                        </div>
                        <span className="text-gray-500 text-sm">Pending Payout</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">₹{stats.pendingPayout.toFixed(2)}</p>
                </div>
            </div>

            {/* Earnings Log */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-5 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-900">Earnings History</h2>
                </div>

                {loading ? (
                    <div className="p-12 text-center">
                        <Loader2 className="animate-spin mx-auto text-gray-400" size={32} />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                        <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No earnings yet</p>
                        <p className="text-sm mt-1">Earnings appear here when your members earn rewards</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {logs.map(log => (
                            <div key={log.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                                        <DollarSign className="w-5 h-5 text-green-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900">
                                            Commission from {log.sourceUserName || 'Member'}
                                        </p>
                                        <p className="text-sm text-gray-500 capitalize">{log.sourceType}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-semibold text-green-600">+₹{log.amount.toFixed(2)}</p>
                                    <p className="text-xs text-gray-400 flex items-center gap-1 justify-end">
                                        <Calendar size={10} />
                                        {typeof log.createdAt === 'string'
                                            ? new Date(log.createdAt).toLocaleDateString()
                                            : log.createdAt?.toDate?.()?.toLocaleDateString() || '-'}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Info Box */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-5 border border-green-100">
                <h3 className="font-semibold text-gray-900 mb-2">Commission Rate: 10%</h3>
                <p className="text-sm text-gray-600">
                    You earn 10% of all earnings made by members who joined using your organization&apos;s referral code.
                    This includes task rewards, shopping cashback, and other earning activities.
                </p>
            </div>
        </div>
    );
}
