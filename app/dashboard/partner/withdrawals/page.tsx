// File: ThinkMart/app/dashboard/partner/withdrawals/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useStore } from '@/store/useStore';
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
  X,
} from 'lucide-react';

interface WithdrawalHistoryItem {
  id: string;
  amount: number;
  method: 'upi' | 'bank' | 'wallet';
  status: 'pending' | 'completed' | 'rejected';
  bankDetails?: { accountNumber?: string } | null;
  upiId?: string | null;
  adminNotes?: string;
  rejectionReason?: string | null;
  requestedAt?: string;
}

export default function PartnerWithdrawalsPage() {
  const { user } = useAuth();
  const { wallet } = useStore();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'upi' | 'bank'>('upi');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [history, setHistory] = useState<WithdrawalHistoryItem[]>([]);

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const currentBalance = wallet?.cashBalance ?? 0;

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

    if (!Number.isFinite(withdrawAmount) || withdrawAmount <= 0) {
      setNotice({ type: 'error', text: 'Please enter a valid amount.' });
      return;
    }

    if (withdrawAmount < 500) {
      setNotice({ type: 'error', text: 'Minimum withdrawal is ₹500.' });
      return;
    }

    if (withdrawAmount > currentBalance) {
      setNotice({ type: 'error', text: `Insufficient balance. You only have ₹${currentBalance.toFixed(2)}.` });
      return;
    }

    if (!details.trim()) {
      setNotice({ type: 'error', text: 'Please provide payout details.' });
      return;
    }

    setLoading(true);
    try {
      await createWithdrawal({
        amount: withdrawAmount,
        method,
        upiId: method === 'upi' ? details.trim() : undefined,
        bankDetails: method === 'bank'
          ? { accountNumber: details.trim() }
          : undefined,
      });

      setNotice({ type: 'success', text: 'Withdrawal requested successfully.' });
      setAmount('');
      setDetails('');
    } catch (error) {
      console.error(error);
      setNotice({ type: 'error', text: getErrorMessage(error, 'Request failed') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Partner Withdrawals</h1>
          <p className="text-gray-500 mt-1">Manage your commission payouts.</p>
        </div>
      </div>

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

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 h-fit">
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
                  onClick={() => setMethod('upi')}
                  className={`p-3 rounded-lg border font-medium transition ${method === 'upi' ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : 'hover:bg-gray-50 text-gray-600'}`}
                >
                  UPI
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('bank')}
                  className={`p-3 rounded-lg border font-medium transition ${method === 'bank' ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : 'hover:bg-gray-50 text-gray-600'}`}
                >
                  Bank
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {method === 'upi' ? 'UPI ID (e.g., user@oksbi)' : 'Account No. & IFSC'}
              </label>
              <input
                type="text"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none transition"
                placeholder={method === 'upi' ? 'username@upi' : 'Acc No, IFSC Code'}
                required
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition flex justify-center items-center gap-2 shadow-lg shadow-indigo-200 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="animate-spin" /> : 'Submit Withdrawal Request'}
              </button>
              <p className="text-xs text-center text-gray-500 mt-3">Requests are typically processed within 24-48 hours.</p>
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
                      <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide mt-1">
                        {item.method === 'upi' ? 'UPI Transfer' : 'Bank Transfer'}
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
                        <span className="text-gray-500">To:</span> {item.upiId || item.bankDetails?.accountNumber}
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
