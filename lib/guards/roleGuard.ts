// File: lib/guards/roleGuard.ts
// Frontend Role Guard Utilities

import { Role, getAllowedRolesForPath, DASHBOARD_ROUTES, SubAdminPermission } from '@/lib/types/roles';

export interface RoleCheckResult {
    allowed: boolean;
    redirectTo?: string;
    reason?: string;
}

/**
 * Check if a user's role is allowed to access a specific path.
 * Returns redirect destination if not allowed.
 */
export function checkRoleAccess(
    userRole: Role | undefined,
    currentPath: string
): RoleCheckResult {
    // No role = not authenticated
    if (!userRole) {
        return {
            allowed: false,
            redirectTo: '/auth/login',
            reason: 'Not authenticated'
        };
    }

    const allowedRoles = getAllowedRolesForPath(currentPath);

    // No restrictions on this path
    if (allowedRoles.length === 0) {
        return { allowed: true };
    }

    // Check if user's role is in allowed list
    if (allowedRoles.includes(userRole)) {
        return { allowed: true };
    }

    // Not allowed - redirect to their correct dashboard
    return {
        allowed: false,
        redirectTo: DASHBOARD_ROUTES[userRole] || '/dashboard/user',
        reason: `Role '${userRole}' cannot access this dashboard`
    };
}

/**
 * Check if user has a specific role (shorthand)
 */
export function hasRole(userRole: Role | undefined, requiredRole: Role | Role[]): boolean {
    if (!userRole) return false;

    if (Array.isArray(requiredRole)) {
        return requiredRole.includes(userRole);
    }

    return userRole === requiredRole;
}

/**
 * Check if sub-admin has a specific permission
 */
export function hasPermission(
    userRole: Role | undefined,
    permissions: SubAdminPermission[] | undefined,
    requiredPermission: SubAdminPermission
): boolean {
    // Admins have all permissions
    if (userRole === 'admin') return true;

    // Sub-admins must have the specific permission
    if (userRole === 'sub_admin' && permissions) {
        return permissions.includes(requiredPermission);
    }

    return false;
}

/**
 * Check if partner has access to a specific city
 */
export function hasCityAccess(
    userRole: Role | undefined,
    assignedCity: string | undefined,
    targetCity: string
): boolean {
    // Admins can access all cities
    if (userRole === 'admin' || userRole === 'sub_admin') return true;

    // Partners must match their assigned city
    if (userRole === 'partner' && assignedCity) {
        return assignedCity.toLowerCase() === targetCity.toLowerCase();
    }

    return false;
}

/**
 * Check if vendor owns a specific resource
 */
export function hasVendorOwnership(
    userRole: Role | undefined,
    userVendorId: string | undefined,
    resourceVendorId: string
): boolean {
    // Admins can access all vendor resources
    if (userRole === 'admin' || userRole === 'sub_admin') return true;

    // Vendors must match their ID
    if (userRole === 'vendor' && userVendorId) {
        return userVendorId === resourceVendorId;
    }

    return false;
}
