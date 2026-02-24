'use client';

import { useEffect, useState } from 'react';
import {
  fetchAdminUserDetail,
  fetchAdminWithdrawals,
  updateAdminWithdrawalStatus,
} from '@/services/adminService';
import {
  Loader2,
  Check,
  X,
  Filter,
  RefreshCw,
  Eye,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

type TabType = 'pending' | 'approved' | 'rejected';

interface Withdrawal {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  userCity?: string;
  amount: number;
  method: string;
  details?: {
    upiId?: string;
    accountNo?: string;
    accountHolder?: string;
    bankName?: string;
    ifsc?: string;
  };
  status: TabType;
  kycStatus?: string;
  walletBalanceAtRequest?: number;
  riskFlags?: string[];
  createdAt: string;
  processedAt?: string;
  processedBy?: string;
  adminNotes?: string;
}

interface WithdrawalsPageCursor { page: number; }

interface UserDetails {
  name: string;
  email: string;
  phone?: string;
  city?: string;
  role?: string;
  kycStatus?: string;
  wallet?: {
    cashBalance: number;
    coinBalance: number;
  };
  withdrawalCount?: number;
}

export default function AdminWithdrawalsPage() {
  const [requests, setRequests] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [filterCity, setFilterCity] = useState('');
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [filterMaxAmount, setFilterMaxAmount] = useState('');
  const [appliedCity, setAppliedCity] = useState('');
  const [appliedMinAmount, setAppliedMinAmount] = useState('');
  const [appliedMaxAmount, setAppliedMaxAmount] = useState('');

  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<WithdrawalsPageCursor | null>(null);

  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [actionModal, setActionModal] = useState<{ action: 'approve' | 'reject'; notes: string } | null>(null);

  const pageSize = 30;
  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  useEffect(() => {
    void fetchRequests(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, appliedCity, appliedMinAmount, appliedMaxAmount]);

  const fetchRequests = async (reset = false) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const page = reset ? 1 : (cursor?.page || 1);
      const result = await fetchAdminWithdrawals(page, pageSize, activeTab, {
        city: appliedCity || undefined,
        minAmount: appliedMinAmount ? Number(appliedMinAmount) : undefined,
        maxAmount: appliedMaxAmount ? Number(appliedMaxAmount) : undefined,
      });

      const rows = (result.data || []) as unknown as Withdrawal[];
      setRequests((prev) => (reset ? rows : [...prev, ...rows]));
      setCursor(result.pagination?.hasNext ? { page: page + 1 } : null);
      setHasMore(Boolean(result.pagination?.hasNext));
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err, 'Failed to load withdrawals') });
      if (reset) {
        setRequests([]);
        setCursor(null);
        setHasMore(false);
      }
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

  const openDetails = async (withdrawal: Withdrawal) => {
    setSelectedWithdrawal(withdrawal);
    setLoadingDetails(true);
    try {
      const result = await fetchAdminUserDetail(withdrawal.userId);
      setUserDetails({
        name: result.name,
        email: result.email,
        phone: result.phone || undefined,
        city: result.city || undefined,
        role: result.role,
        kycStatus: result.kycStatus,
        wallet: result.wallet,
        withdrawalCount: result.withdrawalCount,
      });
    } catch (err) {
      setUserDetails(null);
      setNotice({ type: 'error', text: getErrorMessage(err, 'Failed to load user details') });
    } finally {
      setLoadingDetails(false);
    }
  };

  const closeDetails = () => {
    setSelectedWithdrawal(null);
    setUserDetails(null);
    setActionModal(null);
  };

  const handleAction = async (action: 'approve' | 'reject', notes?: string) => {
    if (!selectedWithdrawal) return;

    const safeNotes = (notes || '').trim();
    if (action === 'reject' && !safeNotes) {
      setNotice({ type: 'error', text: 'Rejection reason is required.' });
      return;
    }

    setProcessingId(selectedWithdrawal.id);
    try {
      if (action === 'approve') {
        await updateAdminWithdrawalStatus(selectedWithdrawal.id, 'completed', undefined, safeNotes || undefined);
      } else {
        await updateAdminWithdrawalStatus(selectedWithdrawal.id, 'rejected', safeNotes);
      }

      setRequests((prev) => prev.filter((r) => r.id !== selectedWithdrawal.id));
      closeDetails();
      setNotice({ type: 'success', text: `Withdrawal ${action === 'approve' ? 'approved' : 'rejected'} successfully.` });
    } catch (err) {
      setNotice({
        type: 'error',
        text: getErrorMessage(err, 'Action failed')
      });
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) return 'N/A';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const exportCsv = () => {
    const headers = ['ID', 'User', 'Email', 'Amount', 'Method', 'Status', 'Created At'];
    const rows = requests.map((r) => [
      r.id,
      r.userName || r.userId,
      r.userEmail || '',
      r.amount,
      r.method,
      r.status,
      formatDate(r.createdAt),
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `withdrawals_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Withdrawal Management</h1>
          <p className="text-gray-500 text-sm mt-1">Review and process withdrawal requests</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 text-sm"
          >
            Export
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 transition disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {notice && (
        <div className={`p-4 rounded-lg border flex items-center justify-between gap-3 ${notice.type === 'success'
          ? 'bg-green-50 border-green-200 text-green-700'
          : 'bg-red-50 border-red-200 text-red-700'
          }`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {notice.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {notice.text}
          </div>
          <button onClick={() => setNotice(null)} className="p-1 rounded hover:bg-black/5" aria-label="Dismiss notice">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-gray-500">
            <Filter size={16} />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          <input
            type="text"
            placeholder="City"
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm w-32"
          />
          <input
            type="number"
            placeholder="Min Rs"
            value={filterMinAmount}
            onChange={(e) => setFilterMinAmount(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm w-24"
          />
          <input
            type="number"
            placeholder="Max Rs"
            value={filterMaxAmount}
            onChange={(e) => setFilterMaxAmount(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm w-24"
          />
          <button
            onClick={() => {
              setAppliedCity(filterCity.trim());
              setAppliedMinAmount(filterMinAmount.trim());
              setAppliedMaxAmount(filterMaxAmount.trim());
            }}
            className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-200"
          >
            Apply
          </button>
          {(filterCity || filterMinAmount || filterMaxAmount) && (
            <button
              onClick={() => {
                setFilterCity('');
                setFilterMinAmount('');
                setFilterMaxAmount('');
                setAppliedCity('');
                setAppliedMinAmount('');
                setAppliedMaxAmount('');
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        {(['pending', 'approved', 'rejected'] as TabType[]).map((tab) => {
          const isActive = activeTab === tab;
          const activeClass =
            tab === 'pending'
              ? 'border-yellow-600 text-yellow-700'
              : tab === 'approved'
                ? 'border-green-600 text-green-700'
                : 'border-red-600 text-red-700';

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 capitalize font-medium text-sm border-b-2 transition ${isActive ? activeClass : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
              <tr>
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Method</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center">
                    <Loader2 className="animate-spin mx-auto text-gray-400" size={30} />
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-gray-400">
                    No {activeTab} requests found.
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{req.userName || 'Unknown'}</div>
                      <div className="text-xs text-gray-500">{req.userEmail || req.userId}</div>
                    </td>
                    <td className="px-5 py-3 font-bold text-green-700">₹{req.amount.toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3 uppercase text-xs text-gray-600">{req.method}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{formatDate(req.createdAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => void openDetails(req)}
                        className="p-2 rounded hover:bg-gray-100"
                        aria-label="View withdrawal details"
                      >
                        <Eye size={16} className="text-gray-500" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => void fetchRequests(false)}
            disabled={loadingMore}
            className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm font-medium text-gray-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loadingMore ? <Loader2 className="animate-spin" size={16} /> : null}
            Load More
          </button>
        </div>
      )}

      {selectedWithdrawal && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={closeDetails} />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center z-10">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Withdrawal Details</h2>
                <p className="text-sm text-gray-500">ID: {selectedWithdrawal.id.slice(0, 12)}...</p>
              </div>
              <button onClick={closeDetails} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Close details">
                <X size={20} />
              </button>
            </div>

            {loadingDetails ? (
              <div className="p-12 text-center">
                <Loader2 className="animate-spin mx-auto text-gray-400" size={32} />
              </div>
            ) : (
              <div className="p-6 space-y-6">
                <div className="bg-green-50 rounded-xl p-5 text-center">
                  <p className="text-sm text-green-700">Requested Amount</p>
                  <p className="text-3xl font-bold text-green-800">₹{selectedWithdrawal.amount.toLocaleString('en-IN')}</p>
                  <p className="text-sm text-green-700 mt-2">{selectedWithdrawal.details?.upiId || selectedWithdrawal.details?.accountNo || '-'}</p>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  <div><span className="text-gray-500">Name: </span>{userDetails?.name || selectedWithdrawal.userName || '-'}</div>
                  <div><span className="text-gray-500">Email: </span>{userDetails?.email || selectedWithdrawal.userEmail || '-'}</div>
                  <div><span className="text-gray-500">Phone: </span>{userDetails?.phone || selectedWithdrawal.userPhone || '-'}</div>
                  <div><span className="text-gray-500">City: </span>{userDetails?.city || selectedWithdrawal.userCity || '-'}</div>
                  <div><span className="text-gray-500">KYC: </span>{userDetails?.kycStatus || selectedWithdrawal.kycStatus || 'unknown'}</div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  <div><span className="text-gray-500">Created: </span>{formatDate(selectedWithdrawal.createdAt)}</div>
                  <div><span className="text-gray-500">Status: </span>{selectedWithdrawal.status}</div>
                  <div><span className="text-gray-500">Wallet at request: </span>₹{selectedWithdrawal.walletBalanceAtRequest?.toLocaleString('en-IN') || '0'}</div>
                </div>

                {selectedWithdrawal.status === 'pending' && (
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setActionModal({ action: 'reject', notes: '' })}
                      disabled={Boolean(processingId)}
                      className="flex-1 py-3 px-4 bg-red-50 text-red-700 rounded-xl font-medium hover:bg-red-100 transition flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <X size={18} /> Reject
                    </button>
                    <button
                      onClick={() => setActionModal({ action: 'approve', notes: '' })}
                      disabled={Boolean(processingId)}
                      className="flex-1 py-3 px-4 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {processingId ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                      Approve
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {actionModal && selectedWithdrawal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setActionModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {actionModal.action === 'approve' ? 'Approve Withdrawal' : 'Reject Withdrawal'}
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Amount: <span className="font-semibold">₹{selectedWithdrawal.amount.toLocaleString('en-IN')}</span>
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {actionModal.action === 'approve' ? 'Payment Reference (optional)' : 'Rejection Reason *'}
            </label>
            <textarea
              value={actionModal.notes}
              onChange={(e) => setActionModal({ ...actionModal, notes: e.target.value })}
              rows={3}
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none mb-4"
              placeholder={actionModal.action === 'approve' ? 'UTR / transaction reference...' : 'Reason for rejection...'}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setActionModal(null)}
                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleAction(actionModal.action, actionModal.notes)}
                disabled={Boolean(processingId) || (actionModal.action === 'reject' && !actionModal.notes.trim())}
                className={`flex-1 py-2 text-white rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2 ${actionModal.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
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
