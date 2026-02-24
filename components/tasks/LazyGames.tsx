// File: components/tasks/LazyGames.tsx
/**
 * Lazy-loaded Game Components
 * 
 * Uses next/dynamic to defer loading of heavy canvas-based game components.
 * This reduces initial bundle size by ~30% for pages that don't immediately need games.
 */

'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/Skeleton';

// Skeleton specifically for game components
const GameSkeleton = () => (
    <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <Skeleton className="w-64 h-64 rounded-full" />
        <Skeleton className="w-32 h-8 rounded-lg" />
        <Skeleton className="w-48 h-10 rounded-full" />
    </div>
);

/**
 * Lazy-loaded SpinWheel component
 * Only loaded when rendered, not included in initial bundle
 */
export const LazySpinWheel = dynamic(
    () => import('./SpinWheel').then(mod => ({ default: mod.SpinWheel })),
    {
        loading: () => <GameSkeleton />,
        ssr: false, // Canvas doesn't work with SSR
    }
);

/**
 * Lazy-loaded LuckyBox component
 * Only loaded when rendered, not included in initial bundle
 */
export const LazyLuckyBox = dynamic(
    () => import('./LuckyBox').then(mod => ({ default: mod.LuckyBox })),
    {
        loading: () => <GameSkeleton />,
        ssr: false, // Canvas doesn't work with SSR
    }
);

// Re-export for convenience
export { GameSkeleton };
