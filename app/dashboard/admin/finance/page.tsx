'use client';

import { useState, useEffect } from 'react';
import { fetchAdminCommissionLogs, type AdminCommissionLog as CommissionLog } from '@/services/adminService';
import {
    Banknote, Calendar, Search, Filter, RefreshCw,
    ArrowRight, Download, ChevronLeft, ChevronRight,
    User, Building2, MapPin
} from 'lucide-react';

export default function AdminFinancePage() {
    const [logs, setLogs] = useState<CommissionLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [filters, setFilters] = useState({
        type: '',
        city: '',
        recipientId: '',
        fromDate: '',
        toDate: ''
    });

    // Pagination
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);

    const limit = 50;

    useEffect(() => {
        fetchLogs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, filters.type, filters.city, filters.recipientId, filters.fromDate, filters.toDate]); // Re-fetch on filter changes

    const fetchLogs = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await fetchAdminCommissionLogs(page, limit, {
                type: filters.type || undefined,
                city: filters.city || undefined,
                recipientId: filters.recipientId || undefined,
                fromDate: filters.fromDate ? new Date(filters.fromDate).toISOString() : undefined,
                toDate: filters.toDate ? new Date(filters.toDate).toISOString() : undefined,
            });

            setLogs(result.data || []);
            setTotal(result.pagination?.total || 0);
            setHasMore(Boolean(result.pagination?.hasNext));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load commission logs');
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPage(1); // Reset page on filter change
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 2,
        }).format(amount);
    };

    const formatDate = (isoString: string) => {
        return new Date(isoString).toLocaleString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Banknote className="w-8 h-8 text-emerald-600" />
                    <h1 className="text-3xl font-bold text-gray-900">Finance & Commissions</h1>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>Total Records: <strong className="text-gray-900">{total}</strong></span>
                    <button
                        onClick={fetchLogs}
                        disabled={loading}
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition"
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Commission Type</label>
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <select
                            value={filters.type}
                            onChange={(e) => handleFilterChange('type', e.target.value)}
                            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                            <option value="">All Types</option>
                            <option value="partner">City Partner</option>
                            <option value="organization">Organization</option>
                            <option value="referral">User Referral</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Filter by city..."
                            value={filters.city}
                            onChange={(e) => handleFilterChange('city', e.target.value)}
                            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="date"
                            value={filters.fromDate}
                            onChange={(e) => handleFilterChange('fromDate', e.target.value)}
                            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="date"
                            value={filters.toDate}
                            onChange={(e) => handleFilterChange('toDate', e.target.value)}
                            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </div>
                </div>
            </div>

            {/* Results Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-600 text-sm">
                        <tr>
                            <th className="px-6 py-4">Date</th>
                            <th className="px-6 py-4">Type</th>
                            <th className="px-6 py-4">Recipient</th>
                            <th className="px-6 py-4">Source</th>
                            <th className="px-6 py-4 text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center">
                                    <div className="flex justify-center flex-col items-center">
                                        <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
                                        <span className="text-gray-500">Loading records...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                    No commission records found matching filters
                                </td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        {formatDate(log.createdAt)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex px-2 py-1 rounded text-xs font-medium capitalize
                      ${log.type === 'partner' ? 'bg-indigo-100 text-indigo-700' :
                                                log.type === 'organization' ? 'bg-purple-100 text-purple-700' :
                                                    'bg-blue-100 text-blue-700'
                                            }
                    `}>
                                            {log.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm">
                                        <div className="font-medium text-gray-900">{log.recipientName || 'Unknown'}</div>
                                        <div className="text-xs text-gray-500 font-mono">{log.recipientId}</div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        <div className="flex items-center gap-1">
                                            <span className="text-gray-900">{log.sourceUserName || 'System'}</span>
                                            {log.city && <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-500">{log.city}</span>}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-0.5">
                                            {log.sourceTransaction || 'Manual Adjustment'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="font-bold text-emerald-600">
                                            +{formatCurrency(log.amount)}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {log.percentage}% share
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
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page <= 1 || loading}
                        className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                    >
                        <ChevronLeft className="w-4 h-4" /> Previous
                    </button>
                    <span className="px-4 py-2 text-sm text-gray-500">Page {page}</span>
                    <button
                        onClick={() => setPage(p => p + 1)}
                        disabled={!hasMore || loading}
                        className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                    >
                        Next <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
