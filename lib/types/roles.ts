// File: lib/types/roles.ts
// RBAC Role Definitions for ThinkMart

/**
 * Available roles in the system.
 * - user: End user (marketplace, tasks, withdrawals)
 * - partner: City investor (earns commission from city transactions)
 * - vendor: Marketplace seller (manages own products/orders)
 * - admin: Full system access
 * - sub_admin: Limited admin with configurable permissions
 */
export type Role = 'user' | 'partner' | 'vendor' | 'admin' | 'sub_admin' | 'organization';

/**
 * All available roles for validation
 */
export const ALL_ROLES: Role[] = ['user', 'partner', 'vendor', 'admin', 'sub_admin', 'organization'];

/**
 * Sub-admin permission types
 */
export const SUB_ADMIN_PERMISSIONS = [
    'manage_users',
    'manage_products',
    'manage_orders',
    'view_analytics',
    'process_withdrawals',
    'manage_tasks',
    'manage_kyc'
] as const;

export type SubAdminPermission = typeof SUB_ADMIN_PERMISSIONS[number];

/**
 * Partner configuration (city investor)
 */
export interface PartnerConfig {
    assignedCity: string;
    commissionPercentage: number; // Max 20% per partner
    assignedAt?: Date;
    assignedBy?: string;
}

/**
 * Vendor configuration (marketplace seller)
 */
export interface VendorConfig {
    vendorId: string;
    businessName: string;
    verified: boolean;
    createdAt?: Date;
}

/**
 * User profile with role and scope information
 */
export interface UserProfile {
    uid: string;
    email: string;
    name: string;
    role: Role;
    city?: string;
    // Role-specific configurations
    partnerConfig?: PartnerConfig;
    vendorConfig?: VendorConfig;
    subAdminPermissions?: SubAdminPermission[];
    // Common fields
    membershipActive?: boolean;
    createdAt?: Date;
}

/**
 * Dashboard routes by role
 */
export const DASHBOARD_ROUTES: Record<Role, string> = {
    user: '/dashboard/user',
    partner: '/dashboard/partner',
    vendor: '/dashboard/vendor',
    admin: '/dashboard/admin',
    sub_admin: '/dashboard/admin', // Sub-admin uses admin dashboard with limited access
    organization: '/dashboard/organization'
};

/**
 * Check if a role is an admin-level role
 */
export function isAdminRole(role: Role): boolean {
    return role === 'admin' || role === 'sub_admin';
}

/**
 * Get allowed roles for a dashboard path
 */
export function getAllowedRolesForPath(path: string): Role[] {
    if (path.startsWith('/dashboard/admin')) return ['admin', 'sub_admin'];
    if (path.startsWith('/dashboard/partner')) return ['partner'];
    if (path.startsWith('/dashboard/vendor')) return ['vendor'];
    if (path.startsWith('/dashboard/organization')) return ['organization'];
    if (path.startsWith('/dashboard/user')) return ['user'];
    return [];
}
