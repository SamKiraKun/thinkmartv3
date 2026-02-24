'use client';

/**
 * MobileBottomNav Component
 * 
 * Fixed bottom navigation for mobile devices.
 * Shows on screens < 768px width.
 */

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, ShoppingBag, Wallet, User, Gift } from 'lucide-react';

const navItems = [
    { href: '/dashboard/user', icon: Home, label: 'Home' },
    { href: '/dashboard/user/marketplace', icon: ShoppingBag, label: 'Shop' },
    { href: '/dashboard/user/tasks', icon: Gift, label: 'Earn' },
    { href: '/dashboard/user/wallet', icon: Wallet, label: 'Wallet' },
    { href: '/dashboard/user/profile', icon: User, label: 'Profile' },
];

export function MobileBottomNav() {
    const pathname = usePathname();

    // Check if current path matches nav item
    const isActive = (href: string) => {
        if (href === '/dashboard/user') {
            return pathname === '/dashboard/user';
        }
        return pathname.startsWith(href);
    };

    return (
        <>
            {/* Spacer to prevent content from being hidden behind nav */}
            <div className="h-16 md:hidden" />

            {/* Fixed bottom nav - only on mobile */}
            <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-gray-200 shadow-lg">
                <div className="flex items-center justify-around h-16 px-2">
                    {navItems.map((item) => {
                        const active = isActive(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${active
                                        ? 'text-indigo-600'
                                        : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <item.icon
                                    size={22}
                                    className={active ? 'text-indigo-600' : ''}
                                />
                                <span
                                    className={`text-xs mt-1 font-medium ${active ? 'text-indigo-600' : 'text-gray-500'
                                        }`}
                                >
                                    {item.label}
                                </span>

                                {/* Active indicator dot */}
                                {active && (
                                    <div className="absolute bottom-1 w-1 h-1 rounded-full bg-indigo-600" />
                                )}
                            </Link>
                        );
                    })}
                </div>

                {/* Safe area for iPhone notch */}
                <div className="h-[env(safe-area-inset-bottom)]" />
            </nav>
        </>
    );
}
