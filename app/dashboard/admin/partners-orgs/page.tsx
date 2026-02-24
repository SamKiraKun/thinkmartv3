'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Users,
    Building2,
    MapPin,
    Percent,
    Search,
    RefreshCw,
    Edit,
    X,
    Save,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import {
    fetchAdminOrganizationsPageLike,
    fetchAdminPartnersPageLike,
    updateAdminOrgConfig,
    updateAdminPartnerConfig,
} from '@/services/adminService';

interface Partner {
    id: string;
    name: string;
    email: string;
    phone?: string;
    assignedCity: string;
    commissionPercentage: number;
    totalEarnings: number;
    withdrawableBalance: number;
    status: string;
    createdAt: string;
}

interface Organization {
    id: string;
    orgName: string;
    orgType: string;
    ownerName: string;
    email: string;
    referralCode: string;
    memberCount: number;
    totalCommissions: number;
    status: string;
    createdAt: string;
}

interface Cursor {
    page: number;
}

interface PartnersPageResponse {
    partners: Partner[];
    nextCursor: Cursor | null;
    hasMore: boolean;
}

interface OrganizationsPageResponse {
    organizations: Organization[];
    nextCursor: Cursor | null;
    hasMore: boolean;
}

type TabType = 'partners' | 'organizations';

