'use client';

import { useState, useEffect } from 'react';
import { fetchAdminVendors, verifyAdminVendor, suspendAdminVendor, type AdminVendor } from '@/services/adminService';
import {
    Store, Loader2, RefreshCw, Search, Filter,
    CheckCircle, XCircle, AlertTriangle, MoreVertical,
    Shield, ShieldAlert, ShieldCheck, MapPin, Mail, Phone,
    ChevronLeft, ChevronRight, Clock
} from 'lucide-react';

type Vendor = AdminVendor;

type StatusFilter = '' | 'pending' | 'verified' | 'suspended';

export default function AdminVendorsPage() {
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Modals
    const [modalType, setModalType] = useState<'verify' | 'suspend' | null>(null);
    const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
    const [note, setNote] = useState('');

    const pageSize = 20;

    useEffect(() => {
        void fetchVendors(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter]);

    const fetchVendors = async (pageNum: number) => {
        setLoading(true);
        setError(null);
        try {
            const result = await fetchAdminVendors(pageNum, pageSize, statusFilter || undefined);

            setVendors(result.data);
            setTotal(result.pagination.total);
            setHasMore(result.pagination.hasNext);
            setPage(pageNum);
        } catch (err: any) {
            setError(err.message || 'Failed to load vendors');
        } finally {
            setLoading(false);
        }
    };

    const handleNextPage = () => {
        if (!hasMore) return;
        void fetchVendors(page + 1);
    };

    const handlePrevPage = () => {
        if (page <= 1) return;
        void fetchVendors(page - 1);
    };

    const handleAction = async () => {
        if (!selectedVendor || !modalType) return;

        setActionLoading(selectedVendor.id);
        setError(null);

        try {
            if (modalType === 'verify') {
                await verifyAdminVendor(selectedVendor.id, note || undefined);

                setVendors(vendors.map(v => v.id === selectedVendor.id ? { ...v, status: 'verified' } : v));
                setSuccess(`Vendor ${selectedVendor.businessName} verified successfully`);
            } else {
                await suspendAdminVendor(selectedVendor.id, note);

                setVendors(vendors.map(v => v.id === selectedVendor.id ? { ...v, status: 'suspended' } : v));
                setSuccess(`Vendor ${selectedVendor.businessName} suspended`);
            }

            setModalType(null);
            setSelectedVendor(null);
            setNote('');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(err.message || 'Action failed');
        } finally {
            setActionLoading(null);
        }
    };

    const openModal = (vendor: Vendor, type: 'verify' | 'suspend') => {
        setSelectedVendor(vendor);
        setModalType(type);
        setNote('');
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'verified':
                return <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-700 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Verified</span>;
            case 'suspended':
                return <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-700 flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Suspended</span>;
            default:
                return <span className="px-2 py-1 rounded-full text-xs bg-amber-100 text-amber-700 flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Store className="w-8 h-8 text-indigo-600" />
                    <h1 className="text-3xl font-bold text-gray-900">Vendor Management</h1>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>Total: <strong className="text-gray-900">{total}</strong> vendors</span>
                    <button
                        onClick={() => {
                            void fetchVendors(1);
                        }}
                        disabled={loading}
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition"
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Alerts */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
                    <AlertTriangle className="w-5 h-5" />
                    <span>{error}</span>
                </div>
            )}

            {success && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3 text-green-700">
                    <CheckCircle className="w-5 h-5" />
                    <span>{success}</span>
                </div>
            )}

            {/* Filters */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-500" />
                    <select
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setPage(1); }}
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="verified">Verified</option>
                        <option value="suspended">Suspended</option>
                    </select>
                </div>
            </div>

            {/* Vendors Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-600 text-sm">
                        <tr>
                            <th className="px-6 py-4">Vendor</th>
                            <th className="px-6 py-4">Contact</th>
                            <th className="px-6 py-4">Location</th>
                            <th className="px-6 py-4">Products</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center">
                                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
                                    <span className="text-gray-500">Loading vendors...</span>
                                </td>
                            </tr>
                        ) : vendors.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                    No vendors found
                                </td>
                            </tr>
                        ) : (
                            vendors.map((vendor) => (
                                <tr key={vendor.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900">{vendor.businessName}</div>
                                        <div className="text-sm text-gray-500">{vendor.ownerName}</div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Mail className="w-3 h-3" /> {vendor.email}
                                        </div>
                                        {vendor.phone && (
                                            <div className="flex items-center gap-2">
                                                <Phone className="w-3 h-3" /> {vendor.phone}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        {vendor.city ? (
                                            <div className="flex items-center gap-2">
                                                <MapPin className="w-3 h-3" /> {vendor.city}
                                            </div>
                                        ) : '-'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="inline-flex px-2 py-1 rounded bg-gray-100 text-sm text-gray-700 font-medium">
                                            {vendor.productCount}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {getStatusBadge(vendor.status)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            {vendor.status !== 'verified' && vendor.status !== 'suspended' && (
                                                <button
                                                    onClick={() => openModal(vendor, 'verify')}
                                                    className="px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 rounded-lg transition"
                                                >
                                                    Verify
                                                </button>
                                            )}
                                            {vendor.status !== 'suspended' && (
                                                <button
                                                    onClick={() => openModal(vendor, 'suspend')}
                                                    className="px-3 py-1.5 text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 rounded-lg transition"
                                                >
                                                    Suspend
                                                </button>
                                            )}
                                            {vendor.status === 'suspended' && (
                                                <button
                                                    onClick={() => openModal(vendor, 'verify')}
                                                    className="px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition"
                                                >
                                                    Reactivate
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {(page > 1 || hasMore) && (
                <div className="flex items-center justify-center gap-2">
                    <button
                        onClick={handlePrevPage}
                        disabled={page <= 1 || loading}
                        className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                    >
                        <ChevronLeft className="w-4 h-4" /> Previous
                    </button>
                    <span className="px-4 py-2 text-sm text-gray-500">Page {page}</span>
                    <button
                        onClick={handleNextPage}
                        disabled={!hasMore || loading}
                        className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                    >
                        Next <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Action Modal */}
            {modalType && selectedVendor && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            {modalType === 'verify' ? 'Verify Vendor' : 'Suspend Vendor'}
                        </h3>
                        <p className="text-sm text-gray-500 mb-4">
                            {modalType === 'verify'
                                ? `Are you sure you want to verify "${selectedVendor.businessName}"?`
                                : `Are you sure you want to suspend "${selectedVendor.businessName}"? This will also suspend all their products.`
                            }
                        </p>

                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {modalType === 'verify' ? 'Note (Optional)' : 'Reason (Required)'}
                        </label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={modalType === 'verify' ? 'Add a verification note...' : 'Provide a reason for suspension...'}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
                            rows={3}
                        />

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => { setModalType(null); setSelectedVendor(null); }}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAction}
                                disabled={(modalType === 'suspend' && !note.trim()) || actionLoading === selectedVendor.id}
                                className={`px-4 py-2 text-white rounded-lg transition flex items-center gap-2 disabled:opacity-50
                  ${modalType === 'verify' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                `}
                            >
                                {actionLoading === selectedVendor.id && <Loader2 className="w-4 h-4 animate-spin" />}
                                {modalType === 'verify' ? 'Verify Vendor' : 'Suspend Vendor'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
