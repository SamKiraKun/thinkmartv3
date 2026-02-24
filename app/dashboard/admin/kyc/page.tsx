'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import {
    approveAdminKyc,
    fetchAdminKycRequests,
    rejectAdminKyc,
    type AdminKycRequest,
} from '@/services/adminService';
import {
    Loader2, Check, X, Clock, CheckCircle, XCircle, RefreshCw,
    User, Shield, Eye, Calendar, MapPin, CreditCard, Building, Phone, FileImage, ExternalLink
} from 'lucide-react';

interface KYCRequest {
    id: string;
    name: string;
    email: string;
    phone?: string;
    city?: string;
    kycStatus: string;
    kycData?: {
        fullName: string;
        dateOfBirth: string;
        address: string;
        city: string;
        state: string;
        pincode: string;
        idType: string;
        idNumber: string;
        bankName: string;
        accountNumber: string;
        ifscCode: string;
        idDocumentUrl?: string;
        addressProofUrl?: string;
    };
    kycSubmittedAt?: any;
    kycRejectionReason?: string;
}

type TabType = 'pending' | 'verified' | 'rejected';
interface KYCPageCursor {
    page: number;
}

export default function AdminKYCPage() {
    const [requests, setRequests] = useState<KYCRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>('pending');
    const [refreshing, setRefreshing] = useState(false);
    const [selectedUser, setSelectedUser] = useState<KYCRequest | null>(null);
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [actionModal, setActionModal] = useState<{ action: 'verify' | 'reject'; reason: string } | null>(null);
    const [cursor, setCursor] = useState<KYCPageCursor | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const PAGE_SIZE = 30;
    const getErrorMessage = (error: unknown, fallback: string) =>
        error instanceof Error ? error.message : fallback;

    useEffect(() => {
        fetchRequests(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    const fetchRequests = async (reset = false) => {
        if (reset) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }
        try {
            const page = reset ? 1 : (cursor?.page || 1);
            const result = await fetchAdminKycRequests(page, PAGE_SIZE, activeTab);

            const mapped = (result.data || []).map((r: AdminKycRequest) => ({
                id: r.userId,
                name: r.userName,
                email: r.userEmail,
                phone: r.userPhone || undefined,
                city: r.userCity || undefined,
                kycStatus: r.status,
                kycData: {
                    ...(r.kycData || {}),
                    idDocumentUrl: r.idDocumentUrl || r.kycData?.idDocumentUrl,
                    addressProofUrl: r.addressProofUrl || r.kycData?.addressProofUrl,
                },
                kycSubmittedAt: r.submittedAt || null,
                kycRejectionReason: r.rejectionReason || undefined,
            }));

            setRequests(prev => reset ? (mapped as KYCRequest[]) : [...prev, ...(mapped as KYCRequest[])]);
            setCursor(result.pagination?.hasNext ? { page: page + 1 } : null);
            setHasMore(Boolean(result.pagination?.hasNext));
        } catch (err) {
            console.error('Failed to fetch KYC requests:', err);
            setNotice({ type: 'error', text: getErrorMessage(err, 'Failed to fetch KYC requests.') });
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchRequests(true);
        setRefreshing(false);
    };

    const handleAction = async (userId: string, action: 'verify' | 'reject', reason = '') => {
        const trimmedReason = reason.trim();
        if (action === 'reject' && !trimmedReason) {
            setNotice({ type: 'error', text: 'Rejection reason is required.' });
            return;
        }
        setProcessingId(userId);
        try {
            if (action === 'verify') {
                await approveAdminKyc(userId, `kyc_approve_${userId}_${Date.now()}`);
            } else {
                await rejectAdminKyc(userId, trimmedReason, `kyc_reject_${userId}_${Date.now()}`);
            }

            setRequests(requests.filter(r => r.id !== userId));
            setSelectedUser(null);
            setActionModal(null);
            setNotice({ type: 'success', text: `KYC ${action === 'verify' ? 'verified' : 'rejected'} successfully.` });
        } catch (err) {
            setNotice({
                type: 'error',
                text: getErrorMessage(err, 'Action failed')
            });
        } finally {
            setProcessingId(null);
        }
    };

    const formatDate = (timestamp: any) => {
        const date = typeof timestamp === 'string'
            ? new Date(timestamp)
            : timestamp?.seconds
                ? new Date(timestamp.seconds * 1000)
                : null;
        if (!date || Number.isNaN(date.getTime())) return 'N/A';
        return date.toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    };

    const tabs: { key: TabType; label: string; icon: any }[] = [
        { key: 'pending', label: 'Pending Review', icon: Clock },
        { key: 'verified', label: 'Verified', icon: CheckCircle },
        { key: 'rejected', label: 'Rejected', icon: XCircle }
    ];

    return (
        <div className="space-y-6 relative">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Shield className="text-indigo-600" /> KYC Management
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Review and verify user KYC submissions</p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 transition disabled:opacity-50"
                >
                    <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {notice && (
                <div className={`p-4 rounded-lg border flex items-center justify-between gap-3 ${notice.type === 'success'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                    }`}>
                    <span className="text-sm font-medium">{notice.text}</span>
                    <button onClick={() => setNotice(null)} className="p-1 rounded hover:bg-black/5">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-200">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition ${isActive
                                ? 'border-indigo-600 text-indigo-700'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            <Icon size={16} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-4">User</th>
                            <th className="px-6 py-4">ID Type</th>
                            <th className="px-6 py-4">Submitted</th>
                            <th className="px-6 py-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="p-12 text-center">
                                    <Loader2 className="animate-spin mx-auto text-gray-400" size={32} />
                                </td>
                            </tr>
                        ) : requests.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="p-12 text-center text-gray-400">
                                    No {activeTab} KYC requests found.
                                </td>
                            </tr>
                        ) : (
                            requests.map(req => (
                                <tr key={req.id} className="hover:bg-gray-50 transition">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                                                <User size={18} className="text-indigo-600" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900">{req.kycData?.fullName || req.name}</p>
                                                <p className="text-xs text-gray-400">{req.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded uppercase">
                                            {req.kycData?.idType || '-'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-500 text-xs">
                                        {formatDate(req.kycSubmittedAt)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => setSelectedUser(req)}
                                            className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-200 transition flex items-center gap-1 ml-auto"
                                        >
                                            <Eye size={14} /> Review
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {!loading && hasMore && (
                <div className="flex justify-center">
                    <button
                        onClick={() => fetchRequests(false)}
                        disabled={loadingMore}
                        className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm font-medium text-gray-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        {loadingMore && <Loader2 className="animate-spin" size={16} />}
                        Load More
                    </button>
                </div>
            )}

            {/* Detail Drawer */}
            {selectedUser && (
                <div className="fixed inset-0 z-50 flex">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedUser(null)} />

                    <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl overflow-y-auto">
                        {/* Header */}
                        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center z-10">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">KYC Review</h2>
                                <p className="text-sm text-gray-500">{selectedUser.kycData?.fullName || selectedUser.name}</p>
                            </div>
                            <button onClick={() => setSelectedUser(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Personal Info */}
                            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                                <h3 className="font-medium text-gray-700 flex items-center gap-2">
                                    <User size={16} /> Personal Information
                                </h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="text-gray-400">Full Name</p>
                                        <p className="font-medium">{selectedUser.kycData?.fullName}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400">Date of Birth</p>
                                        <p className="font-medium">{selectedUser.kycData?.dateOfBirth}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <p className="text-gray-400">Address</p>
                                        <p className="font-medium">{selectedUser.kycData?.address}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400">City</p>
                                        <p className="font-medium">{selectedUser.kycData?.city}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400">State</p>
                                        <p className="font-medium">{selectedUser.kycData?.state}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400">Pincode</p>
                                        <p className="font-medium">{selectedUser.kycData?.pincode}</p>
                                    </div>
                                </div>
                            </div>

                            {/* ID Details */}
                            <div className="bg-blue-50 rounded-xl p-4 space-y-3">
                                <h3 className="font-medium text-blue-700 flex items-center gap-2">
                                    <CreditCard size={16} /> ID Verification
                                </h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="text-blue-400">ID Type</p>
                                        <p className="font-medium uppercase">{selectedUser.kycData?.idType}</p>
                                    </div>
                                    <div>
                                        <p className="text-blue-400">ID Number</p>
                                        <p className="font-medium font-mono">{selectedUser.kycData?.idNumber}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Bank Details */}
                            <div className="bg-green-50 rounded-xl p-4 space-y-3">
                                <h3 className="font-medium text-green-700 flex items-center gap-2">
                                    <Building size={16} /> Bank Details
                                </h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="text-green-400">Bank Name</p>
                                        <p className="font-medium">{selectedUser.kycData?.bankName}</p>
                                    </div>
                                    <div>
                                        <p className="text-green-400">Account Number</p>
                                        <p className="font-medium font-mono">{selectedUser.kycData?.accountNumber}</p>
                                    </div>
                                    <div>
                                        <p className="text-green-400">IFSC Code</p>
                                        <p className="font-medium font-mono">{selectedUser.kycData?.ifscCode}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Document Previews */}
                            {(selectedUser.kycData?.idDocumentUrl || selectedUser.kycData?.addressProofUrl) && (
                                <div className="bg-purple-50 rounded-xl p-4 space-y-4">
                                    <h3 className="font-medium text-purple-700 flex items-center gap-2">
                                        <FileImage size={16} /> Uploaded Documents
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        {selectedUser.kycData?.idDocumentUrl && (
                                            <div>
                                                <p className="text-purple-600 text-sm font-medium mb-2">ID Document</p>
                                                <div className="relative group">
                                                    <Image
                                                        src={selectedUser.kycData.idDocumentUrl}
                                                        alt="ID Document"
                                                        fill
                                                        unoptimized
                                                        sizes="(max-width: 768px) 50vw, 280px"
                                                        className="object-cover rounded-lg border border-purple-200 cursor-pointer"
                                                        onClick={() => window.open(selectedUser.kycData?.idDocumentUrl, '_blank')}
                                                    />
                                                    <a
                                                        href={selectedUser.kycData.idDocumentUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="absolute bottom-2 right-2 p-1.5 bg-white/90 rounded-lg shadow hover:bg-white transition"
                                                    >
                                                        <ExternalLink size={14} className="text-purple-600" />
                                                    </a>
                                                </div>
                                            </div>
                                        )}
                                        {selectedUser.kycData?.addressProofUrl && (
                                            <div>
                                                <p className="text-purple-600 text-sm font-medium mb-2">Address Proof</p>
                                                <div className="relative group">
                                                    <Image
                                                        src={selectedUser.kycData.addressProofUrl}
                                                        alt="Address Proof"
                                                        fill
                                                        unoptimized
                                                        sizes="(max-width: 768px) 50vw, 280px"
                                                        className="object-cover rounded-lg border border-purple-200 cursor-pointer"
                                                        onClick={() => window.open(selectedUser.kycData?.addressProofUrl, '_blank')}
                                                    />
                                                    <a
                                                        href={selectedUser.kycData.addressProofUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="absolute bottom-2 right-2 p-1.5 bg-white/90 rounded-lg shadow hover:bg-white transition"
                                                    >
                                                        <ExternalLink size={14} className="text-purple-600" />
                                                    </a>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-xs text-purple-500">Click images to view full size</p>
                                </div>
                            )}

                            {/* No Documents Warning */}
                            {!selectedUser.kycData?.idDocumentUrl && !selectedUser.kycData?.addressProofUrl && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                    <p className="text-amber-700 text-sm">⚠️ No documents uploaded by user</p>
                                </div>
                            )}

                            {/* Submission Info */}
                            <div className="text-sm text-gray-500">
                                <p>Submitted: {formatDate(selectedUser.kycSubmittedAt)}</p>
                            </div>

                            {/* Rejection Reason (if rejected) */}
                            {selectedUser.kycStatus === 'rejected' && selectedUser.kycRejectionReason && (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                                    <p className="text-sm text-red-600 font-medium">Rejection Reason:</p>
                                    <p className="text-red-700">{selectedUser.kycRejectionReason}</p>
                                </div>
                            )}

                            {/* Actions */}
                            {activeTab === 'pending' && (
                                <div className="flex gap-3 pt-4 border-t border-gray-200">
                                    <button
                                        onClick={() => setActionModal({ action: 'reject', reason: '' })}
                                        disabled={!!processingId}
                                        className="flex-1 py-3 px-4 bg-red-50 text-red-700 rounded-xl font-medium hover:bg-red-100 transition flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        <X size={18} /> Reject
                                    </button>
                                    <button
                                        onClick={() => setActionModal({ action: 'verify', reason: '' })}
                                        disabled={!!processingId}
                                        className="flex-1 py-3 px-4 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                                    >
                                        {processingId === selectedUser.id ? (
                                            <Loader2 className="animate-spin" size={18} />
                                        ) : (
                                            <Check size={18} />
                                        )}
                                        Verify KYC
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {actionModal && selectedUser && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setActionModal(null)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-2">
                            {actionModal.action === 'verify' ? 'Verify KYC' : 'Reject KYC'}
                        </h2>
                        <p className="text-sm text-gray-600 mb-4">
                            User: <span className="font-semibold">{selectedUser.kycData?.fullName || selectedUser.name}</span>
                        </p>
                        {actionModal.action === 'reject' && (
                            <>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Rejection Reason *</label>
                                <textarea
                                    value={actionModal.reason}
                                    onChange={(e) => setActionModal({ ...actionModal, reason: e.target.value })}
                                    rows={3}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none mb-4"
                                    placeholder="Provide reason for rejection..."
                                />
                            </>
                        )}
                        <div className="flex gap-3">
                            <button
                                onClick={() => setActionModal(null)}
                                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleAction(selectedUser.id, actionModal.action, actionModal.reason)}
                                disabled={!!processingId || (actionModal.action === 'reject' && !actionModal.reason.trim())}
                                className={`flex-1 py-2 text-white rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2 ${actionModal.action === 'verify' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                                    }`}
                            >
                                {processingId ? <Loader2 size={16} className="animate-spin" /> : null}
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
