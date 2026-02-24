// File: ThinkMart/components/dashboard/Sidebar.tsx
'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  Wallet,
  Gamepad2,
  Users,
  ShoppingBag,
  LogOut,
  Settings,
  PieChart,
  ListChecks,
  ArrowRightLeft,
  Gift,
  Crown,
  Package,
  ShoppingCart,
  Trophy,
  ScrollText,
  Shield,
  Building2,
  DollarSign,
  GraduationCap
} from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
}

interface MenuItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  highlight?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
  const { user, profile, logout } = useAuth();
  const pathname = usePathname();

  const userMenuItems = [
    { label: "Dashboard", href: "/dashboard/user", icon: LayoutDashboard },
    { label: "Wallet", href: "/dashboard/user/wallet", icon: Wallet },
    ...(profile?.membershipActive
      ? []
      : [{ label: "Upgrade Plan", href: "/dashboard/user/upgrade", icon: Crown, highlight: true }]),
    { label: "Daily Tasks", href: "/dashboard/user/tasks", icon: ListChecks },
    { label: "Spin Wheel", href: "/dashboard/user/spin", icon: Gamepad2 },
    { label: "Lucky Box", href: "/dashboard/user/lucky-box", icon: Gift },
    { label: "Leaderboard", href: "/dashboard/user/leaderboard", icon: Trophy },
    { label: "Referrals", href: "/dashboard/user/referrals", icon: Users },
    { label: "Withdraw", href: "/dashboard/user/withdraw", icon: ArrowRightLeft },
    { label: "KYC Verification", href: "/dashboard/user/kyc", icon: Shield },
    { label: "Shop", href: "/dashboard/user/shop", icon: ShoppingBag },
    { label: "My Orders", href: "/dashboard/user/orders", icon: Package },
    { label: "Settings", href: "/dashboard/user/settings", icon: Settings },
  ] as MenuItem[];

  const partnerMenuItems: MenuItem[] = [
    { label: "Dashboard", href: "/dashboard/partner", icon: LayoutDashboard },
    { label: "My Users", href: "/dashboard/partner/users", icon: Users },
    { label: "Earnings", href: "/dashboard/partner/earnings", icon: Wallet },
    { label: "Withdrawals", href: "/dashboard/partner/withdrawals", icon: ArrowRightLeft },
  ];

  const adminMenuItems: MenuItem[] = [
    { label: "Dashboard", href: "/dashboard/admin", icon: LayoutDashboard },
    { label: "Users", href: "/dashboard/admin/users", icon: Users },
    { label: "Products", href: "/dashboard/admin/products", icon: Package },
    { label: "Orders", href: "/dashboard/admin/orders", icon: ShoppingCart },
    { label: "Transactions", href: "/dashboard/admin/transactions", icon: ScrollText },
    { label: "Partners", href: "/dashboard/admin/partners", icon: Users },
    { label: "Tasks", href: "/dashboard/admin/tasks", icon: ListChecks },
    { label: "Withdrawals", href: "/dashboard/admin/withdrawals", icon: ArrowRightLeft },
    { label: "KYC Requests", href: "/dashboard/admin/kyc", icon: Shield },
    { label: "Analytics", href: "/dashboard/admin/analytics", icon: PieChart },
    { label: "Settings", href: "/dashboard/admin/settings", icon: Settings },
  ];

  const vendorMenuItems: MenuItem[] = [
    { label: "Dashboard", href: "/dashboard/vendor", icon: LayoutDashboard },
    { label: "My Products", href: "/dashboard/vendor/products", icon: Package },
    { label: "Orders", href: "/dashboard/vendor/orders", icon: ShoppingCart },
    { label: "Analytics", href: "/dashboard/vendor/analytics", icon: PieChart },
    { label: "Store Profile", href: "/dashboard/vendor/store", icon: Building2 },
  ];

  const organizationMenuItems: MenuItem[] = [
    { label: "Dashboard", href: "/dashboard/organization", icon: LayoutDashboard },
    { label: "Members", href: "/dashboard/organization/members", icon: Users },
    { label: "Earnings", href: "/dashboard/organization/earnings", icon: DollarSign },
  ];

  const getMenuItems = () => {
    const role = profile?.role || "user";
    if (role === "admin" || role === "sub_admin") return adminMenuItems;
    if (role === "partner") return partnerMenuItems;
    if (role === "vendor") return vendorMenuItems;
    if (role === "organization") return organizationMenuItems;
    return userMenuItems;
  };

  return (
    <aside className={`bg-[#0f1119] border-r border-white/5 text-white h-full transition-all duration-300 flex flex-col shadow-2xl ${isOpen ? "w-64" : "w-0 overflow-hidden"}`}>
      <div className="p-6 border-b border-white/5 flex-shrink-0 bg-[#0f1119]">
        <div className="flex items-center gap-2 mb-2">
          <div className="bg-indigo-500/20 p-1.5 rounded-lg">
            <ShoppingBag className="w-5 h-5 text-indigo-400" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70 truncate">ThinkMart</h1>
        </div>

        <div className="mt-4 p-3 bg-white/5 rounded-xl border border-white/5">
          <p className="text-white text-sm font-medium truncate">
            {profile?.name || user?.displayName || "User"}
          </p>
          <span className="text-xs text-indigo-300 uppercase tracking-wider block truncate mt-0.5 font-semibold">
            {profile?.role || "Member"}
          </span>
        </div>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto custom-scrollbar bg-[#0f1119]">
        <ul className="space-y-1">
          {getMenuItems().map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            const isHighlight = item.highlight;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group whitespace-nowrap border ${isActive
                    ? "bg-indigo-600 shadow-lg shadow-indigo-900/50 border-indigo-500 text-white"
                    : isHighlight
                      ? "bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-300 hover:bg-amber-500/20 border-amber-500/20 hover:border-amber-500/40"
                      : "text-gray-400 hover:bg-white/5 border-transparent hover:text-white"
                    }`}
                >
                  <Icon size={18} className={`flex-shrink-0 ${isActive ? "text-white" : isHighlight ? "text-amber-300" : "text-gray-500 group-hover:text-white transition-colors"}`} />
                  <span className={`font-medium text-sm ${isActive ? "font-semibold" : ""}`}>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-white/5 bg-[#0f1119] flex-shrink-0">
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-all duration-200 font-medium whitespace-nowrap text-sm border border-transparent hover:border-red-500/50"
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};