export default function PartnersOrgsPage() {
    const [activeTab, setActiveTab] = useState<TabType>('partners');
    const [partners, setPartners] = useState<Partner[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);

    const [partnerCursorStack, setPartnerCursorStack] = useState<(Cursor | null)[]>([null]);
    const [organizationCursorStack, setOrganizationCursorStack] = useState<(Cursor | null)[]>([null]);
    const [partnersNextCursor, setPartnersNextCursor] = useState<Cursor | null>(null);
    const [organizationsNextCursor, setOrganizationsNextCursor] = useState<Cursor | null>(null);

    // Edit state
    const [editModal, setEditModal] = useState(false);
    const [editingItem, setEditingItem] = useState<Partner | Organization | null>(null);
    const [editForm, setEditForm] = useState({
        assignedCity: '',
        commissionPercentage: 0,
        status: ''
    });
    const [saving, setSaving] = useState(false);

    const fetchPartners = useCallback(async (cursor: Cursor | null, pageNum: number) => {
        setLoading(true);
        setError(null);

        try {
            const result = await fetchAdminPartnersPageLike(cursor?.page || pageNum, 20);

            setPartners(result?.partners || []);
            setPartnersNextCursor(result?.nextCursor || null);
            setHasMore(Boolean(result?.hasMore));
            setPage(pageNum);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load partners');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchOrganizations = useCallback(async (cursor: Cursor | null, pageNum: number) => {
        setLoading(true);
        setError(null);

        try {
            const result = await fetchAdminOrganizationsPageLike(cursor?.page || pageNum, 20);

            setOrganizations(result?.organizations || []);
            setOrganizationsNextCursor(result?.nextCursor || null);
            setHasMore(Boolean(result?.hasMore));
            setPage(pageNum);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load organizations');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchPartners(null, 1);
    }, [fetchPartners]);

    const handleTabChange = (tab: TabType) => {
        if (tab === activeTab) return;

        setActiveTab(tab);
        setError(null);

        if (tab === 'partners') {
            const cursor = partnerCursorStack[partnerCursorStack.length - 1] ?? null;
            void fetchPartners(cursor, partnerCursorStack.length);
            return;
        }

        const cursor = organizationCursorStack[organizationCursorStack.length - 1] ?? null;
        void fetchOrganizations(cursor, organizationCursorStack.length);
    };

    const refreshCurrentTab = () => {
        if (activeTab === 'partners') {
            const cursor = partnerCursorStack[partnerCursorStack.length - 1] ?? null;
            void fetchPartners(cursor, partnerCursorStack.length);
            return;
        }

        const cursor = organizationCursorStack[organizationCursorStack.length - 1] ?? null;
        void fetchOrganizations(cursor, organizationCursorStack.length);
    };

    const handleNextPage = () => {
        if (!hasMore) return;

        if (activeTab === 'partners') {
            if (!partnersNextCursor) return;
            const nextStack = [...partnerCursorStack, partnersNextCursor];
            setPartnerCursorStack(nextStack);
            void fetchPartners(partnersNextCursor, nextStack.length);
            return;
        }

        if (!organizationsNextCursor) return;
        const nextStack = [...organizationCursorStack, organizationsNextCursor];
        setOrganizationCursorStack(nextStack);
        void fetchOrganizations(organizationsNextCursor, nextStack.length);
    };

    const handlePrevPage = () => {
        if (page <= 1) return;

        if (activeTab === 'partners') {
            const prevStack = partnerCursorStack.slice(0, -1);
            const normalizedStack = prevStack.length ? prevStack : [null];
            const prevCursor = normalizedStack[normalizedStack.length - 1] ?? null;
            setPartnerCursorStack(normalizedStack);
            void fetchPartners(prevCursor, normalizedStack.length);
            return;
        }

        const prevStack = organizationCursorStack.slice(0, -1);
        const normalizedStack = prevStack.length ? prevStack : [null];
        const prevCursor = normalizedStack[normalizedStack.length - 1] ?? null;
        setOrganizationCursorStack(normalizedStack);
        void fetchOrganizations(prevCursor, normalizedStack.length);
    };

    const openEditModal = (item: Partner | Organization) => {
        setEditingItem(item);
        if ('assignedCity' in item) {
            setEditForm({
                assignedCity: item.assignedCity,
                commissionPercentage: item.commissionPercentage,
                status: item.status
            });
        } else {
            setEditForm({
                assignedCity: '',
                commissionPercentage: 0,
                status: item.status
            });
        }
        setEditModal(true);
    };

    const handleSave = async () => {
        if (!editingItem) return;
        setSaving(true);
        setError(null);

        try {
            if (activeTab === 'partners') {
                await updateAdminPartnerConfig(editingItem.id, {
                    assignedCity: editForm.assignedCity,
                    commissionPercentage: editForm.commissionPercentage,
                    status: editForm.status,
                });

                const cursor = partnerCursorStack[partnerCursorStack.length - 1] ?? null;
                await fetchPartners(cursor, partnerCursorStack.length);
            } else {
                await updateAdminOrgConfig(editingItem.id, {
                    commissionPercentage: editForm.commissionPercentage,
                    status: editForm.status
                });

                const cursor = organizationCursorStack[organizationCursorStack.length - 1] ?? null;
                await fetchOrganizations(cursor, organizationCursorStack.length);
            }
            setEditModal(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update');
        } finally {
            setSaving(false);
        }
    };

    const filteredPartners = partners.filter((partner) =>
        partner.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        partner.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        partner.assignedCity.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredOrgs = organizations.filter((org) =>
        org.orgName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        org.ownerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        org.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">Active</span>;
            case 'suspended':
                return <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-700">Suspended</span>;
            case 'pending':
                return <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-700">Pending</span>;
            default:
                return <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">{status}</span>;
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                        <Users className="w-7 h-7 text-indigo-600" />
                        Partners & Organizations
                    </h1>
                    <p className="text-gray-500 mt-1">
                        Manage city partners and referral organizations
                    </p>
                </div>
                <button
                    onClick={refreshCurrentTab}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                    disabled={loading}
                    aria-label="Refresh current list"
                >
                    <RefreshCw className={`w-5 h-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 mb-6 border-b border-gray-200">
                <button
                    onClick={() => handleTabChange('partners')}
                    className={`pb-3 px-1 font-medium transition-colors relative ${activeTab === 'partners'
                        ? 'text-indigo-600'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <span className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        City Partners
                    </span>
                    {activeTab === 'partners' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                    )}
                </button>
                <button
                    onClick={() => handleTabChange('organizations')}
                    className={`pb-3 px-1 font-medium transition-colors relative ${activeTab === 'organizations'
                        ? 'text-indigo-600'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <span className="flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        Organizations
                    </span>
                    {activeTab === 'organizations' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                    )}
                </button>
            </div>

            {/* Search */}
            <div className="mb-6">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder={activeTab === 'partners' ? 'Search partners...' : 'Search organizations...'}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    {error}
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                </div>
            ) : activeTab === 'partners' ? (
                /* Partners Table */
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {filteredPartners.length === 0 ? (
                        <div className="text-center py-12">
                            <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500">No partners found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Partner</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">City</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Commission</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Earnings</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Balance</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredPartners.map((partner) => (
                                        <tr key={partner.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-gray-900">{partner.name}</p>
                                                <p className="text-sm text-gray-500">{partner.email}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-1 text-sm">
                                                    <MapPin className="w-4 h-4 text-gray-400" />
                                                    {partner.assignedCity || 'Not assigned'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600">
                                                    <Percent className="w-4 h-4" />
                                                    {partner.commissionPercentage}%
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm font-medium text-green-600">
                                                ₹{partner.totalEarnings.toLocaleString('en-IN')}
                                            </td>
                                            <td className="px-4 py-3 text-sm font-medium">
                                                ₹{partner.withdrawableBalance.toLocaleString('en-IN')}
                                            </td>
                                            <td className="px-4 py-3">
                                                {getStatusBadge(partner.status)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={() => openEditModal(partner)}
                                                    className="p-2 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
                                                    aria-label={`Edit partner ${partner.name}`}
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : (
                /* Organizations Table */
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {filteredOrgs.length === 0 ? (
                        <div className="text-center py-12">
                            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500">No organizations found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Organization</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Owner</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Referral Code</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Members</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Commissions</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredOrgs.map((org) => (
                                        <tr key={org.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-gray-900">{org.orgName}</p>
                                                <p className="text-xs text-gray-500 capitalize">{org.orgType}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-sm text-gray-900">{org.ownerName}</p>
                                                <p className="text-xs text-gray-500">{org.email}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <code className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">
                                                    {org.referralCode}
                                                </code>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-1 text-sm font-medium">
                                                    <Users className="w-4 h-4 text-gray-400" />
                                                    {org.memberCount}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm font-medium text-green-600">
                                                ₹{org.totalCommissions.toLocaleString('en-IN')}
                                            </td>
                                            <td className="px-4 py-3">
                                                {getStatusBadge(org.status)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={() => openEditModal(org)}
                                                    className="p-2 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
                                                    aria-label={`Edit organization ${org.orgName}`}
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Pagination */}
            {!loading && (page > 1 || hasMore) && (
                <div className="flex items-center justify-between mt-4 px-4 py-3 bg-white rounded-lg border">
                    <p className="text-sm text-gray-500">
                        Page {page}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrevPage}
                            disabled={page === 1}
                            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50"
                            aria-label="Previous page"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="px-3 py-1 text-sm font-medium">Page {page}</span>
                        <button
                            onClick={handleNextPage}
                            disabled={!hasMore}
                            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50"
                            aria-label="Next page"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editModal && editingItem && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md">
                        <div className="flex items-center justify-between p-6 border-b">
                            <h2 className="text-lg font-semibold">
                                Edit {activeTab === 'partners' ? 'Partner' : 'Organization'}
                            </h2>
                            <button onClick={() => setEditModal(false)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Close edit dialog">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            {activeTab === 'partners' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Assigned City
                                    </label>
                                    <input
                                        type="text"
                                        value={editForm.assignedCity}
                                        onChange={(e) => setEditForm({ ...editForm, assignedCity: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Commission Percentage: {editForm.commissionPercentage}%
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="20"
                                    value={editForm.commissionPercentage}
                                    onChange={(e) => setEditForm({ ...editForm, commissionPercentage: parseInt(e.target.value, 10) })}
                                    className="w-full accent-indigo-600"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Status
                                </label>
                                <select
                                    value={editForm.status}
                                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="active">Active</option>
                                    <option value="suspended">Suspended</option>
                                    <option value="pending">Pending</option>
                                </select>
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    onClick={() => setEditModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    <Save className="w-4 h-4" />
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
