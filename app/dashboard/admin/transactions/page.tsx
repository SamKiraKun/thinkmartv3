'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchAdminTransactions, type AdminTransaction } from '@/services/adminService';
import {
  Search,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  RefreshCw,
  UserRound,
  Link2,
} from 'lucide-react';



const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'withdrawal', label: 'Withdrawals' },
  { value: 'order', label: 'Orders' },
  { value: 'purchase', label: 'Orders' },
  { value: 'refund', label: 'Refunds' },
  { value: 'membership', label: 'Membership' },
  { value: 'game', label: 'Games' },
  { value: 'task', label: 'Tasks' },
  { value: 'partner_commission', label: 'Partner Comm.' },
] as const;

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchTransactions = useCallback(
    async (reset: boolean, pageNum: number = 1) => {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      setError(null);
      try {
        const filters = {
          category: filterCategory !== 'all' ? filterCategory : undefined,
          search: debouncedSearch || undefined,
        };
        const response = await fetchAdminTransactions(pageNum, 20, filters);

        const nextItems = response.data || [];
        setTransactions((prev) => (reset ? nextItems : [...prev, ...nextItems]));
        setPage(pageNum);
        setHasMore(Boolean(response.pagination.hasNext));
      } catch (err: any) {
        setError(err.message || 'Failed to load transactions');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedSearch, filterCategory]
  );

  useEffect(() => {
    setPage(1);
    setHasMore(false);
    void fetchTransactions(true, 1);
  }, [fetchTransactions]);

  const formatAmount = (tx: AdminTransaction) => {
    const normalizedType = tx.type.toLowerCase();
    const sign = normalizedType.includes('debit') ? '-' : normalizedType.includes('credit') ? '+' : '';

    if (tx.amount > 0) {
      return `${sign}₹${tx.amount.toLocaleString('en-IN')}`;
    }

    if (tx.coinAmount > 0) {
      return `${sign}${tx.coinAmount.toLocaleString('en-IN')} Coins`;
    }

    return '-';
  };

  const getCounterparty = (tx: AdminTransaction) => {
    const fromLabel = tx.fromName || tx.fromUid || '-';
    const toLabel = tx.toName || tx.toUid || tx.userName || tx.userId || '-';

    if (tx.fromName || tx.fromUid || tx.toName || tx.toUid) {
      return `${fromLabel} -> ${toLabel}`;
    }

    return tx.userName || tx.userId || '-';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Global Transactions</h1>
          <p className="text-gray-500 mt-1">Audit financial flow across the platform.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search ID, user, description..."
              className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <select
              className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none bg-white w-full appearance-none cursor-pointer"
              value={filterCategory}
              onChange={(e) => {
                setFilterCategory(e.target.value);
                setTransactions([]);
                setPage(1);
              }}
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => void fetchTransactions(true, 1)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition text-gray-700 font-medium"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 text-sm border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-semibold">Details</th>
                <th className="px-6 py-4 font-semibold">Counterparty</th>
                <th className="px-6 py-4 font-semibold">Reference</th>
                <th className="px-6 py-4 font-semibold">Category</th>
                <th className="px-6 py-4 font-semibold text-right">Amount</th>
                <th className="px-6 py-4 font-semibold text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <Loader2 className="animate-spin mx-auto mb-2" />
                    Loading transactions...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No transactions found.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const normalizedType = tx.type.toLowerCase();
                  const isCredit = normalizedType.includes('credit');

                  return (
                    <tr key={tx.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${isCredit ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                            {isCredit ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm truncate max-w-[220px]" title={tx.description}>
                              {tx.description || 'No description'}
                            </p>
                            <p className="text-xs text-gray-400 font-mono">ID: {tx.id.slice(0, 10)}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="inline-flex items-center gap-1.5">
                          <UserRound size={14} className="text-gray-400" />
                          <span>{getCounterparty(tx)}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-600">
                        {tx.referenceId ? (
                          <span className="inline-flex items-center gap-1.5 font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                            <Link2 size={12} className="text-gray-400" />
                            {tx.referenceId.slice(0, 14)}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <span className="text-xs uppercase font-bold tracking-wider px-2 py-1 rounded border bg-gray-50 text-gray-600 border-gray-200">
                          {tx.category || 'misc'}
                        </span>
                      </td>

                      <td className={`px-6 py-4 text-right font-bold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                        {formatAmount(tx)}
                      </td>

                      <td className="px-6 py-4 text-right text-sm text-gray-500">
                        {tx.timestampMs ? new Date(tx.timestampMs).toLocaleString() : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <div className="p-4 border-t border-gray-100 text-center bg-gray-50">
            <button
              onClick={() => void fetchTransactions(false, page + 1)}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800 text-sm font-bold hover:underline disabled:opacity-60"
            >
              {loadingMore && <Loader2 size={14} className="animate-spin" />}
              Load More Activity
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
