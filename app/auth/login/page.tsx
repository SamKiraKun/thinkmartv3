// File: myecom/app/auth/login/page.tsx
"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FirebaseError } from "firebase/app";
import { isFirebaseConfigValid } from "@/lib/firebase/config";
import { setDashboardSessionCookie } from "@/lib/auth/sessionCookie";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import { loginWithEmail } from "@/lib/firebase/auth";
import { apiClient } from "@/lib/api/client";
import { Loader2, Mail, Lock, ArrowRight, ShoppingBag } from "lucide-react";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { settings: publicSettings } = usePublicSettings();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      setError("Please enter both email and password.");
      return;
    }

    if (!isFirebaseConfigValid) {
      setError("Authentication is temporarily unavailable. Please contact support.");
      if (process.env.NODE_ENV !== "production") {
        console.error("Firebase public config is missing required values.");
      }
      return;
    }

    setLoading(true);
    setError("");

    try {
      const userCredential = await loginWithEmail(normalizedEmail, password);
      await handleLoginSuccess(userCredential.user.uid);
      return;
    } catch (err) {
      const firebaseError = err as FirebaseError;
      if (process.env.NODE_ENV !== "production") {
        console.error("Login error details:", firebaseError);
      }

      if (
        firebaseError.code === "auth/invalid-credential" ||
        firebaseError.code === "auth/user-not-found" ||
        firebaseError.code === "auth/wrong-password"
      ) {
        setError("Invalid email or password.");
      } else if (firebaseError.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else if (firebaseError.code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later.");
      } else if (firebaseError.code === "auth/network-request-failed") {
        setError("Network issue detected. Please check your connection.");
      } else if (firebaseError.code === "auth/invalid-api-key") {
        setError("Authentication configuration is invalid. Please contact support.");
      } else {
        setError("Unable to sign in right now. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = async (uid: string) => {
    try {
      setDashboardSessionCookie();
      const nextPath = searchParams.get("next") || searchParams.get("redirect");
      if (nextPath && nextPath.startsWith("/dashboard")) {
        router.replace(nextPath);
        return;
      }

      let role = "user";
      try {
        const res = await apiClient.get<{ data: { role?: string } }>("/api/users/me");
        role = res?.data?.role || "user";
      } catch (e) {
        // Role fetch failed, default to 'user'
      }

      router.replace(`/dashboard/${role}`);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Login success handler error:", e);
      }
      router.replace("/dashboard/user");
    }
  };

  return (
    <div className="min-h-screen bg-[#2b2f7a] relative flex items-center justify-center p-4 overflow-hidden selection:bg-indigo-500/30 selection:text-white">

      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-md relative z-10">

        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4 group">
            <div className="bg-white/10 p-2 rounded-xl backdrop-blur-md border border-white/10 group-hover:scale-110 transition-transform">
              <ShoppingBag className="text-white w-6 h-6" />
            </div>
            <span className="text-2xl font-bold text-white">ThinkMart</span>
          </Link>
          <h1 className="text-3xl font-medium text-white mb-2">Welcome back</h1>
          <p className="text-white/60">Enter your details to access your account.</p>
        </div>

        {/* Glass Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          {publicSettings?.maintenanceMode && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 text-amber-100 text-sm rounded-xl">
              Platform is in maintenance mode. Some features may be temporarily unavailable.
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-200 text-sm rounded-xl flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80 ml-1">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-3.5 text-white/40 group-focus-within:text-white transition-colors" size={20} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none transition-all font-medium text-white placeholder-white/20 hover:bg-white/10"
                  placeholder="name@example.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-white/80 ml-1">Password</label>
                <Link href="/auth/forgot-password" aria-label="Forgot password" className="text-xs text-indigo-300 hover:text-white transition-colors">Forgot password?</Link>
              </div>
              <div className="relative group">
                <Lock className="absolute left-4 top-3.5 text-white/40 group-focus-within:text-white transition-colors" size={20} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none transition-all font-medium text-white placeholder-white/20 hover:bg-white/10"
                  placeholder="Enter your password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-thinkmart-deep hover:bg-indigo-50 py-3.5 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center mt-6 group"
            >
              {loading ? (
                <Loader2 className="animate-spin w-6 h-6" />
              ) : (
                <span className="flex items-center gap-2">
                  Sign In
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-8 flex items-center gap-3">
            <div className="h-px bg-white/10 flex-1" />
            <span className="text-white/30 text-xs uppercase tracking-wider">or</span>
            <div className="h-px bg-white/10 flex-1" />
          </div>

          <p className="text-center text-white/60">
            Don&apos;t have an account?{" "}
            <Link href="/auth/register" className="text-white font-medium hover:underline decoration-indigo-400 decoration-2 underline-offset-4">
              Create Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function LoginPageFallback() {
  return (
    <div className="min-h-screen bg-[#2b2f7a] flex items-center justify-center p-4">
      <Loader2 className="w-8 h-8 text-white/70 animate-spin" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
