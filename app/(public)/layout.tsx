// File: ThinkMart/app/(public)/layout.tsx
'use client';

import { PublicNavbar } from "@/components/layout/PublicNavbar";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { usePathname } from 'next/navigation';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isHome = pathname === '/';

  return (
    <div className="flex flex-col min-h-screen">
      <PublicNavbar />
      <main className={`flex-grow ${isHome ? '' : 'pt-16'}`}>
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}