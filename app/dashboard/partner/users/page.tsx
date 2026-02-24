// File: ThinkMart/app/dashboard/partner/users/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fetchPartnerUsers } from '@/services/partnerService';
import {
  Users, MapPin, Loader2, Search, Filter, ChevronDown,
  CheckCircle, Clock, XCircle, AlertCircle, RefreshCw, Crown
} from 'lucide-react';

interface CityUser {
  id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  kycStatus: string;
  membershipActive: boolean;
  createdAt: any;
  lastActiveAt?: any;
}

export default function PartnerUsersPage() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<CityUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastDocId, setLastDocId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<{ type: 'error'; text: string } | null>(null);

  // Filters
  const [kycFilter, setKycFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const getErrorMessage = (error: unknown, fallback: string) => {
    return error instanceof Error ? error.message : fallback;
  };

  // Partner's assigned city
  const assignedCity = profile?.partnerConfig?.assignedCity || '';

  useEffect(() => {
    if (profile?.role === 'partner' && assignedCity) {
      fetchUsers(true);
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, kycFilter]);

  const fetchUsers = async (reset = false) => {
    if (!assignedCity) return;

    if (reset) {
      setLoading(true);
      setUsers([]);
      setLastDocId(null);
      setPage(1);
    } else {
      setLoadingMore(true);
    }

    try {
      const nextPage = reset ? 1 : page + 1;
      const result = await fetchPartnerUsers(nextPage, 20, {
        kycStatus: kycFilter || undefined,
      });
      const newUsers = result.data || [];
      setUsers(reset ? newUsers : [...users, ...newUsers]);
      setHasMore(Boolean(result.pagination?.hasNext));
      setPage(nextPage);
      setLastDocId(result.pagination?.hasNext ? String(nextPage + 1) : null);
    } catch (error: unknown) {
      console.error('Failed to fetch users:', error);
      setNotice({ type: 'error', text: getErrorMessage(error, 'Failed to fetch users') });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = typeof timestamp === 'string'
      ? new Date(timestamp)
      : timestamp?.seconds
        ? new Date(timestamp.seconds * 1000)
        : null;
    if (!date || Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getKycBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return (
          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full flex items-center gap-1">
            <CheckCircle size={12} /> Verified
          </span>
        );
      case 'pending':
        return (
          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full flex items-center gap-1">
            <Clock size={12} /> Pending
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full flex items-center gap-1">
            <XCircle size={12} /> Rejected
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full flex items-center gap-1">
            <AlertCircle size={12} /> Not Submitted
          </span>
        );
    }
  };

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.phone.includes(searchTerm)
  );

  if (!assignedCity) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <MapPin size={48} className="text-gray-300 mb-4" />
        <h2 className="text-xl font-bold text-gray-700">No City Assigned</h2>
        <p className="text-gray-500 mt-2">Contact admin to get a city assigned to your partner account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div className="p-4 rounded-lg border bg-red-50 border-red-200 text-red-700 text-sm font-medium">
          {notice.text}
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="text-indigo-600" /> City Users
          </h1>
          <p className="text-gray-500 text-sm mt-1 flex items-center gap-2">
            <MapPin size={14} /> Viewing users in <strong>{assignedCity}</strong> (read-only)
          </p>
        </div>
        <button
          onClick={() => fetchUsers(true)}
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 transition disabled:opacity-50"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        {/* KYC Filter */}
        <div className="relative">
          <select
            value={kycFilter}
            onChange={(e) => setKycFilter(e.target.value)}
            className="appearance-none pl-10 pr-8 py-2.5 border rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">All KYC Status</option>
            <option value="verified">Verified</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
            <option value="not_submitted">Not Submitted</option>
          </select>
          <Filter size={16} className="absolute left-3 top-3 text-gray-400" />
          <ChevronDown size={16} className="absolute right-2 top-3 text-gray-400" />
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search users..."
            className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
            <tr>
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Contact</th>
              <th className="px-6 py-4">KYC Status</th>
              <th className="px-6 py-4">Membership</th>
              <th className="px-6 py-4">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-12 text-center">
                  <Loader2 className="animate-spin mx-auto text-gray-400" size={32} />
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-12 text-center text-gray-400">
                  No users found in {assignedCity}
                </td>
              </tr>
            ) : (
              filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                        <Users size={18} className="text-indigo-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-400">{user.city}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-gray-600">{user.phone}</p>
                    <p className="text-xs text-gray-400">{user.email}</p>
                  </td>
                  <td className="px-6 py-4">
                    {getKycBadge(user.kycStatus)}
                  </td>
                  <td className="px-6 py-4">
                    {user.membershipActive ? (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full flex items-center gap-1 w-fit">
                        <Crown size={12} /> Premium
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">Free</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-500 text-xs">
                    {formatDate(user.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Load More */}
        {hasMore && !loading && (
          <div className="p-4 border-t border-gray-100 text-center">
            <button
              onClick={() => fetchUsers(false)}
              disabled={loadingMore}
              className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
            >
              {loadingMore ? (
                <Loader2 className="animate-spin inline mr-2" size={16} />
              ) : null}
              Load More
            </button>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
        <strong>Note:</strong> User data is masked for privacy. You can only view users in your assigned city.
        Contact admin for any user-related issues.
      </div>
    </div>
  );
}
