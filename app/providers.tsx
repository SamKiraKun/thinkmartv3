// File: ThinkMart/app/providers.tsx
'use client';

import { useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useStore } from '@/store/useStore';

export function Providers({ children }: { children: React.ReactNode }) {
  const { initializeListeners } = useStore();
  
  // Ref to store the unsubscribe function for Firestore listeners
  const unsubDataRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (authUser) => {
      if (authUser) {
        // 1. Clean up existing listener if any
        if (unsubDataRef.current) {
          unsubDataRef.current();
          unsubDataRef.current = null;
        }

        // 2. Start new listener and store cleanup fn in ref
        // We do NOT return it here; we store it.
        unsubDataRef.current = initializeListeners(authUser.uid);
      } else {
        // User logged out: Clean up data listener
        if (unsubDataRef.current) {
          unsubDataRef.current();
          unsubDataRef.current = null;
        }
      }
    });

    // Cleanup on unmount
    return () => {
      unsubAuth();
      if (unsubDataRef.current) {
        unsubDataRef.current();
      }
    };
  }, [initializeListeners]);

  return <>{children}</>;
}
