// File: ThinkMart/app/dashboard/layout.tsx
'use client';

import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { CartProvider } from "@/contexts/CartContext";
import { CartDrawer } from "@/components/shop/CartDrawer";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { checkRoleAccess } from "@/lib/guards/roleGuard";
import { Role } from "@/lib/types/roles";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      // Redirect to login with return path once auth state is resolved.
      const loginPath = `/auth/login?next=${encodeURIComponent(pathname || "/dashboard/user")}`;
      router.replace(loginPath);
      return;
    }

    // Role-based access control
    if (!loading && profile) {
      const userRole = profile.role as Role | undefined;
      const accessCheck = checkRoleAccess(userRole, pathname);

      if (!accessCheck.allowed && accessCheck.redirectTo) {
        console.warn(`[RBAC] Access denied: ${accessCheck.reason}. Redirecting to ${accessCheck.redirectTo}`);
        router.replace(accessCheck.redirectTo);
      }
    }
  }, [user, profile, loading, router, pathname]);

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <Loader2 className="animate-spin text-indigo-600" size={48} />
      </div>
    );
  }

  // Show nothing if not authenticated (will redirect)
  if (!user) {
    return null;
  }

  // Show nothing if wrong role (will redirect)
  if (profile) {
    const accessCheck = checkRoleAccess(profile.role as Role, pathname);
    if (!accessCheck.allowed) {
      return (
        <div className="flex h-screen items-center justify-center bg-gray-100">
          <Loader2 className="animate-spin text-indigo-600" size={48} />
        </div>
      );
    }
  }

  return (
    <CartProvider>
      <div className="flex h-screen bg-gray-100 overflow-hidden">
        {/* Sidebar - Stays fixed on the left */}
        <div className={`${sidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 flex-shrink-0 h-full`}>
          <Sidebar isOpen={sidebarOpen} />
        </div>

        {/* Main Content - Takes remaining space */}
        <div className="flex-1 flex flex-col h-full overflow-hidden w-full relative">
          <Topbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-6 text-gray-900">
            {children}
          </main>
        </div>

        {/* Cart Drawer - Now controlled via Context */}
        <CartDrawer />
      </div>
    </CartProvider>
  );
}
