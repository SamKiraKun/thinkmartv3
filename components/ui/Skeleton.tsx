// File: ThinkMart/components/ui/Skeleton.tsx
'use client';

interface SkeletonProps {
    className?: string;
}

/**
 * Base Skeleton component with shimmer animation
 */
export const Skeleton = ({ className = '' }: SkeletonProps) => (
    <div
        className={`animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] rounded ${className}`}
        style={{ animation: 'shimmer 1.5s infinite' }}
    />
);

/**
 * Skeleton for stat cards on dashboard
 */
export const StatCardSkeleton = () => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-8 w-32 mb-4" />
        <Skeleton className="h-3 w-20" />
    </div>
);

/**
 * Skeleton for action cards (quick actions grid)
 */
export const ActionCardSkeleton = () => (
    <div className="bg-white p-6 rounded-2xl border border-gray-100">
        <div className="flex justify-between items-start mb-4">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <Skeleton className="h-5 w-16 rounded" />
        </div>
        <Skeleton className="h-6 w-40 mb-2" />
        <Skeleton className="h-4 w-full mb-4" />
        <Skeleton className="h-4 w-24" />
    </div>
);

/**
 * Full page skeleton for dashboard
 */
export const DashboardSkeleton = () => (
    <div className="space-y-8 pb-10 animate-pulse">
        {/* Welcome section skeleton */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <Skeleton className="h-8 w-64 mb-2" />
                <Skeleton className="h-4 w-80" />
            </div>
        </div>

        {/* Stats grid skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
        </div>

        {/* Daily checkin skeleton */}
        <Skeleton className="h-32 w-full rounded-2xl" />

        {/* KYC card skeleton */}
        <Skeleton className="h-20 w-full rounded-2xl" />

        {/* Quick actions skeleton */}
        <Skeleton className="h-6 w-32 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <ActionCardSkeleton />
            <ActionCardSkeleton />
            <ActionCardSkeleton />
        </div>
    </div>
);

/**
 * Table row skeleton for admin lists
 */
export const TableRowSkeleton = ({ columns = 5 }: { columns?: number }) => (
    <tr>
        {Array.from({ length: columns }).map((_, i) => (
            <td key={i} className="px-4 py-3">
                <Skeleton className="h-4 w-full" />
            </td>
        ))}
    </tr>
);

/**
 * Table skeleton for admin pages
 */
export const TableSkeleton = ({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
            <Skeleton className="h-6 w-48" />
        </div>
        <table className="w-full">
            <thead>
                <tr className="bg-gray-50">
                    {Array.from({ length: columns }).map((_, i) => (
                        <th key={i} className="px-4 py-3 text-left">
                            <Skeleton className="h-4 w-20" />
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {Array.from({ length: rows }).map((_, i) => (
                    <TableRowSkeleton key={i} columns={columns} />
                ))}
            </tbody>
        </table>
    </div>
);
