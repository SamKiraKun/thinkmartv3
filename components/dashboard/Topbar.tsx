// File: ThinkMart/components/dashboard/Topbar.tsx
'use client';

import { useAuth } from "@/hooks/useAuth";
import { useStore } from "@/store/useStore";
import { useCart } from "@/contexts/CartContext";
import { Menu, Bell, User, LogOut, ShoppingCart } from "lucide-react";
import { useState } from "react";

interface TopbarProps {
  onToggleSidebar: () => void;
  onOpenCart?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onToggleSidebar, onOpenCart }) => {
  const { user, logout } = useAuth();
  const { wallet } = useStore();
  const { itemCount, setIsOpen } = useCart();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Safe defaults
  const coinBalance = wallet?.coinBalance || 0;
  const cashBalance = wallet?.cashBalance || 0;

  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 lg:hidden"
        >
          <Menu size={20} />
        </button>

        {/* Wallet Summary in Header */}
        <div className="hidden md:flex items-center gap-4 text-sm font-medium">
          <div className="bg-yellow-50 text-yellow-700 px-3 py-1 rounded-full border border-yellow-200">
            🪙 {coinBalance.toLocaleString()} Coins
          </div>
          <div className="bg-green-50 text-green-700 px-3 py-1 rounded-full border border-green-200">
            ₹{cashBalance.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Cart Button */}
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 text-gray-500 hover:bg-gray-100 rounded-full relative"
        >
          <ShoppingCart size={20} />
          {itemCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-indigo-600 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
              {itemCount > 99 ? '99+' : itemCount}
            </span>
          )}
        </button>

        {/* Notifications */}
        <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full relative">
          <Bell size={20} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
        </button>

        {/* Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 hover:bg-gray-50 p-1.5 rounded-lg transition"
          >
            <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold">
              {user?.displayName?.charAt(0) || 'U'}
            </div>
            <span className="text-sm font-medium text-gray-700 hidden sm:block">
              {user?.displayName || 'User'}
            </span>
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 animate-in fade-in zoom-in duration-200">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-sm font-bold text-gray-900">{user?.displayName}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
              <button
                onClick={logout}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};