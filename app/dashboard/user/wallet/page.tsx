// File: ThinkMart/app/dashboard/user/wallet/page.tsx
'use client';

import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { convertCoinsToCash } from '@/services/walletService';
import { WalletCard } from '@/components/dashboard/WalletCard';
import { ArrowRightLeft, History, Coins, Loader2 } from 'lucide-react';
import { formatINRDecimal } from '@/lib/utils/currency';

export default function WalletPage() {
  const { wallet, transactions, loading, refresh } = useWallet();

  const [convertAmount, setConvertAmount] = useState('');
  const [converting, setConverting] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const currentBalance = wallet?.cashBalance ?? 0;
  const currentCoins = wallet?.coinBalance ?? 0;

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);

    const coins = parseInt(convertAmount, 10);

    if (isNaN(coins) || coins <= 0) {
      setNotice({ type: 'error', text: 'Please enter a valid amount.' });
      return;
    }

    if (coins < 1000) {
      setNotice({ type: 'error', text: 'Minimum conversion is 1,000 coins.' });
      return;
    }

    if (coins > currentCoins) {
      setNotice({ type: 'error', text: 'Insufficient coin balance.' });
      return;
    }

    setConverting(true);
    try {
      const data = await convertCoinsToCash(coins);

      setNotice({
        type: 'success',
        text: `Successfully converted ${coins.toLocaleString()} coins to ${formatINRDecimal(data.convertedAmount)}.`,
      });
      setConvertAmount('');
      refresh();
    } catch (error) {
      console.error(error);
      setNotice({ type: 'error', text: getErrorMessage(error, 'Conversion failed. Please try again.') });
    } finally {
      setConverting(false);
    }
  };

  const conversionRate = 100 / 100000; // 1000 Coins = ₹1
  const previewAmount = convertAmount ? parseInt(convertAmount, 10) * conversionRate : 0;
  const formatTxDate = (value: unknown) => {
    if (value instanceof Date) return value.toLocaleDateString();
    if (typeof value === 'string') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? 'Just now' : d.toLocaleDateString();
    }
    if (value && typeof (value as { seconds?: number }).seconds === 'number') {
      return new Date((value as { seconds: number }).seconds * 1000).toLocaleDateString();
    }
    return 'Just now';
  };

  if (loading && !wallet) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900">My Wallet</h1>

      {notice && (
        <div className={`p-4 rounded-xl border text-sm font-medium ${notice.type === 'success'
          ? 'bg-green-50 border-green-200 text-green-700'
          : 'bg-red-50 border-red-200 text-red-700'
          }`}>
          {notice.text}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <WalletCard
          type="balance"
          amount={currentBalance}
          label="Withdrawable Balance"
        />
        <WalletCard
          type="coins"
          amount={currentCoins}
          label="ThinkCoins"
        />
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <ArrowRightLeft className="text-indigo-600" /> Convert Coins to Cash
        </h2>

        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 mb-6 flex items-start gap-3">
          <Coins className="text-indigo-600 shrink-0 mt-1" size={20} />
          <div>
            <p className="text-indigo-900 font-medium">Conversion Rate</p>
            <p className="text-indigo-700 text-sm">1,000 Coins = ₹1.00 (Min conversion: 1,000 coins)</p>
          </div>
        </div>

        <form onSubmit={handleConvert} className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">Coins to Convert</label>
            <input
              type="number"
              value={convertAmount}
              onChange={(e) => setConvertAmount(e.target.value)}
              placeholder="Enter coins (e.g. 1000)"
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none"
              min="1000"
            />
          </div>
          <button
            type="submit"
            disabled={converting || !convertAmount || parseInt(convertAmount, 10) < 1000}
            className="w-full sm:w-auto px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {converting ? <Loader2 className="animate-spin" /> : 'Convert'}
          </button>
        </form>

        {convertAmount && !isNaN(parseInt(convertAmount, 10)) && (
          <p className="text-sm text-gray-500 mt-2">
            You will receive: <span className="font-bold text-green-600">{formatINRDecimal(previewAmount)}</span>
          </p>
        )}
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <History className="text-gray-500" /> Recent Transactions
        </h2>

        <div className="space-y-4">
          {transactions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No transactions yet.</p>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id || Math.random()} className="flex justify-between items-center p-4 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100 transition">
                <div>
                  <p className="font-semibold text-gray-900">{tx.description || tx.type}</p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs text-gray-500 uppercase bg-gray-200 px-2 py-0.5 rounded">
                      {tx.type.replace('_', ' ')}
                    </span>
                    {tx.status && (
                      <span className={`text-xs uppercase px-2 py-0.5 rounded ${tx.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {tx.status}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${['WITHDRAWAL', 'MEMBERSHIP_FEE'].includes(tx.type) ? 'text-red-600' : 'text-green-600'}`}>
                    {['WITHDRAWAL', 'MEMBERSHIP_FEE'].includes(tx.type) ? '-' : '+'}
                    {tx.currency === 'COIN' ? '' : '₹'}
                    {tx.amount?.toLocaleString()}
                    {tx.currency === 'COIN' ? ' coins' : ''}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatTxDate(tx.createdAt)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
