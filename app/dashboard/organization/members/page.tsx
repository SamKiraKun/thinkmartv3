'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { fetchOrganizationMembers } from '@/services/organizationService';
import {
    Users, Search, Loader2, Crown, ArrowLeft, Mail, Calendar
} from 'lucide-react';
import Link from 'next/link';

interface Member {
    id: string;
    name: string;
    email: string;
    phone?: string;
    city?: string;
    membershipActive: boolean;
    createdAt: any;
}

export default function OrganizationMembersPage() {
    const router = useRouter();
    const { user, profile, loading: authLoading } = useAuth();
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (!authLoading && profile) {
            if (profile.role !== 'organization') {
                router.push('/dashboard/user');
                return;
            }
            loadMembers();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, profile, router]);

    const loadMembers = async () => {
        if (!profile?.ownReferralCode) return;
        setLoading(true);

        try {
            const res = await fetchOrganizationMembers(1, 500);
            setMembers((res.data || []) as any);
        } catch (err) {
            console.error('Failed to load members:', err);
        } finally {
            setLoading(false);
        }
    };

    const filteredMembers = members.filter(m =>
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const premiumCount = members.filter(m => m.membershipActive).length;

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
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href="/dashboard/organization"
                        className="p-2 hover:bg-gray-100 rounded-lg transition"
                    >
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <Users className="text-indigo-600" /> Organization Members
                        </h1>
                        <p className="text-gray-500 text-sm">
                            {members.length} members • {premiumCount} premium
                        </p>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                <input
                    type="text"
                    placeholder="Search members..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
            </div>

            {/* Members Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-4">Member</th>
                            <th className="px-6 py-4">Location</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Joined</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="p-12 text-center">
                                    <Loader2 className="animate-spin mx-auto text-gray-400" size={32} />
                                </td>
                            </tr>
                        ) : filteredMembers.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="p-12 text-center text-gray-400">
                                    {searchTerm ? 'No members match your search' : 'No members have joined yet'}
                                </td>
                            </tr>
                        ) : (
                            filteredMembers.map(member => (
                                <tr key={member.id} className="hover:bg-gray-50 transition">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-medium">
                                                {member.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900">{member.name}</p>
                                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                                    <Mail size={10} /> {member.email}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        {member.city || '—'}
                                    </td>
                                    <td className="px-6 py-4">
                                        {member.membershipActive ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">
                                                <Crown size={12} /> Premium
                                            </span>
                                        ) : (
                                            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                                                Free
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-gray-500 text-sm">
                                        <div className="flex items-center gap-1">
                                            <Calendar size={12} />
                                            {typeof member.createdAt === 'string'
                                                ? new Date(member.createdAt).toLocaleDateString()
                                                : member.createdAt?.toDate?.()?.toLocaleDateString() || '—'}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
