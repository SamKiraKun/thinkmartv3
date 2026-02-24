// File: ThinkMart/app/dashboard/user/withdraw/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useStore } from '@/store/useStore';
import { usePublicSettings } from '@/hooks/usePublicSettings';
import { createWithdrawal, fetchWithdrawals } from '@/services/withdrawalService';
import {
  Wallet,
  CreditCard,
  History,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Info,
  Shield,
  Lock,
  Building,
  Smartphone,
  X,
} from 'lucide-react';
import Link from 'next/link';

interface KYCBankDetails {
  bankName: string;
  accountNumber: string;
  ifscCode: string;
}

interface WithdrawalHistoryItem {
  id: string;
  amount: number;
  method: 'upi' | 'bank' | 'wallet';
  status: 'pending' | 'completed' | 'rejected';
  bankDetails?: { bankName?: string; accountNumber?: string; ifscCode?: string } | null;
  upiId?: string | null;
  adminNotes?: string;
  rejectionReason?: string | null;
  requestedAt?: string;
}

export default function WithdrawalPage() {
  const { user, profile } = useAuth();
  const { wallet } = useStore();
  const { settings: publicSettings } = usePublicSettings();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'bank' | 'upi'>('bank');
  const [upiId, setUpiId] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [history, setHistory] = useState<WithdrawalHistoryItem[]>([]);

  const [kycBank, setKycBank] = useState<KYCBankDetails | null>(null);
  const [loadingKyc, setLoadingKyc] = useState(true);

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const currentBalance = wallet?.cashBalance ?? 0;
  const isKycVerified = profile?.kycStatus === 'verified';
  const withdrawalsEnabled = publicSettings?.withdrawalsEnabled !== false;

  useEffect(() => {
    if (!user) return;
    if (profile?.kycData) {
      setKycBank({
        bankName: profile.kycData.bankName || '',
        accountNumber: profile.kycData.accountNumber || '',
        ifscCode: profile.kycData.ifscCode || '',
      });
    } else {
      setKycBank(null);
    }
    setLoadingKyc(false);
  }, [user, profile]);

  useEffect(() => {
    if (!user) return;
    
    let active = true;
    let intervalId: NodeJS.Timeout;

    const loadHistory = async () => {
      try {
        const res = await fetchWithdrawals(user.uid, 1, 50);
        if (active) {
          setHistory(res.data as WithdrawalHistoryItem[]);
        }
      } catch (error) {
        console.error('Withdrawals fetch error:', error);
      }
    };

    void loadHistory();
    intervalId = setInterval(() => {
      void loadHistory();
    }, 15000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);

    const withdrawAmount = parseFloat(amount);

    if (!isKycVerified) {
      setNotice({ type: 'error', text: 'Please complete KYC verification first.' });
      return;
    }

    if (!withdrawalsEnabled) {
      setNotice({ type: 'error', text: 'Withdrawals are temporarily disabled.' });
      return;
    }

    if (!Number.isFinite(withdrawAmount) || withdrawAmount <= 0) {
      setNotice({ type: 'error', text: 'Please enter a valid withdrawal amount.' });
      return;
    }

    const minWithdrawalAmount = publicSettings?.minWithdrawalAmount || 500;
    if (withdrawAmount < minWithdrawalAmount) {
      setNotice({ type: 'error', text: 'Minimum withdrawal is ₹500.' });
      return;
    }

    if (withdrawAmount > currentBalance) {
      setNotice({ type: 'error', text: `Insufficient balance. You only have ₹${currentBalance.toFixed(2)}.` });
      return;
    }

    if (method === 'upi' && !upiId.includes('@')) {
      setNotice({ type: 'error', text: 'Please enter a valid UPI ID (e.g., user@oksbi).' });
      return;
    }

    if (method === 'bank' && (!kycBank?.accountNumber || !kycBank?.ifscCode)) {
      setNotice({ type: 'error', text: 'Bank details from KYC are required. Please complete KYC first.' });
      return;
    }

    setLoading(true);
    try {
      await createWithdrawal({
        amount: withdrawAmount,
        method,
        upiId: method === 'upi' ? upiId : undefined,
        bankDetails: method === 'bank'
          ? {
              bankName: kycBank?.bankName || '',
              accountNumber: kycBank?.accountNumber || '',
              ifscCode: kycBank?.ifscCode || '',
            }
          : undefined,
      });

      setNotice({ type: 'success', text: 'Withdrawal requested successfully.' });
      setAmount('');
      setUpiId('');
    } catch (error) {
      console.error(error);
      setNotice({ type: 'error', text: getErrorMessage(error, 'Request failed') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold text-gray-900">Withdraw Funds</h1>

      {notice && (
        <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${notice.type === 'success'
          ? 'bg-green-50 border-green-200 text-green-700'
          : 'bg-red-50 border-red-200 text-red-700'
          }`}>
          <span className="text-sm font-medium">{notice.text}</span>
          <button
            onClick={() => setNotice(null)}
            className="p-1 rounded hover:bg-black/5"
            aria-label="Dismiss notice"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {!isKycVerified && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-full">
              <Shield className="text-amber-600" size={24} />
            </div>
            <div>
              <p className="font-bold text-amber-800">KYC Required for Withdrawals</p>
              <p className="text-sm text-amber-600">Complete your KYC verification to enable withdrawals.</p>
            </div>
          </div>
          <Link
            href="/dashboard/user/kyc"
            className="px-4 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 transition"
          >
            Complete KYC
          </Link>
        </div>
      )}

      {!withdrawalsEnabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-full">
            <AlertCircle className="text-amber-600" size={20} />
          </div>
          <div>
            <p className="font-bold text-amber-800">Withdrawals Temporarily Disabled</p>
            <p className="text-sm text-amber-600">Please check back later.</p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-8">
        <div className={`bg-white p-6 rounded-2xl shadow-sm border border-gray-200 h-fit ${(!isKycVerified || !withdrawalsEnabled) ? 'opacity-60 pointer-events-none' : ''}`}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <CreditCard className="text-indigo-600" /> New Request
            </h2>
            <div className="bg-green-100 text-green-700 px-3 py-1.5 rounded-full text-sm font-bold flex items-center gap-2 border border-green-200">
              <Wallet size={16} /> Balance: ₹{currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (Min ₹500)</label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-gray-500 font-bold">₹</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none transition"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Payout Method</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setMethod('bank')}
                  className={`p-3 rounded-lg border font-medium transition flex items-center justify-center gap-2 ${method === 'bank' ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : 'hover:bg-gray-50 text-gray-600'}`}
                >
                  <Building size={18} /> Bank Transfer
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('upi')}
                  className={`p-3 rounded-lg border font-medium transition flex items-center justify-center gap-2 ${method === 'upi' ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : 'hover:bg-gray-50 text-gray-600'}`}
                >
                  <Smartphone size={18} /> UPI
                </button>
              </div>
            </div>

            {method === 'bank' && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-700 flex items-center gap-2">
                    <Building size={16} /> Bank Details (from KYC)
                  </h3>
                  <Link href="/dashboard/user/kyc" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                    <Lock size={12} /> Edit in KYC
                  </Link>
                </div>

                {loadingKyc ? (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 className="animate-spin" size={16} /> Loading...
                  </div>
                ) : kycBank?.accountNumber ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Bank Name</span>
                      <span className="font-medium text-gray-900">{kycBank.bankName || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Account Number</span>
                      <span className="font-mono font-medium text-gray-900">****{kycBank.accountNumber.slice(-4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">IFSC Code</span>
                      <span className="font-mono font-medium text-gray-900">{kycBank.ifscCode}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-amber-600 text-sm">No bank details found. Please complete your KYC.</p>
                )}
              </div>
            )}

            {method === 'upi' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">UPI ID</label>
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none transition"
                  placeholder="username@upi"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Enter your UPI ID (e.g., user@oksbi, user@paytm)</p>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || !isKycVerified || !withdrawalsEnabled}
                className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition flex justify-center items-center gap-2 shadow-lg shadow-indigo-200 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="animate-spin" /> : 'Submit Withdrawal Request'}
              </button>
              <p className="text-xs text-center text-gray-500 mt-3">Requests are processed within 24-48 hours.</p>
            </div>
          </form>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col h-[600px]">
          <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <History className="text-gray-500" /> Request History
          </h2>

          <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
            {history.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                <History size={48} className="mb-2" />
                <p>No withdrawal history found.</p>
              </div>
            ) : (
              history.map((item) => (
                <div key={item.id} className="p-4 border border-gray-100 rounded-xl bg-gray-50 hover:bg-white hover:shadow-md transition group">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-2xl font-bold text-gray-900">₹{item.amount.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide flex items-center gap-1 mt-1">
                        {item.method === 'upi' ? (
                          <><Smartphone size={12} /> UPI Transfer</>
                        ) : (
                          <><Building size={12} /> Bank Transfer</>
                        )}
                      </p>
                    </div>

                    <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm
                      ${item.status === 'pending' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                        item.status === 'completed' ? 'bg-green-100 text-green-700 border border-green-200' :
                          'bg-red-100 text-red-700 border border-red-200'}`}>
                      {item.status === 'pending' && <AlertCircle size={14} />}
                      {item.status === 'completed' && <CheckCircle2 size={14} />}
                      {item.status === 'rejected' && <XCircle size={14} />}
                      {item.status === 'completed' ? 'Approved' : item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </div>
                  </div>

                  <div className="flex justify-between items-end border-t border-gray-200 pt-3 mt-2">
                    <div className="text-sm text-gray-600">
                      <p className="truncate max-w-[150px] sm:max-w-[200px]" title={item.upiId || item.bankDetails?.accountNumber}>
                        <span className="text-gray-500">To:</span> {item.upiId || `****${item.bankDetails?.accountNumber?.slice(-4) || ''}`}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {item.requestedAt ? new Date(item.requestedAt).toLocaleString() : 'Just now'}
                      </p>
                    </div>

                    {(item.status === 'rejected' || item.adminNotes) && (
                      <div className="text-right max-w-[50%]">
                        <p className="text-xs font-bold text-gray-500 flex items-center justify-end gap-1">
                          <Info size={12} /> Note:
                        </p>
                        <p className="text-xs text-red-600 italic leading-tight">
                          &quot;{item.adminNotes || item.rejectionReason || 'No reason provided'}&quot;
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
