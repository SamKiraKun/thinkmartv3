// File: ThinkMart/hooks/useAuth.ts
import { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { loginWithEmail } from '@/lib/firebase/auth';
import { clearDashboardSessionCookie, syncDashboardSessionCookie } from '@/lib/auth/sessionCookie';
import { subscribeToUserProfile } from '@/services/userService';
import { UserProfile } from '@/types/user';
import { useAuthStore } from '@/store/auth.store';

export function useAuth() {
  const [loading, setLoading] = useState(true);
  // Using global store to prevent multiple DB reads if hook is used in multiple components
  const { user, profile, setUser, setProfile, clearAuth } = useAuthStore();

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      syncDashboardSessionCookie(firebaseUser);

      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (firebaseUser) {
        setUser(firebaseUser);

        // HYBRID PROFILE LISTENER
        // Routes between Firestore onSnapshot and API based on feature flag.
        // When tm_users_read_api is OFF → Firestore (real-time, legacy)
        // When tm_users_read_api is ON  → API fetch (new Turso-backed path)
        unsubscribeProfile = subscribeToUserProfile(
          firebaseUser.uid,
          (profileData) => {
            if (profileData) {
              setProfile(profileData);
            } else {
              console.warn('User profile missing for', firebaseUser.uid);
            }
            setLoading(false);
          },
          (error) => {
            console.error('Profile fetch error:', error);
            setLoading(false);
          }
        );
      } else {
        clearAuth();
        clearDashboardSessionCookie();
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, [setUser, setProfile, clearAuth]);

  // --- Convenience Methods ---

  const login = async (email: string, password: string) => {
    try {
      await loginWithEmail(email, password);
      // The useEffect above will handle fetching the profile automatically
    } catch (error) {
      throw error; // Re-throw to be handled by the UI (e.g., show error message)
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      clearDashboardSessionCookie();
      clearAuth();
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  /**
   * Note: 'register' is intentionally omitted here.
   * Registration logic involves complex form data (City, State, Referral Code)
   * and is handled explicitly in 'app/auth/register/page.tsx' using the
   * userService.registerUserProfile() hybrid function.
   */

  return {
    user,
    profile,
    loading,
    login,
    logout
  };
}

