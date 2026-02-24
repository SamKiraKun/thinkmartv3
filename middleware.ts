import { NextResponse } from "next/server";

export function middleware() {
  // Dashboard auth is enforced by Firebase client state in app/dashboard/layout.tsx.
  // Avoid hard redirects based on a client-written cookie to prevent production redirect races.
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
