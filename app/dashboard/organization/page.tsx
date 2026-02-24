'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { fetchOrganizationDashboard } from '@/services/organizationService';
import {
    Building2, Users, DollarSign, TrendingUp, Copy, Check,
    ArrowRight, Loader2, GraduationCap, Link as LinkIcon
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface OrgStats {
    memberCount: number;
    totalEarnings: number;
    pendingEarnings: number;
    thisMonthEarnings: number;
}

interface RecentMember {
    id: string;
    name: string;
    email: string;
    joinedAt: any;
    membershipActive: boolean;
}

export default function OrganizationDashboardPage() {
    const router = useRouter();
    const { user, profile, loading: authLoading } = useAuth();
    const [stats, setStats] = useState<OrgStats>({
        memberCount: 0,
        totalEarnings: 0,
        pendingEarnings: 0,
        thisMonthEarnings: 0
    });
    const [recentMembers, setRecentMembers] = useState<RecentMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [orgMeta, setOrgMeta] = useState<{ orgName: string; orgType: string; commissionPercentage: number } | null>(null);

    const loadDashboardData = useCallback(async () => {
        if (!user || !profile) return;
        setLoading(true);

        try {
            const res = await fetchOrganizationDashboard();
            setRecentMembers((res.recentMembers || []) as any);
            setStats({
                memberCount: Number(res.stats?.memberCount || 0),
                totalEarnings: Number(res.stats?.totalEarnings || 0),
                pendingEarnings: Number(res.stats?.pendingEarnings || 0),
                thisMonthEarnings: Number(res.stats?.thisMonthEarnings || 0)
            });
            setOrgMeta({
                orgName: res.org?.orgName || 'Your Organization',
                orgType: res.org?.orgType || 'organization',
                commissionPercentage: Number(res.org?.commissionPercentage || 10),
            });

        } catch (err) {
            console.error('Failed to load org data:', err);
            toast.error('Failed to load dashboard data');
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
            loadDashboardData();
        }
    }, [authLoading, profile, router, loadDashboardData]);

    const copyReferralCode = () => {
        const code = profile?.ownReferralCode || '';
        navigator.clipboard.writeText(code);
        setCopied(true);
        toast.success('Referral code copied!');
        setTimeout(() => setCopied(false), 2000);
    };

    const copyReferralLink = () => {
        const code = profile?.ownReferralCode || '';
        const link = `${window.location.origin}/auth/register?ref=${code}`;
        navigator.clipboard.writeText(link);
        toast.success('Referral link copied!');
    };

    if (authLoading || loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    const orgConfig = (profile as any)?.orgConfig;
    const orgName = orgMeta?.orgName || orgConfig?.orgName || 'Your Organization';
    const orgType = orgMeta?.orgType || orgConfig?.orgType || 'organization';
    const commissionPercentage = orgMeta?.commissionPercentage || Number(orgConfig?.commissionPercentage || 10);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-6 text-white">
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                        {orgType === 'school' || orgType === 'college' ? (
                            <GraduationCap size={28} />
                        ) : (
                            <Building2 size={28} />
                        )}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">{orgName}</h1>
                        <p className="text-white/70 capitalize">{orgType} Dashboard</p>
                    </div>
                </div>

                {/* Referral Code Box */}
                <div className="bg-white/10 backdrop-blur rounded-xl p-4 mt-4">
                    <p className="text-sm text-white/70 mb-2">Your Organization Referral Code</p>
                    <div className="flex items-center gap-3">
                        <code className="text-2xl font-mono font-bold tracking-wider">
                            {profile?.ownReferralCode || '---'}
                        </code>
                        <button
                            onClick={copyReferralCode}
                            className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition"
                            aria-label="Copy referral code"
                        >
                            {copied ? <Check size={18} /> : <Copy size={18} />}
                        </button>
                        <button
                            onClick={copyReferralLink}
                            className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition"
                            title="Copy referral link"
                            aria-label="Copy referral link"
                        >
                            <LinkIcon size={18} />
                        </button>
                    </div>
                    <p className="text-xs text-white/60 mt-2">
                        Share this code with your members. You earn {commissionPercentage}% of their total earnings!
                    </p>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Users className="w-5 h-5 text-blue-600" />
                        </div>
                        <span className="text-gray-500 text-sm">Total Members</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">{stats.memberCount}</p>
                </div>

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
                        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-amber-600" />
                        </div>
                        <span className="text-gray-500 text-sm">This Month</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">₹{stats.thisMonthEarnings.toFixed(2)}</p>
                </div>

                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                            <DollarSign className="w-5 h-5 text-purple-600" />
                        </div>
                        <span className="text-gray-500 text-sm">Pending Payout</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">₹{stats.pendingEarnings.toFixed(2)}</p>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link
                    href="/dashboard/organization/members"
                    className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:border-indigo-200 hover:shadow-md transition group"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center group-hover:bg-indigo-200 transition">
                                <Users className="w-6 h-6 text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">View Members</h3>
                                <p className="text-sm text-gray-500">Manage your organization members</p>
                            </div>
                        </div>
                        <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition" />
                    </div>
                </Link>

                <Link
                    href="/dashboard/organization/earnings"
                    className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:border-green-200 hover:shadow-md transition group"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center group-hover:bg-green-200 transition">
                                <DollarSign className="w-6 h-6 text-green-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">View Earnings</h3>
                                <p className="text-sm text-gray-500">Track commissions and payouts</p>
                            </div>
                        </div>
                        <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-green-600 group-hover:translate-x-1 transition" />
                    </div>
                </Link>
            </div>

            {/* Recent Members */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="p-5 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="font-semibold text-gray-900">Recent Members</h2>
                    <Link href="/dashboard/organization/members" className="text-sm text-indigo-600 hover:underline">
                        View All
                    </Link>
                </div>
                <div className="divide-y divide-gray-100">
                    {recentMembers.length === 0 ? (
                        <div className="p-8 text-center text-gray-400">
                            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>No members yet</p>
                            <p className="text-sm mt-1">Share your referral code to invite members</p>
                        </div>
                    ) : (
                        recentMembers.map(member => (
                            <div key={member.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-medium">
                                        {member.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900">{member.name}</p>
                                        <p className="text-sm text-gray-500">{member.email}</p>
                                    </div>
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${member.membershipActive
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-600'
                                    }`}>
                                    {member.membershipActive ? 'Premium' : 'Free'}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* How It Works */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-100">
                <h3 className="font-semibold text-gray-900 mb-4">How Organization Earnings Work</h3>
                <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-white/70 rounded-lg p-4">
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold mb-2">1</div>
                        <p className="text-sm text-gray-700">Share your referral code with students, employees, or members</p>
                    </div>
                    <div className="bg-white/70 rounded-lg p-4">
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold mb-2">2</div>
                        <p className="text-sm text-gray-700">They sign up and earn through tasks, rewards, and shopping</p>
                    </div>
                    <div className="bg-white/70 rounded-lg p-4">
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold mb-2">3</div>
                        <p className="text-sm text-gray-700">You earn <strong>{commissionPercentage}%</strong> of their total earnings automatically</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
