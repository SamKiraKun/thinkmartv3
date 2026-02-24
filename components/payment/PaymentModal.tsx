// File: myecom/components/payment/PaymentModal.tsx
'use client';

import { useState } from 'react';
import { X, CheckCircle, ShieldCheck, CreditCard } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { purchaseMembership } from '@/services/membershipService';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string | undefined;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, userEmail }) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  if (!isOpen) return null;

  const handlePayment = async () => {
    setLoading(true);
    setError('');

    try {
      // --- SIMULATION START ---
      // In a real app, this is where you'd open Razorpay/Stripe
      console.log("Initializing Payment for:", userEmail);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate 2s delay
      // --- SIMULATION END ---

      // Call Backend to Activate Membership
      await purchaseMembership();

      setSuccess(true);
      
      // Auto-close after success
      setTimeout(() => {
        onClose();
        router.refresh(); // Refresh to update UI to "Premium"
      }, 2000);

    } catch (err) {
      console.error("Payment Error:", err);
      setError(getErrorMessage(err, "Payment failed. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative animate-in fade-in zoom-in duration-200">
        
        {/* Close Button */}
        {!success && !loading && (
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition">
            <X size={24} />
          </button>
        )}

        {/* Content */}
        <div className="p-8 text-center">
          
          {success ? (
            <div className="py-8 space-y-4">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                <CheckCircle size={40} />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Welcome to Premium!</h2>
              <p className="text-gray-500">Your membership is now active. You can now earn from all 6 levels.</p>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <ShieldCheck size={32} />
              </div>
              
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Unlock Premium Access</h2>
              <p className="text-gray-500 mb-8">
                One-time payment of <span className="font-bold text-gray-900">₹1,000</span> to activate lifetime team earnings.
              </p>

              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={handlePayment}
                  disabled={loading}
                  className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all transform active:scale-95 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard size={20} /> Pay ₹1,000 Now
                    </>
                  )}
                </button>
                
                <p className="text-xs text-gray-400 mt-4">
                  Secured by EcoEarn Payments. 100% Refundable within 7 days if not satisfied.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
