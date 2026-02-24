import type { User } from "firebase/auth";

export const DASHBOARD_SESSION_COOKIE = "tm_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecureFlag(): string {
    if (typeof window === "undefined") {
        return "";
    }
    return window.location.protocol === "https:" ? "; Secure" : "";
}

export function setDashboardSessionCookie(): void {
    if (typeof document === "undefined") {
        return;
    }
    document.cookie = `${DASHBOARD_SESSION_COOKIE}=1; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax${getSecureFlag()}`;
}

export function clearDashboardSessionCookie(): void {
    if (typeof document === "undefined") {
        return;
    }
    document.cookie = `${DASHBOARD_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${getSecureFlag()}`;
}

export function syncDashboardSessionCookie(user: User | null): void {
    if (user) {
        setDashboardSessionCookie();
        return;
    }
    clearDashboardSessionCookie();
}
