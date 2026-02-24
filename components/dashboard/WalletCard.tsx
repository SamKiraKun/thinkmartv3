// File: ThinkMart/components/dashboard/WalletCard.tsx
import { Wallet, Coins } from "lucide-react";

interface WalletCardProps {
  type: 'balance' | 'coins';
  amount: number; // We receive 'amount', not 'balance'
  label: string;
}

export const WalletCard: React.FC<WalletCardProps> = ({ type, amount, label }) => {
  // Safety check: ensure amount is a number, default to 0 if undefined/null
  const safeAmount = amount ?? 0;

  return (
    <div className={`p-6 rounded-2xl shadow-lg border border-transparent transition-all hover:shadow-xl ${
      type === 'balance' 
        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' 
        : 'bg-white text-gray-900 border-gray-100'
    }`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm font-medium mb-2 ${type === 'balance' ? 'text-indigo-100' : 'text-gray-500'}`}>
            {label}
          </p>
          <h3 className="text-4xl font-bold">
            {/* Fix: Use safeAmount here instead of undefined 'balance' */}
            {type === 'balance' 
              ? `₹${safeAmount.toFixed(2)}` 
              : safeAmount.toLocaleString()
            }
          </h3>
        </div>
        <div className={`p-4 rounded-xl ${
          type === 'balance' ? 'bg-white/20 text-white' : 'bg-yellow-50 text-yellow-600'
        }`}>
          {type === 'balance' ? <Wallet size={32} /> : <Coins size={32} />}
        </div>
      </div>
    </div>
  );
};