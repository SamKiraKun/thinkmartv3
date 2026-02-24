// File: ThinkMart/components/shop/PurchaseModal.tsx
'use client';

import { useState } from 'react';
import { Product } from '@/types/product';
import { orderService } from '@/services/order.service';
import { useAuth } from '@/hooks/useAuth';
import { useStore } from '@/store/useStore'; // IMPORT STORE
import { X, Wallet, Coins, Loader2, CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface PurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

export const PurchaseModal: React.FC<PurchaseModalProps> = ({ isOpen, onClose, product }) => {
  const { user } = useAuth();
  const { wallet } = useStore(); // USE STORE FOR REAL DATA
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'balance' | 'coins'>('balance');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const getErrorMessage = (value: unknown, fallback: string) => {
    if (typeof value === 'string') return value;
    return value instanceof Error ? value.message : fallback;
  };

  // Safe defaults
  const currentBalance = wallet?.cashBalance ?? 0;
  const currentCoins = wallet?.coinBalance ?? 0;

  if (!isOpen || !product) return null;

  const handlePurchase = async () => {
    if (!user) return;
    setLoading(true);
    setError('');

    try {
      // FIX: Pass dummy address as PurchaseModal doesn't collect it yet
      const dummyAddress = {
        fullName: user.displayName || 'Guest',
        phone: '0000000000',
        addressLine1: 'Digital Purchase',
        city: 'N/A',
        state: 'N/A',
        pincode: '000000'
      };
      await orderService.createOrder(user.uid, product, paymentMethod, dummyAddress);
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
        router.refresh();
      }, 2000);
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Purchase failed"));
    } finally {
      setLoading(false);
    }
  };

  const coinCost = product.coinPrice || (product.price * 1000); // Updated logic: 1000 coins = ₹1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative">

        {!success && (
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        )}

        <div className="p-6">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                <CheckCircle size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Purchase Successful!</h3>
              <p className="text-gray-500 mt-2">Your order has been placed.</p>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Confirm Purchase</h2>
              <p className="text-gray-500 mb-6">You are about to buy <span className="font-semibold text-gray-800">{product.name}</span></p>

              <div className="space-y-3 mb-6">
                <label className="block text-sm font-medium text-gray-700">Choose Payment Method</label>

                {/* Cash Wallet Option */}
                <button
                  onClick={() => setPaymentMethod('balance')}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition ${paymentMethod === 'balance'
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 text-green-600 rounded-lg">
                      <Wallet size={20} />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-gray-900">Cash Wallet</p>
                      <p className="text-xs text-gray-500">Available: ₹{currentBalance.toFixed(2)}</p>
                    </div>
                  </div>
                  <span className="font-bold text-gray-900">₹{product.price.toLocaleString('en-IN')}</span>
                </button>

                {/* Coin Wallet Option */}
                <button
                  onClick={() => setPaymentMethod('coins')}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition ${paymentMethod === 'coins'
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-yellow-100 text-yellow-600 rounded-lg">
                      <Coins size={20} />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-gray-900">EcoCoins</p>
                      <p className="text-xs text-gray-500">Available: {currentCoins.toLocaleString()}</p>
                    </div>
                  </div>
                  <span className="font-bold text-gray-900">{coinCost.toLocaleString()} Coins</span>
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                  {error}
                </div>
              )}

              <button
                onClick={handlePurchase}
                disabled={loading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" /> : 'Confirm Payment'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
